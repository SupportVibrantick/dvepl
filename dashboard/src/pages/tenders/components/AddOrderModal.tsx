import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Plus,
  Trash2,
  Loader2,
  Calendar as CalendarIcon,
  Search,
  Check,
  ChevronDown,
  Settings,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { apiClient } from "@/services/axios";
import { securityApi, crmApi } from "@/services/modules";
import { organizationApi } from "@/services/organization";
import workflowApi from "@/services/workflowApi";
import { toast } from "react-hot-toast";
import { useERPStore } from "@/store/erpStore";

import {
  ProjectDocumentUploadPanel,
} from "./ProjectDocumentUploadPanel";
import { ManageOrderDocumentsModal } from "./ManageOrderDocumentsModal";
import { ManageOrderFieldsModal } from "./ManageOrderFieldsModal";
import { ManageWorkflowStagesModal } from "./ManageWorkflowStagesModal";
import {
  getAddOrderFormFieldConfig,
} from "./addOrderModalFieldsConfig";
import {
  getOrderDocumentCategories,
  normalizeCategoryName,
} from "./orderDocumentsConfig";
import {
  DEFAULT_STAGE_ROWS,
  getOrderStageRequirements,
} from "./orderStageRequirementsConfig";
import { isAdminUser } from "@/utils/pagePermissions";
import { SalesOrderAttachment } from "../orderShared";


// ============================================================
// TYPES
// ============================================================

interface OrderItemForm {
  itemCode: string;
  description: string;
  unit: string;
  quantity: string;
  rate: string;
  gstPercentage: string;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  role?: string;
}

interface StageRow {
  key: string;
  name: string;
  department: string;
}

interface CustomerOption {
  id: string;
  name: string;
  firmName?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  contacts?: Array<{
    name?: string;
    phone?: string;
    email?: string;
    isPrimary?: boolean;
  }>;
}

interface AddOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string | null;
  orderTakenById?: string | null;
  editingOrder?: {
    id: string;
    dveplCode?: string;
    partyName?: string;
    caNo?: string | null;
    name?: string;
    mobile?: string;
    email_id?: string;
    name_of_work?: string;
    department_name?: string;
    section_name?: string;
    division_name?: string;
    subdivision?: string;
    state_name?: string | null;
    tenderID?: string;
    reference_code?: string;
    status?: string;
    remarks?: string;
    poDate?: string;
    deliveryMonthTarget?: string;
    orderConfirmDate?: string;
    drawingConcernedPerson?: string;
    inspectionField?: string;
    attachments?: SalesOrderAttachment[];
  } | null;
  onSuccess: () => void;
}

const EMPTY_ITEM: OrderItemForm = {
  itemCode: "",
  description: "",
  unit: "Nos",
  quantity: "1",
  rate: "0",
  gstPercentage: "18",
};

// Helper to format Date -> YYYY-MM-DD
function toDateInputFormat(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Add days to date
function addDays(dateStr: string, days: number): string {
  if (!dateStr || isNaN(days)) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return toDateInputFormat(d);
}

// Format date for display: "Oct 24, 2026"
function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ============================================================
// MODAL COMPONENT
// ============================================================

export function AddOrderModal({
  open,
  onOpenChange,
  companyId,
  orderTakenById: propOrderTakenById,
  editingOrder,
  onSuccess,
}: AddOrderModalProps) {
  const store = useERPStore();
  const navigate = useNavigate();

  // ------------------------------------------------------------
  // FORM STATE
  // ------------------------------------------------------------
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null
  );
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const [dveplCode, setDveplCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [mobileNo, setMobileNo] = useState("");
  const [emailId, setEmailId] = useState("");

  const [billingAddress, setBillingAddress] = useState("");
  const [isBillingChanged, setIsBillingChanged] = useState(false);

  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [shippingAddress, setShippingAddress] = useState("");

  const [orderDate, setOrderDate] = useState(() =>
    toDateInputFormat(new Date())
  );
  const [commitmentType, setCommitmentType] = useState<"fixed" | "days">(
    "fixed"
  );
  const [commitmentDate, setCommitmentDate] = useState("");
  const [commitmentDays, setCommitmentDays] = useState("");

  const [customerPoNo, setCustomerPoNo] = useState("");
  const [totalPanels, setTotalPanels] = useState("");
  const [advance, setAdvance] = useState("");
  const [projectReference, setProjectReference] = useState("");

  const [orderTakenById, setOrderTakenById] = useState<string | null>(null);
  const [orderTakenByUserIds, setOrderTakenByUserIds] = useState<string[]>([]);

  // Workflow Stages & Responsibility assignments
  const [stageRows, setStageRows] = useState<StageRow[]>(DEFAULT_STAGE_ROWS);
  const [stageAssignments, setStageAssignments] = useState<
    Record<string, string>
  >({});

  // Line items (Order Detail Tabs)
  const [isOrderDetailOpen, setIsOrderDetailOpen] = useState(false);
  const [items, setItems] = useState<OrderItemForm[]>([{ ...EMPTY_ITEM }]);

  // Document upload state
  const [orderAttachments, setOrderAttachments] = useState<SalesOrderAttachment[]>([]);
  const [pendingDocuments, setPendingDocuments] = useState<
    Array<{ category: string; file: File }>
  >([]);
  const [allMandatoryDocsUploaded, setAllMandatoryDocsUploaded] = useState(false);
  const [isManageDocsOpen, setIsManageDocsOpen] = useState(false);
  const [isManageFieldsOpen, setIsManageFieldsOpen] = useState(false);
  const [isManageStagesOpen, setIsManageStagesOpen] = useState(false);

  // Admin-controlled required/optional configuration for this form.
  // Admins can edit via ManageOrderFieldsModal; the resolved config applies
  // to every user (drives the "*" indicators and submit-time validation).
  const fieldConfig = useMemo(
    () => getAddOrderFormFieldConfig(store.settings),
    [store.settings],
  );

  // Per-stage required/optional configuration for the Job Responsibility section
  const stageRequirements = useMemo(
    () => getOrderStageRequirements(store.settings),
    [store.settings],
  );

  const requiredStageNames = useMemo(() => {
    return stageRows
      .filter((stage) => stageRequirements[stage.key] === true)
      .map((stage) => stage.name);
  }, [stageRows, stageRequirements]);

  // Visual shake highlighting for missing required fields / stages / documents
  const [missingFields, setMissingFields] = useState<Record<string, boolean>>({});
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    };
  }, []);

  const triggerShake = (fields: Record<string, boolean>) => {
    setMissingFields(fields);
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => setMissingFields({}), 700);
  };

  const shakeCls = (key: string) =>
    missingFields[key]
      ? "border-red-500 ring-1 ring-red-500/70 animate-shake"
      : "";

  const currentUser = useMemo(() => {
    return store.users.find((user) => user.id === store.currentUserId) as any;
  }, [store.users, store.currentUserId]);

  const isAdmin = useMemo(() => {
    if (!currentUser) return false;
    return (
      isAdminUser(currentUser) ||
      currentUser?.name?.toLowerCase() === "admin" ||
      currentUser?.email?.toLowerCase() === "admin@dvepl.com" ||
      (Array.isArray(currentUser?.roles) &&
        currentUser.roles.some((r: any) =>
          String(r?.name || r).toLowerCase().includes("admin")
        ))
    );
  }, [currentUser]);

  // Data fetching state
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [teamMembers, setTeamMembers] = useState<UserOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derive effective company ID with robust fallback logic
  const effectiveCompanyId = useMemo(() => {
    if (companyId && typeof companyId === "string" && companyId.trim() !== "" && companyId !== "comp-1") {
      return companyId.trim();
    }
    if (store.currentCompanyId && typeof store.currentCompanyId === "string" && store.currentCompanyId.trim() !== "" && store.currentCompanyId !== "comp-1") {
      return store.currentCompanyId.trim();
    }
    const realCompany = store.companies?.find((c) => c.id && c.id !== "comp-1");
    if (realCompany?.id) return realCompany.id;

    const userCompanyId = (currentUser as any)?.companyId;
    if (userCompanyId && typeof userCompanyId === "string" && userCompanyId.trim() !== "" && userCompanyId !== "comp-1") {
      return userCompanyId.trim();
    }
    return null;
  }, [companyId, store.currentCompanyId, store.companies, currentUser]);

  // Safe date helper to avoid timezone offset day-shifting
  const safeDateStr = (val: any): string => {
    if (!val) return "";
    if (typeof val === "string") {
      const match = val.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
    try {
      return toDateInputFormat(new Date(val));
    } catch {
      return "";
    }
  };

  // ------------------------------------------------------------
  // RESET FORM
  // ------------------------------------------------------------
  const resetForm = () => {
    setSelectedCustomerId(null);
    setCustomerSearchQuery("");
    setIsCustomerDropdownOpen(false);

    setDveplCode("");
    setCompanyName("");
    setContactPerson("");
    setMobileNo("");
    setEmailId("");

    setBillingAddress("");
    setIsBillingChanged(false);

    setSameAsBilling(true);
    setShippingAddress("");

    setOrderDate(toDateInputFormat(new Date()));
    setCommitmentType("fixed");
    setCommitmentDate("");
    setCommitmentDays("");

    setCustomerPoNo("");
    setTotalPanels("");
    setAdvance("");
    setProjectReference("");

    setOrderTakenById(propOrderTakenById || null);
    setStageAssignments({});

    setIsOrderDetailOpen(false);
    setItems([{ ...EMPTY_ITEM }]);
    setOrderAttachments([]);
    setPendingDocuments([]);
    setAllMandatoryDocsUploaded(false);
  };

  // ------------------------------------------------------------
  // LOAD WORKFLOW TEMPLATE (Job Responsibility stages)
  // ------------------------------------------------------------
  const loadStageRows = useCallback(async () => {
    try {
      const res = await workflowApi.getTemplate();
      if (res.data?.success && res.data?.data?.steps) {
        const steps = res.data.data.steps
          .filter((s) => s.isActive)
          .sort((a, b) => a.position - b.position);

        if (steps.length > 0) {
          const mapped: StageRow[] = steps.map((s) => {
            // Guess department from step name or fallback
            let dept = "Costing";
            const nameLower = s.name.toLowerCase();
            if (nameLower.includes("account") || nameLower.includes("po")) {
              dept = "Accounts";
            } else if (nameLower.includes("draw") || nameLower.includes("design")) {
              dept = "Design";
            } else if (nameLower.includes("purchase") || nameLower.includes("vendor")) {
              dept = "Accounts";
            } else if (nameLower.includes("production")) {
              dept = "Production";
            } else if (nameLower.includes("inventory")) {
              dept = "Inventory";
            }
            return {
              key: s.key,
              name: s.name,
              department: dept,
            };
          });
          setStageRows(mapped);
        }
      }
    } catch (err) {
      console.error("Failed to load workflow template:", err);
    }
  }, []);

  // ------------------------------------------------------------
  // LOAD CUSTOMERS, TEAM MEMBERS & WORKFLOW TEMPLATE
  // ------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    // 0. Ensure Company Settings are loaded for document categories & fields
    void store.fetchSettings();

    // Ensure Company Context is loaded
    if (!effectiveCompanyId) {
      (async () => {
        try {
          const comps = await organizationApi.companies.list();
          const list = Array.isArray(comps) ? comps : (comps as any)?.data || [];
          if (list.length > 0) {
            useERPStore.setState({ companies: list as any });
            const validComp = list.find((c: any) => c.id && c.id !== "comp-1") || list[0];
            if (validComp?.id) {
              store.setCompanyId(validComp.id);
            }
          }
        } catch (err) {
          console.error("Failed to load companies in AddOrderModal:", err);
        }
      })();
    }

    // 1. Fetch Customers
    (async () => {
      try {
        const res = await crmApi.customers.list();
        const list = Array.isArray(res) ? res : (res as any)?.data || [];
        setCustomers(list);
      } catch (err) {
        console.error("Failed to load customers:", err);
      }
    })();

    // 2. Fetch Team Members
    (async () => {
      try {
        const res = await securityApi.users.list();
        const list: UserOption[] = Array.isArray(res)
          ? res
          : (res as any)?.data || [];
        const activeUsers = list.filter(
          (u: any) =>
            u.isActive !== false &&
            u.name?.toLowerCase() !== "admin" &&
            u.email?.toLowerCase() !== "admin@dvepl.com"
        );
        setTeamMembers(activeUsers.length > 0 ? activeUsers : (store.users as any) || []);
      } catch (err) {
        console.error("Failed to load users:", err);
        if (store.users?.length) {
          setTeamMembers(store.users as any);
        }
      }
    })();

    // 3. Fetch Workflow Template Steps
    void loadStageRows();

    // Listen for postMessage from workflow stages editor tab or window focus
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "WORKFLOW_STAGES_UPDATED") {
        void loadStageRows();
        toast.success("Workflow stages updated.");
      }
    };
    const handleFocus = () => {
      void loadStageRows();
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("focus", handleFocus);
    };
  }, [open, store.users, loadStageRows]);

  // ------------------------------------------------------------
  // HANDLE PREFILL ON EDIT
  // ------------------------------------------------------------
  useEffect(() => {
    const fetchOrderDetails = async () => {
      if (!editingOrder?.id) return;
      try {
        const res = await apiClient.get(`/order/read/${editingOrder.id}`);
        if (res.data?.success && res.data?.data) {
          const order = res.data.data;

          setDveplCode(order.dveplCode || "");
          setCompanyName(order.partyName || "");
          setCustomerSearchQuery(order.partyName || "");
          setCustomerPoNo(order.caNo || "");

          if (order.customerId) {
            setSelectedCustomerId(order.customerId);
          }

          if (order.orderTakenById) {
            setOrderTakenById(order.orderTakenById);
          } else if (order.orderTakenBy?.id) {
            setOrderTakenById(order.orderTakenBy.id);
          }

          const takenIds = Array.isArray(order.takenByUsers)
            ? order.takenByUsers
                .map((tu: any) => tu?.user?.id)
                .filter(Boolean)
            : [];

          if (takenIds.length > 0) {
            setOrderTakenByUserIds(Array.from(new Set(takenIds)));
            setOrderTakenById(order.orderTakenById || takenIds[0]);
          } else {
            setOrderTakenByUserIds(
              order.orderTakenById
                ? [order.orderTakenById]
                : order.orderTakenBy?.id
                  ? [order.orderTakenBy.id]
                  : []
            );
          }

          if (Array.isArray(order.assignments) && order.assignments.length > 0) {
            const mappedAssignments: Record<string, string> = {};
            order.assignments.forEach((a: any) => {
              if (a.stage && a.userId) {
                mappedAssignments[a.stage] = a.userId;
              }
            });
            if (Object.keys(mappedAssignments).length > 0) {
              setStageAssignments((prev) => ({ ...prev, ...mappedAssignments }));
            }
          }

          const parts = (order.contactDetails || "").split(" | ");
          setContactPerson(parts[0] || "");
          setMobileNo(parts[1] || "");
          setEmailId(parts[2] || "");

          if (order.poDate) {
            setOrderDate(safeDateStr(order.poDate));
          }
          if (order.deliveryMonthTarget) {
            setCommitmentType("fixed");
            setCommitmentDate(safeDateStr(order.deliveryMonthTarget));
          }
          setTotalPanels(order.inspectionField || "");

          if (order.remarks) {
            const lines = order.remarks.split("\n");
            lines.forEach((line: string) => {
              if (line.startsWith("Project Reference: ")) {
                setProjectReference(line.replace("Project Reference: ", ""));
              } else if (line.startsWith("Advance: ")) {
                setAdvance(line.replace("Advance: ", ""));
              } else if (line.startsWith("Billing Address: ")) {
                setBillingAddress(line.replace("Billing Address: ", ""));
                setIsBillingChanged(true);
              } else if (line.startsWith("Shipping Address: ")) {
                setShippingAddress(line.replace("Shipping Address: ", ""));
                setSameAsBilling(false);
              }
            });
          }

          if (Array.isArray(order.salesOrderAttachments)) {
            setOrderAttachments(order.salesOrderAttachments);
          } else if (Array.isArray(order.attachments)) {
            setOrderAttachments(order.attachments);
          }

          if (order.items && order.items.length > 0) {
            setItems(
              order.items.map((item: any) => ({
                itemCode: item.itemCode || "",
                description: item.description || "",
                unit: item.unit || "Nos",
                quantity: String(item.quantity ?? "1"),
                rate: String(item.unitPrice ?? item.rate ?? "0"),
                gstPercentage: String(item.gstPercentage ?? "18"),
              }))
            );
          } else {
            setItems([{ ...EMPTY_ITEM }]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch order details:", err);
        toast.error("Failed to load full order details.");
      }
    };

    if (!open) return;

    if (editingOrder) {
      setDveplCode(editingOrder.dveplCode || "");
      const initialParty = editingOrder.partyName || (editingOrder as any).firm_name || "";
      setCompanyName(initialParty);
      setCustomerSearchQuery(initialParty);
      setContactPerson(editingOrder.name || "");
      setMobileNo(editingOrder.mobile || "");
      setEmailId(editingOrder.email_id || "");
      setCustomerPoNo(editingOrder.caNo || "");
      setProjectReference(editingOrder.reference_code || "");
      setTotalPanels(editingOrder.inspectionField || "");
      if (editingOrder.poDate) {
        setOrderDate(safeDateStr(editingOrder.poDate));
      }
      if (editingOrder.deliveryMonthTarget) {
        setCommitmentDate(safeDateStr(editingOrder.deliveryMonthTarget));
      }
      if (Array.isArray(editingOrder.attachments)) {
        setOrderAttachments(editingOrder.attachments);
      }
      void fetchOrderDetails();
} else {
      setOrderAttachments([]);
      setOrderTakenById(propOrderTakenById || null);
      setOrderTakenByUserIds(propOrderTakenById ? [propOrderTakenById] : []);
    }
  }, [open, editingOrder, propOrderTakenById]);

  // Close customer dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target as Node)
      ) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ------------------------------------------------------------
  // CUSTOMER AUTO-COMPLETE FILTER & SELECTION
  // ------------------------------------------------------------
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter((c) => {
        const nameMatch = c.name?.toLowerCase().includes(q);
        const firmMatch = c.firmName?.toLowerCase().includes(q);
        const contactMatch = c.contacts?.some(
          (cp) =>
            cp.name?.toLowerCase().includes(q) ||
            cp.phone?.includes(q) ||
            cp.email?.toLowerCase().includes(q)
        );
        return nameMatch || firmMatch || contactMatch;
      })
      .slice(0, 10);
  }, [customers, customerSearchQuery]);

  const handleSelectCustomer = (customer: CustomerOption) => {
    setSelectedCustomerId(customer.id);
    setCustomerSearchQuery(customer.firmName || customer.name || "");
    setIsCustomerDropdownOpen(false);

    setCompanyName(customer.firmName || customer.name || "");

    const primaryContact =
      customer.contacts?.find((cp) => cp.isPrimary) ||
      customer.contacts?.[0];

    if (primaryContact) {
      if (primaryContact.name) setContactPerson(primaryContact.name);
      if (primaryContact.phone) setMobileNo(primaryContact.phone);
      if (primaryContact.email) setEmailId(primaryContact.email);
    }

    if (customer.billingAddress) {
      setBillingAddress(customer.billingAddress);
    }
    if (customer.shippingAddress) {
      setShippingAddress(customer.shippingAddress);
      setSameAsBilling(false);
    } else {
      setSameAsBilling(true);
    }
    setIsBillingChanged(false);
  };

  const handleClearCustomer = () => {
    setSelectedCustomerId(null);
    setCustomerSearchQuery("");
    setCompanyName("");
    setContactPerson("");
    setMobileNo("");
    setEmailId("");
    setBillingAddress("");
    setIsBillingChanged(false);
  };

  // ------------------------------------------------------------
  // COMMITMENT DATE CALCULATION
  // ------------------------------------------------------------
  const calculatedCommitmentDate = useMemo(() => {
    if (commitmentType === "fixed") {
      return commitmentDate;
    }
    const days = parseInt(commitmentDays, 10);
    if (!orderDate || isNaN(days) || days <= 0) return "";
    return addDays(orderDate, days);
  }, [commitmentType, commitmentDate, commitmentDays, orderDate]);

  // ------------------------------------------------------------
  // STAGE ASSIGNMENT HANDLER & LABELS
  // ------------------------------------------------------------
  const handleStageAssignmentChange = (stageKey: string, userId: string) => {
    setStageAssignments((prev) => ({
      ...prev,
      [stageKey]: userId === "__none__" ? "" : userId,
    }));
  };

  const toggleOrderTakenByUser = (userId: string, checked: boolean) => {
    setOrderTakenByUserIds((prev) => {
      const next = checked
        ? Array.from(new Set([...prev, userId]))
        : prev.filter((id) => id !== userId);
      setOrderTakenById(next[0] || null);
      return next;
    });
  };

  const selectedOrderTakenByLabel = useMemo(() => {
    const ids = Array.from(
      new Set([
        ...orderTakenByUserIds,
        ...(orderTakenById && !orderTakenByUserIds.includes(orderTakenById)
          ? [orderTakenById]
          : []),
      ]),
    );
    return ids
      .map((id) => {
        const member = teamMembers.find((m) => m.id === id);
        return member
          ? `${member.name}${member.email ? ` (${member.email})` : ""}`
          : "";
      })
      .filter(Boolean)
      .join(", ");
  }, [orderTakenByUserIds, orderTakenById, teamMembers]);

  const getStageAssigneeLabel = (stageKey: string) => {
    const userId = stageAssignments[stageKey];
    if (!userId || userId === "__none__") return "";
    const member = teamMembers.find((m) => m.id === userId);
    return member ? member.name : "";
  };

  // ------------------------------------------------------------
  // LINE ITEM MANAGEMENT
  // ------------------------------------------------------------
  const updateItem = (
    index: number,
    key: keyof OrderItemForm,
    value: string
  ) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [key]: value } : item))
    );
  };

  const addItem = () => {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length === 0 ? [{ ...EMPTY_ITEM }] : next;
    });
  };

  // ------------------------------------------------------------
  // REMARKS BUILDER
  // ------------------------------------------------------------
  const buildRemarks = () => {
    const lines: string[] = [];
    if (projectReference.trim()) {
      lines.push(`Project Reference: ${projectReference.trim()}`);
    }
    if (advance.trim()) {
      lines.push(`Advance: ${advance.trim()}`);
    }
    if (totalPanels.trim()) {
      lines.push(`Total Panels/Units: ${totalPanels.trim()}`);
    }
    if (billingAddress.trim()) {
      lines.push(`Billing Address: ${billingAddress.trim()}`);
    }
    if (!sameAsBilling && shippingAddress.trim()) {
      lines.push(`Shipping Address: ${shippingAddress.trim()}`);
    }
    if (commitmentType === "days" && commitmentDays.trim()) {
      lines.push(
        `Commitment: ${commitmentDays.trim()} Days (Target: ${calculatedCommitmentDate})`
      );
    }
    return lines.join("\n");
  };

  // ------------------------------------------------------------
  // SUBMIT & PROCEED HANDLER
  // ------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingOrder && !effectiveCompanyId) {
      toast.error("Company context is missing. Please make sure an active company is selected.");
      return;
    }

    const effectiveCompanyName = companyName.trim() || customerSearchQuery.trim();

    // Required-field validation driven by admin-configured field requirements
    const missingRequired: string[] = [];
    const missingMap: Record<string, boolean> = {};
    const markMissing = (key: string, isMissing: boolean, label: string) => {
      if (!isMissing) return;
      missingRequired.push(label);
      missingMap[key] = true;
    };

    markMissing(
      "companyName",
      Boolean(fieldConfig.companyName && !effectiveCompanyName),
      "Customer / Company Name",
    );
    markMissing(
      "dveplCode",
      Boolean(fieldConfig.dveplCode && !dveplCode.trim()),
      "DVEPL Ref Code",
    );
    markMissing(
      "contactPerson",
      Boolean(fieldConfig.contactPerson && !contactPerson.trim()),
      "Contact Person",
    );
    markMissing(
      "mobileNo",
      Boolean(fieldConfig.mobileNo && !mobileNo.trim()),
      "Mobile No",
    );
    markMissing(
      "emailId",
      Boolean(fieldConfig.emailId && !emailId.trim()),
      "Email ID",
    );
    markMissing(
      "billingAddress",
      Boolean(fieldConfig.billingAddress && !billingAddress.trim()),
      "Billing Address",
    );
    markMissing(
      "shippingAddress",
      Boolean(
        fieldConfig.shippingAddress &&
          (sameAsBilling ? !billingAddress.trim() : !shippingAddress.trim()),
      ),
      "Shipping Address",
    );
    markMissing(
      "orderDate",
      Boolean(fieldConfig.orderDate && !orderDate.trim()),
      "Date of Order",
    );
    if (fieldConfig.commitment) {
      if (commitmentType === "fixed" && !commitmentDate.trim()) {
        markMissing("commitment", true, "Date of Commitment");
      } else if (commitmentType === "days" && !commitmentDays.trim()) {
        markMissing("commitment", true, "Date of Commitment");
      }
    }
    markMissing(
      "customerPoNo",
      Boolean(fieldConfig.customerPoNo && !customerPoNo.trim()),
      "Customer PO No",
    );
    markMissing(
      "totalPanels",
      Boolean(fieldConfig.totalPanels && !totalPanels.trim()),
      "Total Panels / Units",
    );
    markMissing(
      "advance",
      Boolean(fieldConfig.advance && !advance.trim()),
      "Advance",
    );
    markMissing(
      "projectReference",
      Boolean(fieldConfig.projectReference && !projectReference.trim()),
      "Project Reference",
    );
    markMissing(
      "orderTakenBy",
      Boolean(fieldConfig.orderTakenBy && orderTakenByUserIds.length === 0),
      "Order Taken By / Concerned Person",
    );

    for (const stage of stageRows) {
      if (stageRequirements[stage.key] !== true) continue;
      const assigned = stageAssignments[stage.key];
      if (!assigned || assigned === "__none__") {
        missingRequired.push(stage.name);
        missingMap[`stage:${stage.key}`] = true;
      }
    }

    if (missingRequired.length > 0) {
      triggerShake(missingMap);
      toast.error("Please complete all required fields before proceeding.");
      return;
    }

    // Check mandatory documents for new orders
    if (!editingOrder && !allMandatoryDocsUploaded) {
      const configuredDocs = getOrderDocumentCategories(store.settings);
      const mandatoryDocs = configuredDocs.filter((d) => d.isMandatory);
      const missing = mandatoryDocs.filter((mand) => {
        const mandNorm = normalizeCategoryName(mand.name);
        return !pendingDocuments.some(
          (doc) => normalizeCategoryName(doc.category) === mandNorm
        );
      });

      if (missing.length > 0) {
        triggerShake({ docs: true });
        toast.error("Please upload all mandatory documents before proceeding.");
        return;
      }
    }

    const contactParts = [contactPerson, mobileNo, emailId]
      .map((v) => v.trim())
      .filter(Boolean);
    const contactDetails =
      contactParts.length > 0 ? contactParts.join(" | ") : null;

    const validItems = items
      .filter((item) => item.itemCode.trim() || item.description.trim())
      .map((item) => ({
        itemCode: item.itemCode.trim() || "ITEM-1",
        description: item.description.trim() || "Order Item",
        unit: item.unit.trim() || "Nos",
        quantity: Math.max(1, Number(item.quantity) || 1),
        rate: Math.max(0, Number(item.rate) || 0),
        gstPercentage: Math.max(0, Number(item.gstPercentage) || 18),
        remarks: null,
      }));

    const finalItems =
      validItems.length > 0
        ? validItems
        : [
            {
              itemCode: dveplCode.trim(),
              description: `Sales Order for ${effectiveCompanyName}`,
              unit: "Nos",
              quantity: 1,
              rate: 0,
              gstPercentage: 18,
              remarks: null,
            },
          ];

    const finalTakenByUserIds = Array.from(
      new Set([
        ...orderTakenByUserIds,
        ...(orderTakenById && !orderTakenByUserIds.includes(orderTakenById)
          ? [orderTakenById]
          : []),
      ]),
    );

    const payload = {
      ...(editingOrder
        ? {
            orderTakenById: finalTakenByUserIds[0] || null,
          }
        : {
            companyId: effectiveCompanyId,
            orderTakenById: finalTakenByUserIds[0] || null,
          }),
      orderTakenByUserIds: finalTakenByUserIds,
      customerId: selectedCustomerId || null,
      dveplCode: dveplCode.trim(),
      status: editingOrder?.status || "PENDING",
      partyName: effectiveCompanyName,
      caNo: customerPoNo.trim() || null,
      contactDetails,
      poDate: orderDate || null,
      orderConfirmDate: orderDate || null,
      deliveryMonthTarget: calculatedCommitmentDate || null,
      inspectionField: totalPanels.trim() || null,
      sendNotification: true,
      remarks: buildRemarks() || null,
      items: finalItems,
    };

    setIsSubmitting(true);
    try {
      // 1. Create or Update Sales Order
      const response = editingOrder
        ? await apiClient.patch(`/order/update/${editingOrder.id}`, payload)
        : await apiClient.post("/order/create", payload);

      if (!response.data?.success) {
        toast.error(
          response.data?.message ??
            (editingOrder
              ? "Unable to update order."
              : "Unable to create order.")
        );
        return;
      }

      const orderId = editingOrder
        ? editingOrder.id
        : response.data?.data?.id;

      // 2. Save Stage Responsibilities (Assignments) FIRST
      // Saving assignments first ensures that if the creator or assignee is checked
      // for stage authorization when uploading attachments, their permissions exist.
      const stageAssignmentsPayload = Object.entries(stageAssignments)
        .filter(([_, userId]) => Boolean(userId) && userId !== "__none__")
        .map(([stage, userId]) => ({
          stage,
          userIds: [userId],
        }));

      if (orderId && stageAssignmentsPayload.length > 0) {
        try {
          await apiClient.put(`/order/assign/${orderId}`, {
            assignments: stageAssignmentsPayload,
          });
        } catch (assignErr) {
          console.error("Failed to assign stages:", assignErr);
        }
      }

      // 3. Upload and Attach Pending Documents
      let uploadIssuesCount = 0;
      const failedCategories: string[] = [];

      if (orderId && pendingDocuments.length > 0) {
        for (const { category, file } of pendingDocuments) {
          try {
            const formData = new FormData();
            formData.append("file", file);
            const uploadRes = await apiClient.post("/upload/", formData, {
              headers: { "Content-Type": "multipart/form-data" },
            });
            const fileUrl = uploadRes.data?.data?.fileUrl;
            if (!fileUrl) {
              throw new Error("Upload did not return a file URL.");
            }
            await apiClient.post(`/order/attachment/${orderId}`, {
              fileName: file.name,
              fileUrl,
              fileSize: file.size,
              mimeType: file.type || null,
              category,
            });
          } catch (uploadErr: any) {
            console.error(`Document upload failed for ${category}:`, uploadErr);
            uploadIssuesCount++;
            failedCategories.push(category);
          }
        }
      }

      if (uploadIssuesCount > 0) {
        toast.error(
          `Order saved, but failed to upload: ${failedCategories.join(", ")}. Please re-upload in order details.`
        );
      } else {
        toast.success(
          editingOrder
            ? "Order updated successfully!"
            : "Order created successfully! Redirecting to Accounts..."
        );
      }
      resetForm();
      onOpenChange(false);
      onSuccess();

      if (!editingOrder && orderId) {
        navigate(`/accounts/${orderId}`);
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ??
          (editingOrder
            ? "Failed to update order. Please try again."
            : "Failed to create order. Please try again.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !isSubmitting) {
      resetForm();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="
          w-[calc(100%-2rem)]
          sm:max-w-4xl
          lg:max-w-5xl
          xl:max-w-6xl
          max-h-[92vh]
          overflow-hidden
          p-0
          gap-0
          rounded-2xl
          border
          border-neutral-200
          dark:border-neutral-800
          bg-white
          dark:bg-neutral-950
          shadow-2xl
        "
      >
        {/* ========================================================
            MODAL HEADER (Matching Screenshot 1)
            ======================================================== */}
        <DialogHeader className="px-6 py-5 border-b border-neutral-100 dark:border-neutral-800 flex flex-row items-center justify-between">
          <div className="space-y-1">
            <DialogTitle className="text-xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">
              {editingOrder ? "Edit Order" : "Start New Order"}
            </DialogTitle>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-normal">
              Step 1 — capture customer & order details. Documents can be attached below.
            </p>
          </div>
          {isAdmin && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsManageFieldsOpen(true)}
              className="shrink-0 h-8 text-[11px] font-semibold gap-1.5 rounded-lg border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all"
              title="Admins can configure which fields are required before submission"
            >
              <Settings className="size-3" />
              Field Requirements
            </Button>
          )}
        </DialogHeader>

        {/* ========================================================
            MODAL SCROLLABLE BODY
            ======================================================== */}
        <form
          onSubmit={handleSubmit}
          className="overflow-y-auto max-h-[calc(92vh-140px)] px-6 py-6 space-y-6 scrollbar-thin text-neutral-800 dark:text-neutral-200"
        >
          {/* ======================================================
              ROW 1: CUSTOMER / COMPANY NAME & DVEPL REF CODE
              ====================================================== */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Customer / Company Combobox */}
            <div className="lg:col-span-8 space-y-1 relative" ref={customerDropdownRef}>
              <label className="text-[11px] font-bold tracking-wider text-neutral-700 dark:text-neutral-300 uppercase block">
                {fieldConfig.companyName && <span className="text-red-500 font-bold">*</span>} CUSTOMER / COMPANY NAME
              </label>
              <div className="relative">
                <Input
                  value={customerSearchQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomerSearchQuery(val);
                    setCompanyName(val);
                    setIsCustomerDropdownOpen(true);
                    if (!val) {
                      setSelectedCustomerId(null);
                    }
                  }}
                  onFocus={() => setIsCustomerDropdownOpen(true)}
                  placeholder="Search existing customer or enter company name..."
                  className={`h-10 text-xs rounded-lg transition-all pr-8 ${
                    selectedCustomerId
                      ? "border-emerald-600 ring-1 ring-emerald-600 font-medium"
                      : "border-neutral-300 dark:border-neutral-700 focus:border-emerald-600 focus:ring-emerald-500"
                  } ${shakeCls("companyName")}`}
                />
                {selectedCustomerId ? (
                  <button
                    type="button"
                    onClick={handleClearCustomer}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                    title="Clear selected customer"
                  >
                    <X className="size-4" />
                  </button>
                ) : (
                  <Search className="size-4 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                )}
              </div>

              {/* Autocomplete Dropdown Menu */}
              {isCustomerDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-3 text-xs text-neutral-500 text-center">
                      No matching customers found.
                    </div>
                  ) : (
                    filteredCustomers.map((cust) => {
                      const isSelected = selectedCustomerId === cust.id;
                      const contact = cust.contacts?.[0];
                      return (
                        <div
                          key={cust.id}
                          onClick={() => handleSelectCustomer(cust)}
                          className={`p-2.5 text-xs hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 cursor-pointer flex items-center justify-between transition-colors ${
                            isSelected ? "bg-emerald-50 dark:bg-emerald-950/50" : ""
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-neutral-800 dark:text-neutral-100 truncate">
                              {cust.firmName || cust.name}
                            </p>
                            {contact && (
                              <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                                {contact.name || "Contact"}
                                {contact.phone ? ` · ${contact.phone}` : ""}
                                {contact.email ? ` · ${contact.email}` : ""}
                              </p>
                            )}
                          </div>
                          {isSelected && (
                            <Check className="size-4 text-emerald-600 shrink-0 ml-2" />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* DVEPL Ref Code */}
            <div className="lg:col-span-4 space-y-1">
              <label className="text-[11px] font-bold tracking-wider text-neutral-700 dark:text-neutral-300 uppercase block">
                {fieldConfig.dveplCode && <span className="text-red-500 font-bold">*</span>} DVEPL REF CODE
              </label>
              <Input
                value={dveplCode}
                onChange={(e) => setDveplCode(e.target.value)}
                placeholder="e.g. SO-2026-0001"
                className={`h-10 text-xs rounded-lg border-neutral-300 dark:border-neutral-700 focus:border-emerald-600 focus:ring-emerald-500 ${shakeCls("dveplCode")}`}
              />
            </div>
          </div>

          {/* ======================================================
              ROW 2: CONTACT PERSON, MOBILE NO, EMAIL ID
              ====================================================== */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold tracking-wider text-neutral-700 dark:text-neutral-300 uppercase block">
                {fieldConfig.contactPerson && <span className="text-red-500 font-bold">*</span>} CONTACT PERSON
              </label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Contact person name"
                className={`h-10 text-xs rounded-lg border-neutral-300 dark:border-neutral-700 focus:border-emerald-600 focus:ring-emerald-500 ${shakeCls("contactPerson")}`}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold tracking-wider text-neutral-700 dark:text-neutral-300 uppercase block">
                {fieldConfig.mobileNo && <span className="text-red-500 font-bold">*</span>} MOBILE NO
              </label>
              <Input
                value={mobileNo}
                onChange={(e) => setMobileNo(e.target.value)}
                placeholder="Mobile number"
                className={`h-10 text-xs rounded-lg border-neutral-300 dark:border-neutral-700 focus:border-emerald-600 focus:ring-emerald-500 ${shakeCls("mobileNo")}`}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold tracking-wider text-neutral-700 dark:text-neutral-300 uppercase block">
                {fieldConfig.emailId && <span className="text-red-500 font-bold">*</span>} EMAIL ID
              </label>
              <Input
                type="email"
                value={emailId}
                onChange={(e) => setEmailId(e.target.value)}
                placeholder="Email address"
                className={`h-10 text-xs rounded-lg border-neutral-300 dark:border-neutral-700 focus:border-emerald-600 focus:ring-emerald-500 ${shakeCls("emailId")}`}
              />
            </div>
          </div>

          {/* ======================================================
              ROW 3: BILLING ADDRESS
              ====================================================== */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold tracking-wider text-neutral-700 dark:text-neutral-300 uppercase block">
              {fieldConfig.billingAddress && <span className="text-red-500 font-bold">*</span>} BILLING ADDRESS
            </label>
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 bg-neutral-50/50 dark:bg-neutral-900/30">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-neutral-600 dark:text-neutral-400">
                  {billingAddress && !isBillingChanged
                    ? `Inherited: ${billingAddress}`
                    : "Inherited from the selected customer — nothing to fill in unless it's changed"}
                </span>
                <button
                  type="button"
                  onClick={() => setIsBillingChanged(!isBillingChanged)}
                  className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 font-semibold text-xs hover:underline cursor-pointer shrink-0"
                >
                  {isBillingChanged
                    ? "Hide Billing Address"
                    : "Any change in Billing Address?"}
                </button>
              </div>

              {isBillingChanged && (
                <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
                  <Textarea
                    value={billingAddress}
                    onChange={(e) => setBillingAddress(e.target.value)}
                    placeholder="Enter updated billing address..."
                    rows={2}
                    className={`text-xs rounded-lg border-neutral-300 dark:border-neutral-700 ${shakeCls("billingAddress")}`}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ======================================================
              ROW 4: SHIPPING ADDRESS
              ====================================================== */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold tracking-wider text-neutral-700 dark:text-neutral-300 uppercase block">
              {fieldConfig.shippingAddress && <span className="text-red-500 font-bold">*</span>} SHIPPING ADDRESS
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              <Checkbox
                checked={sameAsBilling}
                onCheckedChange={(val) => setSameAsBilling(Boolean(val))}
              />
              <span>Same as Billing Address</span>
            </label>

            {!sameAsBilling && (
              <div className="pt-1">
                <Textarea
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="Enter specific shipping / site delivery address..."
                  rows={2}
                  className={`text-xs rounded-lg border-neutral-300 dark:border-neutral-700 ${shakeCls("shippingAddress")}`}
                />
              </div>
            )}
          </div>

          {/* ======================================================
              ROW 5: DATE OF ORDER, DATE OF COMMITMENT, CUSTOMER PO NO
              ====================================================== */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Date of Order */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold tracking-wider text-neutral-700 dark:text-neutral-300 uppercase block">
                {fieldConfig.orderDate && <span className="text-red-500 font-bold">*</span>} DATE OF ORDER
              </label>
              <div className="relative">
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className={`h-10 text-xs rounded-lg border-neutral-300 dark:border-neutral-700 ${shakeCls("orderDate")}`}
                />
              </div>
            </div>

            {/* Date of Commitment with Toggle */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-bold tracking-wider text-neutral-700 dark:text-neutral-300 uppercase">
                  {fieldConfig.commitment && <span className="text-red-500 font-bold">*</span>} DATE OF COMMITMENT
                </label>
                <div className="inline-flex rounded-md p-0.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCommitmentType("fixed")}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-sm transition-all ${
                      commitmentType === "fixed"
                        ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xs"
                        : "text-neutral-400 dark:text-neutral-500 hover:text-neutral-600"
                    }`}
                  >
                    Fixed
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommitmentType("days")}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-sm transition-all ${
                      commitmentType === "days"
                        ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xs"
                        : "text-neutral-400 dark:text-neutral-500 hover:text-neutral-600"
                    }`}
                  >
                    Days
                  </button>
                </div>
              </div>

              {commitmentType === "fixed" ? (
                <Input
                  type="date"
                  value={commitmentDate}
                  onChange={(e) => setCommitmentDate(e.target.value)}
                  className={`h-10 text-xs rounded-lg border-neutral-300 dark:border-neutral-700 ${shakeCls("commitment")}`}
                />
              ) : (
                <div className="space-y-1">
                  <Input
                    type="number"
                    min="1"
                    value={commitmentDays}
                    onChange={(e) => setCommitmentDays(e.target.value)}
                    placeholder="e.g. 30 (days from approval of drawing)"
                    className={`h-10 text-xs rounded-lg border-neutral-300 dark:border-neutral-700 ${shakeCls("commitment")}`}
                  />
                  {calculatedCommitmentDate && (
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                      Target Delivery Date: {formatDateDisplay(calculatedCommitmentDate)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Customer PO No */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold tracking-wider text-neutral-700 dark:text-neutral-300 uppercase block">
                {fieldConfig.customerPoNo && <span className="text-red-500 font-bold">*</span>} CUSTOMER PO NO
              </label>
              <Input
                value={customerPoNo}
                onChange={(e) => setCustomerPoNo(e.target.value)}
                placeholder="e.g. CWEAFJ-48/2025"
                className={`h-10 text-xs rounded-lg border-neutral-300 dark:border-neutral-700 ${shakeCls("customerPoNo")}`}
              />
            </div>
          </div>

          {/* ======================================================
              ROW 6: TOTAL PANELS/UNITS, ADVANCE, PROJECT REFERENCE
              ====================================================== */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold tracking-wider text-neutral-700 dark:text-neutral-300 uppercase block">
                {fieldConfig.totalPanels && <span className="text-red-500 font-bold">*</span>} TOTAL PANELS / UNITS
              </label>
              <Input
                value={totalPanels}
                onChange={(e) => setTotalPanels(e.target.value)}
                placeholder="No. of physical panels in this job (not item qty) — enables units-clear"
                className={`h-10 text-xs rounded-lg border-neutral-300 dark:border-neutral-700 ${shakeCls("totalPanels")}`}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold tracking-wider text-neutral-700 dark:text-neutral-300 uppercase block">
                {fieldConfig.advance && <span className="text-red-500 font-bold">*</span>} ADVANCE
              </label>
              <Input
                value={advance}
                onChange={(e) => setAdvance(e.target.value)}
                placeholder="e.g. 20% or ₹50,000"
                className={`h-10 text-xs rounded-lg border-neutral-300 dark:border-neutral-700 ${shakeCls("advance")}`}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold tracking-wider text-neutral-700 dark:text-neutral-300 uppercase block">
                {fieldConfig.projectReference && <span className="text-red-500 font-bold">*</span>} PROJECT REFERENCE
              </label>
              <Input
                value={projectReference}
                onChange={(e) => setProjectReference(e.target.value)}
                placeholder="e.g. MES-AF-UDHAMPUR"
                className={`h-10 text-xs rounded-lg border-neutral-300 dark:border-neutral-700 ${shakeCls("projectReference")}`}
              />
            </div>
          </div>

          {/* ======================================================
              ROW 7: ORDER TAKEN BY / CONCERNED PERSON
              ====================================================== */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold tracking-wider text-neutral-700 dark:text-neutral-300 uppercase block">
              {fieldConfig.orderTakenBy && <span className="text-red-500 font-bold">*</span>} ORDER TAKEN BY / CONCERNED PERSON
            </label>
            <div className={`rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 max-h-44 overflow-y-auto space-y-1 ${shakeCls("orderTakenBy")}`}>
              {teamMembers.length === 0 ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 px-1 py-1">
                  No team members available
                </p>
              ) : (
                teamMembers.map((member) => {
                  const checked = orderTakenByUserIds.includes(member.id);
                  return (
                    <label
                      key={member.id}
                      className={`flex items-start gap-2 cursor-pointer rounded-md px-2 py-1.5 text-xs transition-colors ${
                        checked
                          ? "bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-200 dark:ring-blue-900"
                          : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                      }`}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={checked}
                        onCheckedChange={(val) =>
                          toggleOrderTakenByUser(member.id, Boolean(val))
                        }
                      />
                      <span className="font-medium text-neutral-800 dark:text-neutral-200">
                        {member.name}
                        {member.email ? (
                          <span className="block text-[10px] font-normal text-neutral-500 dark:text-neutral-400">
                            {member.email}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            {selectedOrderTakenByLabel ? (
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-normal leading-relaxed">
                Selected: {selectedOrderTakenByLabel}
              </p>
            ) : (
              <p className="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal leading-relaxed">
                Select one or more team members who will handle this order.
              </p>
            )}
          </div>

          {/* ======================================================
              SECTION: * JOB RESPONSIBILITY — WHO HANDLES EACH STAGE
              ====================================================== */}
          <div className="space-y-2 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[11px] font-bold tracking-wider text-neutral-800 dark:text-neutral-200 uppercase">
                    {requiredStageNames.length > 0 && <span className="text-red-500 font-bold">*</span>} JOB RESPONSIBILITY — WHO HANDLES EACH STAGE
                  </h3>
                  {requiredStageNames.length > 0 && (
                    <span className="text-[10px] bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-semibold px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800/60">
                      {requiredStageNames.length} required stage{requiredStageNames.length > 1 ? "s" : ""}
                    </span>
                  )}
                  {!isAdmin && (
                    <span className="text-[10px] bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 font-medium px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                      Admin Managed Only
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-normal leading-relaxed mt-0.5">
                  {isAdmin
                    ? "Pick who's responsible for each stage that varies per order. Stages with a Fixed Responsible Person (set on the Workflow Template) are auto-assigned and not asked here."
                    : "Stage responsibilities are managed and assigned exclusively by Administrators."}
                </p>
              </div>
              {isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsManageStagesOpen(true)}
                  className="shrink-0 h-7 text-[11px] font-semibold gap-1.5 rounded-lg border-blue-200 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all shadow-3xs"
                  title="Manage workflow stages / steps"
                >
                  <Settings className="size-3" />
                  Manage Stages
                </Button>
              )}
            </div>

            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-200 dark:divide-neutral-800 overflow-hidden bg-white dark:bg-neutral-900">
              {stageRows.map((stage) => {
                const assignedVal = stageAssignments[stage.key] || "__none__";
                const stageLabel = getStageAssigneeLabel(stage.key);
                return (
                  <div
                    key={stage.key}
                    className="p-3 flex items-center justify-between gap-4 text-xs hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {stageRequirements[stage.key] === true && (
                        <span className="text-red-500 font-bold">*</span>
                      )}
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                        {stage.name}
                      </span>
                      <span className="text-neutral-400">·</span>
                      <span className="text-neutral-500 font-medium">
                        {stage.department}
                      </span>
                    </div>

                    <div className="w-56 shrink-0">
                      <Select
                        value={assignedVal}
                        disabled={!isAdmin}
                        onValueChange={(val) =>
                          handleStageAssignmentChange(stage.key, val ?? "")
                        }
                      >
                        <SelectTrigger
                          className={`h-8 text-xs rounded-lg border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-normal ${
                            !isAdmin ? "cursor-not-allowed opacity-75 bg-neutral-100/70 dark:bg-neutral-900" : ""
                          } ${shakeCls(`stage:${stage.key}`)}`}
                        >
                          <SelectValue placeholder={isAdmin ? "Who's responsible?" : "Unassigned"}>
                            {stageLabel || undefined}
                          </SelectValue>
                        </SelectTrigger>
                        {isAdmin && (
                          <SelectContent>
                            <SelectItem value="__none__">
                              Who's responsible?
                            </SelectItem>
                            {teamMembers.map((member) => (
                              <SelectItem key={member.id} value={member.id}>
                                {member.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        )}
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ======================================================
              SECTION: PROJECT DOCUMENT UPLOAD (Matching Screenshot 3)
              ====================================================== */}
          <div className={`pt-2 ${shakeCls("docs")}`}>
            <ProjectDocumentUploadPanel
              attachments={orderAttachments}
              immediate={Boolean(editingOrder)}
              orderId={editingOrder?.id || null}
              disabled={isSubmitting}
              uploading={isSubmitting}
              isAdmin={isAdmin}
              onPendingChange={setPendingDocuments}
              onUploaded={() => {
                onSuccess();
                if (editingOrder?.id) {
                  apiClient.get(`/order/read/${editingOrder.id}`).then((res) => {
                    if (res.data?.data?.salesOrderAttachments) {
                      setOrderAttachments(res.data.data.salesOrderAttachments);
                    }
                  }).catch(() => {});
                }
              }}
              onDeleted={(attachmentId) => {
                setOrderAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
                onSuccess();
              }}
              onMandatoryFulfilledChange={setAllMandatoryDocsUploaded}
              onOpenManageDocs={isAdmin ? () => setIsManageDocsOpen(true) : undefined}
            />
          </div>

          {/* Manage Document Types Modal for Admin */}
          {isAdmin && (
            <ManageOrderDocumentsModal
              open={isManageDocsOpen}
              onOpenChange={setIsManageDocsOpen}
              categories={getOrderDocumentCategories(store.settings)}
            />
          )}

          {/* Manage Form Field Requirements Modal for Admin */}
          {isAdmin && (
            <ManageOrderFieldsModal
              open={isManageFieldsOpen}
              onOpenChange={setIsManageFieldsOpen}
              fields={fieldConfig}
              stageRequirements={stageRequirements}
            />
          )}

          {/* Manage Workflow Stages Modal for Admin */}
          {isAdmin && (
            <ManageWorkflowStagesModal
              open={isManageStagesOpen}
              onOpenChange={setIsManageStagesOpen}
              onSaved={() => void loadStageRows()}
            />
          )}

          {/* ======================================================
              FOOTER ACTION: SAVE & PROCEED (Matching Screenshot 1-3)
              ====================================================== */}
          <div className="pt-6 pb-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-3">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="
                h-10
                px-8
                rounded-xl
                font-bold
                text-sm
                text-white
                bg-[#15803d]
                hover:bg-[#166534]
                dark:bg-emerald-600
                dark:hover:bg-emerald-700
                shadow-sm
                transition-all
                disabled:opacity-60
              "
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </span>
              ) : (
                "Save & Proceed"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default AddOrderModal;
