import React from "react";
import { apiClient } from "@/services/axios";
import {
  DEFAULT_WORKFLOW_STAGES,
  WorkflowStageMeta,
} from "@/hooks/useWorkflowTemplate";
import { SalesOrderAssignment } from "./components/SalesOrderAssignModal";

// ============================================================
// API RESPONSE SHAPE
// ============================================================

export interface RawQuoteTenderOrder {
  name: string;
  email_id: string;
  mobile: string;
  firm_name: string;
  tender_no: string;
  department_name: string;
  name_of_work: string;
  remarked_at: string;
  file_name: string | null;
  t_id: number;
  section_name: string;
  division_name: string;
  subdivision: string;
  tenderID: string;
  remark: string;
  reference_code: string;
  state_name: string | null;
  city_name: string | null;
}

// ============================================================
// TABLE / DETAIL ROW SHAPE
// ============================================================

export interface QuoteTenderOrder extends RawQuoteTenderOrder {
  id: string;
  dveplCode?: string;
  drawingAttached: boolean;
  drawings?: Array<{
    id: string;
    drawingNo: string;
    title: string;
    fileName: string;
    fileUrl: string;
  }>;
  attachments?: SalesOrderAttachment[];
  poStatus?: string;
  poNumber?: string;
  assignments?: SalesOrderAssignment[];
  workflowStage?: string;
  nextAction?: string | null;
  dueDate?: string | null;
}

export interface SalesOrderAttachment {
  id: string;
  salesOrderId: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number | null;
  mimeType?: string | null;
  category?: string | null;
  uploadedById?: string | null;
  createdAt?: string;
}

// ============================================================
// AVAILABLE COLUMNS (used by the list page's column visibility picker)
// ============================================================

export const ALL_COLUMN_KEYS = [
  { id: "tenderNo", label: "TENDER NO" },
  { id: "firmName", label: "FIRM NAME" },
  { id: "assignedUsers", label: "ASSIGNED TO" },
  { id: "accounts", label: "ACCOUNTS / COSTING" },
  { id: "drawings", label: "ENGINEERING DRAWINGS" },
  { id: "contactPerson", label: "Name" },
  { id: "mobile", label: "MOBILE" },
  { id: "email", label: "EMAIL" },
  { id: "departmentName", label: "DEPARTMENT" },
  { id: "stateCity", label: "STATE / CITY" },
  { id: "tenderID", label: "TENDER ID" },
  { id: "referenceCode", label: "REFERENCE CODE" },
  { id: "poStatus", label: "PO STATUS" },
  { id: "remark", label: "REMARK" },
  { id: "remarkedAt", label: "REMARKED AT" },
  { id: "fileName", label: "FILE" },
] as const;

export type ColumnKey = (typeof ALL_COLUMN_KEYS)[number]["id"];

export const EMPTY_ARRAY: QuoteTenderOrder[] = [];

// ============================================================
// WORKFLOW STAGE HELPERS (shared with the workflow tracker page)
// ============================================================

export function workflowStageLabel(
  stage?: string | null,
  stages?: WorkflowStageMeta[],
) {
  if (!stage) return "—";
  const def = (stages ?? DEFAULT_WORKFLOW_STAGES).find(
    (s) => s.key === stage,
  );
  return def?.name || stage.replace(/_/g, " ");
}

export function workflowStagePercent(
  stage?: string | null,
  stages?: WorkflowStageMeta[],
) {
  if (!stage) return 0;
  const list = stages ?? DEFAULT_WORKFLOW_STAGES;
  const index = list.findIndex((s) => s.key === stage);
  if (index === -1) return 0;
  return Math.round((index / (list.length - 1)) * 100);
}

// ============================================================
// PARSERS
// ============================================================

export function parseSalesOrderRemarks(remarks: string) {
  const fields = {
    workName: "",
    department: "",
    section: "",
    division: "",
    subDivision: "",
    location: "",
    tenderId: "",
    referenceCode: "",
    fileName: "",
  };
  if (!remarks) return fields;

  const lines = remarks.split("\n");
  lines.forEach((line) => {
    const parts = line.split(":");
    if (parts.length >= 2) {
      const key = parts[0].trim().toLowerCase();
      const val = parts.slice(1).join(":").trim();
      if (key === "work") fields.workName = val;
      else if (key === "department") fields.department = val;
      else if (key === "section") fields.section = val;
      else if (key === "division") fields.division = val;
      else if (key === "sub division") fields.subDivision = val;
      else if (key === "location") fields.location = val;
      else if (key === "tender id") fields.tenderId = val;
      else if (key === "reference code") fields.referenceCode = val;
      else if (key === "file name") fields.fileName = val;
    }
  });
  return fields;
}

export function parseContactDetails(contactDetails: string) {
  const parts = (contactDetails || "").split("|").map((p) => p.trim());
  return {
    name: parts[0] || "",
    mobile: parts[1] || "",
    email: parts[2] || "",
  };
}

// ============================================================
// SHARED FETCH + TRANSFORM
// Used by both the orders list page and the order detail page so
// the two never drift out of sync with each other.
// ============================================================

export async function fetchQuoteTenderOrders(): Promise<{
  success: boolean;
  rows: QuoteTenderOrder[];
  message?: string;
}> {
  // 1. Fetch backend purchase orders
  let backendPOs: any[] = [];
  try {
    const poRes = await apiClient.get("/purchase-order/read");
    if (poRes.data?.success) {
      backendPOs = poRes.data.data ?? [];
    }
  } catch (err) {
    console.error("Error loading purchase orders:", err);
  }

  // 2. Fetch PO revisions from backend database
  let dbRevisions: any[] = [];
  try {
    const revRes = await apiClient.get("/purchase-order/revisions/list");
    if (revRes.data?.success) {
      dbRevisions = revRes.data.data ?? [];
    }
  } catch (err) {
    console.error("Error loading revisions:", err);
  }

  const response = await apiClient.get("/order/read?page=1&limit=100");

  if (!response.data?.success) {
    return {
      success: false,
      rows: [],
      message: response.data?.message ?? "Unable to load orders.",
    };
  }

  const rawSalesOrders = response.data?.data ?? [];

  const rows: QuoteTenderOrder[] = rawSalesOrders.map((order: any) => {
    const remarksFields = parseSalesOrderRemarks(order.remarks || "");
    const contactFields = parseContactDetails(order.contactDetails || "");
    const refCode = remarksFields.referenceCode || "";

    // Resolve PO Status — direct FK match first, reference-code string
    // comparison only as a legacy fallback.
    const matchedRev =
      dbRevisions.find(
        (rev) => rev.salesOrderId && rev.salesOrderId === order.id,
      ) ||
      dbRevisions.find(
        (rev) =>
          refCode &&
          rev.referenceCode &&
          String(rev.referenceCode).trim() === String(refCode).trim(),
      );
    const matchedPO =
      backendPOs.find(
        (po) => po.linkedSalesOrderId && po.linkedSalesOrderId === order.id,
      ) ||
      backendPOs.find(
        (po) =>
          refCode &&
          po.referenceCode &&
          String(po.referenceCode).trim() === String(refCode).trim(),
      );

    let poStatus = "No PO";
    let poNumber = "";

    if (matchedRev) {
      poStatus = matchedRev.poStatus;
      poNumber = matchedRev.poNumber;
    } else if (matchedPO) {
      poStatus = matchedPO.status; // e.g. DRAFT, APPROVED, SENT, etc.
      poNumber = matchedPO.poNo;

      // Map backend status to human-readable/friendly
      if (poStatus === "DRAFT") poStatus = "Draft";
      else if (poStatus === "APPROVED") poStatus = "Approved";
      else if (poStatus === "SENT") poStatus = "Sent";
      else if (poStatus === "PARTIAL_RECEIVED") poStatus = "Partially Received";
      else if (poStatus === "COMPLETED") poStatus = "Received";
      else if (poStatus === "CANCELLED") poStatus = "Cancelled";
    }

    return {
      id: order.id,
      dveplCode: order.dveplCode || "",
      t_id: order.dveplCode
        ? parseInt(order.dveplCode.replace(/\D/g, ""), 10) || 0
        : 0,
      tender_no: order.caNo || "",
      name_of_work: remarksFields.workName || "",
      firm_name: order.partyName || "",
      name: contactFields.name || "",
      mobile: contactFields.mobile || "",
      email_id: contactFields.email || "",
      department_name: remarksFields.department || "",
      section_name: remarksFields.section || "",
      division_name: remarksFields.division || "",
      subdivision: remarksFields.subDivision || "",
      state_name: remarksFields.location || "",
      city_name: null,
      tenderID: remarksFields.tenderId || "",
      reference_code: refCode,
      poStatus,
      poNumber,
      remark: order.status || "",
      remarked_at: order.createdAt || "",
      drawingAttached:
        order.engineeringProjects?.some(
          (proj: any) => proj.drawings?.length > 0,
        ) || false,
      drawings:
        order.engineeringProjects?.flatMap(
          (proj: any) => proj.drawings || [],
        ) || [],
      file_name: remarksFields.fileName || null,
      assignments: order.assignments || [],
      attachments: order.salesOrderAttachments || [],
      workflowStage: order.workflowStage || undefined,
      nextAction: order.nextAction ?? null,
      dueDate: order.dueDate ? new Date(order.dueDate).toISOString() : null,
    };
  });

  return { success: true, rows };
}

// ============================================================
// DETAIL ITEM COMPONENT
// ============================================================

export function DetailItem({
  label,
  value,
  className = "",
  multiline = false,
}: {
  label: string;
  value: string | number | null | undefined;
  className?: string;
  multiline?: boolean;
}) {
  const displayValue =
    value !== null && value !== undefined && String(value).trim() !== ""
      ? String(value)
      : "—";

  return (
    <div
      className={`rounded-xl border border-border/60 bg-muted/10 hover:bg-muted/20 transition-all duration-200 px-4 py-3 min-w-0 shadow-3xs ${className}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
        {label}
      </p>

      <p
        className={`mt-1 text-xs sm:text-sm font-semibold text-foreground break-words ${
          multiline
            ? "leading-relaxed whitespace-pre-wrap text-muted-foreground/90 font-medium"
            : ""
        }`}
      >
        {displayValue}
      </p>
    </div>
  );
}

// ============================================================
// SECTION TITLE COMPONENT
// ============================================================

export function DetailSectionTitle({
  title,
  color = "bg-primary",
}: {
  title: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className={`h-4.5 w-1 rounded-full ${color}`} />

      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
        {title}
      </h3>
    </div>
  );
}