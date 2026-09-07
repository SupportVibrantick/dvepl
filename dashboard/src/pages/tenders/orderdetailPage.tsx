import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  UserPlus,
  FileText,
  ExternalLink,
  RefreshCw,
  Maximize2,
  Minimize2,
  Circle,
  Clock3,
  ChevronRight,
  MoreVertical,
  ShieldCheck,
  Cpu,
  Layers,
  Check,
  RotateCcw,
  Users,
  Building2,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Tag,
  Briefcase,
  FileSpreadsheet,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "react-hot-toast";
import { useERPStore } from "@/store/erpStore";
import { isAdminUser } from "@/utils/pagePermissions";
import { useWorkflowTemplate } from "@/hooks/useWorkflowTemplate";
import workflowApi from "@/services/workflowApi";

// Build a full URL from a relative fileUrl path returned by the backend
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL ?? "";
function buildFileUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  try {
    return new URL(rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`, API_BASE_URL).toString();
  } catch {
    return rawUrl;
  }
}

import {
  SalesOrderAssignModal,
} from "./components/SalesOrderAssignModal";
import { AddOrderModal } from "./components/AddOrderModal";
import { ProjectDocumentUploadPanel } from "./components/ProjectDocumentUploadPanel";

import {
  QuoteTenderOrder,
  DetailItem,
  DetailSectionTitle,
  workflowStageLabel,
  workflowStagePercent,
  fetchQuoteTenderOrders,
} from "./orderShared";

// ============================================================
// TABS
// ============================================================

type TabId = "overview" | "workflow" | "documents" | "audit";

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useERPStore();

  const { stages: workflowStages } = useWorkflowTemplate();

  const currentUser = useMemo(() => {
    return store.users.find((user) => user.id === store.currentUserId) as any;
  }, [store.users, store.currentUserId]);

  const currentUserId = store.currentUserId || currentUser?.id || null;
  const isAdmin = isAdminUser(currentUser);

  const isOrderAssignedToCurrentUser = useCallback(
    (order: QuoteTenderOrder | null | undefined) => {
      if (!order || !currentUserId) return false;
      const orderStage = order.workflowStage;
      return (order.assignments || []).some(
        (assignment) =>
          assignment.userId === currentUserId &&
          (!orderStage ||
            assignment.stage === null ||
            assignment.stage === undefined ||
            assignment.stage === orderStage),
      );
    },
    [currentUserId],
  );

  const [tender, setTender] = useState<QuoteTenderOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<TabId>(
    initialTab === "workflow" ||
      initialTab === "documents" ||
      initialTab === "audit"
      ? (initialTab as TabId)
      : "overview",
  );

  const canWorkOnOrder = isAdmin || isOrderAssignedToCurrentUser(tender);

  // User's specific assignments on this tender
  const myAssignments = useMemo(() => {
    if (!tender || !currentUserId) return [];
    return (tender.assignments || []).filter((a) => a.userId === currentUserId);
  }, [tender, currentUserId]);

  const hasAllStagesAssignment = myAssignments.some(
    (a) => a.stage === null || a.stage === undefined || a.stage === ""
  );

  // Can the current user perform actions on a given workflow stage?
  const canWorkOnStage = useCallback(
    (stageKey: string): boolean => {
      if (isAdmin) return true;
      if (hasAllStagesAssignment) return true;
      return myAssignments.some((a) => a.stage === stageKey);
    },
    [isAdmin, hasAllStagesAssignment, myAssignments]
  );

  // Can the current user access the Accounts & Costing part?
  const canAccessAccounts = useMemo(() => {
    if (isAdmin) return true;
    if (hasAllStagesAssignment) return true;
    return myAssignments.some(
      (a) =>
        a.stage === "ACCOUNTS_COSTING" ||
        (a.stage || "").toUpperCase().includes("ACCOUNT")
    );
  }, [isAdmin, hasAllStagesAssignment, myAssignments]);

  // Can the current user access the Vendors / PO part?
  const canAccessVendors = useMemo(() => {
    if (isAdmin) return true;
    if (hasAllStagesAssignment) return true;
    return myAssignments.some(
      (a) =>
        (a.stage || "").toUpperCase().includes("VENDOR") ||
        (a.stage || "").toUpperCase().includes("PO") ||
        a.stage === "DRAWING_ASSIGNED" ||
        a.stage === "DRAWING_APPROVED" ||
        a.stage === "PO_READY" ||
        a.stage === "PO_PLACED"
    );
  }, [isAdmin, hasAllStagesAssignment, myAssignments]);

  // Can the current user access the Engineering Drawings part?
  const canAccessDrawings = useMemo(() => {
    if (isAdmin) return true;
    if (hasAllStagesAssignment) return true;
    return myAssignments.some(
      (a) =>
        a.stage === "DRAWING_SENT" ||
        a.stage === "REVISION_REQUIRED" ||
        (a.stage || "").toUpperCase().includes("DRAWING") ||
        (a.stage || "").toUpperCase().includes("REVISION")
    );
  }, [isAdmin, hasAllStagesAssignment, myAssignments]);

  const [assigningTender, setAssigningTender] =
    useState<QuoteTenderOrder | null>(null);
  const [assigningStageKey, setAssigningStageKey] = useState<string | null>(
    null,
  );
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);

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

  const loadTender = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const result = await fetchQuoteTenderOrders();
      if (!result.success) {
        toast.error(result.message ?? "Unable to load order.");
        setIsLoading(false);
        return;
      }
      const found = result.rows.find((r) => r.id === id);
      if (!found) {
        setNotFound(true);
      } else {
        setTender(found);
        setNotFound(false);
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ?? "Unable to load order.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadTender();
  }, [loadTender]);

  const handleStageToggle = async (stageKey: string, checked: boolean) => {
    if (!tender || !canWorkOnOrder) return;
    const currentIndex = workflowStages.findIndex(
      (s) => s.key === tender.workflowStage,
    );
    const targetIndex = workflowStages.findIndex((s) => s.key === stageKey);
    if (targetIndex === -1) return;

    // Checking a stage advances the order past it; unchecking reverts the
    // workflow back to that stage (making it the current/in-progress stage).
    const targetStage = checked
      ? workflowStages[Math.min(targetIndex + 1, workflowStages.length - 1)]
          ?.key ?? stageKey
      : stageKey;

    if (targetStage === tender.workflowStage && currentIndex === targetIndex) {
      return;
    }

    setIsUpdatingStage(true);
    try {
      await workflowApi.updateOrderWorkflowStage(tender.id, targetStage, {
        description: checked
          ? `Marked "${workflowStages[targetIndex]?.name}" as completed`
          : `Reopened "${workflowStages[targetIndex]?.name}"`,
      });
      toast.success(
        checked ? "Stage marked as completed." : "Stage reopened.",
      );
      await loadTender();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ?? "Failed to update workflow stage.",
      );
    } finally {
      setIsUpdatingStage(false);
    }
  };

  const openAssignForStage = (stageKey: string) => {
    if (!isAdmin) return;
    setAssigningStageKey(stageKey);
    setAssigningTender(tender);
  };

  const openAssignAll = () => {
    if (!isAdmin) return;
    setAssigningStageKey(null);
    setAssigningTender(tender);
  };

  const drawingsCount = tender?.drawings?.length ?? 0;
  const attachmentCount = tender?.attachments?.length ?? 0;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "workflow", label: "Workflow" },
    { id: "documents", label: "Documents", count: drawingsCount + attachmentCount },
    { id: "audit", label: "Communication & Audit" },
  ];

  // ============================================================
  // LOADING / NOT FOUND STATES
  // ============================================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" />
          Loading order…
        </div>
      </div>
    );
  }

  if (notFound || !tender) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-sm font-semibold text-muted-foreground">
          This order could not be found.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-xl"
          onClick={() => navigate("/tender/orders")}
        >
          <ArrowLeft className="size-3.5" />
          Back to Orders
        </Button>
      </div>
    );
  }

  const remarkStyles: Record<string, string> = {
    accepted: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    rejected: "bg-rose-500/10 text-rose-600 border-rose-500/20",
    pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    new_order: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    "new order": "bg-blue-500/10 text-blue-600 border-blue-500/20",
  };
  const remarkKey = String(tender.remark || "").toLowerCase();

  return (
    <div className="flex flex-col h-full">
      {/* ========================================================
          PAGE HEADER
          ======================================================== */}

      <div className="border-b bg-card/60 backdrop-blur px-4 sm:px-6 py-4 space-y-4">
        {/* Top Action Bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/tender/orders")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 -ml-2 rounded-lg hover:bg-muted"
            >
              <ArrowLeft className="size-3.5" />
              Back to Orders
            </button>
            <span className="text-muted-foreground/40">|</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                {tender.tender_no || tender.dveplCode || "Order Details"}
              </span>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${
                  remarkStyles[remarkKey] ||
                  "bg-muted text-muted-foreground border-muted-foreground/10"
                }`}
              >
                {tender.remark || "Pending"}
              </span>
              {tender.dveplCode && (
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border bg-muted/40 text-muted-foreground">
                  {tender.dveplCode}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Full Screen" : "Enter Full Screen"}
              className="h-8 text-xs font-semibold rounded-xl gap-1.5"
            >
              {isFullscreen ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )}
              <span className="hidden sm:inline">
                {isFullscreen ? "Exit Full Screen" : "Full Screen"}
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canAccessAccounts}
              onClick={() => {
                if (!canAccessAccounts) return;
                navigate(`/accounts/${tender.id}`);
              }}
              className={`h-8 text-xs font-bold rounded-xl gap-1.5 border-sky-500/30 transition-all shadow-3xs ${
                canAccessAccounts
                  ? "text-sky-600 dark:text-sky-400 bg-sky-500/5 hover:bg-sky-500/10 cursor-pointer"
                  : "opacity-40 cursor-not-allowed bg-muted/20 text-muted-foreground"
              }`}
              title={
                canAccessAccounts
                  ? "Open Accounts Costing & Quotation sheet"
                  : "Accounts & Costing is only accessible to assigned accounts personnel and administrators"
              }
            >
              <FileSpreadsheet className="size-3.5" />
              <span>Accounts & Costing</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canAccessVendors}
              onClick={() => {
                if (!canAccessVendors) return;
                navigate(`/purchase/vendors?orderId=${tender.id}&ref=${encodeURIComponent(tender.reference_code || "")}`);
              }}
              className={`h-8 text-xs font-bold rounded-xl gap-1.5 border-amber-500/30 transition-all shadow-3xs ${
                canAccessVendors
                  ? "text-amber-600 dark:text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 cursor-pointer"
                  : "opacity-40 cursor-not-allowed bg-muted/20 text-muted-foreground"
              }`}
              title={
                canAccessVendors
                  ? "Open Vendors & Purchase Orders"
                  : "Vendors is only accessible to authorized personnel and administrators"
              }
            >
              <Users className="size-3.5" />
              <span>Vendors</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canAccessDrawings}
              onClick={() => {
                if (!canAccessDrawings) return;
                navigate(`/export-orders?orderId=${tender.id}`);
              }}
              className={`h-8 text-xs font-bold rounded-xl gap-1.5 border-purple-500/30 transition-all shadow-3xs ${
                canAccessDrawings
                  ? "text-purple-600 dark:text-purple-400 bg-purple-500/5 hover:bg-purple-500/10 cursor-pointer"
                  : "opacity-40 cursor-not-allowed bg-muted/20 text-muted-foreground"
              }`}
              title={
                canAccessDrawings
                  ? "Open Engineering Drawings & Revisions"
                  : "Engineering Drawings is only accessible to assigned drawing personnel and administrators"
              }
            >
              <Layers className="size-3.5" />
              <span>Engineering Drawings</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold rounded-xl"
              onClick={() => setIsEditOpen(true)}
            >
              Edit
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={!isAdmin}
              onClick={() => {
                if (!isAdmin) return;
                setAssigningTender(tender);
              }}
              title={
                isAdmin
                  ? "Manage Assignments"
                  : "Only administrators can manage assignments"
              }
              className="h-8 text-xs font-bold rounded-xl gap-1.5"
            >
              <UserPlus className="size-3.5" />
              Assignments
            </Button>
          </div>
        </div>

        {/* Basic Order & Customer Details Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Order Info */}
          <div className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-2xs">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <FileText className="size-3.5 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Order No / CA</span>
            </div>
            <p className="text-xs font-bold text-foreground truncate" title={tender.tender_no}>
              {tender.tender_no || "—"}
            </p>
            {tender.reference_code && (
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                Ref: {tender.reference_code}
              </p>
            )}
          </div>

          {/* Customer / Firm */}
          <div className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-2xs">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Building2 className="size-3.5 text-blue-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Customer / Firm</span>
            </div>
            <p className="text-xs font-bold text-foreground truncate" title={tender.firm_name}>
              {tender.firm_name || "—"}
            </p>
            {tender.name && (
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5 truncate">
                Contact: {tender.name}
              </p>
            )}
          </div>

          {/* Contact Details */}
          <div className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-2xs">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Phone className="size-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Phone & Email</span>
            </div>
            <p className="text-xs font-bold text-foreground truncate">
              {tender.mobile || "—"}
            </p>
            {tender.email_id && (
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5 truncate" title={tender.email_id}>
                {tender.email_id}
              </p>
            )}
          </div>

          {/* Department / Jurisdiction */}
          <div className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-2xs">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <MapPin className="size-3.5 text-purple-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Department / Location</span>
            </div>
            <p className="text-xs font-bold text-foreground truncate" title={tender.department_name}>
              {tender.department_name || "—"}
            </p>
            {(tender.state_name || tender.city_name) && (
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5 truncate">
                {[tender.city_name, tender.state_name].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>

        {/* Name of Work (if present) */}
        {tender.name_of_work && (
          <div className="flex items-start gap-2 bg-muted/40 rounded-xl px-3 py-2 border border-border/60">
            <Briefcase className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1.5">
                Work:
              </span>
              <span className="text-xs font-medium text-foreground line-clamp-2">
                {tender.name_of_work}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          TAB BAR
          ======================================================== */}

      <div className="flex items-center gap-1 border-b px-4 sm:px-6 bg-background overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
              activeTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span
                className={`ml-1.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[9px] ${
                  activeTab === t.id
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ========================================================
          TAB CONTENT
          ======================================================== */}

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 scrollbar-thin">
        <div className="max-w-5xl mx-auto space-y-7">
          {activeTab === "overview" && (
            <>
              {/* Order & Tender Information */}
              <section className="space-y-3">
                <DetailSectionTitle
                  title="Order & Tender Specifications"
                  color="bg-primary"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <DetailItem label="Tender / CA Number" value={tender.tender_no} />
                  <DetailItem label="Internal DVEPL Code" value={tender.dveplCode} />
                  <DetailItem label="Tender ID" value={tender.tenderID} />
                  <DetailItem label="Reference Code" value={tender.reference_code} />
                  <DetailItem label="Order Status" value={tender.remark} />
                  <DetailItem
                    label="Created On"
                    value={
                      tender.remarked_at
                        ? new Date(tender.remarked_at).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"
                    }
                  />
                  {tender.dueDate && (
                    <DetailItem
                      label="Target Due Date"
                      value={new Date(tender.dueDate).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    />
                  )}
                  {tender.nextAction && (
                    <DetailItem
                      label="Next Action"
                      value={tender.nextAction}
                      className="sm:col-span-2"
                    />
                  )}
                </div>
              </section>

              {/* Customer & Contact Details */}
              <section className="border-t pt-6 space-y-3">
                <DetailSectionTitle
                  title="Customer & Contact Details"
                  color="bg-blue-500"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <DetailItem label="Customer / Firm Name" value={tender.firm_name} className="sm:col-span-2" />
                  <DetailItem label="Contact Person" value={tender.name} />
                  <DetailItem label="Mobile / Phone" value={tender.mobile} />
                  <DetailItem label="Email Address" value={tender.email_id} className="sm:col-span-2" />
                  <DetailItem label="State / Region" value={tender.state_name} />
                  <DetailItem label="City" value={tender.city_name} />
                </div>
              </section>

              {/* Jurisdiction & Department */}
              <section className="border-t pt-6 space-y-3">
                <DetailSectionTitle title="Jurisdiction & Structure" color="bg-emerald-500" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <DetailItem label="Department" value={tender.department_name} />
                  <DetailItem label="Division" value={tender.division_name} />
                  <DetailItem label="Sub Division" value={tender.subdivision} />
                  <DetailItem label="Section" value={tender.section_name} />
                </div>
              </section>

              {/* Purchase Order Status */}
              {tender.poStatus && (
                <section className="border-t pt-6 space-y-3">
                  <DetailSectionTitle
                    title="Purchase Order Status"
                    color="bg-indigo-500"
                  />
                  <div className="rounded-2xl border border-border/80 bg-muted/20 p-4 flex items-center justify-between gap-4 flex-wrap shadow-2xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">
                          {tender.poStatus}
                        </span>
                        {tender.poNumber && (
                          <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-muted text-foreground border border-border/60">
                            PO #{tender.poNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Purchase Order synchronization status for this sales record.
                      </p>
                    </div>
                    {tender.reference_code && (
                      <button
                        onClick={() =>
                          navigate(
                            `/purchase/orders?${new URLSearchParams({
                              ref: tender.reference_code,
                              order: tender.id,
                              mode: tender.poStatus === "No PO" ? "generate" : "view",
                            }).toString()}`,
                          )
                        }
                        className="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors border border-primary/20"
                      >
                        {tender.poStatus === "No PO"
                          ? "＋ Generate PO"
                          : "View PO"}
                        <ExternalLink className="size-3" />
                      </button>
                    )}
                  </div>
                </section>
              )}
            </>
          )}

          {activeTab === "workflow" && (
            <>
              {workflowStages.length > 0 ? (
                (() => {
                  const currentIndex = workflowStages.findIndex(
                    (s) => s.key === tender.workflowStage,
                  );
                  const percent = workflowStagePercent(
                    tender.workflowStage,
                    workflowStages,
                  );
                  const isDone = currentIndex === workflowStages.length - 1;

                  // Helper function to pick an intuitive, themed Lucide icon for each stage
                  const getStageIcon = (stageKey: string, stageName: string, index: number) => {
                    const key = stageKey.toUpperCase();
                    const name = (stageName || "").toLowerCase();
                    if (key.includes("ACCOUNT") || key.includes("COSTING") || name.includes("costing") || name.includes("account")) {
                      return <FileSpreadsheet className="size-4.5" />;
                    }
                    if (name.includes("vendor") || (name.includes("upload") && name.includes("po"))) {
                      return <Users className="size-4.5" />;
                    }
                    if (name.includes("drawing") || (key.includes("DRAWING") && !name.includes("vendor") && !name.includes("po"))) {
                      return <Layers className="size-4.5" />;
                    }
                    if (key.includes("DOC") || key.includes("INITIAL")) {
                      return <FileText className="size-4.5" />;
                    }
                    if (
                      key.includes("SEC") ||
                      key.includes("CLEAR") ||
                      key.includes("APPROVAL") ||
                      key.includes("APPROVED")
                    ) {
                      return <ShieldCheck className="size-4.5" />;
                    }
                    if (
                      key.includes("CONF") ||
                      key.includes("SYS")
                    ) {
                      return <Cpu className="size-4.5" />;
                    }
                    if (key.includes("PO") || key.includes("ORDER")) {
                      return <Users className="size-4.5" />;
                    }
                    // Fallback cycles based on stage index
                    const icons = [
                      <FileText className="size-4.5" />,
                      <ShieldCheck className="size-4.5" />,
                      <Cpu className="size-4.5" />,
                      <Layers className="size-4.5" />,
                      <CheckCircle2 className="size-4.5" />,
                    ];
                    return icons[index % icons.length];
                  };

                  return (
                    <div className="space-y-6">
                      {/* Top Header Card */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h2 className="text-xl font-bold tracking-tight text-foreground">
                            {tender.tender_no
                              ? `${tender.tender_no} Workflow Sequence`
                              : "Onboarding & Production Sequence"}
                          </h2>
                          <p className="text-xs text-muted-foreground mt-1">
                            Manage and track the critical pipeline stages for this order.
                          </p>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <Button
                            size="sm"
                            disabled={!isAdmin}
                            onClick={openAssignAll}
                            title={
                              isAdmin
                                ? "Assign users to all stages"
                                : "Only administrators can assign all stages"
                            }
                            className="h-9 px-4 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all flex items-center gap-2"
                          >
                            <UserPlus className="size-3.5" />
                            Assign All Stages
                          </Button>
                        </div>
                      </div>

                      {/* Overall Completion Box */}
                      <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs transition-all">
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-xs sm:text-sm font-bold text-foreground">
                            Overall Completion
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                            {isDone ? "100%" : `${percent}%`}
                          </span>
                        </div>
                        <div className="w-full bg-muted/60 dark:bg-muted/40 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${Math.max(percent, isDone ? 100 : 0)}%` }}
                          />
                        </div>
                      </div>

                      {/* Workflow Step Cards */}
                      <div className="space-y-3">
                        {workflowStages.map((s, i) => {
                          const stageCompleted = i < currentIndex;
                          const stageCurrent = i === currentIndex;
                          const stagePending = i > currentIndex;
                          const isAccountsStage =
                            s.key === "ACCOUNTS_COSTING" ||
                            s.key.toUpperCase().includes("ACCOUNT") ||
                            s.name.toLowerCase().includes("account");

                          const nameLower = s.name.toLowerCase();
                          const keyUpper = s.key.toUpperCase();

                          // Vendor / PO stage: "Upload Purchase Order (PO) for Vendor", or any stage mentioning vendor or PO creation for vendor
                          const isVendorStage =
                            !isAccountsStage &&
                            (nameLower.includes("vendor") ||
                             (nameLower.includes("upload") && nameLower.includes("po")) ||
                             (nameLower.includes("purchase order") && nameLower.includes("vendor")) ||
                             nameLower.includes("upload purchase order") ||
                             (keyUpper.includes("VENDOR") && !nameLower.includes("drawing")));

                          // Drawing stage: specifically for drawings, ensuring vendor/PO stages are NOT misidentified as drawing stages
                          const isDrawingStage =
                            !isAccountsStage &&
                            !isVendorStage &&
                            (nameLower.includes("drawing") ||
                             (keyUpper.includes("DRAWING") && !nameLower.includes("vendor") && !nameLower.includes("po")));

                          const stageUsers = (tender.assignments || []).filter(
                            (a) =>
                              !a.stage ||
                              a.stage === s.key ||
                              a.stage === "",
                          );
                          const stageRemark = (tender.assignments || []).find(
                            (a) =>
                              a.remarks &&
                              (!a.stage || a.stage === s.key || a.stage === ""),
                          )?.remarks;

                          return (
                            <div
                              key={s.key}
                              onClick={() => {
                                if (isAccountsStage && canAccessAccounts) {
                                  navigate(`/accounts/${tender.id}`);
                                } else if (isVendorStage && canAccessVendors) {
                                  navigate(`/purchase/vendors?orderId=${tender.id}&ref=${encodeURIComponent(tender.reference_code || "")}`);
                                } else if (isDrawingStage && canAccessDrawings) {
                                  navigate(`/export-orders?orderId=${tender.id}`);
                                }
                              }}
                              className={`group relative flex items-center justify-between gap-3 sm:gap-4 rounded-2xl border bg-card p-3.5 sm:p-4 transition-all duration-200 shadow-xs hover:shadow-md ${
                                isAccountsStage && canAccessAccounts
                                  ? "cursor-pointer hover:border-sky-500/50 hover:bg-sky-500/[0.02]"
                                  : isVendorStage && canAccessVendors
                                    ? "cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/[0.02]"
                                    : isDrawingStage && canAccessDrawings
                                      ? "cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/[0.02]"
                                      : ""
                              } ${
                                stageCurrent
                                  ? "border-blue-500/40 ring-1 ring-blue-500/20 bg-blue-500/[0.02]"
                                  : stageCompleted
                                    ? "border-emerald-500/30 bg-emerald-500/[0.01]"
                                    : "border-border/80 hover:border-border"
                              }`}
                            >
                              <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
                                {/* Left icon badge */}
                                <div
                                  className={`size-10 sm:size-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                    isAccountsStage
                                      ? "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400"
                                      : isVendorStage
                                        ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                                        : isDrawingStage
                                          ? "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400"
                                          : stageCurrent
                                            ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                                            : stageCompleted
                                              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                                              : "bg-purple-50 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400"
                                  }`}
                                >
                                  {getStageIcon(s.key, s.name, i)}
                                </div>

                                {/* Step Title and assigned users */}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {/* Small status dot indicator */}
                                    <span
                                      className={`size-2 rounded-full shrink-0 ${
                                        stageCurrent
                                          ? "bg-blue-600 dark:bg-blue-400 animate-pulse"
                                          : stageCompleted
                                            ? "bg-emerald-500"
                                            : "bg-muted-foreground/40"
                                      }`}
                                    />
                                    <h4 className="text-xs sm:text-sm font-bold text-foreground truncate">
                                      {s.name}
                                    </h4>
                                    {isAccountsStage && (
                                      <span
                                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                                          canAccessAccounts
                                            ? "text-sky-600 dark:text-sky-400 bg-sky-500/10"
                                            : "text-muted-foreground bg-muted/40"
                                        }`}
                                      >
                                        {canAccessAccounts ? "Click to open accounts" : "Restricted access"}
                                      </span>
                                    )}
                                    {isVendorStage && (
                                      <span
                                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                                          canAccessVendors
                                            ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                                            : "text-muted-foreground bg-muted/40"
                                        }`}
                                      >
                                        {canAccessVendors ? "Click to open vendors" : "Restricted access"}
                                      </span>
                                    )}
                                    {isDrawingStage && (
                                      <span
                                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                                          canAccessDrawings
                                            ? "text-purple-600 dark:text-purple-400 bg-purple-500/10"
                                            : "text-muted-foreground bg-muted/40"
                                        }`}
                                      >
                                        {canAccessDrawings ? "Click to open drawings" : "Restricted access"}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Users className="size-3 shrink-0 opacity-70" />
                                      {stageUsers.length > 0
                                        ? `${stageUsers.length} user${stageUsers.length > 1 ? "s" : ""} assigned`
                                        : "No users assigned"}
                                    </span>
                                    {stageRemark && (
                                      <>
                                        <span>•</span>
                                        <span className="italic truncate max-w-[220px]" title={stageRemark}>
                                          “{stageRemark}”
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Right Side: Status Badge + Action Menu */}
                              <div
                                className="flex items-center gap-2 sm:gap-3 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isAccountsStage && canAccessAccounts && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate(`/accounts/${tender.id}`)}
                                    className="h-7 text-xs font-semibold rounded-lg gap-1.5 border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 cursor-pointer shadow-3xs"
                                    title="Open Accounts & Costing page"
                                  >
                                    <FileSpreadsheet className="size-3.5" />
                                    <span className="hidden sm:inline">Open Accounts Page</span>
                                    <ChevronRight className="size-3" />
                                  </Button>
                                )}
                                {isVendorStage && canAccessVendors && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate(`/purchase/vendors?orderId=${tender.id}&ref=${encodeURIComponent(tender.reference_code || "")}`)}
                                    className="h-7 text-xs font-semibold rounded-lg gap-1.5 border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer shadow-3xs"
                                    title="Open Vendors page"
                                  >
                                    <Users className="size-3.5" />
                                    <span className="hidden sm:inline">Open Vendors Page</span>
                                    <ChevronRight className="size-3" />
                                  </Button>
                                )}
                                {isDrawingStage && canAccessDrawings && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate(`/export-orders?orderId=${tender.id}`)}
                                    className="h-7 text-xs font-semibold rounded-lg gap-1.5 border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 cursor-pointer shadow-3xs"
                                    title="Open Engineering Drawings page"
                                  >
                                    <Layers className="size-3.5" />
                                    <span className="hidden sm:inline">Open Drawings Page</span>
                                    <ChevronRight className="size-3" />
                                  </Button>
                                )}

                                {/* Status Pill Badge */}
                                <span
                                  className={`inline-flex items-center justify-center font-bold text-[10px] tracking-wider uppercase px-3 py-1 rounded-full border ${
                                    stageCompleted
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                      : stageCurrent
                                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                        : "bg-muted text-muted-foreground border-border/80"
                                  }`}
                                >
                                  {stageCompleted
                                    ? "Completed"
                                    : stageCurrent
                                      ? "In Progress"
                                      : "Pending"}
                                </span>

                                {/* 3-Dots Action Menu */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        aria-label="Stage actions"
                                        className="size-8 rounded-lg p-0 text-muted-foreground/70 hover:text-foreground hover:bg-muted cursor-pointer"
                                      >
                                        <MoreVertical className="size-4" />
                                      </Button>
                                    }
                                  />
                                  <DropdownMenuContent
                                    align="end"
                                    sideOffset={6}
                                    className="w-52 rounded-xl p-1.5 shadow-lg border border-border bg-popover text-popover-foreground"
                                  >
                                    {isAccountsStage && canAccessAccounts && (
                                      <>
                                        <DropdownMenuItem
                                          onClick={() => navigate(`/accounts/${tender.id}`)}
                                          className="gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-sky-600 dark:text-sky-400 cursor-pointer"
                                        >
                                          <FileSpreadsheet className="size-3.5 text-sky-500" />
                                          Open Accounts & Costing
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                      </>
                                    )}

                                    {isVendorStage && canAccessVendors && (
                                      <>
                                        <DropdownMenuItem
                                          onClick={() => navigate(`/purchase/vendors?orderId=${tender.id}&ref=${encodeURIComponent(tender.reference_code || "")}`)}
                                          className="gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 cursor-pointer"
                                        >
                                          <Users className="size-3.5 text-amber-500" />
                                          Open Vendors Page
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                      </>
                                    )}

                                    {isDrawingStage && canAccessDrawings && (
                                      <>
                                        <DropdownMenuItem
                                          onClick={() => navigate(`/export-orders?orderId=${tender.id}`)}
                                          className="gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-purple-600 dark:text-purple-400 cursor-pointer"
                                        >
                                          <Layers className="size-3.5 text-purple-500" />
                                          Open Engineering Drawings
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                      </>
                                    )}

                                    {canWorkOnStage(s.key) && (
                                      <DropdownMenuItem
                                        onClick={() => handleStageToggle(s.key, !stageCompleted)}
                                        disabled={isUpdatingStage}
                                        className="gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold cursor-pointer"
                                      >
                                        {stageCompleted ? (
                                          <>
                                            <RotateCcw className="size-3.5 text-amber-500" />
                                            Reopen Stage
                                          </>
                                        ) : (
                                          <>
                                            <Check className="size-3.5 text-emerald-500" />
                                            Mark as Completed
                                          </>
                                        )}
                                      </DropdownMenuItem>
                                    )}

                                    {!canWorkOnStage(s.key) && !isAdmin && (!isAccountsStage || !canAccessAccounts) && (
                                      <div className="px-2.5 py-2 text-[11px] text-muted-foreground italic">
                                        View-only (Not assigned to this stage)
                                      </div>
                                    )}

                                    {isAdmin && (
                                      <>
                                        {canWorkOnStage(s.key) && <DropdownMenuSeparator />}
                                        <DropdownMenuItem
                                          onClick={() => openAssignForStage(s.key)}
                                          className="gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold cursor-pointer"
                                        >
                                          <UserPlus className="size-3.5 text-primary" />
                                          Assign Users
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Next Action & Due Date Footer Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        <div className="rounded-2xl border border-border/70 bg-card px-4 py-3.5 shadow-xs">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Next Action
                          </p>
                          <p className="mt-1 text-xs font-semibold text-foreground">
                            {tender.nextAction || "No action assigned"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-card px-4 py-3.5 shadow-xs">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Target Due Date
                          </p>
                          <p className="mt-1 text-xs font-semibold text-foreground">
                            {tender.dueDate
                              ? new Date(tender.dueDate).toLocaleDateString(
                                  "en-IN",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )
                              : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-8 text-center shadow-xs">
                  <p className="text-xs font-medium text-muted-foreground">
                    No workflow template has been configured for this order yet.
                  </p>
                </div>
              )}

              <section className="border-t pt-7">
                <div className="flex items-center justify-between mb-4">
                  <DetailSectionTitle title="Assigned Users" color="bg-violet-500" />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!isAdmin}
                    onClick={() => {
                      if (!isAdmin) return;
                      setAssigningTender(tender);
                    }}
                    title={
                      isAdmin
                        ? "Manage Assignments"
                        : "Only administrators can manage assignments"
                    }
                    className="gap-1.5 h-8 text-xs font-bold border-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-500/5 hover:border-violet-500/40 rounded-xl transition-all duration-200"
                  >
                    <UserPlus className="size-3.5" />
                    Manage Assignments
                  </Button>
                </div>

                <div className="rounded-2xl border border-border/80 bg-muted/10 p-4 shadow-3xs">
                  {tender.assignments && tender.assignments.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {tender.assignments.map((assignment, idx) => (
                        <div
                          key={assignment.id || assignment.userId || idx}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-background shadow-3xs"
                        >
                          <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] uppercase border">
                            {(assignment.user?.name || "U").charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-xs text-foreground">
                              {assignment.user?.name ||
                                "User ID: " + assignment.userId}
                            </p>
                            {assignment.user?.email && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {assignment.user.email}
                              </p>
                            )}
                          </div>
                          <span
                            className={`ml-1 inline-flex items-center text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
                              assignment.stage
                                ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20"
                                : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"
                            }`}
                          >
                            {assignment.stage
                              ? workflowStageLabel(assignment.stage, workflowStages)
                              : "All Stages"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-muted-foreground p-1">
                      <span className="italic font-medium">
                        No users are currently assigned to this order.
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!isAdmin}
                        onClick={() => {
                          if (!isAdmin) return;
                          setAssigningTender(tender);
                        }}
                        title={
                          isAdmin
                            ? "Assign Users"
                            : "Only administrators can manage assignments"
                        }
                        className="h-8 text-xs font-bold rounded-lg px-3"
                      >
                        ＋ Assign Now
                      </Button>
                    </div>
                  )}
                </div>
              </section>

              <section className="border-t pt-7">
                <DetailSectionTitle
                  title="Work Access Status"
                  color={
                    isAdmin || hasAllStagesAssignment
                      ? "bg-emerald-500"
                      : myAssignments.length > 0
                        ? "bg-violet-500"
                        : "bg-amber-500"
                  }
                />
                <div
                  className={`rounded-2xl border p-4 flex items-start gap-3 shadow-3xs ${
                    isAdmin || hasAllStagesAssignment
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-950 dark:text-emerald-300"
                      : myAssignments.length > 0
                        ? "border-violet-500/20 bg-violet-500/5 text-violet-950 dark:text-violet-300"
                        : "border-amber-500/20 bg-amber-500/5 text-amber-950 dark:text-amber-300"
                  }`}
                >
                  {isAdmin || hasAllStagesAssignment || myAssignments.length > 0 ? (
                    <CheckCircle2
                      className={`size-5 shrink-0 mt-0.5 ${
                        isAdmin || hasAllStagesAssignment
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-violet-600 dark:text-violet-400"
                      }`}
                    />
                  ) : (
                    <XCircle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-sm font-bold leading-none">
                      {isAdmin
                        ? "Full Administrator Access"
                        : hasAllStagesAssignment
                          ? "Assigned to All Stages"
                          : myAssignments.length > 0
                            ? `Assigned Responsibilities: ${myAssignments
                                .map((a) =>
                                  a.stage
                                    ? workflowStageLabel(a.stage, workflowStages)
                                    : "All Stages"
                                )
                                .join(", ")}`
                            : "View-only Mode"}
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground/80 leading-normal font-medium">
                      {isAdmin
                        ? "You have full administrator access across all stages and financial operations for this order."
                        : hasAllStagesAssignment
                          ? "You are assigned to oversee and manage all workflow stages for this order."
                          : myAssignments.length > 0
                            ? "You have authorization to perform actions only on your assigned stages (e.g. Accounts & Costing, Drawings, etc.). Other stages are view-only."
                            : "You are not assigned to this tender. You have view-only access. Only assigned team members and administrators can modify this order."}
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeTab === "documents" && (
            <>
              <section>
                <DetailSectionTitle title="Project Documents" color="bg-cyan-500" />
                <ProjectDocumentUploadPanel
                  attachments={tender.attachments || []}
                  immediate
                  orderId={tender.id}
                  disabled={!isOrderAssignedToCurrentUser(tender) && !isAdmin}
                  onUploaded={() => void loadTender()}
                  onDeleted={() => void loadTender()}
                />
                {!isOrderAssignedToCurrentUser(tender) && !isAdmin && (
                  <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                    View-only: you can open attached documents but cannot add
                    or remove them.
                  </p>
                )}
              </section>

              <section className="border-t pt-7">
                <DetailSectionTitle title="Engineering Drawings" color="bg-primary" />

                {tender.drawings && tender.drawings.length > 0 ? (
                  <div className="rounded-2xl border border-border/80 overflow-hidden shadow-3xs">
                    <div className="divide-y divide-border/60">
                      {tender.drawings.map((drawing) => (
                        <div
                          key={drawing.id}
                          className="flex items-center justify-between gap-4 px-4 py-3 bg-muted/10 hover:bg-muted/20 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/15 shrink-0">
                              <FileText className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-foreground truncate">
                                {drawing.title || drawing.drawingNo || "Untitled Drawing"}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-medium truncate">
                                {drawing.drawingNo ? `${drawing.drawingNo} · ` : ""}
                                {drawing.fileName || "—"}
                              </p>
                            </div>
                          </div>

                          {drawing.fileUrl && (
                            <a
                              href={buildFileUrl(drawing.fileUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-xs font-bold text-primary hover:text-primary-hover flex items-center gap-1"
                            >
                              View
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-6 text-center shadow-3xs">
                    <p className="text-xs font-medium text-muted-foreground">
                      No engineering drawings have been attached to this order yet.
                    </p>
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === "audit" && (
            <>
              <section>
                <DetailSectionTitle title="Status History" color="bg-amber-500" />
                <div className="rounded-2xl border border-border/80 bg-muted/10 p-4 shadow-3xs">
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[10px] font-bold px-3 py-1 rounded-full border uppercase tracking-wider ${
                        remarkStyles[remarkKey] ||
                        "bg-muted text-muted-foreground border-muted-foreground/10"
                      }`}
                    >
                      {tender.remark || "—"}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">
                      {tender.remarked_at
                        ? new Date(tender.remarked_at).toLocaleString("en-IN")
                        : "—"}
                    </span>
                  </div>
                </div>
              </section>

              <section className="border-t pt-7">
                <div className="rounded-2xl border border-border/80 bg-muted/10 p-5 shadow-3xs">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/15">
                      <FileText className="size-4.5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Record Information
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-semibold">
                        Metadata associated with this synchronized tender record.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-background border border-border/80 p-3 shadow-3xs hover:border-primary/25 transition-all duration-200">
                      <p className="text-[9px] uppercase font-bold text-muted-foreground/80 tracking-wider">
                        Record ID
                      </p>
                      <p className="mt-1 text-xs font-bold text-foreground break-all">
                        {tender.id || "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-background border border-border/80 p-3 shadow-3xs hover:border-primary/25 transition-all duration-200">
                      <p className="text-[9px] uppercase font-bold text-muted-foreground/80 tracking-wider">
                        Tender ID
                      </p>
                      <p className="mt-1 text-xs font-bold text-foreground break-all">
                        {tender.tenderID || "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-background border border-border/80 p-3 shadow-3xs hover:border-primary/25 transition-all duration-200">
                      <p className="text-[9px] uppercase font-bold text-muted-foreground/80 tracking-wider">
                        Status
                      </p>
                      <p className="mt-1 text-xs font-bold text-foreground capitalize">
                        {tender.remark || "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-background border border-border/80 p-3 shadow-3xs hover:border-primary/25 transition-all duration-200">
                      <p className="text-[9px] uppercase font-bold text-muted-foreground/80 tracking-wider">
                        File
                      </p>
                      <p className="mt-1 text-xs font-bold text-foreground truncate">
                        {tender.file_name && tender.file_name !== "null"
                          ? tender.file_name
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {/* ========================================================
          ASSIGN USERS MODAL
          ======================================================== */}
      <SalesOrderAssignModal
        open={Boolean(assigningTender)}
        onOpenChange={(open) => {
          if (!open) {
            setAssigningTender(null);
            setAssigningStageKey(null);
          }
        }}
        order={assigningTender}
        initialStageKey={assigningStageKey}
        onSuccess={() => void loadTender()}
      />

      {/* ========================================================
          EDIT ORDER MODAL
          ======================================================== */}
      <AddOrderModal
        open={isEditOpen}
        onOpenChange={(open) => setIsEditOpen(open)}
        editingOrder={tender}
        companyId={(currentUser as any)?.companyId || null}
        orderTakenById={currentUserId}
        onSuccess={() => void loadTender()}
      />
    </div>
  );
}

export default OrderDetailPage;