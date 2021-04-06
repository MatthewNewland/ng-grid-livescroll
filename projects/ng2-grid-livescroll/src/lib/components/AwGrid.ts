﻿import {
    Component, Input, Output, EventEmitter,
    ViewChild, ViewChildren,
    QueryList,
    AfterViewInit,
    ViewEncapsulation,
    ChangeDetectionStrategy
} from '@angular/core';
import { CdkVirtualScrollViewport } from "@angular/cdk/scrolling";
import { BehaviorSubject, Observable } from 'rxjs/Rx';
import { ReactiveGridService, ReactiveGridPageService } from '../services/GridReactiveServices';
import { SortingService } from '../services/SortingService';
import { SelectService } from '../services/SelectService';
import { ColumnResizeService } from '../services/ColumnResizeService';
import { DndService } from '../services/DndService';
import { SelectionMode } from '../models/enums';
import { GridColumnDef, GridRow, GridRowEventModel, GridClickEventModel } from '../models/GridModels';
import { LiveScroll } from '../directives/liveScroll';
import { Page } from './Page';

@Component({
    selector: 'aw-grid',
    templateUrl: './templates/awgrid.html',
    styleUrls: ['./templates/awgrid.css'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AwGrid implements AfterViewInit {
    private _colsSubj = new BehaviorSubject<GridColumnDef[]>([]);
    columns = this._colsSubj.asObservable();

    pageServices: Observable<ReactiveGridPageService[]>;

    private _teardowns = [];

    @Input() noRecordsMessage: string = "";
    @Input() idField: string;
    @Input() set allowDrag(val: boolean) {
        this.dndService.dragDisabled = !val;
    }

    get allowDrag(): boolean {
        return !this.dndService.dragDisabled;
    }

    @Input() dragSourceType: string = "";
    @Input() set allowDrop(val: boolean) {
        this.dndService.dropDisabled = !val;
    }

    get allowDrop(): boolean {
        return !this.dndService.dropDisabled;
    }

    @Input() acceptDropTypes: string = "";

    private _colsDef: GridColumnDef[];
    @Input() set columnsDef(cols: GridColumnDef[]) {
        this._colsDef = cols;
        //adjust initial cellwidth
        this._colsDef.forEach(col => {
            col.cellWidth = col.width;
        });
        this._colsSubj.next(cols);
        // this.refresh();
    }
    @Input() pageSize = 100;
    @Input() emptyRowHeight = 35;
    @Input() height: string;

    @Input() selectionMode: SelectionMode = SelectionMode.multiple;
    @Input() selected: string[];

    @ViewChild(LiveScroll, { static: false }) liveScroll: LiveScroll;
    @ViewChildren(Page) _pages: QueryList<Page>;

    @Output() onSelect: EventEmitter<GridRow[]> = new EventEmitter<GridRow[]>();
    @Output() onDoubleClick: EventEmitter<GridRow> = new EventEmitter<GridRow>();
    @Output() onRowCreate: EventEmitter<GridRowEventModel> = new EventEmitter<GridRowEventModel>();
    @Output() onRowDestroy: EventEmitter<GridRowEventModel> = new EventEmitter<GridRowEventModel>();
    @Output() onClick: EventEmitter<GridClickEventModel> = new EventEmitter<GridClickEventModel>();

    @ViewChild(CdkVirtualScrollViewport) body: CdkVirtualScrollViewport;

    get pages(): Page[] {
        if (!this._pages)
            return [];
        return this._pages.map(p => p);
    }

    get totalCount(): number {
        return this.dataService.totalCount;
    }

    constructor(public dataService: ReactiveGridService, public selectService: SelectService,
        public dndService: DndService) {

        this._teardowns = [
            this.selectService.onSelect.subscribe(evt => {
                this.onSelect.emit(evt);
            }),
            this.selectService.onRowCreate.subscribe(evt => {
                this.onRowCreate.emit(evt);
            }),
            this.selectService.onRowDestroy.subscribe(evt => {
                this.onRowDestroy.emit(evt);
            }),
            this.selectService.onDoubleClick.subscribe(evt => {
                this.onDoubleClick.emit(evt);
            }),
            this.selectService.onClick.subscribe(evt => {
                this.onClick.emit(evt);
            })
        ];

        this.pageServices = this.dataService.pages
            .map(pages => {
                setTimeout(() => this.fit(), 100);
                return pages;
            });
    }

    ngAfterViewInit() {
        this.selectService.selectionMode = this.selectionMode;

        this._teardowns.push(this.body.elementScrolled()
            .debounceTime(500)
            .distinctUntilChanged()
            .subscribe(evt => {
                //get visible pages
                var visiblePages = this.body.elementRef.nativeElement.getElementsByClassName("tpage");
                var pageIndexes = Array.from(visiblePages)
                    .map((n) => parseInt(n.getAttribute("page-index"), 10))
                    .filter(i => !isNaN(i));

                this.onLiveScroll(pageIndexes);
            }));

        // if (!!this._colsDef && this._colsDef.length > 0 && !this._colsDef.find(val => !val.width))
        //     //auto resize the last row
        //     this._colsDef[this._colsDef.length - 1].width = null;

        if (this._colsDef && this._colsDef.length > 0)
            this.refresh();
    }

    ngOnDestroy() {
        this._teardowns.forEach(t => t.unsubscribe());
    }

    columnResizing: boolean = false;

    onColumnResizing(colDef) {
        this.columnResizing = !!colDef;
    }

    fit() {
        this.liveScroll.fit();
    }

    initialized: boolean = false;

    refresh() {
        let sub = this.dataService.initialRequestDone
            .subscribe(data => {
                sub.unsubscribe();
                this.initialized = true;
            });

        this.dataService.initialize(this.pageSize, this._colsDef, this.idField);
        this.dataService.currentPages = [0];
        this.liveScroll.reset();
        this.dataService.refresh();
    }

    select(ids?: string[]) {
        if (ids) {
            this.selected = ids;
            this.dataService.selectedIds = ids;
        }

        if (!this.dataService.pageServices.length)
            return;

        //use reducer to realize selectMany
        var selectedRows = this.dataService.pageServices
            .map(s => s.rowsState)
            .reduce((x, y) => x.concat(y))
            .filter(r => this.selected.find(id => id == r.id));

        this.selectService.selectMany(selectedRows);
    }

    onLiveScroll(pagesToLoad: number[]) {
        this.dataService
            .changePages(pagesToLoad, this.dataService.sortField, this.dataService.sortDsc, this.selected);
    }
}