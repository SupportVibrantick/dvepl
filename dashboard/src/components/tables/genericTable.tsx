import React, { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  ColumnDef,
  flexRender,
  SortingState,
  VisibilityState,
  RowSelectionState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit,
  Trash2,
  SlidersHorizontal,
  ArrowUpDown,
  GripVertical,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { useERPStore } from "@/store/erpStore";
import { cn } from "@/utils/helpers";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// =========================================================
// STYLED PRESENTATIONAL TABLE COMPONENTS
// =========================================================

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full max-h-[60vh] overflow-auto" data-slot="table-container">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted group/row",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 sticky top-0 bg-card/95 backdrop-blur-xs z-30 shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

// =========================================================
// DRAGGABLE HEADER CELL (used for reorderable columns only)
// =========================================================
function SortableHeaderCell({
  id,
  children,
  className,
  width,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  width?: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : undefined,
    width,
    minWidth: width,
  };

  return (
    <TableHead ref={setNodeRef} style={style} className={className}>
      <div className="flex items-center gap-3">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/50 hover:text-muted-foreground shrink-0"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <span>{children}</span>
      </div>
    </TableHead>
  );
}

// =========================================================
// MAIN GENERIC TABLE COMPONENT
// =========================================================

interface GenericTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  onView?: (row: TData) => void;
  onEdit?: (row: TData) => void;
  onDelete?: (row: TData) => void;
  onRowClick?: (row: TData) => void;
  bulkActions?: (selectedRows: TData[]) => React.ReactNode;
  isLoading?: boolean;
  showColumnVisibility?: boolean;
  freezeActions?: boolean;
  /**
   * Unique key identifying this table instance (e.g. "organizations", "invoices").
   * When provided, the user's dragged column order is saved to localStorage
   * under `generic-table-column-order:<storageKey>` and restored on reload.
   * Omit to disable persistence (order resets each session).
   */
  storageKey?: string;
}

export function GenericTable<TData extends { id: string }>({
  columns,
  data,
  onView,
  onEdit,
  onDelete,
  onRowClick,
  bulkActions,
  isLoading = false,
  showColumnVisibility = true,
  freezeActions = true,
  storageKey,
}: GenericTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Auto-derive a stable key from the column ids/accessorKeys so persistence
  // works even if the caller never passes storageKey. If two tables on the
  // page share the exact same columns, pass storageKey explicitly to
  // disambiguate them.
  const autoKey = React.useMemo(
    () =>
      columns
        .map((c: any) => c.id ?? c.accessorKey ?? "")
        .join("|"),
    [columns],
  );
  const localStorageKey = `generic-table-column-order:${storageKey ?? autoKey}`;
  const localStorageVisibilityKey = `generic-table-column-visibility:${storageKey ?? autoKey}`;

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = window.localStorage.getItem(localStorageVisibilityKey);
      return saved ? (JSON.parse(saved) as VisibilityState) : {};
    } catch {
      return {};
    }
  });

  // Load any previously saved column order (lazy init, runs once)
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem(localStorageKey);
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });

  // Re-load column order from localStorage if the localStorageKey changes (e.g. after dynamic columns/custom fields load)
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(localStorageKey);
      setColumnOrder(saved ? (JSON.parse(saved) as string[]) : []);
    } catch {
      // ignore
    }
  }, [localStorageKey]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(localStorageVisibilityKey);
      setColumnVisibility(saved ? (JSON.parse(saved) as VisibilityState) : {});
    } catch {
      setColumnVisibility({});
    }
  }, [localStorageVisibilityKey]);

  const [isColumnsOpen, setIsColumnsOpen] = useState(false);

  const t = (key: string) => {
    return key;
  };

  // Append selection checkbox column if bulk actions exist
  const tableColumns = React.useMemo(() => {
    const visibleCols = columns.filter((col: any) => {
      return true;
    });

    const cols = visibleCols.map((col) => {
      if (typeof col.header === "string") {
        return {
          ...col,
          header: t(col.header),
        };
      }
      return col;
    });

    if (bulkActions) {
      cols.unshift({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              (table.getIsAllPageRowsSelected() ||
                (table.getIsSomePageRowsSelected() && "mixed")) as any
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
            className="translate-y-[2px]"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className="translate-y-[2px]"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      });
    }

    // Append action column if handlers exist
    if (onView || onEdit || onDelete) {
      cols.push({
        id: "actions",
        header: t("Actions"),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div
              className="flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger
                  onClick={(e) => e.stopPropagation()}
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("Actions")}
                      title={t("Actions")}
                      className="size-8 rounded-lg p-0 text-muted-foreground/60 hover:bg-primary/10 hover:text-primary data-[popup-open]:bg-primary/10 data-[popup-open]:text-primary cursor-pointer transition-colors"
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent
                  align="end"
                  sideOffset={6}
                  className="w-44 min-w-0 rounded-xl p-1.5 shadow-lg ring-foreground/10"
                >
                  {onView && (
                    <DropdownMenuItem
                      onClick={() => onView(item)}
                      className="gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5 text-primary" />
                      {t("Overview")}
                    </DropdownMenuItem>
                  )}
                  {onEdit && (
                    <DropdownMenuItem
                      onClick={() => onEdit(item)}
                      className="gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold cursor-pointer text-amber-600 dark:text-amber-400 focus:text-amber-600 dark:focus:text-amber-400"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      {t("Edit")}
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <>
                      {(onView || onEdit) && (
                        <div className="-mx-1 my-1 h-px bg-border" />
                      )}
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(item)}
                        className="gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("Delete")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
        enableSorting: false,
        enableHiding: false,
      });
    }

    return cols;
  },
    [columns, onView, onEdit, onDelete, bulkActions]);

  // Columns that must never be dragged or reordered (checkbox + actions)
  const nonDraggableIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (bulkActions) ids.add("select");
    // Freeze/drag-lock the actions column whether it was injected by us
    // (via onView/onEdit/onDelete) or supplied by the caller in `columns`
    // (e.g. the Purchase Orders page defines its own actions column).
    const hasCallerActionsColumn = tableColumns.some(
      (column: any) => (column.id ?? column.accessorKey) === "actions",
    );
    if (onView || onEdit || onDelete || hasCallerActionsColumn) ids.add("actions");
    return ids;
  }, [bulkActions, onView, onEdit, onDelete, tableColumns]);

  // Initialize / sync column order whenever the column set changes,
  // always keeping "select" first and "actions" last.
  React.useEffect(() => {
    const ids = tableColumns.map((column: any) => column.id ?? column.accessorKey);
    setColumnOrder((prev) => {
      if (prev.length === 0) return ids;

      // To prevent removing columns that are temporarily missing (e.g. custom fields loading asynchronously),
      // we keep all columns from the saved order (prev) and append any new ones from ids.
      const newIds = ids.filter((id) => !prev.includes(id));
      const merged = [...prev, ...newIds];

      const hasSelect = merged.includes("select");
      const hasActions = merged.includes("actions");
      const rest = merged.filter((id) => id !== "select" && id !== "actions");

      return [
        ...(hasSelect ? ["select"] : []),
        ...rest,
        ...(hasActions ? ["actions"] : []),
      ];
    });
  }, [tableColumns]);

  // Persist column order to localStorage whenever it changes
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (columnOrder.length === 0) return;
    try {
      window.localStorage.setItem(localStorageKey, JSON.stringify(columnOrder));
    } catch {
      // localStorage may be unavailable (private browsing, quota, etc.) — fail silently
    }
  }, [columnOrder, localStorageKey]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        localStorageVisibilityKey,
        JSON.stringify(columnVisibility),
      );
    } catch {
      // localStorage may be unavailable (private browsing, quota, etc.) — fail silently
    }
  }, [columnVisibility, localStorageVisibilityKey]);

  const localStoragePageSizeKey = `generic-table-page-size:${storageKey ?? autoKey}`;

  const [initialPageSize] = useState<number>(() => {
    if (typeof window === "undefined") return 10;
    try {
      const saved = window.localStorage.getItem(localStoragePageSizeKey);
      return saved ? parseInt(saved, 10) : 10;
    } catch {
      return 10;
    }
  });

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnOrder,
    },
    initialState: {
      pagination: {
        pageSize: initialPageSize,
      },
    },
    defaultColumn: {
      size: 200,
      minSize: 90,
      maxSize: 600,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const [customPageSize, setCustomPageSize] = useState<string>(String(initialPageSize));

  React.useEffect(() => {
    const pSize = table.getState().pagination.pageSize;
    setCustomPageSize(String(pSize));
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(localStoragePageSizeKey, String(pSize));
      } catch {
        // fail silently
      }
    }
  }, [table.getState().pagination.pageSize, localStoragePageSizeKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // "select" and "actions" can never be dragged or dropped onto
    if (nonDraggableIds.has(active.id as string) || nonDraggableIds.has(over.id as string)) {
      return;
    }

    setColumnOrder((current) => {
      const hasSelect = current.includes("select");
      const hasActions = current.includes("actions");
      const draggableIds = current.filter((id) => !nonDraggableIds.has(id));

      const oldIndex = draggableIds.indexOf(active.id as string);
      const newIndex = draggableIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return current;

      const reordered = arrayMove(draggableIds, oldIndex, newIndex);

      return [
        ...(hasSelect ? ["select"] : []),
        ...reordered,
        ...(hasActions ? ["actions"] : []),
      ];
    });
  };

  const selectedRows = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original);

  const currentPage = table.getState().pagination.pageIndex + 1;
  const pageCount = table.getPageCount();

  const getVisiblePages = () => {
    const delta = 1; // number of pages to show before and after current page
    const range: number[] = [];
    const rangeWithDots: (number | string)[] = [];
    let l: number | null = null;

    for (let i = 1; i <= pageCount; i++) {
      if (i === 1 || i === pageCount || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i);
      }
    }

    for (const i of range) {
      if (l !== null) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l > 2) {
          rangeWithDots.push("...");
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots;
  };

  return (
    <div className="space-y-4">
      {/* Table Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left Side: Pagination & Bulk Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Pagination Navigation & Info */}
          {!isLoading && data.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {/* 1. Page Numbers Navigation Pill */}
              <div className="flex items-center gap-1 bg-muted/60 border border-border/70 p-1 h-11 rounded-xl shadow-xs">
                {/* Prev Arrow */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card border border-transparent hover:border-border/30 hover:shadow-3xs transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <ChevronLeft className="h-4.5 w-4.5" />
                </Button>

                {/* Page numbers */}
                <div className="flex items-center gap-1">
                  {getVisiblePages().map((page, index) => {
                    if (page === "...") {
                      return (
                        <span
                          key={`dots-${index}`}
                          className="text-xs text-muted-foreground font-semibold px-1.5 select-none"
                        >
                          ...
                        </span>
                      );
                    }
                    const isCurrent = page === currentPage;
                    return (
                      <Button
                        key={`page-${page}`}
                        variant={isCurrent ? "default" : "ghost"}
                        size="sm"
                        className={cn(
                          "h-9 w-9 p-0 rounded-lg text-xs font-semibold transition-all duration-150",
                          isCurrent
                            ? "bg-primary text-white hover:bg-primary/95 shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-card border border-transparent hover:border-border/30 hover:shadow-3xs"
                        )}
                        onClick={() => table.setPageIndex((page as number) - 1)}
                      >
                        {page}
                      </Button>
                    );
                  })}
                </div>

                {/* Next Arrow */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card border border-transparent hover:border-border/30 hover:shadow-3xs transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  <ChevronRight className="h-4.5 w-4.5" />
                </Button>
              </div>

              {/* 2. Custom Entries Selector Pill */}
              <div className="flex items-center gap-2 bg-muted/60 border border-border/70 px-3 h-11 rounded-xl shadow-xs text-xs text-muted-foreground font-medium">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-12 h-7 text-center bg-card border border-border/70 text-foreground rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 font-bold text-xs"
                  value={customPageSize}
                  onChange={(e) => {
                    const valStr = e.target.value.replace(/[^0-9]/g, "");
                    setCustomPageSize(valStr);
                    if (valStr) {
                      const valNum = parseInt(valStr, 10);
                      if (valNum > 0) {
                        table.setPageSize(valNum);
                      }
                    }
                  }}
                  onBlur={() => {
                    if (!customPageSize || parseInt(customPageSize, 10) <= 0) {
                      table.setPageSize(10);
                      setCustomPageSize("10");
                    }
                  }}
                />
                <span>entries per page</span>
                <div className="w-px h-4 bg-border/80 mx-1.5" />
                <button
                  type="button"
                  className="text-primary hover:text-primary/80 font-bold uppercase text-[10px] tracking-wider transition-colors"
                  onClick={() => {
                    table.setPageSize(data.length || Number.MAX_SAFE_INTEGER);
                    setCustomPageSize(String(data.length || Number.MAX_SAFE_INTEGER));
                  }}
                >
                  Show All
                </button>
              </div>
            </div>
          )}

          {/* Bulk Actions */}
          {selectedRows.length > 0 && bulkActions && (
            <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-md text-xs font-medium transition-all duration-300">
              <span>{selectedRows.length} selected</span>
              <div className="h-4 w-px bg-primary/20 mx-1" />
              {bulkActions(selectedRows)}
            </div>
          )}
        </div>

        {showColumnVisibility && (
          <div className="flex items-center gap-2 ml-auto">
            {/* Column Visibility Selector */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsColumnsOpen(!isColumnsOpen)}
                className="h-8 gap-2 border border-border text-xs px-3 py-1.5 flex items-center justify-center rounded-md hover:bg-muted transition-colors font-medium cursor-pointer outline-none bg-card text-foreground"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{t("Columns")}</span>
              </Button>
              {isColumnsOpen && (
                <>
                  {/* Overlay to close on click outside */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsColumnsOpen(false)}
                  />
                  <div className="absolute right-0 top-9.5 z-50 w-[180px] bg-popover border border-border shadow-md rounded-lg p-2.5 space-y-1.5 text-popover-foreground">
                    <div className="px-1 py-0.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      {t("Toggle Columns")}
                    </div>
                    <div className="h-px bg-border my-1" />
                    <div className="max-h-[220px] overflow-y-auto space-y-0.5">
                      {table
                        .getAllColumns()
                        .filter((column) => column.getCanHide())
                        .map((column) => {
                          return (
                            <div
                              key={column.id}
                              onClick={() =>
                                column.toggleVisibility(!column.getIsVisible())
                              }
                              className="flex items-center justify-between text-xs py-1.5 px-2 rounded-md hover:bg-muted cursor-pointer transition-colors"
                            >
                              <span className="capitalize">{t(column.id)}</span>
                              <Checkbox
                                checked={column.getIsVisible()}
                                className="h-3.5 w-3.5"
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actual Data Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <Table>
            <TableHeader className="bg-muted/50 border-b border-border">
              {table.getHeaderGroups().map((headerGroup) => (
                <SortableContext
                  key={headerGroup.id}
                  items={columnOrder.filter((id) => !nonDraggableIds.has(id))}
                  strategy={horizontalListSortingStrategy}
                >
                  <TableRow className="hover:bg-transparent">
                    {headerGroup.headers.map((header) => {
                      const label = header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          );

                      // "select" and "actions" stay exactly as before — not draggable
                      if (nonDraggableIds.has(header.column.id)) {
                        return (
                          <TableHead
                            key={header.id}
                            style={{
                              width: header.getSize(),
                              minWidth: header.getSize(),
                            }}
                            className={cn(
                              "sticky top-0 z-30 bg-muted text-xs font-semibold py-3.5 px-6 text-muted-foreground whitespace-nowrap",
                              header.id === "actions" && "text-center",
                              header.id === "actions" &&
                                freezeActions &&
                                "right-0 border-l border-l-border z-40 shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]",
                            )}
                          >
                            {label}
                          </TableHead>
                        );
                      }

                      return (
                        <SortableHeaderCell
                          key={header.id}
                          id={header.column.id}
                          width={header.getSize()}
                          className="sticky top-0 z-30 bg-muted text-xs font-semibold py-3.5 px-6 text-muted-foreground whitespace-nowrap select-none"
                        >
                          {label}
                        </SortableHeaderCell>
                      );
                    })}
                  </TableRow>
                </SortableContext>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                // Skeletons for Loading State
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow
                    key={i}
                    className="animate-pulse border-b border-border/50"
                  >
                    {tableColumns.map((col, colIndex) => (
                      <TableCell
                        key={colIndex}
                        className={cn(
                          "py-4 px-6",
                          col.id === "actions" && freezeActions && "sticky right-0 bg-card border-l border-l-border z-10"
                        )}
                      >
                        <div className="h-4 bg-muted rounded-md w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : table.getPaginationRowModel().rows?.length ? (
                table.getPaginationRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={cn(
                      "hover:bg-muted/30 border-b border-border/40 transition-colors duration-150",
                      onRowClick && "cursor-pointer",
                    )}
                    onClick={
                      onRowClick
                        ? (e) => {
                            const target = e.target as HTMLElement;
                            if (
                              target.closest(
                                "button, a, input, select, textarea, label",
                              )
                            ) {
                              return;
                            }
                            onRowClick(row.original);
                          }
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        style={{
                          width: cell.column.getSize(),
                          minWidth: cell.column.getSize(),
                        }}
                        className={cn(
                          "py-3.5 px-6 text-sm font-normal align-middle",
                          cell.column.id === "actions" && "text-center",
                          cell.column.id === "actions" && freezeActions && "sticky right-0 bg-card group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted border-l border-l-border z-10",
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                // Empty State
                <TableRow>
                  <TableCell
                    colSpan={tableColumns.length}
                    className="h-32 text-center text-muted-foreground text-xs py-8"
                  >
                    No records found matching your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DndContext>
      </div>

    </div>
  );
}

// Helper to render sortable column header easily
export function sortableHeader(title: string) {
  return ({ column }: { column: any }) => {
    const store = useERPStore();
    const t = (key: string) => {
      return key;
    };
    return (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-4 hover:bg-transparent hover:text-foreground text-muted-foreground font-semibold flex gap-1.5 items-center justify-start text-xs p-1"
      >
        <span>{t(title)}</span>
        <ArrowUpDown className="h-3 w-3" />
      </Button>
    );
  };
}
