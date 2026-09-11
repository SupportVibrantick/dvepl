import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import type { ZodType } from "zod";
import {
  Plus,
  Search,
  Calendar,
  FileText,
  Info,
  Paperclip,
  User,
  Layers,
  CheckSquare,
  Loader2,
  UserPlus,
  UserMinus,
  RefreshCw,
} from "lucide-react";
import { GenericTable } from "@/components/tables/genericTable";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { canPerformPageAction } from "@/utils/pagePermissions";

// Maps the generic table's storage key (tableName) to the PRBAC module key so
// Create/Edit/Delete buttons can be hidden when the action permission is off.
// Tables without a PRBAC module remain un-gated (buttons stay visible).
const TABLE_NAME_TO_MODULE: Record<string, string> = {
  companies: "companies",
  branches: "branches",
  departments: "departments",
  teams: "teams",
  designations: "designations",
  costCenters: "cost_centers",
  employees: "employees",
  attendances: "attendance",
  leaves: "leaves",
  holidays: "holidays",
  salaries: "payroll",
  employeeDocuments: "documents",
  customers: "customers",
  communicationHistories: "communication",
  salesOrders: "orders",
  vendors: "vendors",
  warehouses: "inventory",
  inventories: "inventory",
  stockTransfers: "inventory",
  tenderRequests: "tender_requests",
  tenders: "tenders",
  governmentDepartments: "government_departments",
  sections: "sections",
  divisions: "divisions",
  subDivisions: "sub_divisions",
  referenceCodes: "reference_codes",
  technicalClarifications: "technical_clarifications",
  boqs: "boqs",
  quotations: "quotations",
  users: "users",
  roles: "roles",
  approvalRequests: "approval_requests",
  inspections: "inspections",
  materials: "materials",
  materialCategories: "material_categories",
  productionPlans: "production_plans",
  workOrders: "work_orders",
  purchaseRequests: "purchase_requests",
  purchaseOrders: "orders",
  dispatches: "inventory",
};


import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useERPStore } from "@/store/erpStore";
import { toast } from "react-hot-toast";
import type { ResourceApi } from "@/services/organization";
import { hrmsApi } from "@/services/modules";
import { ConfirmDialog } from "@/components/shared/confirmDialog";

type FieldType =
  | "text"
  | "number"
  | "date"
  | "textarea"
  | "select"
  | "checkbox";

interface CrudField {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
}

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface GenericCrudPageProps<
  TRecord extends { id: string } = { id: string },
> {
  tableName: string;
  moduleName: string;
  pluralName: string;
  columns: ColumnDef<TRecord>[];
  fields: CrudField[];
  defaultFormValues: Record<string, unknown>;
  zodSchema: ZodType;
  breadcrumbs?: BreadcrumbItem[];
  searchPlaceholder?: string;
  statsCards?: (
    data: TRecord[],
  ) => Array<{
    label: string;
    value: React.ReactNode;
    change?: string;
    trend?: "up" | "down";
  }>;
  api?: ResourceApi<any>;
  selectOptions?: Record<
    string,
    () => Promise<
      Array<{ id: string; name?: string; title?: string; code?: string }>
    >
  >;
  readOnly?: boolean;
  hideAdd?: boolean;
  freezeActions?: boolean;
  /** Fields to hide from the Overview dialog for this specific CRUD page. */
  overviewHiddenFields?: string[];
  /**
   * Optional relation collection management.
   *
   * Used by teamsConfig.relationManager:
   * - getAvailableRecords(record)
   * - add(record, relatedRecordId)
   * - remove(record, relatedRecordId)
   */
  relationManager?: {
    relationKey: string;
    title?: string;
    getAvailableRecords: (record: TRecord) => Promise<any[]>;
    add: (record: TRecord, relatedRecordId: string) => Promise<void>;
    remove: (record: TRecord, relatedRecordId: string) => Promise<void>;
  };
  /**
   * Optional action that pulls records in from another source (e.g. syncing
   * users into employees). Renders a "Sync" button in the page header.
   */
  syncAction?: {
    label: string;
    run: () => Promise<{ syncedCount?: number; message?: string }>;
  };
}

const asInputValue = (value: unknown) => (value == null ? "" : String(value));

// Stable fallback — must NOT be inline `?? []` inside a Zustand selector
// because a new array literal creates a new reference every render,
// causing useSyncExternalStore to loop infinitely.
const EMPTY_ARRAY: never[] = [];

// Fields that must never render in a generic view/detail sheet, regardless
// of which model the record came from — schema-wide secrets & internal
// bookkeeping columns (see users.passwordHash, refresh_tokens/otp_requests/
// password_resets *Hash columns, customer_portal_users.activationToken).
const IGNORED_KEYS = new Set([
  "id",
  "companyId",
  "passwordHash",
  "tokenHash",
  "otpHash",
  "activationToken",
  "deletedAt",
  "company",
  "userPermissions",
  "createdAt",
  "updatedAt",
]);

// Maps a foreign-key field name (as it appears on any Prisma model in
// schema.prisma) to the Zustand store slice that holds the referenced
// records, plus how to turn one of those records into a display label.
// Keeping this table-driven (rather than an if/else chain per field) means
// new relations added to the schema only need one line here.
type RelationResolver = {
  storeKey: string;
  label: (record: any) => string | undefined;
};

const personLabel = (record: any) =>
  record
    ? `${record.firstName ?? ""} ${record.lastName ?? ""}`.trim() || record.name
    : undefined;
const nameLabel = (record: any) =>
  record?.name ?? record?.title ?? record?.code ?? record?.id;

const FK_RELATION_MAP: Record<string, RelationResolver> = {
  // Organization
  branchId: { storeKey: "branches", label: nameLabel },
  departmentId: { storeKey: "departments", label: nameLabel },
  teamId: { storeKey: "teams", label: nameLabel },
  designationId: { storeKey: "designations", label: (r) => r?.title },
  costCenterId: { storeKey: "costCenters", label: nameLabel },
  reportsToId: { storeKey: "employees", label: personLabel },
  // Auth / PRBAC
  userId: { storeKey: "users", label: (r) => r?.name },
  roleId: { storeKey: "roles", label: nameLabel },
  employeeId: { storeKey: "employees", label: personLabel },
  createdById: { storeKey: "employees", label: personLabel },
  assignedToId: { storeKey: "users", label: (r) => r?.name },
  approvedById: { storeKey: "users", label: (r) => r?.name },
  askedById: { storeKey: "users", label: (r) => r?.name },
  answeredById: { storeKey: "users", label: (r) => r?.name },
  approverId: { storeKey: "users", label: (r) => r?.name },
  // Tender / Govt hierarchy
  governmentDepartmentId: {
    storeKey: "governmentDepartments",
    label: nameLabel,
  },
  sectionId: { storeKey: "sections", label: nameLabel },
  divisionId: { storeKey: "divisions", label: nameLabel },
  subDivisionId: { storeKey: "subDivisions", label: nameLabel },
  tenderRequestId: { storeKey: "tenderRequests", label: (r) => r?.title },
  tenderId: { storeKey: "tenders", label: (r) => r?.title },
  // CRM / Sales
  customerId: { storeKey: "customers", label: nameLabel },
  quotationId: { storeKey: "quotations", label: (r) => r?.quotationNo },
  salesOrderId: {
    storeKey: "salesOrders",
    label: (r) => r?.orderNo ?? r?.soNumber,
  },
  portalUserId: { storeKey: "customerPortalUsers", label: (r) => r?.name },
};

// Every enum status/action value defined across schema.prisma, mapped to a
// badge color. Falls back to a neutral badge for anything not listed here
// (e.g. a future enum value) instead of silently going gray-only.
const STATUS_COLORS: Record<string, string> = {
  // TenderStatus
  DRAFT: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  OPEN: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  ASSIGNED: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  IN_PROGRESS: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  SUBMITTED: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  WON: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  LOST: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  COMPLETED: "bg-teal-500/10 text-teal-500 border-teal-500/20",
  CANCELLED: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  // TenderRequestStatus
  NEW: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  CONTACTED: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  QUALIFIED: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  TENDER: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  QUOTATION: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  // QuotationStatus
  PENDING_APPROVAL: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  APPROVED: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  SENT: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  ACCEPTED: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  REJECTED: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  NEGOTIATING: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  EXPIRED: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  REVISED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  // ApprovalStatus / LeaveStatus
  PENDING: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  UNDER_REVIEW: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  // SalesOrderStatus
  ACTIVE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  ON_HOLD: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  // EmployeeStatus
  ON_LEAVE: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  SUSPENDED: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  RESIGNED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  TERMINATED: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  // AttendanceStatus
  PRESENT: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  ABSENT: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  HALF_DAY: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  HOLIDAY: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  // ClarificationStatus
  ANSWERED: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  CLOSED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  // ReferenceCodeAction
  GENERATED: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  UPDATED: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  DELETED: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  REGENERATED: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  MISSING: "bg-rose-500/10 text-rose-500 border-rose-500/20",
};

const getStatusBadge = (status: string) => {
  const s = String(status).toUpperCase();
  const colorClass =
    STATUS_COLORS[s] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors ${colorClass}`}
    >
      {status}
    </span>
  );
};

const groupRecordFields = (record: Record<string, any>, hiddenFields: string[] = []) => {
  const core: Array<{ key: string; value: any }> = [];
  const dates: Array<{ key: string; value: any }> = [];
  const relations: Array<{ key: string; value: any }> = [];

  Object.entries(record)
    .filter(([key]) => !IGNORED_KEYS.has(key) && !hiddenFields.includes(key))
    .forEach(([key, value]) => {
      if (key === "status" || key === "name" || key === "title") return;

      // Skip foreign key IDs if the actual relationship object is present in the record
      if (key.endsWith("Id")) {
        const relationKey = key.slice(0, -2);
        if (record[relationKey] !== undefined) return;
      }

      if (
        Array.isArray(value) ||
        (typeof value === "object" && value !== null)
      ) {
        relations.push({ key, value });
      } else if (
        (typeof value === "string" &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) ||
        key.toLowerCase().includes("date") ||
        key === "createdAt" ||
        key === "updatedAt"
      ) {
        dates.push({ key, value });
      } else {
        core.push({ key, value });
      }
    });

  return { core, dates, relations };
};

const formatFieldLabel = (key: string) =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/\sId$/, "");

const renderDisplayValue = (
  key: string,
  value: unknown,
  record?: Record<string, any>,
  optionValues?: Record<string, any>,
  fields?: Array<{
    name: string;
    options?: Array<{ value: string; label: string }>;
  }>,
): React.ReactNode => {
  if (value === null || value === undefined || value === "") return "—";

  // 1. Resolve foreign key UUIDs to names dynamically using relation objects
  //    that were already eager-loaded onto the record (e.g. `customer` next
  //    to `customerId`).
  if (typeof value === "string" && key.endsWith("Id") && record) {
    const relationKey = key.slice(0, -2);
    const relationObj = record[relationKey];
    if (relationObj && typeof relationObj === "object") {
      const label = relationObj.firstName
        ? `${relationObj.firstName} ${relationObj.lastName ?? ""}`.trim()
        : (relationObj.name ??
          relationObj.title ??
          relationObj.fileName ??
          relationObj.code ??
          relationObj.id);
      if (label) return String(label);
    }
  }

  // 2. Resolve loaded select option labels (API level)
  if (optionValues && optionValues[key]) {
    const matched = (
      optionValues[key] as Array<{ value: string; label: string }> | undefined
    )?.find((opt: any) => opt.value === value);
    if (matched) return matched.label;
  }

  // 3. Resolve static field configuration options
  if (fields) {
    const fieldConfig = fields.find((f) => f.name === key);
    if (fieldConfig && fieldConfig.options) {
      const matched = fieldConfig.options.find((opt) => opt.value === value);
      if (matched) return matched.label;
    }
  }

  // 4. Resolve IDs globally using Zustand store lists, driven by
  //    FK_RELATION_MAP so every relation defined in schema.prisma is covered
  //    (not just the handful the view happens to embed eagerly).
  if (typeof value === "string") {
    const resolver = FK_RELATION_MAP[key];
    if (resolver) {
      const store = useERPStore.getState() as Record<string, any>;
      const list = store[resolver.storeKey];
      if (Array.isArray(list)) {
        const match = list.find((item: any) => item.id === value);
        if (match) {
          const label = resolver.label(match);
          if (label) return label;
        }
      }
    }
  }

  // Handle Arrays (e.g. attachments, revisions, etc.)
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (typeof value[0] === "object" && value[0] !== null) {
      return (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {value.map((item: any, i) => {
            const label =
              item.name ??
              item.title ??
              item.fileName ??
              item.code ??
              item.quotationNo ??
              item.orderNo ??
              item.soNumber ??
              `Item #${i + 1}`;
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg bg-muted border hover:bg-muted/80 transition-all px-2.5 py-1 text-xs font-semibold text-foreground"
              >
                <Paperclip className="size-3 text-muted-foreground" />
                {label}
              </span>
            );
          })}
        </div>
      );
    }
    return value.join(", ");
  }

  // Handle Object Relations (e.g. customer, createdBy)
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.firstName) {
      return `${obj.firstName} ${obj.lastName ?? ""}`.trim();
    }
    const label =
      obj.name ??
      obj.title ??
      obj.code ??
      obj.quotationNo ??
      obj.orderNo ??
      obj.soNumber ??
      obj.id;
    return label ? String(label) : "—";
  }

  // Handle known status/action enums (TenderStatus, QuotationStatus,
  // ApprovalStatus, AttendanceStatus, ClarificationStatus, etc.)
  if (
    typeof value === "string" &&
    (key === "status" || key === "action" || key === "actionType") &&
    STATUS_COLORS[value.toUpperCase()]
  ) {
    return getStatusBadge(value);
  }

  // Handle ISO Date formats
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
  ) {
    return new Date(value).toLocaleString();
  }

  // Handle Booleans
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold">
        Yes
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 text-slate-500 border border-slate-500/20 px-2.5 py-0.5 text-xs font-semibold">
        No
      </span>
    );
  }

  return String(value);
};

const getCombinedOptions = (
  fieldName: string,
  staticOptions?: Array<{ value: string; label: string }>,
  optionValues?: Record<string, any>,
) => {
  const loaded = optionValues?.[fieldName] ?? [];
  const statics = staticOptions ?? [];

  // Resolve from store globally if available
  const storeOptions: Array<{ value: string; label: string }> = [];
  const resolver = FK_RELATION_MAP[fieldName];
  if (resolver) {
    const store = useERPStore.getState() as Record<string, any>;
    const list = store[resolver.storeKey];
    if (Array.isArray(list)) {
      list.forEach((item: any) => {
        const label = resolver.label(item);
        if (label && item.id) {
          storeOptions.push({ value: item.id, label });
        }
      });
    }
  }

  const combined = [...loaded, ...storeOptions, ...statics];

  return combined.filter(
    (opt, index, self) =>
      self.findIndex((o) => o.value === opt.value) === index,
  );
};

export function GenericCrudPage<TRecord extends { id: string }>({
  tableName,
  moduleName,
  pluralName,
  columns,
  fields,
  defaultFormValues,
  zodSchema,
  breadcrumbs = [],
  searchPlaceholder = `Search ${pluralName.toLowerCase()}...`,
  statsCards,
  api,
  selectOptions,
  readOnly = false,
  hideAdd = false,
  freezeActions = true,
  overviewHiddenFields = [],
  relationManager,
  syncAction,
}: GenericCrudPageProps<TRecord>) {
  const [searchParams] = useSearchParams();
  const globalStore = useERPStore();
  const [profileTab, setProfileTab] = useState<"overview" | "attendance" | "leave" | "salary">("overview");
  const [payrollStep, setPayrollStep] = useState(1);
  const [payrollMonth, setPayrollMonth] = useState("August 2026");
  const [payrollAllowances, setPayrollAllowances] = useState(15000);
  const [payrollDeductions, setPayrollDeductions] = useState(5000);
  const [isPayrollRunning, setIsPayrollRunning] = useState(false);
  const [isPayrollDone, setIsPayrollDone] = useState(false);

  const localRecords = useERPStore(
    (state) =>
      ((state as unknown as Record<string, unknown>)[tableName] as TRecord[]) ??
      EMPTY_ARRAY,
  );
  const addRecord = useERPStore((state) => state.addRecord);
  const updateRecord = useERPStore((state) => state.updateRecord);
  const deleteRecord = useERPStore((state) => state.deleteRecord);
  const [search, setSearch] = useState("");
  const [formValues, setFormValues] =
    useState<Record<string, unknown>>(defaultFormValues);
  const [editingRecord, setEditingRecord] = useState<TRecord | null>(null);
  const [viewingRecord, setViewingRecord] = useState<TRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [remoteRecords, setRemoteRecords] = useState<TRecord[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(api));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [optionValues, setOptionValues] = useState<
    Record<string, CrudField["options"]>
  >({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<TRecord | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Optional Team -> Employee membership management.
  const [teamEmployees, setTeamEmployees] = useState<any[]>([]);
  const [teamMemberDialogOpen, setTeamMemberDialogOpen] = useState(false);
  const [teamMemberSearch, setTeamMemberSearch] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [isTeamMemberSubmitting, setIsTeamMemberSubmitting] = useState(false);
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);

  // Attendance records for the employee currently being viewed in the profile.
  // Fetched from the API (the Zustand store's `attendances` is only used by
  // locally-created records, so API-created attendance would otherwise never
  // show up in the employee overview's Attendance tab).
  const [profileAttendances, setProfileAttendances] = useState<any[]>([]);
  const [isProfileAttendanceLoading, setIsProfileAttendanceLoading] =
    useState(false);

  const records = api ? remoteRecords : localRecords;

  // Action-permission gating. Tables without a PRBAC module are not gated.
  const moduleKey = TABLE_NAME_TO_MODULE[tableName];
  const currentUser = globalStore.users?.find(
    (u: any) => u.id === globalStore.currentUserId,
  ) as any;
  const canCreate =
    !moduleKey || canPerformPageAction(currentUser?.actionPermissions, moduleKey, "create");
  const canEdit =
    !moduleKey || canPerformPageAction(currentUser?.actionPermissions, moduleKey, "edit");
  const canDelete =
    !moduleKey || canPerformPageAction(currentUser?.actionPermissions, moduleKey, "delete");

  const loadRecords = useCallback(async () => {
    if (!api) return;
    setIsLoading(true);
    try {
      setRemoteRecords(await api.list());
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ??
        `Unable to load ${pluralName.toLowerCase()}.`,
      );
    } finally {
      setIsLoading(false);
    }
  }, [api, pluralName]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const handleSync = async () => {
    if (!syncAction) return;
    setIsSyncing(true);
    const syncToast = toast.loading("Syncing...");
    try {
      const res = await syncAction.run();
      const syncedCount = res?.syncedCount ?? 0;
      toast.success(
        res?.message ?? `Successfully synced ${syncedCount} records!`,
        { id: syncToast },
      );
      await loadRecords();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ?? "Sync failed.",
        { id: syncToast },
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // Stabilise the selectOptions reference — the prop is an object literal that
  // gets a new identity on every render, which would cause an infinite loop.
  const selectOptionsRef = React.useRef(selectOptions);

  useEffect(() => {
    const opts = selectOptionsRef.current;
    if (!opts) return;
    Object.entries(opts).forEach(([field, load]) => {
      load()
        .then((items) => {
          setOptionValues((current) => ({
            ...current,
            [field]: items.map((item: any) => {
              const label = item.firstName
                ? `${item.firstName} ${item.lastName ?? ""}`.trim()
                : (item.name ?? item.title ?? item.code ?? item.id);
              return { value: item.id, label };
            }),
          }));
        })
        .catch((err) => {
          console.warn(`Unable to load options for field ${field}:`, err);
        });
    });
  }, []); // intentionally empty — selectOptionsRef.current is stable

  useEffect(() => {
    let hasPrefill = false;
    const prefilled: Record<string, unknown> = { ...defaultFormValues };

    fields.forEach((field) => {
      const val = searchParams.get(field.name);
      if (val !== null) {
        prefilled[field.name] = val;
        hasPrefill = true;
      }
    });

    if (hasPrefill) {
      setFormValues(prefilled);
      setIsFormOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on component mount to capture URL query params

  const getEmployeeId = (member: any) =>
    member?.employeeId ?? member?.employee?.id ?? member?.id;

  const getEmployeeName = (employee: any) => {
    if (!employee) return "Unknown employee";

    if (employee.firstName) {
      return `${employee.firstName} ${employee.lastName ?? ""}`.trim();
    }

    return (
      employee.name ??
      employee.title ??
      employee.email ??
      employee.employeeCode ??
      employee.id
    );
  };

  const getEmployeeSubtitle = (employee: any) =>
    employee?.designation?.title ??
    employee?.designation?.name ??
    employee?.designation ??
    employee?.email ??
    employee?.employeeCode ??
    "";

  const getCurrentRelationRecords = useCallback(
    (record: TRecord | null): any[] => {
      if (!record || !relationManager?.relationKey) return [];

      const value = (record as Record<string, any>)[
        relationManager.relationKey
      ];

      return Array.isArray(value) ? value : [];
    },
    [relationManager?.relationKey],
  );

  const loadAvailableRelationRecords = useCallback(
    async (record: TRecord) => {
      if (!relationManager) return;

      try {
        const available = await relationManager.getAvailableRecords(record);
        setTeamEmployees(Array.isArray(available) ? available : []);
      } catch (error: any) {
        toast.error(
          error.response?.data?.message ??
            "Unable to load available members.",
        );
        setTeamEmployees([]);
      }
    },
    [relationManager],
  );

  const openTeamMemberDialog = async () => {
    if (!viewingRecord || !relationManager) return;

    setTeamMemberSearch("");
    setSelectedEmployeeIds([]);
    setTeamMemberDialogOpen(true);

    await loadAvailableRelationRecords(viewingRecord);
  };

  const toggleEmployeeSelection = (employeeId: string) => {
    setSelectedEmployeeIds((current) =>
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId],
    );
  };

  const submitTeamMembers = async () => {
    if (
      !viewingRecord ||
      !relationManager ||
      selectedEmployeeIds.length === 0
    ) {
      return;
    }

    setIsTeamMemberSubmitting(true);

    try {
      // relationManager.add is intentionally single-record because that is
      // the contract already implemented by teamsConfig.
      await Promise.all(
        selectedEmployeeIds.map((employeeId) =>
          relationManager.add(viewingRecord, employeeId),
        ),
      );

      const addedEmployees = teamEmployees.filter((employee) =>
        selectedEmployeeIds.includes(employee.id),
      );

      const relationKey = relationManager.relationKey;
      setViewingRecord((current) => {
        if (!current) return current;

        const existing = getCurrentRelationRecords(current);
        const existingIds = new Set(existing.map(getEmployeeId));

        return {
          ...current,
          [relationKey]: [
            ...existing,
            ...addedEmployees.filter(
              (employee) => !existingIds.has(getEmployeeId(employee)),
            ),
          ],
        };
      });

      // Refresh the available list. The backend removes assigned employees
      // from /members/available/:teamId because their teamId is no longer null.
      await loadAvailableRelationRecords(viewingRecord);

      setSelectedEmployeeIds([]);
      setTeamMemberDialogOpen(false);

      toast.success(
        selectedEmployeeIds.length === 1
          ? "Employee added to team."
          : `${selectedEmployeeIds.length} employees added to team.`,
      );
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ??
          "Unable to add employees to team.",
      );
    } finally {
      setIsTeamMemberSubmitting(false);
    }
  };

  const removeTeamMember = async (employeeId: string) => {
    if (!viewingRecord || !relationManager) return;

    setRemoveMemberId(employeeId);

    try {
      await relationManager.remove(viewingRecord, employeeId);

      const relationKey = relationManager.relationKey;

      setViewingRecord((current) => {
        if (!current) return current;

        const currentMembers = getCurrentRelationRecords(current);

        return {
          ...current,
          [relationKey]: currentMembers.filter(
            (member) => getEmployeeId(member) !== employeeId,
          ),
        };
      });

      // The removed employee becomes available again because the backend sets
      // employee.teamId back to null.
      await loadAvailableRelationRecords(viewingRecord);

      toast.success("Employee removed from team.");
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ??
          "Unable to remove employee from team.",
      );
    } finally {
      setRemoveMemberId(null);
    }
  };

  const currentTeamMembers = useMemo(
    () => getCurrentRelationRecords(viewingRecord),
    [getCurrentRelationRecords, viewingRecord],
  );

  const availableTeamEmployees = useMemo(() => {
    const memberIds = new Set(currentTeamMembers.map(getEmployeeId));
    const query = teamMemberSearch.trim().toLowerCase();

    return teamEmployees.filter((employee) => {
      // The backend already returns only employees with teamId === null.
      // This extra client-side check protects against stale data.
      if (!employee?.id || memberIds.has(employee.id)) return false;
      if (!query) return true;

      return [
        getEmployeeName(employee),
        getEmployeeSubtitle(employee),
        employee?.email,
        employee?.employeeCode,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query),
        );
    });
  }, [
    teamEmployees,
    currentTeamMembers,
    teamMemberSearch,
  ]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) =>
      Object.values(record).some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(query),
      ),
    );
  }, [records, search]);

  const openCreate = () => {
    setEditingRecord(null);
    setFormValues(defaultFormValues);
    setErrors({});
    setIsFormOpen(true);
  };

  const openEdit = (record: TRecord) => {
    setEditingRecord(record);
    setFormValues({ ...defaultFormValues, ...record });
    setErrors({});
    setIsFormOpen(true);
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = zodSchema.safeParse(formValues);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const field = String(issue.path[0] ?? "form");
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      if (api) {
        if (editingRecord && api.update)
          await api.update(
            editingRecord.id,
            result.data as Record<string, unknown>,
          );
        else await api.create(result.data as Record<string, unknown>);
        await loadRecords();
      } else if (editingRecord)
        updateRecord(tableName, editingRecord.id, result.data);
      else addRecord(tableName, result.data);
      setIsFormOpen(false);
      toast.success(`${moduleName} saved successfully.`);
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ??
        `Unable to save ${moduleName.toLowerCase()}.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const setField = (name: string, value: unknown) => {
    setFormValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  };

  const cards = statsCards?.(records) ?? [];

  const processedColumns = useMemo(() => {
    return columns.map((col) => {
      const accessorKey = (col as any).accessorKey;
      if (
        typeof accessorKey === "string" &&
        FK_RELATION_MAP[accessorKey] &&
        !(col as any).cell
      ) {
        return {
          ...col,
          cell: ({ getValue, row }: any) => {
            const val = getValue();
            return renderDisplayValue(
              accessorKey,
              val,
              row.original,
              optionValues,
              fields,
            );
          },
        };
      }
      return col;
    });
  }, [columns, optionValues, fields]);

  const viewingGroups = useMemo(
    () =>
      viewingRecord
        ? groupRecordFields(viewingRecord as unknown as Record<string, any>, overviewHiddenFields)
        : null,
    [viewingRecord, overviewHiddenFields],
  );

  useEffect(() => {
    if (!viewingRecord || tableName !== "teams" || !relationManager) {
      setTeamEmployees([]);
      setSelectedEmployeeIds([]);
      return;
    }

    // Current members are already included by the existing team read endpoint
    // and therefore come from viewingRecord[relationManager.relationKey].
    setTeamEmployees([]);
    setSelectedEmployeeIds([]);
  }, [viewingRecord, tableName, relationManager]);

  useEffect(() => {
    if (!viewingRecord || tableName !== "employees") {
      setProfileAttendances([]);
      setIsProfileAttendanceLoading(false);
      return;
    }

    let active = true;
    setIsProfileAttendanceLoading(true);
    hrmsApi.attendance
      .list({ employeeId: viewingRecord.id })
      .then((records) => {
        if (active) {
          setProfileAttendances(Array.isArray(records) ? records : []);
        }
      })
      .catch((err) => {
        console.warn("Unable to load employee attendance:", err);
        if (active) setProfileAttendances([]);
      })
      .finally(() => {
        if (active) setIsProfileAttendanceLoading(false);
      });

    return () => {
      active = false;
    };
  }, [viewingRecord, tableName]);

  const renderEmployeeProfile = (record: any) => {
    const employeeAttendances = profileAttendances;
    const employeeLeaves = globalStore.leaves.filter((l) => l.employeeId === record.id);
    const employeeSalary = globalStore.salaries.find((s) => s.employeeId === record.id);

    const formatProfileTime = (value?: string | null) => {
      if (!value) return "—";
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    const formatProfileHours = (checkIn?: string | null, checkOut?: string | null) => {
      if (!checkIn || !checkOut) return "—";
      const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
      if (ms <= 0) return "—";
      const totalMinutes = Math.floor(ms / 60000);
      return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
    };

    return (
      <div className="flex flex-col h-full bg-card">
        {/* Profile Header */}
        <div className="flex items-start gap-4 p-6 border-b border-border bg-muted/5">
          <Avatar className="h-16 w-16 rounded-2xl border-2 border-border shadow-sm">
            <AvatarFallback className="text-lg bg-primary/10 text-primary font-bold rounded-2xl">
              {record.firstName?.slice(0, 1)}{record.lastName?.slice(0, 1) || ""}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-foreground">
                {[record.firstName, record.lastName].filter(Boolean).join(" ")}
              </h2>
              {getStatusBadge(record.status)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
              Employee Code: <span className="font-semibold text-foreground">{record.employeeCode}</span>
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2 font-medium">
              <div>
                Dept: <span className="font-semibold text-foreground">{renderDisplayValue("departmentId", record.departmentId, record)}</span>
              </div>
              <div>
                Desg: <span className="font-semibold text-foreground">{renderDisplayValue("designationId", record.designationId, record)}</span>
              </div>
              <div>
                Branch: <span className="font-semibold text-foreground">{renderDisplayValue("branchId", record.branchId, record)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-border/80 px-6 bg-muted/10">
          {(["overview", "attendance", "leave", "salary"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setProfileTab(tab)}
              className={`py-3.5 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all relative -mb-px capitalize ${
                profileTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {profileTab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <div>
                  <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Date of Joining</span>
                  <span className="font-medium text-foreground mt-1 block">
                    {record.dateOfJoining ? new Date(record.dateOfJoining).toLocaleDateString() : "—"}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Date of Birth</span>
                  <span className="font-medium text-foreground mt-1 block">
                    {record.dateOfBirth ? new Date(record.dateOfBirth).toLocaleDateString() : "—"}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Gender</span>
                  <span className="font-medium text-foreground mt-1 block capitalize">{record.gender || "—"}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Reports To</span>
                  <span className="font-medium text-foreground mt-1 block">
                    {renderDisplayValue("reportsToId", record.reportsToId, record)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {profileTab === "attendance" && (
            <div className="space-y-4">
              {isProfileAttendanceLoading ? (
                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                  Loading attendance records...
                </div>
              ) : employeeAttendances.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                  No attendance records logged for this employee.
                </div>
              ) : (
                <div className="border border-border/80 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/30 border-b border-border/80 text-muted-foreground uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Check-In</th>
                        <th className="p-3">Check-Out</th>
                        <th className="p-3">Hours</th>
                        <th className="p-3">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {employeeAttendances.map((att) => (
                        <tr key={att.id} className="hover:bg-muted/10">
                          <td className="p-3 font-semibold">{new Date(att.date).toLocaleDateString()}</td>
                          <td className="p-3">{getStatusBadge(att.status)}</td>
                          <td className="p-3 font-medium text-muted-foreground">{formatProfileTime(att.checkIn)}</td>
                          <td className="p-3 font-medium text-muted-foreground">{formatProfileTime(att.checkOut)}</td>
                          <td className="p-3 font-semibold text-foreground">{formatProfileHours(att.checkIn, att.checkOut)}</td>
                          <td className="p-3 text-muted-foreground italic">{att.remarks || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {profileTab === "leave" && (
            <div className="space-y-4">
              {employeeLeaves.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                  No leaves requested yet.
                </div>
              ) : (
                <div className="border border-border/80 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/30 border-b border-border/80 text-muted-foreground uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="p-3">Period</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Reason</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {employeeLeaves.map((lv) => (
                        <tr key={lv.id} className="hover:bg-muted/10">
                          <td className="p-3 font-semibold">
                            {new Date(lv.fromDate).toLocaleDateString()} - {new Date(lv.toDate).toLocaleDateString()}
                          </td>
                          <td className="p-3">
                            <span className="font-semibold text-foreground uppercase text-[10px] bg-muted/60 border px-2 py-0.5 rounded">
                              {lv.leaveType}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground font-medium max-w-[200px] truncate" title={lv.reason ?? undefined}>
                            {lv.reason || "—"}
                          </td>
                          <td className="p-3">{getStatusBadge(lv.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {profileTab === "salary" && (
            <div className="space-y-4">
              {!employeeSalary ? (
                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                  No salary/CTC details configured yet for this employee.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border/80 bg-muted/5 p-4 flex flex-col justify-between">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Base Salary</span>
                      <span className="text-xl font-bold text-foreground mt-1">₹{employeeSalary.basic?.toLocaleString()}</span>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-muted/5 p-4 flex flex-col justify-between">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">HRA</span>
                      <span className="text-xl font-bold text-foreground mt-1">₹{employeeSalary.hra?.toLocaleString()}</span>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-muted/5 p-4 flex flex-col justify-between">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Allowances</span>
                      <span className="text-xl font-bold text-foreground mt-1">₹{employeeSalary.allowances?.toLocaleString()}</span>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-muted/5 p-4 flex flex-col justify-between">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Deductions</span>
                      <span className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">₹{employeeSalary.deductions?.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Net CTC (Annualized)</span>
                      <span className="text-xs text-muted-foreground block mt-0.5">Effective from {new Date(employeeSalary.effectiveFrom).toLocaleDateString()}</span>
                    </div>
                    <span className="text-3xl font-extrabold text-primary">₹{employeeSalary.ctc?.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="bg-muted/10 border-t border-border p-4 px-6 flex items-center justify-end">
          <Button type="button" onClick={() => setViewingRecord(null)}>
            Close Profile
          </Button>
        </div>
      </div>
    );
  };

  const renderPayrollWizard = () => {
    const totalEmployeesCount = globalStore.employees.filter((e) => e.status === "ACTIVE").length;
    const totalBasic = globalStore.salaries.reduce((sum, s) => sum + (s.basic || 0), 0);
    const totalHra = globalStore.salaries.reduce((sum, s) => sum + (s.hra || 0), 0);
    const finalPayout = totalBasic + totalHra + payrollAllowances - payrollDeductions;

    return (
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm mb-6 space-y-6">
        <div className="flex items-center justify-between gap-4 border-b border-border/80 pb-4">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-primary" /> Run Monthly Payroll
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Verify employee details, adjust allowances, and authorize disbursement.
            </p>
          </div>
          <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
            Period: {payrollMonth}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 relative">
          {[
            { step: 1, label: "Select Month" },
            { step: 2, label: "Review Timecards" },
            { step: 3, label: "Adjustments" },
            { step: 4, label: "Authorize" },
          ].map((s) => (
            <div
              key={s.step}
              className={`flex flex-col items-center text-center p-2 rounded-xl transition-all duration-200 border ${
                payrollStep === s.step
                  ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                  : payrollStep > s.step
                  ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mb-1.5 border ${
                payrollStep >= s.step ? "bg-primary text-white border-primary" : "bg-muted text-muted-foreground border-border"
              }`}>
                {s.step}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="p-4 rounded-xl border border-border/60 bg-muted/5 min-h-[140px] flex flex-col justify-center">
          {payrollStep === 1 && (
            <div className="space-y-3.5">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Step 1: Select Disbursement Month</p>
              <div className="flex items-center gap-3">
                <select
                  value={payrollMonth}
                  onChange={(e) => setPayrollMonth(e.target.value)}
                  className="bg-card border border-border text-xs font-semibold p-2 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 h-10 w-48 cursor-pointer"
                >
                  {["June 2026", "July 2026", "August 2026", "September 2026"].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <Button onClick={() => setPayrollStep(2)} className="h-10">Next: Review Timecards</Button>
              </div>
            </div>
          )}

          {payrollStep === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Step 2: Review Attendance and Leave Approvals</p>
              <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground font-medium">
                <div className="p-3 border rounded-xl bg-card">
                  Active Staff Count: <span className="font-bold text-foreground text-sm block mt-1">{totalEmployeesCount} Employees</span>
                </div>
                <div className="p-3 border rounded-xl bg-card">
                  Present Days Logged: <span className="font-bold text-foreground text-sm block mt-1">
                    {globalStore.attendances.filter(a => a.status === "PRESENT").length} Days
                  </span>
                </div>
                <div className="p-3 border rounded-xl bg-card">
                  Approved Leaves: <span className="font-bold text-foreground text-sm block mt-1">
                    {globalStore.leaves.filter(l => l.status === "APPROVED").length} Requests
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setPayrollStep(1)}>Back</Button>
                <Button onClick={() => setPayrollStep(3)}>Next: Adjustments</Button>
              </div>
            </div>
          )}

          {payrollStep === 3 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Step 3: Enter Allowances & Deductions Adjustments</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Special Monthly Allowances (All Staff)</Label>
                  <Input
                    type="number"
                    value={payrollAllowances}
                    onChange={(e) => setPayrollAllowances(Number(e.target.value))}
                    className="h-10"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Standard Deductions (TDS, PF, ESI)</Label>
                  <Input
                    type="number"
                    value={payrollDeductions}
                    onChange={(e) => setPayrollDeductions(Number(e.target.value))}
                    className="h-10"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setPayrollStep(2)}>Back</Button>
                <Button onClick={() => setPayrollStep(4)}>Next: Authorize Run</Button>
              </div>
            </div>
          )}

          {payrollStep === 4 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Step 4: Authorize and Disburse Monthly Salaries</p>
              {isPayrollDone ? (
                <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400 rounded-xl">
                  <span className="text-xl">🎉</span>
                  <div className="text-xs font-semibold">
                    Payroll processed and disbursed successfully! Net payout: ₹{finalPayout.toLocaleString()}.
                  </div>
                  <Button variant="outline" size="sm" className="ml-auto h-8 text-[11px] font-bold" onClick={() => {
                    setIsPayrollDone(false);
                    setPayrollStep(1);
                  }}>
                    Run Again
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-xs font-semibold text-muted-foreground space-y-1">
                    <div>Gross Base Salary: <span className="text-foreground font-bold">₹{totalBasic.toLocaleString()}</span></div>
                    <div>Gross HRA: <span className="text-foreground font-bold">₹{totalHra.toLocaleString()}</span></div>
                    <div>Net Disbursement Payout: <span className="text-primary font-bold text-sm">₹{finalPayout.toLocaleString()}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setPayrollStep(3)}>Back</Button>
                    <Button
                      disabled={isPayrollRunning}
                      type="button"
                      onClick={() => {
                        setIsPayrollRunning(true);
                        setTimeout(() => {
                          setIsPayrollRunning(false);
                          setIsPayrollDone(true);
                          toast.success(`Payroll processed for ${payrollMonth}`);
                        }, 1200);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                    >
                      {isPayrollRunning ? "Processing..." : "Confirm & Run Payroll"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          {breadcrumbs.map((item, index) => (
            <React.Fragment key={`${item.label}-${index}`}>
              {index > 0 && <span className="mx-2">/</span>}
              <span
                className={
                  index === breadcrumbs.length - 1
                    ? "text-foreground"
                    : undefined
                }
              >
                {item.label}
              </span>
            </React.Fragment>
          ))}
        </nav>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {pluralName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage {pluralName.toLowerCase()}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {syncAction && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSync()}
              disabled={isSyncing}
              className="gap-2"
            >
              <RefreshCw className={`size-4 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing..." : syncAction.label}
            </Button>
          )}
          {!readOnly && !hideAdd && canCreate && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" /> Add {moduleName}
            </Button>
          )}
        </div>
      </div>

      {tableName === "salaries" && renderPayrollWizard()}

      {cards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-in fade-in duration-200">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-all duration-200"
            >
              <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest">{card.label}</p>
              <p className="mt-2.5 text-2xl font-extrabold tracking-tight text-foreground">{card.value}</p>
              {card.change && (
                <p className="mt-1.5 text-xs text-muted-foreground font-semibold">
                  {card.change}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
        />
      </div>

      <GenericTable<any>
        columns={processedColumns as any}
        data={filteredRecords}
        onView={setViewingRecord}
        onEdit={!readOnly && canEdit && (!api || api.update) ? openEdit : undefined}
        onDelete={
          (api && !api.remove) || !canDelete
            ? undefined
            : (record) => {
              setRecordToDelete(record);
              setDeleteConfirmOpen(true);
            }
        }
        isLoading={isLoading}
        freezeActions={freezeActions}
        storageKey={tableName}
      />

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="bg-gradient-to-br from-primary/5 via-background to-transparent border-b p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {editingRecord ? "Update Entry" : "New Entry"}
            </p>

            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              {editingRecord ? `Edit ${moduleName}` : `Add ${moduleName}`}
            </DialogTitle>

            <DialogDescription className="text-xs text-muted-foreground">
              Complete the details below to update the system logs.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={submitForm}
            className="flex-1 flex flex-col justify-between overflow-y-auto"
          >
            <div className="p-6 space-y-6">
              {fields.map((field) => (
                <div key={field.name} className="flex flex-col gap-2">
                  <Label
                    htmlFor={field.name}
                    className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    {field.label}
                    {field.required && (
                      <span className="text-destructive"> *</span>
                    )}
                  </Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={field.name}
                      value={asInputValue(formValues[field.name])}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        setField(field.name, event.target.value)
                      }
                      className="min-h-[120px] bg-card hover:bg-card/85 transition-colors border-border/80 focus-visible:ring-1 focus-visible:ring-primary"
                    />
                  ) : field.type === "select" ? (
                    <Select
                      value={asInputValue(formValues[field.name])}
                      onValueChange={(value) => setField(field.name, value)}
                    >
                      <SelectTrigger
                        id={field.name}
                        className="w-full bg-card hover:bg-card/85 transition-colors border-border/80 focus:ring-1 focus:ring-primary"
                      >
                        <SelectValue placeholder={`Select ${field.label}`}>
                          {/* Explicitly render the matched label so that Radix UI
                              never falls back to displaying the raw UUID value,
                              even when SelectContent items load asynchronously. */}
                          {getCombinedOptions(field.name, field.options, optionValues)
                            .find((o) => o.value === asInputValue(formValues[field.name]))
                            ?.label ?? undefined}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {getCombinedOptions(
                          field.name,
                          field.options,
                          optionValues,
                        ).map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === "checkbox" ? (
                    <div className="flex h-10 items-center gap-2.5 px-3 rounded-lg border border-border/80 bg-card hover:bg-card/85 transition-colors">
                      <Checkbox
                        id={field.name}
                        checked={Boolean(formValues[field.name])}
                        onCheckedChange={(checked) =>
                          setField(field.name, Boolean(checked))
                        }
                        className="border-muted-foreground/50 data-[state=checked]:bg-primary"
                      />
                      <Label
                        htmlFor={field.name}
                        className="text-sm font-medium text-foreground cursor-pointer select-none"
                      >
                        Active / Enabled
                      </Label>
                    </div>
                  ) : (
                    <Input
                      id={field.name}
                      type={field.type}
                      value={asInputValue(formValues[field.name])}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        setField(field.name, event.target.value)
                      }
                      className="bg-card hover:bg-card/85 transition-colors border-border/80 focus-visible:ring-1 focus-visible:ring-primary"
                    />
                  )}
                  {errors[field.name] && (
                    <p className="text-xs text-destructive font-medium mt-0.5">
                      {errors[field.name]}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="bg-muted/30 border-t p-4 px-6 flex items-center justify-end gap-3 sticky bottom-0 bg-background">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsFormOpen(false)}
                className="hover:bg-muted/80"
              >
                Cancel
              </Button>
              <Button type="submit" className="shadow-xs hover:opacity-90">
                {editingRecord ? "Save changes" : `Create ${moduleName}`}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(viewingRecord)}
        onOpenChange={(open) => !open && setViewingRecord(null)}
      >
        <DialogContent className="w-[95vw] max-w-3xl max-h-[85vh] overflow-y-auto p-0">
          {viewingRecord && (
            tableName === "employees" ? (
              renderEmployeeProfile(viewingRecord)
            ) : (
              <>
                <DialogHeader className="px-6 pt-6">
                  <DialogTitle>{moduleName} Overview</DialogTitle>
                  <DialogDescription>
                    View complete {moduleName.toLowerCase()} details.
                  </DialogDescription>
                </DialogHeader>

                <div className="px-6 pb-6">
                  {viewingGroups && (
                    <div className="space-y-6 py-4">
                      {"status" in (viewingRecord as any) && (
                        <div>
                          {getStatusBadge(String((viewingRecord as any).status))}
                        </div>
                      )}

                      {viewingGroups.core.length > 0 && (
                        <section className="space-y-2">
                          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                            <Info className="size-3.5" /> Details
                          </h3>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                            {viewingGroups.core.map(({ key, value }) => (
                              <React.Fragment key={key}>
                                <dt className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mt-1">
                                  {formatFieldLabel(key)}
                                </dt>
                                <dd className="break-words text-foreground font-medium">
                                  {renderDisplayValue(
                                    key,
                                    value,
                                    viewingRecord as Record<string, any>,
                                    optionValues,
                                    fields,
                                  )}
                                </dd>
                              </React.Fragment>
                            ))}
                          </dl>
                        </section>
                      )}

                      {viewingGroups.dates.length > 0 && (
                        <section className="space-y-2">
                          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                            <Calendar className="size-3.5" /> Dates
                          </h3>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                            {viewingGroups.dates.map(({ key, value }) => (
                              <React.Fragment key={key}>
                                <dt className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mt-1">
                                  {formatFieldLabel(key)}
                                </dt>
                                <dd className="break-words text-foreground font-medium">
                                  {renderDisplayValue(
                                    key,
                                    value,
                                    viewingRecord as Record<string, any>,
                                    optionValues,
                                    fields,
                                  )}
                                </dd>
                              </React.Fragment>
                            ))}
                          </dl>
                        </section>
                      )}

                      {viewingGroups.relations.length > 0 && (
                        <section className="space-y-2">
                          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                            <Layers className="size-3.5" /> Related records
                          </h3>
                          <dl className="grid grid-cols-1 gap-y-3 text-sm">
                            {viewingGroups.relations.map(({ key, value }) => (
                              <React.Fragment key={key}>
                                <dt className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mt-1">
                                  {formatFieldLabel(key)}
                                </dt>
                                <dd className="break-words text-foreground font-medium">
                                  {renderDisplayValue(
                                    key,
                                    value,
                                    viewingRecord as Record<string, any>,
                                    optionValues,
                                    fields,
                                  )}
                                </dd>
                              </React.Fragment>
                            ))}
                          </dl>
                        </section>
                      )}

                      {tableName === "teams" &&
                        relationManager && (
                          <section className="space-y-3 rounded-xl border bg-card p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                                  <User className="size-3.5" />{" "}
                                  {relationManager.title ?? "Team members"}
                                </h3>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Add or remove employees assigned to this team.
                                </p>
                              </div>

                              {!readOnly && (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() => void openTeamMemberDialog()}
                                >
                                  <UserPlus className="size-4" />
                                  Add members
                                </Button>
                              )}
                            </div>

                            {currentTeamMembers.length === 0 ? (
                              <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                                No employees are assigned to this team yet.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {currentTeamMembers.map((member) => {
                                  const employee =
                                    member?.employee ?? member;
                                  const employeeId =
                                    member?.employeeId ?? employee?.id;

                                  return (
                                    <div
                                      key={employeeId}
                                      className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold">
                                          {getEmployeeName(employee)}
                                        </p>
                                        {getEmployeeSubtitle(employee) && (
                                          <p className="truncate text-xs text-muted-foreground">
                                            {getEmployeeSubtitle(employee)}
                                          </p>
                                        )}
                                      </div>

                                      {!readOnly && employeeId && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="shrink-0 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                          disabled={removeMemberId === employeeId}
                                          onClick={() =>
                                            void removeTeamMember(employeeId)
                                          }
                                        >
                                          {removeMemberId === employeeId ? (
                                            <Loader2 className="size-4 animate-spin" />
                                          ) : (
                                            <UserMinus className="size-4" />
                                          )}
                                          Remove
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </section>
                        )}
                    </div>
                  )}
                </div>
              </>
            )
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={teamMemberDialogOpen}
        onOpenChange={(open) => {
          setTeamMemberDialogOpen(open);
          if (!open) {
            setTeamMemberSearch("");
            setSelectedEmployeeIds([]);
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-lg p-0">
          <DialogHeader className="border-b p-6">
            <DialogTitle>Add Team Members</DialogTitle>
            <DialogDescription>
              Select one or more employees to add to this team.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-6">
            <Input
              value={teamMemberSearch}
              onChange={(event) =>
                setTeamMemberSearch(event.target.value)
              }
              placeholder="Search employees..."
              autoFocus
            />

            <div className="max-h-[360px] overflow-y-auto rounded-lg border">
              {availableTeamEmployees.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {teamMemberSearch
                    ? "No matching available employees."
                    : "No available employees to add."}
                </div>
              ) : (
                <div className="divide-y">
                  {availableTeamEmployees.map((employee) => {
                    const selected = selectedEmployeeIds.includes(
                      employee.id,
                    );

                    return (
                      <button
                        key={employee.id}
                        type="button"
                        onClick={() =>
                          toggleEmployeeSelection(employee.id)
                        }
                        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() =>
                            toggleEmployeeSelection(employee.id)
                          }
                          onClick={(event) => event.stopPropagation()}
                        />

                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {getEmployeeName(employee)}
                          </p>
                          {getEmployeeSubtitle(employee) && (
                            <p className="truncate text-xs text-muted-foreground">
                              {getEmployeeSubtitle(employee)}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedEmployeeIds.length > 0 && (
              <p className="text-xs font-medium text-muted-foreground">
                {selectedEmployeeIds.length} employee
                {selectedEmployeeIds.length === 1 ? "" : "s"} selected
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t bg-muted/30 p-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setTeamMemberDialogOpen(false)}
              disabled={isTeamMemberSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitTeamMembers()}
              disabled={
                selectedEmployeeIds.length === 0 ||
                isTeamMemberSubmitting
              }
              className="gap-2"
            >
              {isTeamMemberSubmitting && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Add selected
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Move ${moduleName} to Recycle Bin?`}
        description={`This ${moduleName.toLowerCase()} will be moved to the Recycle Bin. You can restore it anytime from Settings → Recycle Bin.`}
        confirmText="Move to Bin"
        onConfirm={async () => {
          if (!recordToDelete) return;
          setIsLoading(true);
          try {
            if (api?.remove) {
              await api.remove(recordToDelete.id);
              await loadRecords();
            } else deleteRecord(tableName, recordToDelete.id);
            toast.success(`${moduleName} deleted successfully.`);
          } catch (error: any) {
            toast.error(
              error.response?.data?.message ??
              `Unable to delete ${moduleName.toLowerCase()}.`,
            );
          } finally {
            setIsLoading(false);
            setRecordToDelete(null);
          }
        }}
      />
    </div>
  );
}