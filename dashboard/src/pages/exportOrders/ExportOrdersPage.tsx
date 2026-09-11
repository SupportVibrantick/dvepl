import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useExportOrdersStore } from "@/store/exportOrders.store";
import { useERPStore } from "@/store/erpStore";
import { canPerformPageAction } from "@/utils/pagePermissions";
import { Search, RefreshCw, Layers, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FilterPanel from "./components/FilterPanel";
import OrdersTable from "./components/OrdersTable";
import DrawingUploader from "./components/DrawingUploader";
import DrawingLibrary from "./components/DrawingLibrary";
import { BackToOrderWorkflowButton } from "@/components/shared/backToOrderWorkflowButton";

export interface Filters {
  soNo: string;
  customer: string;
  status: string;
  assignedEngineer: string;
  startDate: string;
  endDate: string;
}

export interface PdfOpts {
  companyHeader: boolean;
  companyFooter: boolean;
  pageNumbers: boolean;
  includeDrawings: boolean;
  landscapeMode: boolean;
  alternateRows: boolean;
}

const DEFAULT_FILTERS: Filters = {
  soNo: "",
  customer: "",
  status: "all",
  assignedEngineer: "",
  startDate: "",
  endDate: "",
};

export default function ExportOrdersPage() {
  const store = useERPStore();
  const currentUser = store.users?.find(
    (u: any) => u.id === store.currentUserId,
  ) as any;
  const canCreate = canPerformPageAction(
    currentUser?.actionPermissions,
    "export_orders",
    "create",
  );
  const canEdit = canPerformPageAction(
    currentUser?.actionPermissions,
    "export_orders",
    "edit",
  );

  const orders = useExportOrdersStore((s) => s.orders);
  const availableOrders = useExportOrdersStore((s) => s.availableOrders);
  const allDrawings = useExportOrdersStore((s) => s.drawings);
  const ordersLoading = useExportOrdersStore((s) => s.isOrdersLoading);
  const fetchOrders = useExportOrdersStore((s) => s.fetchOrders);
  const fetchAvailableOrders = useExportOrdersStore((s) => s.fetchAvailableOrders);
  const fetchDrawings = useExportOrdersStore((s) => s.fetchDrawings);

  const navigate = useNavigate();
  const { id: paramOrderId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlOrderId = paramOrderId || searchParams.get("orderId") || null;

  // ── Filter state ─────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [activeFilters, setActiveFilters] = useState<Partial<Filters>>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Selection & Direct Upload state ──────────────────────────────────────
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>(() =>
    urlOrderId ? [urlOrderId] : [],
  );
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<string[]>([]);
  const [directUploadOrderId, setDirectUploadOrderId] = useState<string | null>(null);
  const [openDirectUpload, setOpenDirectUpload] = useState(false);

  // Sync selection when urlOrderId changes
  useEffect(() => {
    if (urlOrderId) {
      setSelectedOrderIds([urlOrderId]);
    }
  }, [urlOrderId]);

  // ── Fetch data ───────────────────────────────────────────────────────────
  useEffect(() => {
    void fetchOrders({
      search: searchQuery || activeFilters.soNo || activeFilters.customer || undefined,
      status:
        activeFilters.status && activeFilters.status !== "all"
          ? activeFilters.status
          : undefined,
      assignedEngineer: activeFilters.assignedEngineer || undefined,
      startDate: activeFilters.startDate || undefined,
      endDate: activeFilters.endDate || undefined,
    });
  }, [searchQuery, activeFilters, fetchOrders]);

  useEffect(() => {
    void fetchAvailableOrders();
  }, [fetchAvailableOrders]);

  const allOrderIds = useMemo(() => {
    const ids = orders.map((o) => o.id);
    if (urlOrderId && !ids.includes(urlOrderId)) {
      ids.push(urlOrderId);
    }
    return ids;
  }, [orders, urlOrderId]);
  const allOrderIdsKey = allOrderIds.join(",");
  useEffect(() => {
    void fetchDrawings(allOrderIds);
  }, [allOrderIds, allOrderIdsKey, fetchDrawings]);

  // ── Computed ─────────────────────────────────────────────────────────────
  const targetOrder = useMemo(() => {
    if (!urlOrderId) return null;
    return (
      orders.find((o) => o.id === urlOrderId) ||
      availableOrders.find((o) => o.id === urlOrderId) ||
      null
    );
  }, [orders, availableOrders, urlOrderId]);

  const selectedOrders = orders.filter((o) => selectedOrderIds.includes(o.id));

  // Drawings to display: if orders are selected, show only drawings for selected orders, else show all drawings
  const displayedDrawings = useMemo(() => {
    if (selectedOrderIds.length > 0) {
      return allDrawings.filter(
        (d) =>
          d.project?.salesOrderId &&
          selectedOrderIds.includes(d.project.salesOrderId),
      );
    }
    return allDrawings;
  }, [allDrawings, selectedOrderIds]);

  const hasActiveFilters = Boolean(
    activeFilters.soNo ||
      activeFilters.customer ||
      (activeFilters.status && activeFilters.status !== "all") ||
      activeFilters.assignedEngineer ||
      activeFilters.startDate ||
      activeFilters.endDate,
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    setActiveFilters({ ...filters });
    setSelectedOrderIds([]);
    setSelectedDrawingIds([]);
  }, [filters]);

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setActiveFilters({});
    setSearchQuery("");
    setSelectedOrderIds([]);
    setSelectedDrawingIds([]);
  }, []);

  const handleSelectOrder = useCallback(
    (id: string, checked: boolean) => {
      setSelectedOrderIds((prev) =>
        checked ? [...prev, id] : prev.filter((x) => x !== id),
      );
    },
    [],
  );

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedOrderIds(checked ? orders.map((o) => o.id) : []);
    },
    [orders],
  );

  const handleDrawingCreated = useCallback(() => {
    void fetchOrders();
    void fetchDrawings(allOrderIds);
  }, [allOrderIds, fetchOrders, fetchDrawings]);

  const handleDirectUploadClick = (orderId: string) => {
    setDirectUploadOrderId(orderId);
    setOpenDirectUpload(true);
  };

  const allKnownOrders = useMemo(() => {
    const merged = [...orders];
    availableOrders.forEach((ao) => {
      if (!merged.some((o) => o.id === ao.id)) merged.push(ao);
    });
    return merged;
  }, [orders, availableOrders]);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-primary" />
            Engineering Drawings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage, upload, and track technical drawings for assigned sales orders
          </p>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2">
          <BackToOrderWorkflowButton />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void fetchOrders();
              if (allOrderIds.length > 0) void fetchDrawings(allOrderIds);
            }}
            className="gap-1.5 h-9"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>

          <Button
            variant={hasActiveFilters ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterOpen(true)}
            className="gap-1.5 h-9"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-white ml-0.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Search and Quick Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by SO number or customer name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 w-full"
          />
        </div>
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchQuery("")}
            className="h-10 text-xs text-muted-foreground"
          >
            Clear Search
          </Button>
        )}
      </div>

      {/* Filter Drawer */}
      <FilterPanel
        filters={filters}
        setFilters={setFilters}
        onSearch={handleSearch}
        open={filterOpen}
        setOpen={setFilterOpen}
      />

      {/* Active Order Banner */}
      {urlOrderId && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-900 dark:text-purple-300 shadow-3xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <Layers className="size-4.5 shrink-0 text-purple-600 dark:text-purple-400" />
            <div className="min-w-0">
              <p className="text-xs font-medium">
                Showing engineering drawings for Order:{" "}
                <span className="font-bold text-foreground">
                  {String(targetOrder?.dveplCode || (targetOrder as any)?.soNo || urlOrderId)}
                </span>
                {Boolean(targetOrder?.partyName) && (
                  <span className="ml-1.5 opacity-80 text-[11px]">
                    ({String(targetOrder?.partyName)})
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedOrderIds([]);
              if (paramOrderId) {
                navigate("/export-orders");
              } else {
                const next = new URLSearchParams(searchParams);
                next.delete("orderId");
                setSearchParams(next);
              }
            }}
            className="h-7 text-xs px-2.5 rounded-lg border-purple-500/30 text-purple-700 dark:text-purple-300 hover:bg-purple-500/15 cursor-pointer shrink-0"
          >
            Show All Orders
          </Button>
        </div>
      )}

      {/* Section 1: Assigned Orders */}
      <div className="flex flex-col gap-3">
        <OrdersTable
          orders={orders}
          isLoading={ordersLoading}
          selectedOrderIds={selectedOrderIds}
          onSelectOrder={handleSelectOrder}
          onSelectAll={handleSelectAll}
          onUploadDrawing={handleDirectUploadClick}
        />
      </div>

      {/* Section 2: Upload Area */}
      {canCreate && (
        <DrawingUploader
          selectedOrderIds={selectedOrderIds}
          selectedOrders={selectedOrders}
          availableOrders={availableOrders}
          onSuccess={handleDrawingCreated}
          directOrderId={directUploadOrderId}
          openDirectUpload={openDirectUpload}
          onCloseDirectUpload={() => setOpenDirectUpload(false)}
        />
      )}

      {/* Section 3: Drawing Library */}
      <DrawingLibrary
        drawings={displayedDrawings}
        selectedDrawingIds={selectedDrawingIds}
        setSelectedDrawingIds={setSelectedDrawingIds}
        onStatusChanged={handleDrawingCreated}
        canEdit={canEdit}
        orders={allKnownOrders}
      />
    </div>
  );
}
