import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useERPStore } from "@/store/erpStore";
import { isAdminUser } from "@/utils/pagePermissions";
import {
  ChevronLeft,
  Pencil,
  Eye,
  Users,
  Plus,
  Trash2,
  Printer,
  Save,
  FileText,
  Loader2,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
  ArrowLeft,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/services/axios";
import { useWorkflowTemplate } from "@/hooks/useWorkflowTemplate";
import workflowApi from "@/services/workflowApi";

// Modals
import { CustomerMasterEditModal } from "./components/CustomerMasterEditModal";
import { ManageAccessModal } from "./components/ManageAccessModal";
import { FilePreviewModal } from "./components/FilePreviewModal";
import { DeliveryNoteModal } from "./components/DeliveryNoteModal";

// Types
import {
  PanelItem,
  SharedOrderFile,
  AccountSectionFile,
  CustomerMasterDetails,
  AccountCostingData,
} from "./types";

const DEFAULT_SHARED_FILES: SharedOrderFile[] = [];

const DEFAULT_CUSTOMER_DETAILS: CustomerMasterDetails = {
  companyName: "gk enterprises",
  contactPerson: "—",
  dveplRefCode: "123456",
  dateOfOrder: "2026-08-31",
  dateOfCommitment: "2026-10-15",
  projectRef: "1234",
  gstNumber: "—",
  billingAddress: "—",
  specialNotes: "—",
};

function createDefaultItem(): PanelItem {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    panelName: "",
    qty: 1,
    price: 0,
    total: 0,
  };
}

const DEFAULT_ITEMS: PanelItem[] = [createDefaultItem()];

function parseRemarksField(remarks: string | undefined | null, keyName: string): string {
  if (!remarks) return "";
  const lines = remarks.split("\n");
  for (const line of lines) {
    if (line.toLowerCase().startsWith(keyName.toLowerCase() + ":")) {
      return line.substring(keyName.length + 1).trim();
    }
  }
  return "";
}

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL ?? "";
function buildFileUrl(rawUrl?: string): string {
  if (!rawUrl) return "";
  if (/^https?:\/\//i.test(rawUrl) || rawUrl.startsWith("blob:")) return rawUrl;
  try {
    return new URL(rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`, API_BASE_URL || window.location.origin).toString();
  } catch {
    return rawUrl;
  }
}

export function AccountsPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedTargetIdRef = useRef<string | null>(null);

  // Orders list for dropdown selector
  const [orderList, setOrderList] = useState<Array<{ id: string; dveplCode?: string; partyName?: string; caNo?: string }>>([]);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [rawOrder, setRawOrder] = useState<any>(null);

  const store = useERPStore();
  const currentUser = useMemo(() => {
    return store.users.find((user) => user.id === store.currentUserId) as any;
  }, [store.users, store.currentUserId]);
  const currentUserId = store.currentUserId || currentUser?.id || null;
  const isAdmin = isAdminUser(currentUser);

  // Check if current user is authorized for the accounts part of this order
  const hasAccountsAccess = useMemo(() => {
    if (isAdmin) return true;
    if (!rawOrder) return true; // While order is still loading
    const assignments: any[] = rawOrder.assignments || [];
    return assignments.some(
      (a: any) =>
        a.userId === currentUserId &&
        (!a.stage ||
          a.stage === "ACCOUNTS_COSTING" ||
          String(a.stage).toUpperCase().includes("ACCOUNT"))
    );
  }, [isAdmin, rawOrder, currentUserId]);

  const currentOrderId = rawOrder?.id || id || "";
  const orderCode = rawOrder?.dveplCode || (id ? (id.startsWith("ORD-") ? id : id.startsWith("SO-") ? id : `ORD-2026-${id.padStart(5, "0")}`) : "ORD-2026-00265");
  const storageKey = `dvepl_accounts_costing_${currentOrderId || orderCode}`;

  const { stages: workflowStages } = useWorkflowTemplate();
  const [isSavingCosting, setIsSavingCosting] = useState(false);

  const currentWorkflowStage = rawOrder?.workflowStage || "ORDER_CONFIRMED";
  const accountsStageIndex = workflowStages.findIndex(
    (s) =>
      s.key === "ACCOUNTS_COSTING" ||
      s.key.toUpperCase().includes("ACCOUNT") ||
      s.name.toLowerCase().includes("account")
  );
  const effectiveAccountsIndex = accountsStageIndex !== -1 ? accountsStageIndex : 1;
  const accountsStage = workflowStages[effectiveAccountsIndex] || null;
  const nextStage = workflowStages[effectiveAccountsIndex + 1] || null;
  const currentStageIndex = workflowStages.findIndex((s) => s.key === currentWorkflowStage);
  const isCurrentlyAccountsOrEarlier =
    currentStageIndex <= effectiveAccountsIndex ||
    currentWorkflowStage === "ORDER_CONFIRMED" ||
    currentWorkflowStage === "ACCOUNTS_COSTING";

  // State
  const [customerDetails, setCustomerDetails] = useState<CustomerMasterDetails>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.customerDetails) return parsed.customerDetails;
      }
    } catch {}
    return DEFAULT_CUSTOMER_DETAILS;
  });

  const [sharedFiles, setSharedFiles] = useState<SharedOrderFile[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.sharedFiles) return parsed.sharedFiles;
      }
    } catch {}
    return DEFAULT_SHARED_FILES;
  });

  const [accountFiles, setAccountFiles] = useState<AccountSectionFile[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.accountFiles) return parsed.accountFiles;
      }
    } catch {}
    return [];
  });

  const [items, setItems] = useState<PanelItem[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.items && parsed.items.length > 0) return parsed.items;
      }
    } catch {}
    return DEFAULT_ITEMS;
  });

  const [taxPercent, setTaxPercent] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.taxPercent === "number") return parsed.taxPercent;
      }
    } catch {}
    return 18;
  });

  const [lessAdvance, setLessAdvance] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.lessAdvance === "number") return parsed.lessAdvance;
      }
    } catch {}
    return 0;
  });

  const [specialNote, setSpecialNote] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.specialNote === "string") return parsed.specialNote;
      }
    } catch {}
    return "";
  });

  // Modals state
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [selectedFileForAccess, setSelectedFileForAccess] = useState<SharedOrderFile | null>(null);
  const [previewFile, setPreviewFile] = useState<{
    name: string;
    uploader?: string;
    uploadTime?: string;
    size?: string;
    fileUrl?: string;
  } | null>(null);
  const [isDeliveryNoteOpen, setIsDeliveryNoteOpen] = useState(false);

  // Fetch available orders for dropdown
  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get("/order/read?page=1&limit=100");
        if (res.data?.success && Array.isArray(res.data?.data)) {
          const allOrders = res.data.data;
          if (isAdmin) {
            setOrderList(allOrders);
          } else {
            const accessible = allOrders.filter((o: any) =>
              (o.assignments || []).some(
                (a: any) =>
                  a.userId === currentUserId &&
                  (!a.stage ||
                    a.stage === "ACCOUNTS_COSTING" ||
                    String(a.stage).toUpperCase().includes("ACCOUNT"))
              )
            );
            setOrderList(accessible);
          }
        }
      } catch (err) {
        console.error("Failed to fetch order list for accounts selector:", err);
      }
    })();
  }, [isAdmin, currentUserId]);

  // Fetch target order details from backend
  const fetchOrderData = useCallback(async (targetId?: string) => {
    if (!targetId) return;
    setIsLoadingOrder(true);

    try {
      let orderData: any = null;

      // Try read by ID
      try {
        const res = await apiClient.get(`/order/read/${targetId}`);
        if (res.data?.success && res.data?.data) {
          orderData = res.data.data;
        }
      } catch {
        // Fallback: search in list
        const listRes = await apiClient.get("/order/read?page=1&limit=100");
        if (listRes.data?.success && Array.isArray(listRes.data?.data)) {
          orderData = listRes.data.data.find(
            (o: any) =>
              o.id === targetId ||
              o.dveplCode === targetId ||
              o.caNo === targetId
          );
        }
      }

      if (orderData) {
        setRawOrder(orderData);

        const currentKey = `dvepl_accounts_costing_${orderData.id}`;
        const fallbackKey = `dvepl_accounts_costing_${orderData.dveplCode}`;
        let savedCosting: any = null;
        try {
          const raw = localStorage.getItem(currentKey) || localStorage.getItem(fallbackKey);
          if (raw) savedCosting = JSON.parse(raw);
        } catch {}

        // Parse contact
        const contactParts = (orderData.contactDetails || "").split("|").map((s: string) => s.trim());
        const contactName = contactParts[0] || orderData.partyName || "—";

        // Parse remarks fields
        const projectRefFromRemarks = parseRemarksField(orderData.remarks, "Project Reference");
        const billingAddressFromRemarks = parseRemarksField(orderData.remarks, "Billing Address");
        const advanceFromRemarks = parseRemarksField(orderData.remarks, "Advance");

        const parsedAdvance = advanceFromRemarks
          ? parseFloat(advanceFromRemarks.replace(/[^\d.-]/g, "")) || 0
          : 0;

        const effectiveCustomerDetails: CustomerMasterDetails = {
          companyName: orderData.partyName || orderData.firm_name || "—",
          contactPerson: contactName,
          dveplRefCode: orderData.dveplCode || orderData.caNo || "—",
          dateOfOrder: orderData.poDate ? orderData.poDate.substring(0, 10) : (orderData.createdAt ? orderData.createdAt.substring(0, 10) : "—"),
          dateOfCommitment: orderData.deliveryMonthTarget ? orderData.deliveryMonthTarget.substring(0, 10) : "—",
          projectRef: projectRefFromRemarks || orderData.reference_code || "—",
          gstNumber: orderData.customer?.gstNumber || "—",
          billingAddress: billingAddressFromRemarks || orderData.customer?.billingAddress || "—",
          specialNotes: orderData.remarks || "—",
        };

        setCustomerDetails(savedCosting?.customerDetails || effectiveCustomerDetails);

        // Map shared attachments
        const attachments: any[] = orderData.salesOrderAttachments || orderData.attachments || [];
        const drawings: any[] = orderData.drawings || orderData.engineeringProjects?.flatMap((p: any) => p.drawings || []) || [];

        const mappedFiles: SharedOrderFile[] = [
          ...attachments.map((att) => {
            const now = att.createdAt ? new Date(att.createdAt) : new Date();
            const timeStr = `${now.getDate()} ${now.toLocaleString("default", { month: "short" })}, ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
            const sizeMb = att.fileSize ? `${(att.fileSize / (1024 * 1024)).toFixed(1)} MB` : "1.2 MB";
            return {
              id: att.id || `att-${Math.random()}`,
              name: att.fileName || "Document",
              uploader: att.uploader?.name || orderData.orderTakenBy?.name || "Order Creator",
              uploadTime: timeStr,
              location: att.category ? `Category: ${att.category}` : "stored in this Order's Documents",
              size: sizeMb,
              fileUrl: buildFileUrl(att.fileUrl),
              isBlocked: false,
              allowedRoles: ["admin", "accounts"],
            };
          }),
          ...drawings.map((dwg) => {
            const sizeMb = "2.5 MB";
            return {
              id: dwg.id || `dwg-${Math.random()}`,
              name: dwg.title || dwg.fileName || "Engineering Drawing",
              uploader: "Design Team",
              uploadTime: "Attached to Order",
              location: "Engineering Drawings",
              size: sizeMb,
              fileUrl: buildFileUrl(dwg.fileUrl),
              isBlocked: false,
              allowedRoles: ["admin", "accounts"],
            };
          }),
        ];

        setSharedFiles(savedCosting?.sharedFiles || mappedFiles);

        // Items mapping
        if (savedCosting?.items && savedCosting.items.length > 0) {
          setItems(savedCosting.items);
        } else if (orderData.items && orderData.items.length > 0) {
          setItems(
            orderData.items.map((it: any, idx: number) => {
              const qty = Number(it.quantity) || 1;
              const price = Number(it.unitPrice || it.rate) || 0;
              return {
                id: it.id || `item-${idx + 1}-${Math.random().toString(36).substring(2, 7)}`,
                panelName: it.description || it.itemCode || `Panel ${idx + 1}`,
                qty,
                price,
                total: qty * price,
              };
            })
          );
        } else {
          setItems([createDefaultItem()]);
        }

        if (typeof savedCosting?.taxPercent === "number") {
          setTaxPercent(savedCosting.taxPercent);
        } else {
          setTaxPercent(18);
        }

        if (typeof savedCosting?.lessAdvance === "number") {
          setLessAdvance(savedCosting.lessAdvance);
        } else if (parsedAdvance > 0) {
          setLessAdvance(parsedAdvance);
        } else {
          setLessAdvance(0);
        }

        if (typeof savedCosting?.specialNote === "string") {
          setSpecialNote(savedCosting.specialNote);
        } else {
          setSpecialNote("");
        }

        if (Array.isArray(savedCosting?.accountFiles)) {
          setAccountFiles(savedCosting.accountFiles);
        } else {
          setAccountFiles([]);
        }
      }
    } catch (err) {
      console.error("Error hydrating order for AccountsPage:", err);
    } finally {
      setIsLoadingOrder(false);
    }
  }, []);

  useEffect(() => {
    const targetId = id || (orderList.length > 0 ? orderList[0].id : null);
    if (!targetId) return;

    if (loadedTargetIdRef.current === targetId) return;
    loadedTargetIdRef.current = targetId;

    void fetchOrderData(targetId);
  }, [id, orderList, fetchOrderData]);

  // Calculations
  const calculatedValues = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const taxAmount = (subtotal * (Number(taxPercent) || 0)) / 100;
    const totalAmount = Math.max(0, subtotal + taxAmount - (Number(lessAdvance) || 0));
    return {
      subtotal,
      taxAmount,
      totalAmount,
    };
  }, [items, taxPercent, lessAdvance]);

  // Handlers for Items
  const handleItemChange = (
    itemId: string,
    field: "panelName" | "qty" | "price",
    value: any
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const updated = { ...item, [field]: value };
        if (field === "qty" || field === "price") {
          const qty = field === "qty" ? (value === "" ? 0 : Number(value) || 0) : Number(item.qty) || 0;
          const price = field === "price" ? (value === "" ? 0 : Number(value) || 0) : Number(item.price) || 0;
          updated.total = qty * price;
        }
        return updated;
      })
    );
  };

  const handleAddRow = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const newId = `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setItems((prev) => [
      ...prev,
      {
        id: newId,
        panelName: "",
        qty: 1,
        price: 0,
        total: 0,
      },
    ]);
  };

  const handleDeleteRow = (itemId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setItems((prev) => {
      const remaining = prev.filter((item) => item.id !== itemId);
      return remaining.length > 0 ? remaining : [createDefaultItem()];
    });
  };

  // Handlers for Account Section File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: AccountSectionFile[] = Array.from(files).map((file) => {
      const sizeInMb = (file.size / (1024 * 1024)).toFixed(1);
      const now = new Date();
      const timeStr = `${now.getDate()} ${now.toLocaleString("default", { month: "short" })}, ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

      return {
        id: `acc-file-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: file.name,
        size: `${sizeInMb} MB`,
        uploadTime: timeStr,
        file,
        fileUrl: URL.createObjectURL(file),
      };
    });

    setAccountFiles((prev) => [...prev, ...newFiles]);
    toast.success(`${files.length} file(s) added successfully`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteAccountFile = (fileId: string) => {
    setAccountFiles((prev) => prev.filter((f) => f.id !== fileId));
    toast.success("File removed");
  };

  // Save Costing Handler
  const handleSaveCosting = async (advanceWorkflow: boolean = true) => {
    setIsSavingCosting(true);
    const payload: AccountCostingData = {
      orderId: currentOrderId || "ORD-2026-00265",
      orderCode,
      customerDetails,
      sharedFiles,
      accountFiles,
      items,
      taxPercent,
      lessAdvance,
      specialNote,
      lastSavedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(`dvepl_accounts_costing_${currentOrderId || orderCode}`, JSON.stringify(payload));
      if (orderCode) {
        localStorage.setItem(`dvepl_accounts_costing_${orderCode}`, JSON.stringify(payload));
      }

      if (advanceWorkflow && currentOrderId && nextStage) {
        try {
          await workflowApi.updateOrderWorkflowStage(currentOrderId, nextStage.key, {
            description: "Accounts & Costing details completed and saved.",
          });
          toast.success(
            `Costing saved! Order advanced to Step ${effectiveAccountsIndex + 2}: "${nextStage.name}".`
          );
          setRawOrder((prev: any) =>
            prev ? { ...prev, workflowStage: nextStage.key } : prev
          );
          setTimeout(() => {
            navigate(`/orders/${currentOrderId}?tab=workflow`);
          }, 1000);
        } catch (stageErr: any) {
          console.error("Workflow advancement error:", stageErr);
          toast.success("Costing details saved successfully!");
        }
      } else {
        toast.success("Costing & account details saved successfully!");
      }
    } catch {
      toast.error("Failed to save costing locally.");
    } finally {
      setIsSavingCosting(false);
    }
  };

  // Manage Access update handler
  const handleUpdateAccess = (fileId: string, isBlocked: boolean, allowedRoles: string[]) => {
    setSharedFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, isBlocked, allowedRoles } : f))
    );
    toast.success(`Access updated for file.`);
  };

  const costingData: AccountCostingData = {
    orderId: currentOrderId || "ORD-2026-00265",
    orderCode,
    customerDetails,
    sharedFiles,
    accountFiles,
    items,
    taxPercent,
    lessAdvance,
    specialNote,
  };
  if (isLoadingOrder) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          Loading Accounts & Costing sheet...
        </div>
      </div>
    );
  }

  if (!hasAccountsAccess && rawOrder) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
        <div className="size-16 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4 border border-amber-500/20 shadow-xs">
          <ShieldAlert className="size-8" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Access Restricted</h2>
        <p className="text-sm text-muted-foreground max-w-md mt-2 leading-relaxed">
          The Accounts & Costing section for order{" "}
          <span className="font-semibold text-foreground">
            {rawOrder.dveplCode || rawOrder.caNo || rawOrder.id}
          </span>{" "}
          is restricted. Only assigned accounts personnel and administrators can access this part.
        </p>
        <div className="flex items-center gap-3 mt-6">
          <Button
            variant="outline"
            onClick={() => navigate(`/orders/${rawOrder.id}`)}
            className="rounded-xl gap-2 text-xs font-semibold"
          >
            <ArrowLeft className="size-3.5" />
            Back to Order Details
          </Button>
          <Button
            variant="default"
            onClick={() => navigate("/tender/orders")}
            className="rounded-xl text-xs font-bold"
          >
            All Orders
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-16 font-sans">
      {/* Main Page Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Navigation & Header Section */}
        <div>
          {/* Back to Order Link */}
          <button
            type="button"
            onClick={() => {
              if (currentOrderId) {
                navigate(`/orders/${currentOrderId}`);
              } else {
                navigate("/tender/orders");
              }
            }}
            className="inline-flex items-center gap-1 text-xs md:text-sm font-semibold text-foreground hover:text-primary transition-colors mb-2 group cursor-pointer"
          >
            <ChevronLeft className="size-4 group-hover:-translate-x-0.5 transition-transform text-foreground" />
            <span>Back to order</span>
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              {/* Order Code */}
              <div className="flex items-center gap-2">
                <span className="text-sm md:text-base font-bold font-mono tracking-wider text-primary uppercase">
                  {orderCode}
                </span>
                {isLoadingOrder && (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Account Section Heading & Subtitle */}
              <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mt-0.5">
                Account Section
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 font-normal">
                Costing & quotation sheet — for the customer, separate from internal purchase orders.
              </p>
            </div>

            {/* Switch Order Dropdown */}
            {orderList.length > 0 && (
              <div className="flex items-center gap-2 shrink-0 bg-card border border-border/80 rounded-xl p-1.5 shadow-2xs">
                <span className="text-xs font-semibold text-muted-foreground pl-2 whitespace-nowrap">
                  Order:
                </span>
                <Select
                  value={currentOrderId || id || ""}
                  onValueChange={(val) => {
                    if (val) navigate(`/accounts/${val}`);
                  }}
                >
                  <SelectTrigger className="h-8 w-[200px] sm:w-[240px] rounded-lg text-xs font-medium border-border/60 bg-background">
                    <SelectValue placeholder="Select an order..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {orderList.map((ord) => (
                      <SelectItem key={ord.id} value={ord.id} className="text-xs">
                        <span className="font-mono font-bold text-primary mr-1.5">
                          {ord.dveplCode || ord.caNo || ord.id.slice(0, 8)}
                        </span>
                        <span className="text-muted-foreground truncate">
                          {ord.partyName ? `(${ord.partyName})` : ""}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fetchOrderData(currentOrderId || id)}
                  title="Refresh order data"
                  className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Step 2 Workflow Banner */}
        {rawOrder && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-sky-500/10 border border-sky-500/20 rounded-xl p-3 sm:px-4 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 font-bold text-xs">
                2
              </div>
              <div>
                <p className="text-xs font-bold text-foreground flex items-center gap-2">
                  <span>Workflow Step 2: Accounts & Costing</span>
                  {isCurrentlyAccountsOrEarlier ? (
                    <span className="text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20">
                      In Progress
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="size-3" /> Completed
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Fill in the customer costing & pricing details. Saving will automatically advance this order to{" "}
                  <strong className="text-foreground">{nextStage ? nextStage.name : "the next workflow step"}</strong>.
                </p>
              </div>
            </div>

            {nextStage && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 font-medium">
                <span>Next Stage:</span>
                <span className="font-semibold text-foreground bg-background px-2.5 py-1 rounded-lg border border-border">
                  {nextStage.name}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Card 1: Order Metadata Summary Grid */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-xs">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-4 gap-x-6">
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Company Name</p>
              <p className="text-xs font-semibold text-card-foreground line-clamp-1">
                {customerDetails.companyName || "—"}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Contact Person</p>
              <p className="text-xs font-medium text-card-foreground">
                {customerDetails.contactPerson || "—"}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">DVEPL Ref Code</p>
              <p className="text-xs font-mono font-bold text-card-foreground">
                {customerDetails.dveplRefCode || "—"}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Date of Order</p>
              <p className="text-xs font-medium text-card-foreground">
                {customerDetails.dateOfOrder || "—"}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Date of Commitment</p>
              <p className="text-xs font-medium text-card-foreground">
                {customerDetails.dateOfCommitment || "—"}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Project Ref</p>
              <p className="text-xs font-mono font-bold text-card-foreground">
                {customerDetails.projectRef || "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Company Details (Customer Master) */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm md:text-base font-semibold text-card-foreground">
              Company Details (Customer Master)
            </h2>
            <button
              type="button"
              onClick={() => setIsCustomerModalOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 hover:bg-primary/10 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            >
              <Pencil className="size-3.5" />
              <span>Edit</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">GST Number</p>
              <p className="text-xs font-medium text-card-foreground">
                {customerDetails.gstNumber || "—"}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Billing Address</p>
              <p className="text-xs font-medium text-card-foreground whitespace-pre-line">
                {customerDetails.billingAddress || "—"}
              </p>
            </div>

            <div className="md:col-span-2 pt-1">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Special Notes (Customer Master)</p>
              <p className="text-xs font-medium text-card-foreground">
                {customerDetails.specialNotes || "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Files from New Order / Other Tabs */}
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Files from New Order / Other Tabs — view only, admin decides who can open each file
          </h3>

          <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden shadow-xs">
            {sharedFiles.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground text-center">
                No files uploaded during order creation or attached from other tabs yet.
              </div>
            ) : (
              sharedFiles.map((file) => (
                <div
                  key={file.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/40 transition-colors"
                >
                  {/* Left Side: Icon, Name, Metadata */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Eye className="size-4 text-primary shrink-0" />
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setPreviewFile(file)}
                        className="text-xs sm:text-sm font-semibold text-primary hover:underline text-left cursor-pointer"
                      >
                        {file.name}
                      </button>
                      <span className="text-xs text-muted-foreground font-normal">
                        · uploaded by {file.uploader} · {file.uploadTime} · {file.location}
                      </span>
                    </div>
                  </div>

                  {/* Right Side: Manage Access Button */}
                  <div className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedFileForAccess(file)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-lg hover:bg-rose-500/20 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Users className="size-3.5" />
                      <span>Manage Access {file.isBlocked ? "(Blocked)" : "(Allowed)"}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Section 4: Files Added On This Account Section */}
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Files Added On This Account Section — view, upload or delete freely
          </h3>

          <div className="bg-card border border-border rounded-xl p-5 shadow-xs">
            {accountFiles.length === 0 ? (
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  No files added on this sheet yet.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>Add More Files</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                  {accountFiles.map((file) => (
                    <div
                      key={file.id}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="size-4 text-primary shrink-0" />
                        <button
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          className="text-xs font-semibold text-primary hover:underline truncate"
                        >
                          {file.name}
                        </button>
                        <span className="text-[11px] text-muted-foreground">
                          ({file.size} · {file.uploadTime})
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-muted"
                          title="Preview"
                        >
                          <Eye className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAccountFile(file.id)}
                          className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/10"
                          title="Delete file"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    <span>Add More Files</span>
                  </button>
                </div>
              </div>
            )}

            {/* Hidden native file picker */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
              className="hidden"
            />
          </div>
          <p className="text-[11px] text-muted-foreground/80 mt-1.5">
            Max file size: 50 MB per file.
          </p>
        </div>

        {/* Section 5: Details As per Project (Table) */}
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Details As per Project
          </h3>

          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <th className="py-3 px-3 w-12 text-center border-r border-border">#</th>
                    <th className="py-3 px-4 border-r border-border">Panel Name</th>
                    <th className="py-3 px-3 w-28 text-center border-r border-border">Qty</th>
                    <th className="py-3 px-3 w-36 text-center border-r border-border">Price</th>
                    <th className="py-3 px-4 w-36 text-center border-r border-border sm:border-r-0">Total</th>
                    <th className="py-3 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item, index) => (
                    <tr key={item.id} className="hover:bg-muted/30 group">
                      {/* # Number */}
                      <td className="py-2.5 px-3 text-center border-r border-border text-xs text-muted-foreground font-medium">
                        {index + 1}
                      </td>

                      {/* Panel Name */}
                      <td className="py-1 px-3 border-r border-border">
                        <input
                          type="text"
                          value={item.panelName || ""}
                          onChange={(e) => handleItemChange(item.id, "panelName", e.target.value)}
                          placeholder="S.No or Name of Panel"
                          className="w-full py-1.5 text-xs text-foreground placeholder:text-muted-foreground bg-transparent border-0 focus:outline-hidden focus:ring-0"
                        />
                      </td>

                      {/* Qty */}
                      <td className="py-1 px-2 border-r border-border">
                        <input
                          type="number"
                          min="0"
                          value={item.qty === 0 ? "0" : item.qty || ""}
                          onChange={(e) => handleItemChange(item.id, "qty", e.target.value)}
                          className="w-full py-1.5 text-xs text-center text-foreground bg-transparent border-0 focus:outline-hidden focus:ring-0"
                        />
                      </td>

                      {/* Price */}
                      <td className="py-1 px-2 border-r border-border">
                        <input
                          type="number"
                          min="0"
                          value={item.price === 0 ? "0" : item.price || ""}
                          onChange={(e) => handleItemChange(item.id, "price", e.target.value)}
                          className="w-full py-1.5 text-xs text-center text-foreground bg-transparent border-0 focus:outline-hidden focus:ring-0 font-mono"
                        />
                      </td>

                      {/* Total */}
                      <td className="py-2.5 px-4 text-center border-r border-border sm:border-r-0 text-xs text-foreground font-mono font-semibold">
                        {Number(item.total || 0).toLocaleString("en-IN")}
                      </td>

                      {/* Action Delete */}
                      <td className="py-1 px-2 text-center">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteRow(item.id, e)}
                          className="text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-1 cursor-pointer"
                          title="Remove row"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add Row Button */}
          <button
            type="button"
            onClick={(e) => handleAddRow(e)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors mt-2 cursor-pointer"
          >
            <Plus className="size-3.5" />
            <span>Add row</span>
          </button>
        </div>

        {/* Calculations / Summary Card (Right aligned below Table) */}
        <div className="flex justify-end">
          <div className="w-full sm:w-80 bg-card border border-border rounded-xl overflow-hidden shadow-xs">
            {/* Value (Subtotal) */}
            <div className="flex items-center justify-between border-b border-border">
              <div className="py-2.5 px-4 text-xs font-medium text-muted-foreground border-r border-border flex-1 bg-muted/20">
                Value
              </div>
              <div className="py-2.5 px-4 text-xs font-bold text-card-foreground w-32 text-right font-mono">
                {calculatedValues.subtotal.toLocaleString("en-IN")}
              </div>
            </div>

            {/* Tax % */}
            <div className="flex items-center justify-between border-b border-border">
              <div className="py-2 px-4 text-xs font-medium text-muted-foreground border-r border-border flex-1 flex items-center justify-between bg-muted/20">
                <span>Tax %</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(Number(e.target.value) || 0)}
                  className="w-12 py-0.5 px-1 text-xs text-center border border-input rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-hidden"
                />
              </div>
              <div className="py-2.5 px-4 text-xs font-bold text-card-foreground w-32 text-right font-mono">
                {calculatedValues.taxAmount.toLocaleString("en-IN")}
              </div>
            </div>

            {/* Less Advance */}
            <div className="flex items-center justify-between border-b border-border">
              <div className="py-2 px-4 text-xs font-medium text-muted-foreground border-r border-border flex-1 bg-muted/20">
                Less Advance
              </div>
              <div className="py-2 px-4 text-xs font-bold text-card-foreground w-32 text-right flex items-center justify-end gap-1">
                <span className="text-muted-foreground">+</span>
                <input
                  type="number"
                  min="0"
                  value={lessAdvance}
                  onChange={(e) => setLessAdvance(Number(e.target.value) || 0)}
                  className="w-20 py-0.5 px-1 text-xs text-right border border-input rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-hidden font-mono"
                />
              </div>
            </div>

            {/* Total Amount */}
            <div className="flex items-center justify-between bg-primary/10">
              <div className="py-3 px-4 text-xs font-bold text-card-foreground border-r border-border flex-1">
                Total Amount
              </div>
              <div className="py-3 px-4 text-sm font-extrabold text-primary w-32 text-right font-mono">
                {calculatedValues.totalAmount.toLocaleString("en-IN")}
              </div>
            </div>
          </div>
        </div>

        {/* Section 6: Special Note */}
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Special Note (visible on this Account Section)
          </h3>
          <Textarea
            value={specialNote}
            onChange={(e) => setSpecialNote(e.target.value)}
            placeholder="Any special instruction, discount note, or remark for this order's costing..."
            rows={3}
            className="w-full bg-card border border-border rounded-xl p-3 text-xs text-card-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:border-primary shadow-xs"
          />
        </div>

        {/* Bottom Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          {/* Delivery Note Button */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsDeliveryNoteOpen(true)}
            className="h-9 px-4 text-xs font-semibold border-sky-500 text-sky-500 hover:bg-sky-500/10 bg-card rounded-xl gap-2 shadow-xs cursor-pointer"
          >
            <Printer className="size-4" />
            <span>Delivery Note</span>
          </Button>

          {/* Save Draft Button */}
          <Button
            type="button"
            variant="outline"
            disabled={isSavingCosting}
            onClick={() => handleSaveCosting(false)}
            className="h-9 px-4 text-xs font-semibold rounded-xl gap-2 shadow-xs cursor-pointer"
          >
            <Save className="size-4" />
            <span>Save Draft</span>
          </Button>

          {/* Save & Advance to Next Step Button */}
          <Button
            type="button"
            disabled={isSavingCosting}
            onClick={() => handleSaveCosting(true)}
            className="h-9 px-5 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl gap-2 shadow-xs transition-all cursor-pointer"
          >
            {isSavingCosting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            <span>
              {nextStage
                ? `Save & Move to ${nextStage.name}`
                : "Save Costing"}
            </span>
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </main>

      {/* Modals */}
      <CustomerMasterEditModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        initialData={customerDetails}
        onSave={(data) => {
          setCustomerDetails(data);
          toast.success("Customer master details updated");
        }}
      />

      <ManageAccessModal
        isOpen={Boolean(selectedFileForAccess)}
        onClose={() => setSelectedFileForAccess(null)}
        file={selectedFileForAccess}
        onUpdateAccess={handleUpdateAccess}
      />

      <FilePreviewModal
        isOpen={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        file={previewFile}
      />

      <DeliveryNoteModal
        isOpen={isDeliveryNoteOpen}
        onClose={() => setIsDeliveryNoteOpen(false)}
        data={costingData}
        calculatedValues={calculatedValues}
      />
    </div>
  );
}

export default AccountsPage;
