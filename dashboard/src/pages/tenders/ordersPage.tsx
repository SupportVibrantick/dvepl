import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "react-router-dom";
import {
  Search,
  RefreshCw,
  SlidersHorizontal,
  FileText,
  CheckCircle2,
  XCircle,
  Users,
  UserPlus,
  ExternalLink,
  Plus,
  Maximize2,
  Minimize2,
  FileSpreadsheet,
  Layers,
} from "lucide-react";

import {
  QuoteTenderOrder,
  ALL_COLUMN_KEYS,
  ColumnKey,
  EMPTY_ARRAY,
  fetchQuoteTenderOrders,
} from "./orderShared";

import {
  GenericTable,
  sortableHeader,
} from "@/components/tables/genericTable";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Checkbox } from "@/components/ui/checkbox";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { apiClient } from "@/services/axios";
import { toast } from "react-hot-toast";
import { useERPStore } from "@/store/erpStore";
import {
  isAdminUser,
  canPerformPageAction,
} from "@/utils/pagePermissions";
import { ConfirmDialog } from "@/components/shared/confirmDialog";
import { SalesOrderAssignModal } from "./components/SalesOrderAssignModal";

import { AddOrderModal } from "./components/AddOrderModal";

// ============================================================
// GENERIC TABLE TYPE WORKAROUND
// ============================================================

const TenderTable = GenericTable as unknown as React.ComponentType<{
  columns: ColumnDef<QuoteTenderOrder>[];
  data: QuoteTenderOrder[];
  onView?: (row: QuoteTenderOrder) => void;
  onEdit?: (row: QuoteTenderOrder) => void;
  onDelete?: (row: QuoteTenderOrder) => void;
  onRowClick?: (row: QuoteTenderOrder) => void;
  isLoading?: boolean;
  showColumnVisibility?: boolean;
  storageKey?: string;
}>;

// ============================================================
// PAGE
// ============================================================

export function OrdersPage() {
  const store = useERPStore();

  const currentUser = useMemo(() => {
    return store.users.find((user) => user.id === store.currentUserId) as any;
  }, [store.users, store.currentUserId]);

  const currentUserId = store.currentUserId || currentUser?.id || null;

  const isAdmin = isAdminUser(currentUser);

  const canCreate = canPerformPageAction(
    currentUser?.actionPermissions,
    "orders",
    "create",
  );
  const canEdit = canPerformPageAction(
    currentUser?.actionPermissions,
    "orders",
    "edit",
  );
  const canDelete = canPerformPageAction(
    currentUser?.actionPermissions,
    "orders",
    "delete",
  );

  const navigate = useNavigate();
  const [quoteTenders, setQuoteTenders] =
    useState<QuoteTenderOrder[]>(EMPTY_ARRAY);

  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState("");

  const [filterRemark, setFilterRemark] = useState<string>("");

  const [sortBy, setSortBy] = useState<string>("date-newest");

  // Selected tender for user assignment modal
  const [assigningTender, setAssigningTender] =
    useState<QuoteTenderOrder | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);

  const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);

  const [editingOrder, setEditingOrder] = useState<QuoteTenderOrder | null>(
    null,
  );

  const [orderToDelete, setOrderToDelete] =
    useState<QuoteTenderOrder | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  // ============================================================
  // COLUMN VISIBILITY
  // ============================================================

  const [visibleColumns, setVisibleColumns] = useState<
    Record<string, boolean>
  >(() => {
    try {
      const saved = localStorage.getItem(
        "quote-tender-table-column-visibility"
      );

      if (saved) {
        const parsed = JSON.parse(saved);
        ALL_COLUMN_KEYS.forEach((col) => {
          if (parsed[col.id] === undefined) {
            parsed[col.id] = true;
          }
        });
        return parsed;
      }
    } catch {
      // Fall back to defaults
    }

    const initial: Record<string, boolean> = {};

    ALL_COLUMN_KEYS.forEach((col) => {
      initial[col.id] = true;
    });

    return initial;
  });

  useEffect(() => {
    localStorage.setItem(
      "quote-tender-table-column-visibility",
      JSON.stringify(visibleColumns)
    );
  }, [visibleColumns]);

  // ============================================================
  // LOAD DATA
  // ============================================================

  const loadQuoteTenders = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = await fetchQuoteTenderOrders();

      if (result.success) {
        setQuoteTenders(result.rows);
        setAssigningTender((prev) => {
          if (!prev) return null;
          const updated = result.rows.find((r) => r.id === prev.id);
          return updated || prev;
        });
      } else {
        toast.error(result.message ?? "Unable to load orders.");
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ??
          "Unable to load orders."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuoteTenders();
  }, [loadQuoteTenders]);

  const handleDeleteOrder = useCallback(async () => {
    if (!orderToDelete) return;

    setIsDeleting(true);
    try {
      const response = await apiClient.delete(
        `/order/delete/${orderToDelete.id}`
      );
      if (response.data?.success) {
        toast.success("Order deleted successfully.");
        setOrderToDelete(null);
        await loadQuoteTenders();
      } else {
        toast.error(
          response.data?.message ?? "Unable to delete order."
        );
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ??
          "Failed to delete order. Please try again."
      );
    } finally {
      setIsDeleting(false);
    }
  }, [orderToDelete, loadQuoteTenders]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    const syncToast = toast.loading("Syncing orders from portal...");
    try {
      const response = await apiClient.get("/quotetender/read");
      if (response.data?.success) {
        const syncedCount = response.data?.syncedCount ?? 0;
        toast.success(`Successfully synced ${syncedCount} new orders!`, {
          id: syncToast,
        });
        // Reload list
        await loadQuoteTenders();
      } else {
        toast.error(
          response.data?.message ?? "Unable to sync orders.",
          { id: syncToast }
        );
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ?? "Failed to sync orders from portal.",
        { id: syncToast }
      );
    } finally {
      setIsSyncing(false);
    }
  }, [loadQuoteTenders]);

  // ============================================================
  // COLUMN CONTROLS
  // ============================================================

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const setAllColumns = (val: boolean) => {
    const updated: Record<string, boolean> = {};

    ALL_COLUMN_KEYS.forEach((col) => {
      updated[col.id] = val;
    });

    setVisibleColumns(updated);
  };

  // ============================================================
  // REMARK FILTER OPTIONS
  // ============================================================

  const remarkOptions = useMemo(() => {
    const set = new Set<string>();

    quoteTenders.forEach((t) => {
      if (t.remark) {
        set.add(t.remark);
      }
    });

    return Array.from(set);
  }, [quoteTenders]);

  // ============================================================
  // SEARCH / FILTER / SORT
  // ============================================================

  const processedTenders = useMemo(() => {
    let list = [...quoteTenders];

    const q = search.trim().toLowerCase();

    if (q) {
      list = list.filter((item) =>
        [
          item.name,
          item.email_id,
          item.mobile,
          item.firm_name,
          item.tender_no,
          item.department_name,
          item.name_of_work,
          item.section_name,
          item.division_name,
          item.subdivision,
          item.tenderID,
          item.reference_code,
          item.remark,
          item.state_name,
          item.city_name,
          item.poStatus,
          item.poNumber,
        ]
          .filter(Boolean)
          .some((val) =>
            String(val).toLowerCase().includes(q)
          )
      );
    }

    if (filterRemark) {
      list = list.filter(
        (item) =>
          (item.remark || "").toLowerCase() ===
          filterRemark.toLowerCase()
      );
    }

    if (sortBy === "date-newest") {
      list.sort(
        (a, b) =>
          new Date(b.remarked_at).getTime() -
          new Date(a.remarked_at).getTime()
      );
    } else if (sortBy === "date-oldest") {
      list.sort(
        (a, b) =>
          new Date(a.remarked_at).getTime() -
          new Date(b.remarked_at).getTime()
      );
    } else if (sortBy === "firm-asc") {
      list.sort((a, b) =>
        (a.firm_name || "").localeCompare(
          b.firm_name || ""
        )
      );
    }

    return list;
  }, [quoteTenders, search, filterRemark, sortBy]);

  // ============================================================
  // STATISTICS
  // ============================================================

  const totalTenders = quoteTenders.length;

  const acceptedCount = useMemo(
    () =>
      quoteTenders.filter(
        (t) =>
          (t.remark || "").toLowerCase() === "accepted"
      ).length,
    [quoteTenders]
  );

  const rejectedCount = useMemo(
    () =>
      quoteTenders.filter(
        (t) =>
          (t.remark || "").toLowerCase() === "rejected"
      ).length,
    [quoteTenders]
  );

  const uniqueFirms = useMemo(
    () =>
      new Set(
        quoteTenders.map((t) => t.firm_name)
      ).size,
    [quoteTenders]
  );

  // ============================================================
  // TABLE COLUMNS
  // ============================================================

  const tableColumns =
    useMemo<ColumnDef<QuoteTenderOrder>[]>(() => {
      const allDefs: Record<
        string,
        ColumnDef<QuoteTenderOrder>
      > = {
        tenderNo: {
          accessorKey: "tender_no",
          header: sortableHeader("TENDER NO"),
          cell: ({ row }) => (
            <div className="flex flex-col gap-0.5 py-0.5">
              <span className="font-bold text-foreground text-xs md:text-sm">
                {row.original.tender_no || "—"}
              </span>
              {row.original.dveplCode && (
                <span className="text-[10px] text-muted-foreground font-semibold">
                  {row.original.dveplCode}
                </span>
              )}
            </div>
          ),
        },

        firmName: {
          accessorKey: "firm_name",
          header: sortableHeader("FIRM NAME"),
          cell: ({ row }) => (
            <div className="flex flex-col gap-0.5 py-0.5">
              <span className="font-semibold text-foreground text-xs">
                {row.original.firm_name || "—"}
              </span>
              {row.original.name && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  {row.original.name}
                </span>
              )}
            </div>
          ),
        },

        assignedUsers: {
          id: "assignedUsers",
          header: "ASSIGNED TO",
          cell: ({ row }) => {
            const item = row.original;
            const assignments = item.assignments || [];

            return (
              <div className="flex items-center gap-2 min-w-[140px]">
                {assignments.length > 0 ? (
                  <div
                    className="flex items-center -space-x-1.5 overflow-hidden"
                    title={assignments.map((a) => a.user?.name || a.userId).join(", ")}
                  >
                    {assignments.slice(0, 3).map((a, idx) => (
                      <span
                        key={a.id || a.userId || idx}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 border-2 border-background text-[10px] font-bold text-primary shrink-0 uppercase shadow-3xs"
                      >
                        {(a.user?.name || "U").charAt(0)}
                      </span>
                    ))}
                    {assignments.length > 3 && (
                      <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-muted border-2 border-background text-[10px] font-bold text-muted-foreground shrink-0 shadow-3xs">
                        +{assignments.length - 3}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] font-semibold text-muted-foreground/60 italic pl-1">
                    Unassigned
                  </span>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!isAdmin && !canEdit}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isAdmin && !canEdit) return;
                    setAssigningTender(item);
                  }}
                  className="size-7 rounded-lg hover:bg-primary/10 hover:text-primary transition-all duration-150 ml-auto shrink-0 border border-transparent hover:border-primary/10"
                  title={isAdmin || canEdit ? "Assign Users" : "Only administrators can manage assignments"}
                >
                  <UserPlus className="size-3.5" />
                </Button>
              </div>
            );
          },
        },

        accounts: {
          id: "accounts",
          header: "ACCOUNTS",
          cell: ({ row }) => {
            const item = row.original;
            const assignments = item.assignments || [];
            const canAccess =
              isAdmin ||
              assignments.some(
                (a) =>
                  a.userId === currentUserId &&
                  (!a.stage ||
                    a.stage === "ACCOUNTS_COSTING" ||
                    String(a.stage).toUpperCase().includes("ACCOUNT"))
              );

            return (
              <Button
                variant="outline"
                size="sm"
                disabled={!canAccess}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canAccess) return;
                  navigate(`/accounts/${item.id}`);
                }}
                className={`h-7 px-2.5 text-[11px] font-bold rounded-lg gap-1.5 shadow-3xs transition-all ${
                  canAccess
                    ? "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20 hover:bg-sky-500/20 hover:text-sky-700 cursor-pointer"
                    : "opacity-30 cursor-not-allowed border-muted text-muted-foreground bg-muted/10"
                }`}
                title={
                  canAccess
                    ? "Open Costing & Quotation sheet"
                    : "Restricted to assigned accounts personnel and administrators"
                }
              >
                <FileSpreadsheet className="size-3 text-sky-600 dark:text-sky-400" />
                <span>Accounts</span>
              </Button>
            );
          },
        },

        drawings: {
          id: "drawings",
          header: "DRAWINGS",
          cell: ({ row }) => {
            const item = row.original;
            const assignments = item.assignments || [];
            const canAccess =
              isAdmin ||
              assignments.some(
                (a) =>
                  a.userId === currentUserId &&
                  (!a.stage ||
                    a.stage === "DRAWING_ASSIGNED" ||
                    a.stage === "DRAWING_SENT" ||
                    a.stage === "REVISION_REQUIRED" ||
                    a.stage === "DRAWING_APPROVED" ||
                    String(a.stage).toUpperCase().includes("DRAWING") ||
                    String(a.stage).toUpperCase().includes("REVISION"))
              );

            return (
              <Button
                variant="outline"
                size="sm"
                disabled={!canAccess}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canAccess) return;
                  navigate(`/export-orders?orderId=${item.id}`);
                }}
                className={`h-7 px-2.5 text-[11px] font-bold rounded-lg gap-1.5 shadow-3xs transition-all ${
                  canAccess
                    ? "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20 hover:text-purple-700 cursor-pointer"
                    : "opacity-30 cursor-not-allowed border-muted text-muted-foreground bg-muted/10"
                }`}
                title={
                  canAccess
                    ? "Open Engineering Drawings"
                    : "Restricted to assigned drawing personnel and administrators"
                }
              >
                <Layers className="size-3 text-purple-600 dark:text-purple-400" />
                <span>Drawings</span>
              </Button>
            );
          },
        },

        contactPerson: {
          accessorKey: "name",
          header: "Name",
          cell: ({ getValue }) =>
            (getValue() as string) || "—",
        },

        mobile: {
          accessorKey: "mobile",
          header: "MOBILE",
          cell: ({ getValue }) =>
            (getValue() as string) || "—",
        },

        email: {
          accessorKey: "email_id",
          header: "EMAIL",
          cell: ({ getValue }) => (
            <span className="truncate max-w-[180px] text-xs text-muted-foreground inline-block">
              {(getValue() as string) || "—"}
            </span>
          ),
        },

        departmentName: {
          accessorKey: "department_name",
          header: "DEPARTMENT",
          cell: ({ getValue }) =>
            (getValue() as string) || "—",
        },

        stateCity: {
          id: "stateCity",
          header: "STATE / CITY",
          cell: ({ row }) => {
            const item = row.original;

            const parts = [
              item.city_name,
              item.state_name,
            ].filter(Boolean);

            return parts.length > 0
              ? parts.join(", ")
              : "—";
          },
        },

        tenderID: {
          accessorKey: "tenderID",
          header: "TENDER ID",
          cell: ({ getValue }) =>
            (getValue() as string) || "—",
        },

        referenceCode: {
          accessorKey: "reference_code",
          header: "REFERENCE CODE",
          cell: ({ getValue }) =>
            (getValue() as string) || "—",
        },

        poStatus: {
          accessorKey: "poStatus",
          header: "PO STATUS",
          cell: ({ row }) => {
            const val = String(row.original.poStatus || "No PO");
            const poNo = row.original.poNumber;
            const refCode = row.original.reference_code;
            const orderId = row.original.id;

            const badge: Record<string, string> = {
              ready: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
              "needs revision": "bg-rose-500/10 text-rose-600 border-rose-500/20",
              placed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
              ordered: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
              pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
              "no po": "bg-muted text-muted-foreground border-muted-foreground/10",
            };

            return (
              <div className="flex flex-col gap-1 items-start py-0.5">
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                    badge[val.toLowerCase()] || "bg-muted text-muted-foreground"
                  }`}
                >
                  {val}
                </span>
                {poNo && (
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {poNo}
                  </span>
                )}
                {refCode && (
                  <button
                    onClick={() => {
                      const mode = val === "No PO" ? "generate" : "view";
                      const params = new URLSearchParams({ mode });
                      if (refCode) params.set("ref", refCode);
                      if (orderId) params.set("order", orderId);
                      navigate(`/purchase/orders?${params.toString()}`);
                    }}
                    className="text-[10px] text-primary hover:text-primary-hover font-bold mt-0.5 flex items-center gap-0.5 transition-colors"
                  >
                    {val === "No PO" ? "＋ Generate PO" : "📂 View PO"}
                  </button>
                )}
              </div>
            );
          },
        },

        remark: {
          accessorKey: "remark",
          header: "REMARK",

          cell: ({ getValue }) => {
            const val = String(
              getValue() || "—"
            );

            const badge: Record<string, string> = {
              accepted:
                "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",

              rejected:
                "bg-rose-500/10 text-rose-600 border-rose-500/20",

              pending:
                "bg-amber-500/10 text-amber-600 border-amber-500/20",

              new_order:
                "bg-blue-500/10 text-blue-600 border-blue-500/20",

              "new order":
                "bg-blue-500/10 text-blue-600 border-blue-500/20",
            };

            return (
              <span
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                  badge[val.toLowerCase()] ||
                  "bg-muted text-muted-foreground"
                }`}
              >
                {val}
              </span>
            );
          },
        },

        remarkedAt: {
          accessorKey: "remarked_at",
          header: sortableHeader("REMARKED AT"),

          cell: ({ getValue }) => {
            const val = getValue() as string;

            return val
              ? new Date(val).toLocaleString("en-IN")
              : "—";
          },
        },

        fileName: {
          accessorKey: "file_name",
          header: "FILE",

          cell: ({ getValue }) => {
            const val =
              getValue() as string | null;

            if (!val || val === "null") {
              return "—";
            }

            return (
              <span
                className="truncate max-w-[160px] inline-flex items-center gap-1 text-xs text-muted-foreground"
                title={val}
              >
                <FileText className="size-3.5 text-muted-foreground shrink-0" />
                {val}
              </span>
            );
          },
        },
      };

      return (Object.keys(allDefs) as ColumnKey[])
        .filter((key) => visibleColumns[key])
        .map((key) => allDefs[key]);
    }, [visibleColumns, isAdmin, currentUserId]);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">

      {/* ========================================================
          HEADER
          ======================================================== */}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
            Orders
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your client tenders, purchase order status, and drawing synchronizations in real-time.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadQuoteTenders()}
          className="gap-2 self-start sm:self-center h-9 shadow-2xs hover:bg-muted/60 transition-colors"
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit Full Screen" : "Enter Full Screen"}
          className="gap-2 self-start sm:self-center h-9 shadow-2xs hover:bg-muted/60 transition-colors"
        >
          {isFullscreen ? (
            <Minimize2 className="size-3.5" />
          ) : (
            <Maximize2 className="size-3.5" />
          )}
          {isFullscreen ? "Exit Full Screen" : "Full Screen"}
        </Button>
      </div>

      {/* ========================================================
          METRIC CARDS
          ======================================================== */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

        {/* Total */}
        <div className="rounded-2xl border bg-gradient-to-br from-card to-indigo-500/[0.02] p-5 shadow-2xs hover:shadow-xs transition-all duration-300 hover:border-indigo-500/30 group">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Total Tenders
            </p>

            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 group-hover:scale-105 transition-transform duration-300">
              <FileText className="size-5" />
            </div>
          </div>

          <p className="mt-3 text-3xl font-bold tracking-tight">
            {totalTenders}
          </p>
          <p className="text-[10px] text-muted-foreground/80 mt-1.5 font-medium">
            Total records synced from portal
          </p>
        </div>

        {/* Accepted */}
        <div className="rounded-2xl border bg-gradient-to-br from-card to-emerald-500/[0.02] p-5 shadow-2xs hover:shadow-xs transition-all duration-300 hover:border-emerald-500/30 group">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Accepted
            </p>

            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 group-hover:scale-105 transition-transform duration-300">
              <CheckCircle2 className="size-5" />
            </div>
          </div>

          <p className="mt-3 text-3xl font-bold tracking-tight">
            {acceptedCount}
          </p>
          <p className="text-[10px] text-muted-foreground/80 mt-1.5 font-medium">
            Tenders ready for purchase orders
          </p>
        </div>

        {/* Rejected */}
        <div className="rounded-2xl border bg-gradient-to-br from-card to-rose-500/[0.02] p-5 shadow-2xs hover:shadow-xs transition-all duration-300 hover:border-rose-500/30 group">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Rejected
            </p>

            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 group-hover:scale-105 transition-transform duration-300">
              <XCircle className="size-5" />
            </div>
          </div>

          <p className="mt-3 text-3xl font-bold tracking-tight">
            {rejectedCount}
          </p>
          <p className="text-[10px] text-muted-foreground/80 mt-1.5 font-medium">
            Tenders requiring revision
          </p>
        </div>

        {/* Firms */}
        <div className="rounded-2xl border bg-gradient-to-br from-card to-violet-500/[0.02] p-5 shadow-2xs hover:shadow-xs transition-all duration-300 hover:border-violet-500/30 group">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Active Firms
            </p>

            <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600 group-hover:scale-105 transition-transform duration-300">
              <Users className="size-5" />
            </div>
          </div>

          <p className="mt-3 text-3xl font-bold tracking-tight">
            {uniqueFirms}
          </p>
          <p className="text-[10px] text-muted-foreground/80 mt-1.5 font-medium">
            Unique partner firms registered
          </p>
        </div>
      </div>

      {/* ========================================================
          TOOLBAR
          ======================================================== */}

      <div className="flex flex-wrap items-center justify-between gap-3 bg-card border rounded-2xl p-3 shadow-3xs">

        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-[260px] border border-muted-foreground/15 rounded-xl px-3 bg-muted/30 focus-within:bg-background focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 shadow-inner-sm transition-all duration-200">
          <Search className="size-4 text-muted-foreground" />

          <Input
            placeholder="Search tender no, firm, work, department..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="h-9 border-none shadow-none focus-visible:ring-0 px-0 text-xs font-medium"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">

          {/* Add Order Manually */}
          <Button
            variant="outline"
            size="sm"
            disabled={!canCreate}
            onClick={() => setIsAddOrderOpen(true)}
            title={canCreate ? "Add a sales order manually" : "You do not have permission to add orders"}
            className="gap-1.5 h-9 rounded-xl border-emerald-500/20 hover:border-emerald-500/40 text-emerald-600 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all duration-200 text-xs font-semibold"
          >
            <Plus className="size-3.5" />
            Add Order
          </Button>

          {/* Sync Portal Orders */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="gap-1.5 h-9 rounded-xl border-primary/20 hover:border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 transition-all duration-200 text-xs font-semibold"
          >
            <RefreshCw className={`size-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Portal Orders"}
          </Button>

          {/* Customize Columns */}
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-9 rounded-xl border-muted-foreground/15 text-xs font-semibold shadow-3xs"
                >
                  <SlidersHorizontal className="size-3.5" />
                  <span>Customize Columns</span>
                </Button>
              }
            />

            <PopoverContent
              align="end"
              className="w-64 p-3 space-y-3 z-50 bg-background border border-border/80 rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              <div className="flex items-center justify-between border-b pb-2">
                <span className="font-bold text-xs">
                  Toggle Columns
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 h-6 px-1.5 text-[11px] font-medium text-primary hover:text-primary hover:bg-primary/10 rounded"
                    onClick={() =>
                      setAllColumns(
                        !ALL_COLUMN_KEYS.every(
                          (c) => visibleColumns[c.id] ?? true
                        )
                      )
                    }
                  >
                    <Checkbox
                      checked={ALL_COLUMN_KEYS.every(
                        (c) => visibleColumns[c.id] ?? true
                      )}
                      className="pointer-events-none size-3.5"
                    />
                    Select All
                  </button>

                  <button
                    type="button"
                    className="h-6 px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground rounded"
                    onClick={() =>
                      setAllColumns(false)
                    }
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {ALL_COLUMN_KEYS.map((col) => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2.5 px-1 py-1 text-xs font-medium cursor-pointer hover:bg-muted/50 rounded transition-colors"
                  >
                    <Checkbox
                      checked={
                        visibleColumns[col.id] ??
                        true
                      }
                      onCheckedChange={() =>
                        toggleColumn(col.id)
                      }
                    />

                    <span>{col.label}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Remark Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">
              Remark
            </span>

            <Select
              value={filterRemark}
              onValueChange={(val) =>
                setFilterRemark(val ?? "")
              }
            >
              <SelectTrigger className="h-9 w-[130px] rounded-xl border-muted-foreground/15 bg-background shadow-3xs font-semibold focus:ring-1 focus:ring-primary/20">
                <SelectValue placeholder="All">
                  {filterRemark ? filterRemark.charAt(0).toUpperCase() + filterRemark.slice(1) : undefined}
                </SelectValue>
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="">
                  All
                </SelectItem>

                {remarkOptions.map((r) => (
                  <SelectItem
                    key={r}
                    value={r}
                  >
                    {r.charAt(0).toUpperCase() +
                      r.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">
              Sort
            </span>

            <Select
              value={sortBy}
              onValueChange={(val) =>
                setSortBy(
                  val ?? "date-newest"
                )
              }
            >
              <SelectTrigger className="h-9 w-[140px] rounded-xl border-muted-foreground/15 bg-background shadow-3xs font-semibold focus:ring-1 focus:ring-primary/20">
                <SelectValue placeholder="Date Newest">
                  {sortBy === "date-newest"
                    ? "Date Newest"
                    : sortBy === "date-oldest"
                    ? "Date Oldest"
                    : sortBy === "firm-asc"
                    ? "Firm A-Z"
                    : undefined}
                </SelectValue>
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="date-newest">
                  Date Newest
                </SelectItem>

                <SelectItem value="date-oldest">
                  Date Oldest
                </SelectItem>

                <SelectItem value="firm-asc">
                  Firm A-Z
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ========================================================
          MAIN TABLE
          ======================================================== */}

      <TenderTable
        columns={tableColumns}
        data={processedTenders}
        onView={(row) => navigate(`/orders/${row.id}?tab=workflow`)}
        onRowClick={(row) => navigate(`/orders/${row.id}?tab=workflow`)}
        onEdit={
          canEdit || isAdmin
            ? (row) => {
                setEditingOrder(row);
                setIsAddOrderOpen(true);
              }
            : undefined
        }
        onDelete={
          canDelete || isAdmin
            ? (row) => {
                setOrderToDelete(row);
              }
            : undefined
        }
        isLoading={isLoading}
        showColumnVisibility={false}
        storageKey="quote-tender-orders"
      />

      {/* ========================================================
          ASSIGN USERS MODAL
          ======================================================== */}
      <SalesOrderAssignModal
        open={Boolean(assigningTender)}
        onOpenChange={(open) => {
          if (!open) {
            setAssigningTender(null);
          }
        }}
        order={assigningTender}
        onSuccess={() => void loadQuoteTenders()}
      />

      {/* ========================================================
          ADD / EDIT ORDER MANUALLY MODAL
          ======================================================== */}
      <AddOrderModal
        open={isAddOrderOpen}
        onOpenChange={(open) => {
          setIsAddOrderOpen(open);
          if (!open) setEditingOrder(null);
        }}
        editingOrder={editingOrder}
        companyId={(currentUser as any)?.companyId || null}
        orderTakenById={currentUserId}
        onSuccess={() => void loadQuoteTenders()}
      />

      {/* ========================================================
          DELETE ORDER CONFIRMATION
          ======================================================== */}
      <ConfirmDialog
        open={Boolean(orderToDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setOrderToDelete(null);
        }}
        title={`Delete Order?`}
        description={
          orderToDelete
            ? `This will move order ${orderToDelete.dveplCode || orderToDelete.tender_no || ""} to the Recycle Bin. You can restore it later if needed.`
            : ""
        }
        confirmText="Delete Order"
        cancelText="Cancel"
        variant="danger"
        loading={isDeleting}
        onConfirm={() => void handleDeleteOrder()}
      />
    </div>
  );
}

export default OrdersPage;