import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  Search,
  Plus,
  Trash2,
  Eye,
  FileText,
  X,
  Package,
  GripVertical,
  RefreshCw,
  SlidersHorizontal,
  Edit,
  MoreVertical,
  FileDown,
  Mail,
  FileSpreadsheet,
  Printer,
  History,
  ArrowLeft,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
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
import { GenericTable, sortableHeader } from "@/components/tables/genericTable";
import { canPerformPageAction } from "@/utils/pagePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "react-hot-toast";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { tenderApi, inventoryApi, securityApi, salesOrderApi } from "@/services/modules";
import { apiClient } from "@/services/axios";
import { useERPStore } from "@/store/erpStore";
import dynamicApi from "@/services/dynamicApi";
import { DynamicField, DynamicRecord } from "@/types/dynamic";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirmDialog";
import "@/styles/vendors.css";

function getRecordValue(
  recordValues: Record<string, any> | string | null | undefined,
  field: { fieldName: string; label: string } | undefined,
): any {
  if (!field) return undefined;
  let saved: Record<string, any> = {};
  if (typeof recordValues === "string") {
    try { saved = JSON.parse(recordValues); } catch { saved = {}; }
  } else if (recordValues && typeof recordValues === "object") {
    saved = recordValues;
  }
  if (field.fieldName && Object.prototype.hasOwnProperty.call(saved, field.fieldName)) return saved[field.fieldName];
  if (field.label && Object.prototype.hasOwnProperty.call(saved, field.label)) return saved[field.label];
  const normalizeKey = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedFieldName = normalizeKey(field.fieldName);
  const normalizedLabel = normalizeKey(field.label);
  const matchingEntry = Object.entries(saved).find(([key]) => {
    const nk = normalizeKey(key);
    return nk === normalizedFieldName || nk === normalizedLabel;
  });
  return matchingEntry?.[1];
}

function SortableHeaderCell({ id, children, className, width }: { id: string; children: React.ReactNode; className?: string; width?: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : undefined,
    width,
    minWidth: width,
  };
  return (
    <th ref={setNodeRef} style={style} className={className}>
      <div className="flex items-center gap-2">
        <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/50 hover:text-muted-foreground shrink-0">
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <span>{children}</span>
      </div>
    </th>
  );
}

interface Vendor {
  id: string;
  name: string;
  category: string;
  contactPerson: string;
  phone: string;
  email: string;
  gstNumber: string;
  address: string;
  notes: string;
  createdAt: string;
}

interface InventoryMaterial {
  id: string;
  materialCode: string;
  name: string;
  category: string;
  hsnCode: string;
  gst: string;
  unit: string;
  type: string;
}

interface InventoryItem {
  id: string;
  materialId: string;
  quantity: string;
  unitPrice: string;
  location: string | null;
  material: InventoryMaterial;
}

interface POItem {
  id: string;
  materialId?: string;
  inventoryId?: string;
  description: string;
  qty: number | "";
  unit: string;
  hsnCode: string;
  catNo: string;
  rate: number;
  discountPercent: number;
  net: number;
  total: number;
  [key: string]: any;
}

interface PORevision {
  id: string;
  vendorId: string;
  poNumber: string;
  poDate: string;
  poStatus: string;
  paymentTerms: string;
  materialStatus: string;
  advance: number;
  remarks: string;
  cgstPercent: number;
  sgstPercent: number;
  igstPercent: number;
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  grandTotal: number;
  termsAndConditions: string;
  lineItems: POItem[];
  companyDetails: {
    name: string;
    address: string;
    phone: string;
    email: string;
    gstin: string;
    iso: string;
    signatory: string;
    division: string;
  };
  createdAt: string;
  createdBy: string;
  revisionNo: number;
  customColumns?: string[];
  referenceCode?: string;
}

const apiService = {
  vendors: {
    list: async (): Promise<Vendor[]> => {
      return tenderApi.vendors.list() as unknown as Vendor[];
    },
  },
  revisions: {
    list: async (): Promise<PORevision[]> => {
      const response = await apiClient.get("/purchase-order/revisions/list");
      if (response.data?.success) return response.data.data ?? [];
      return [];
    },
    create: async (revision: PORevision): Promise<PORevision> => {
      const response = await apiClient.post("/purchase-order/revisions/create", revision);
      if (response.data?.success) return response.data.data;
      return revision;
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/purchase-order/revisions/${id}`);
    },
  },
  purchaseOrders: {
    list: async () => {
      const response = await apiClient.get("/purchase-order/read");
      return response.data?.data ?? [];
    },
  },
};

export function PurchaseOrdersPage() {
  const { currentCompanyId, companies, users, currentUserId } = useERPStore();
  const currentUser = users?.find((u: any) => u.id === currentUserId) as any;
  const canCreate = canPerformPageAction(currentUser?.actionPermissions, "purchaseOrders", "create");
  const canEdit = canPerformPageAction(currentUser?.actionPermissions, "purchaseOrders", "edit");
  const canDelete = canPerformPageAction(currentUser?.actionPermissions, "purchaseOrders", "delete");
  const canExport = canPerformPageAction(currentUser?.actionPermissions, "purchaseOrders", "export");

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [revisions, setRevisions] = useState<PORevision[]>([]);
  const [nextPoNo, setNextPoNo] = useState("");
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryFields, setInventoryFields] = useState<DynamicField[]>([]);
  const [inventoryRecords, setInventoryRecords] = useState<DynamicRecord[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  const [isDataEntryOpen, setIsDataEntryOpen] = useState(false);
  const [activePoVendor, setActivePoVendor] = useState<Vendor | null>(null);
  const [deMaximized, setDeMaximized] = useState(false);
  const [linkedSalesOrderId, setLinkedSalesOrderId] = useState<string>("");

  const orderType = linkedSalesOrderId ? "JO Order PO" : "Stock Order";

  const [companyDetails, setCompanyDetails] = useState({ name: "", address: "", phone: "", email: "", gstin: "", iso: "", signatory: "", division: "" });
  const [poNumber, setPoNumber] = useState("");
  const [poDate, setPoDate] = useState(new Date().toISOString().split("T")[0]);
  const [poStatus, setPoStatus] = useState("Pending");
  const [paymentTerms, setPaymentTerms] = useState("30 days net");
  const [materialStatus, setMaterialStatus] = useState("Pending");
  const [referenceCode, setReferenceCode] = useState("");
  const [advance, setAdvance] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [cgstPercent, setCgstPercent] = useState(9);
  const [sgstPercent, setSgstPercent] = useState(9);
  const [igstPercent, setIgstPercent] = useState(0);
  const [terms, setTerms] = useState("");
  const [poItems, setPoItems] = useState<POItem[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [newColName, setNewColName] = useState("");
  const [isAddingCol, setIsAddingCol] = useState(false);

  const [isPoPreviewOpen, setIsPoPreviewOpen] = useState(false);
  const poPreviewIframeRef = useRef<HTMLIFrameElement>(null);
  const revisionViewerIframeRef = useRef<HTMLIFrameElement>(null);
  const [isPoPlacedDialogOpen, setIsPoPlacedDialogOpen] = useState(false);
  const [placeSendWhatsapp, setPlaceSendWhatsapp] = useState(true);
  const [placeSendEmail, setPlaceSendEmail] = useState(false);
  const [placePhone, setPlacePhone] = useState("");

  const [clearRowsConfirmOpen, setClearRowsConfirmOpen] = useState(false);
  const [removeColConfirmOpen, setRemoveColConfirmOpen] = useState(false);
  const [colToRemove, setColToRemove] = useState<string | null>(null);
  const [deleteRevisionConfirmOpen, setDeleteRevisionConfirmOpen] = useState(false);
  const [revisionToDelete, setRevisionToDelete] = useState<string | null>(null);
  const [isRevisionsPanelOpen, setIsRevisionsPanelOpen] = useState(false);
  const [viewingRevision, setViewingRevision] = useState<PORevision | null>(null);
  const [revisionSearch, setRevisionSearch] = useState("");

  const [poColumnOrder, setPoColumnOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem("po-table-column-order");
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch { return []; }
  });

  const [inventoryDropdownRowId, setInventoryDropdownRowId] = useState<string | null>(null);
  const excelImportInputRef = useRef<HTMLInputElement>(null);
  const [isImportingExcel, setIsImportingExcel] = useState(false);

  const [globalSearch, setGlobalSearch] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");
  const [searchField, setSearchField] = useState<"all" | "poNo" | "status" | "vendor">("all");

  // Deep-link support: /purchase/orders?order=<salesOrderId>&ref=<code>&mode=generate|view
  // The order ID is the primary link (direct FK); ref is display/legacy fallback.
  const location = useLocation();
  const navigate = useNavigate();
  const [linkedRefCode, setLinkedRefCode] = useState("");
  const [linkedOrderId, setLinkedOrderId] = useState("");
  const [linkedMode, setLinkedMode] = useState<"generate" | "view" | "">("");
  const handledDeepLinkRef = useRef<string>("");

  const clearLinkedPoParams = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("ref");
    url.searchParams.delete("order");
    url.searchParams.delete("mode");
    window.history.replaceState({}, "", url.toString());
    setLinkedRefCode("");
    setLinkedOrderId("");
    setLinkedMode("");
  };

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const ref = queryParams.get("ref");
    const orderId = queryParams.get("order") || "";
    const mode = queryParams.get("mode") as "generate" | "view" | null;
    if ((!ref && !orderId) || handledDeepLinkRef.current === `${orderId}::${ref}::${mode}`) return;
    // Wait until data has loaded so we can match existing revisions.
    if (loading || vendors.length === 0) return;

    handledDeepLinkRef.current = `${orderId}::${ref}::${mode}`;
    setLinkedRefCode(ref || "");
    setLinkedOrderId(orderId);
    setLinkedMode(mode || "generate");

    // Auto-open the existing PO revision linked to this order — direct ID
    // match first, reference-code string only as legacy fallback.
    const foundRev =
      (orderId && revisions.find((r) => (r as any).salesOrderId === orderId)) ||
      (ref ? revisions.find((r) => r.referenceCode && String(r.referenceCode).trim() === String(ref).trim()) : undefined);
    if (foundRev) {
      const v = vendors.find((vendor) => vendor.id === foundRev.vendorId);
      if (v) {
        loadRevision(foundRev);
        setActivePoVendor(v);
        setIsDataEntryOpen(true);
        toast.success(`Auto-opened existing PO revision for reference: ${foundRev.referenceCode || ref}`);
        return;
      }
    }

    // No existing PO for this order — start a new one pre-linked by ID + reference.
    if (mode !== "view") {
      openNewDataEntry(null);
      setReferenceCode(ref || "");
      if (orderId) setLinkedSalesOrderId(orderId);
      toast.success(`New PO started for reference: ${ref || "linked order"}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisions, vendors, loading, location.search]);

  useEffect(() => { fetchAllData(); }, []);

  const fetchAllData = async () => {
    setLoading(true);
    setInventoryLoading(true);
    try {
      const [vList, rList, invList, dynFieldsRes, dynRecordsRes, soData, nextNoRes] = await Promise.all([
        apiService.vendors.list(),
        apiService.revisions.list(),
        inventoryApi.list(),
        dynamicApi.getFields("inventory"),
        dynamicApi.getRecords("inventory"),
        salesOrderApi.salesOrders.list({ page: "1", limit: "500" }).catch(() => []),
        // Server-side numbering is authoritative: it also accounts for
        // soft-deleted POs that still own their poNo via a unique index.
        apiClient.get("/purchase-order/next-number").catch(() => null),
      ]);
      setVendors(vList);
      setRevisions(rList);
      setInventoryItems(invList);
      setInventoryFields((dynFieldsRes.data?.data || []).sort((a: any, b: any) => a.orderNo - b.orderNo));
      setInventoryRecords(dynRecordsRes.data?.data || []);
      setSalesOrders(Array.isArray(soData) ? soData : []);
      if (nextNoRes?.data?.success && typeof nextNoRes.data.data === "string") {
        setNextPoNo(nextNoRes.data.data);
      }
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); setInventoryLoading(false); }
  };

  const refreshNextPoNo = async () => {
    try {
      const res = await apiClient.get("/purchase-order/next-number");
      if (res.data?.success && typeof res.data.data === "string") {
        setNextPoNo(res.data.data);
      }
    } catch {}
  };

  const poDefaultColumnIds = useMemo(() => {
    const dynFields = inventoryFields.map((f) => f.fieldName).filter((n) => n !== "qty" && n !== "discountPercent" && n !== "total");
    return ["sno", ...dynFields, "qty", "discountPercent", "total", "delete"];
  }, [inventoryFields]);

  const orderedPoColumnIds = useMemo(() => {
    const mergeOrder = (order: string[]) => {
      const current = order.filter((id) => poDefaultColumnIds.includes(id));
      const missing = poDefaultColumnIds.filter((id) => !current.includes(id));
      const result = [...current];
      for (const id of missing) {
        const defaultIdx = poDefaultColumnIds.indexOf(id);
        let insertAt = -1;
        for (let i = defaultIdx + 1; i < poDefaultColumnIds.length; i++) {
          const pos = result.indexOf(poDefaultColumnIds[i]);
          if (pos !== -1) { insertAt = pos; break; }
        }
        if (insertAt === -1) result.push(id);
        else result.splice(insertAt, 0, id);
      }
      return result;
    };
    const merged = poColumnOrder.length === 0 ? [...poDefaultColumnIds] : mergeOrder(poColumnOrder);
    const middleColumns = merged.filter((id) => id !== "sno" && id !== "qty" && id !== "discountPercent" && id !== "total" && id !== "delete");
    return ["sno", ...middleColumns, "qty", "discountPercent", "total", "delete"].filter(
      (id) => poDefaultColumnIds.includes(id) || id === "sno" || id === "qty" || id === "discountPercent" || id === "total" || id === "delete",
    );
  }, [poColumnOrder, poDefaultColumnIds]);

  const inventoryFieldsMap = useMemo(() => new Map(inventoryFields.map((field) => [field.fieldName, field])), [inventoryFields]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem("po-table-column-order", JSON.stringify(orderedPoColumnIds)); } catch {}
  }, [orderedPoColumnIds]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } }),
  );

  const getCustomColumnName = (id: string) => id.replace(/^custom_/, "");

  const getPoColumnLabel = (id: string) => {
    switch (id) {
      case "sno": return "S.No.";
      case "description": { const nameField = inventoryFields.find((f) => f.label.toLowerCase().includes("name") || f.label.toLowerCase().includes("desc")); return nameField ? nameField.label : "Item Description"; }
      case "qty": return "Qty";
      case "rate": return "Rate (₹)";
      case "discountPercent": return "DIS (%)";
      case "net": return "Net (₹)";
      case "total": return "Total (₹)";
      case "delete": return "";
      default: { const dynField = inventoryFieldsMap.get(id); if (dynField) return dynField.label; return getCustomColumnName(id); }
    }
  };

  const getPoColumnClassName = (id: string) => {
    switch (id) {
      case "sno": return "th-sno";
      case "description": return "th-desc";
      case "qty": return "th-qty";
      case "unit": return "th-unit";
      case "hsnCode": return "th-hsn";
      case "catNo": return "th-catno";
      case "rate": return "th-rate";
      case "discountPercent": return "th-dis";
      case "net": return "th-net";
      case "total": return "th-total";
      case "delete": return "th-del";
      default: return "";
    }
  };

  const getPoColumnWidth = (id: string) => {
    switch (id) {
      case "sno": return 50;
      case "description": return 240;
      case "qty": return 80;
      case "unit": return 80;
      case "hsnCode": return 100;
      case "catNo": return 100;
      case "rate": return 105;
      case "discountPercent": return 85;
      case "net": return 110;
      case "total": return 120;
      case "delete": return 45;
      default: return 130;
    }
  };

  const totals = useMemo(() => {
    const subtotal = poItems.reduce((sum, item) => sum + item.total, 0);
    const cgstAmt = (subtotal * cgstPercent) / 100;
    const sgstAmt = (subtotal * sgstPercent) / 100;
    const igstAmt = (subtotal * igstPercent) / 100;
    const grandTotal = subtotal + cgstAmt + sgstAmt + igstAmt;
    const balance = grandTotal - advance;
    return { subtotal, cgstAmt, sgstAmt, igstAmt, grandTotal, balance };
  }, [poItems, cgstPercent, sgstPercent, igstPercent, advance]);

  const handleAddPoRow = () => {
    const newItem: POItem = { id: `row-${Date.now()}`, description: "", qty: "", rate: 0, discountPercent: 0, net: 0, total: 0, unit: "", hsnCode: "", catNo: "" };
    inventoryFields.forEach((f) => { newItem[f.fieldName] = ""; });
    customColumns.forEach((c) => { newItem[c] = ""; });
    setPoItems((prev) => [...prev, newItem]);
  };

  const getInventoryMatches = (query: string): DynamicRecord[] => {
    const q = query.trim().toLowerCase();
    const pool = !q ? inventoryRecords : inventoryRecords.filter((rec) => Object.values(rec.values || {}).some((val) => String(val || "").toLowerCase().includes(q)));
    return pool.slice(0, 15);
  };

  const applyInventoryItemToRow = (rowId: string, invRecord: DynamicRecord) => {
    setPoItems((prev) =>
      prev.map((item) => {
        if (item.id !== rowId) return item;
        const updatedItem: POItem = { ...item, inventoryId: invRecord.id, materialId: invRecord.id };
        inventoryFields.forEach((f) => {
          const loadedValue = getRecordValue(invRecord.values, f);
          updatedItem[f.fieldName] = loadedValue !== undefined && loadedValue !== null ? loadedValue : item[f.fieldName] ?? "";
        });
        const primaryField = inventoryFields[0];
        if (primaryField) updatedItem.description = String(updatedItem[primaryField.fieldName] || "");
        const qtyField = inventoryFields.find((f) => f.label.toLowerCase().includes("qty") || f.label.toLowerCase().includes("quantity"));
        const priceField = inventoryFields.find((f) => f.label.toLowerCase().includes("price") || f.label.toLowerCase().includes("rate"));
        const discountField = inventoryFields.find((f) => f.label.toLowerCase().includes("discount"));
        updatedItem.qty = qtyField ? Number(updatedItem[qtyField.fieldName]) || 1 : Number(item.qty) || 1;
        updatedItem.rate = priceField ? Number(updatedItem[priceField.fieldName]) || 0 : Number(item.rate) || 0;
        updatedItem.discountPercent = discountField ? Number(updatedItem[discountField.fieldName]) || 0 : Number(item.discountPercent) || 0;
        const qty = Number(updatedItem.qty) || 1;
        const rate = Number(updatedItem.rate) || 0;
        const disc = Number(updatedItem.discountPercent) || 0;
        const net = rate * (1 - disc / 100);
        updatedItem.net = net;
        updatedItem.total = qty * net;
        return updatedItem;
      }),
    );
    const primaryField = inventoryFields[0];
    const nameVal = primaryField ? getRecordValue(invRecord.values, primaryField) : "";
    toast.success(`Loaded "${nameVal || "Item"}" details from inventory`);
    setInventoryDropdownRowId(null);
  };

  const updatePoItemField = (id: string, field: string, val: any) => {
    setPoItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: val };
        const primaryField = inventoryFields[0];
        if (primaryField && field === primaryField.fieldName) updated.description = String(val || "");
        const isQtyField = field === "qty" || inventoryFieldsMap.get(field)?.label.toLowerCase().includes("qty") || inventoryFieldsMap.get(field)?.label.toLowerCase().includes("quantity");
        const isPriceField = field === "rate" || inventoryFieldsMap.get(field)?.label.toLowerCase().includes("price") || inventoryFieldsMap.get(field)?.label.toLowerCase().includes("rate");
        const isDiscountField = field === "discountPercent" || inventoryFieldsMap.get(field)?.label.toLowerCase().includes("discount");
        if (isQtyField) updated.qty = val === "" ? "" : Number(val) || 0;
        if (isPriceField) updated.rate = Number(val) || 0;
        if (isDiscountField) updated.discountPercent = Number(val) || 0;
        const qty = Number(updated.qty) || 0;
        const rate = Number(updated.rate) || 0;
        const disc = Number(updated.discountPercent) || 0;
        const net = rate * (1 - disc / 100);
        updated.net = net;
        updated.total = qty * net;
        return updated;
      }),
    );
  };

  const handleDeletePoRow = (id: string) => setPoItems((prev) => prev.filter((item) => item.id !== id));
  const handleDuplicateLastRow = () => {
    if (poItems.length === 0) { toast.error("No items to duplicate."); return; }
    const last = poItems[poItems.length - 1];
    setPoItems((prev) => [...prev, { ...last, id: `row-${Date.now()}` }]);
    toast.success("Last row duplicated");
  };
  const handleClearAllRows = () => setClearRowsConfirmOpen(true);
  const handleAddCustomColumn = () => {
    if (!newColName.trim()) { toast.error("Column name is required"); return; }
    const safeName = newColName.trim();
    if (customColumns.includes(safeName)) { toast.error("Column already exists"); return; }
    setCustomColumns((prev) => [...prev, safeName]);
    setPoItems((prev) => prev.map((item) => ({ ...item, [safeName]: "" })));
    setNewColName("");
    setIsAddingCol(false);
    toast.success(`Column "${safeName}" added`);
  };
  const handleRemoveCustomColumn = (colName: string) => { setColToRemove(colName); setRemoveColConfirmOpen(true); };

  const handleImportExcelClick = () => excelImportInputRef.current?.click();
  const getCellValue = (row: Record<string, any>, keys: string[]): string => {
    for (const key of Object.keys(row)) {
      if (keys.includes(key.trim().toLowerCase())) { const v = row[key]; return v === undefined || v === null ? "" : String(v).trim(); }
    }
    return "";
  };
  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportingExcel(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (rows.length === 0) { toast.error("No data found in the selected file"); return; }
        let matchedFromInventory = 0;
        const newItems: POItem[] = [];
        rows.forEach((row, idx) => {
          const newItem: POItem = { id: `row-${Date.now()}-${idx}`, description: "", qty: "", rate: 0, discountPercent: 0, net: 0, total: 0, unit: "", hsnCode: "", catNo: "" };
          const cellValues = Object.values(row).map((v) => String(v || "").trim()).filter(Boolean);
          let invMatch: DynamicRecord | undefined;
          if (cellValues.length > 0) {
            invMatch = inventoryRecords.find((rec) => Object.values(rec.values || {}).some((val) => {
              const valStr = String(val || "").trim().toLowerCase();
              if (!valStr) return false;
              return cellValues.some((cellVal) => cellVal.toLowerCase() === valStr);
            }));
          }
          if (invMatch) { matchedFromInventory++; newItem.inventoryId = invMatch.id; newItem.materialId = invMatch.id; }
          inventoryFields.forEach((f) => {
            const cellVal = getCellValue(row, [f.label.trim().toLowerCase(), f.fieldName.trim().toLowerCase()]);
            if (cellVal !== "") newItem[f.fieldName] = f.type === "NUMBER" ? Number(cellVal) || 0 : cellVal;
            else if (invMatch) { const invVal = getRecordValue(invMatch.values, f); if (invVal !== undefined) newItem[f.fieldName] = f.type === "NUMBER" ? Number(invVal) || 0 : String(invVal); }
            else newItem[f.fieldName] = f.type === "NUMBER" ? 0 : "";
          });
          const nameField = inventoryFields.find((f) => f.label.toLowerCase().includes("name") || f.label.toLowerCase().includes("desc"));
          if (nameField) newItem.description = String(newItem[nameField.fieldName] || "");
          else { const ff = inventoryFields[0]; if (ff) newItem.description = String(newItem[ff.fieldName] || ""); }
          const qtyField = inventoryFields.find((f) => f.label.toLowerCase().includes("qty") || f.label.toLowerCase().includes("quantity"));
          const priceField = inventoryFields.find((f) => f.label.toLowerCase().includes("price") || f.label.toLowerCase().includes("rate") || f.label.toLowerCase().includes("cost"));
          newItem.qty = qtyField ? Number(newItem[qtyField.fieldName]) || 1 : 1;
          newItem.rate = priceField ? Number(newItem[priceField.fieldName]) || 0 : 0;
          newItem.net = newItem.rate;
          newItem.total = newItem.qty * newItem.net;
          const hasContent = inventoryFields.some((f) => String(newItem[f.fieldName] || "").trim() !== "");
          if (hasContent) newItems.push(newItem);
        });
        if (newItems.length === 0) { toast.error("No valid rows found in the Excel file."); return; }
        setPoItems((prev) => [...prev, ...newItems]);
        toast.success(`Imported ${newItems.length} item(s) from Excel` + (matchedFromInventory > 0 ? ` (${matchedFromInventory} matched to Inventory)` : ""));
      } catch { toast.error("Failed to read the Excel file."); }
      finally { setIsImportingExcel(false); if (excelImportInputRef.current) excelImportInputRef.current.value = ""; }
    };
    reader.onerror = () => { toast.error("Failed to read the selected file."); setIsImportingExcel(false); };
    reader.readAsBinaryString(file);
  };

  const handleDownloadPoItemsTemplate = () => {
    const headers = inventoryFields.map((f) => f.label);
    const sampleRow = inventoryFields.map((f) => {
      if (f.type === "NUMBER") {
        if (f.label.toLowerCase().includes("qty") || f.label.toLowerCase().includes("quantity")) return 10;
        if (f.label.toLowerCase().includes("price") || f.label.toLowerCase().includes("rate")) return 100;
        return 123;
      }
      if (f.label.toLowerCase().includes("unit") || f.label.toLowerCase().includes("uom")) return "Nos";
      if (f.label.toLowerCase().includes("hsn")) return "8536";
      return `Sample ${f.label}`;
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PO Items");
    XLSX.writeFile(wb, "po_line_items_template.xlsx");
  };

  const openNewDataEntry = (vendor: Vendor | null) => {
    setActivePoVendor(vendor);
    // Prefer the server-suggested number (accounts for recycled POs that
    // still hold their poNo); fall back to counting saved revisions.
    const currentYear = new Date().getFullYear();
    const prefix = `PO-${currentYear}-`;
    const yearRevisions = revisions.filter((r) => r.poNumber && r.poNumber.startsWith(prefix));
    let nextNum = 1;
    if (yearRevisions.length > 0) {
      const numbers = yearRevisions.map((r) => { const parts = r.poNumber.split("-"); const lastPart = parts[parts.length - 1]; const parsed = parseInt(lastPart, 10); return isNaN(parsed) ? 0 : parsed; });
      nextNum = Math.max(...numbers) + 1;
    }
    const localNext = `${prefix}${String(nextNum).padStart(4, "0")}`;
    setPoNumber(nextPoNo || localNext);
    setPoDate(new Date().toISOString().split("T")[0]);
    setPoStatus("Pending");
    setPaymentTerms("30 days net");
    setMaterialStatus("Pending");
    setReferenceCode("");
    setAdvance(0);
    setRemarks("");
    setCgstPercent(9);
    setSgstPercent(9);
    setIgstPercent(0);
    setTerms("");
    setPoItems([]);
    setCustomColumns([]);
    setLinkedSalesOrderId("");
    const activeCompany = companies.find((c: any) => c.id === currentCompanyId);
    setCompanyDetails({ name: activeCompany?.name || "", address: activeCompany?.address || "", phone: activeCompany?.phone || "", email: activeCompany?.email || "", gstin: activeCompany?.gst || "", iso: "", signatory: "", division: "" });
    setSelectedRevisionId(null);
    setIsDataEntryOpen(true);
  };

  const loadRevision = (rev: PORevision) => {
    setPoNumber(rev.poNumber);
    setPoDate(rev.poDate);
    let mappedFriendly = rev.poStatus || "Pending";
    if (mappedFriendly === "APPROVED") mappedFriendly = "Ready";
    else if (mappedFriendly === "SENT") mappedFriendly = "Placed";
    else if (mappedFriendly === "PARTIAL_RECEIVED") mappedFriendly = "Partially Received";
    else if (mappedFriendly === "COMPLETED") mappedFriendly = "Received";
    else if (mappedFriendly === "CANCELLED") mappedFriendly = "Cancelled";
    setPoStatus(mappedFriendly);
    setPaymentTerms(rev.paymentTerms);
    setMaterialStatus(rev.materialStatus);
    setAdvance(rev.advance);
    setRemarks(rev.remarks);
    setCgstPercent(rev.cgstPercent);
    setSgstPercent(rev.sgstPercent);
    setIgstPercent(rev.igstPercent);
    setTerms(rev.termsAndConditions);
    const mappedItems = (rev.lineItems || []).map((item) => {
      const mappedItem: any = { ...item };
      const invItem = inventoryItems.find((inv) => inv.materialId === item.materialId);
      const invRecord = invItem ? inventoryRecords.find((rec) => rec.id === invItem.id) : null;
      if (invRecord && invRecord.values) {
        inventoryFields.forEach((f) => {
          const loadedValue = getRecordValue(invRecord.values, f);
          mappedItem[f.fieldName] = loadedValue !== undefined && loadedValue !== null ? loadedValue : mappedItem[f.fieldName] ?? "";
        });
      } else {
        inventoryFields.forEach((f) => {
          if (mappedItem[f.fieldName] === undefined) {
            if (f.label.toLowerCase().includes("name") || f.label.toLowerCase().includes("desc")) mappedItem[f.fieldName] = item.description || "";
            else if (f.label.toLowerCase().includes("unit") || f.label.toLowerCase().includes("uom")) mappedItem[f.fieldName] = item.unit || "Nos";
            else if (f.label.toLowerCase().includes("hsn")) mappedItem[f.fieldName] = item.hsnCode || "";
            else mappedItem[f.fieldName] = "";
          }
        });
      }
      mappedItem.description = mappedItem.description || item.description || "";
      mappedItem.qty = item.qty !== undefined && item.qty !== "" ? Number(item.qty) || 0 : "";
      mappedItem.rate = Number(item.rate) || 0;
      mappedItem.discountPercent = Number(item.discountPercent) || 0;
      mappedItem.net = Number(item.net) || (mappedItem.rate * (1 - mappedItem.discountPercent / 100));
      mappedItem.total = Number(item.total) || ((mappedItem.qty || 0) * mappedItem.net);
      const primaryField = inventoryFields[0];
      if (primaryField && !mappedItem[primaryField.fieldName]) mappedItem[primaryField.fieldName] = mappedItem.description;
      return mappedItem;
    });
    setPoItems(mappedItems);
    setCompanyDetails(rev.companyDetails);
    setSelectedRevisionId(rev.id);
    setCustomColumns(rev.customColumns || []);
    setReferenceCode(rev.referenceCode || "");
    toast.success(`Loaded PO details from revision v${rev.revisionNo}`);
  };

  const handleSavePoRevision = async (overrideStatus?: string) => {
    if (!activePoVendor) return;
    if (!poNumber.trim()) { toast.error("PO Number is required"); return; }
    if (!poDate) { toast.error("PO Date is required"); return; }
    if (poItems.length === 0) { toast.error("Add at least one line item before saving"); return; }
    for (let i = 0; i < poItems.length; i++) {
      const item = poItems[i];
      let resolvedMaterialId = item.materialId || item.inventoryId;
      if (!resolvedMaterialId && item.description && inventoryFields.length > 0) {
        const primaryField = inventoryFields[0];
        const descLower = item.description.trim().toLowerCase();
        const matchedRecord = inventoryRecords.find((rec) => { const recName = String(getRecordValue(rec.values, primaryField) || "").trim().toLowerCase(); return recName === descLower; });
        if (matchedRecord) resolvedMaterialId = matchedRecord.id;
      }
      if (!resolvedMaterialId && item.description) {
        const descLower = item.description.trim().toLowerCase();
        const matched = inventoryItems.find((inv) => inv.material?.name?.trim().toLowerCase() === descLower);
        if (matched?.materialId) resolvedMaterialId = matched.materialId;
      }
      if (!resolvedMaterialId && inventoryItems.length > 0) resolvedMaterialId = inventoryItems[0].materialId;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!resolvedMaterialId || !uuidRegex.test(resolvedMaterialId)) {
        toast.error(`Item at row ${i + 1} (${item.description || "empty description"}) is not linked to any valid material in the inventory.`);
        return;
      }
    }
    if (advance < 0) { toast.error("Advance amount cannot be negative"); return; }
    if (advance > totals.grandTotal && totals.grandTotal > 0) { toast.error("Advance cannot exceed the grand total"); return; }
    const existingRevisions = revisions.filter((r) => r.vendorId === activePoVendor.id && r.poNumber === poNumber);
    const nextRevisionNo = existingRevisions.length === 0 ? 0 : Math.max(...existingRevisions.map((r) => r.revisionNo)) + 1;
    const statusToSave = overrideStatus ?? poStatus;
    const newRevision: PORevision = {
      id: `rev-${Date.now()}`, vendorId: activePoVendor.id, poNumber, poDate, poStatus: statusToSave, paymentTerms, materialStatus, advance, remarks, cgstPercent, sgstPercent, igstPercent,
      subtotal: totals.subtotal, cgstAmount: totals.cgstAmt, sgstAmount: totals.sgstAmt, igstAmount: totals.igstAmt, grandTotal: totals.grandTotal,
      termsAndConditions: terms, lineItems: poItems, companyDetails, createdAt: new Date().toISOString(), createdBy: useERPStore.getState().currentUserName || "Unknown User", revisionNo: nextRevisionNo, customColumns: [...customColumns], referenceCode, salesOrderId: linkedSalesOrderId || null,
    } as PORevision;
    try {
      let mappedStatus: "DRAFT" | "APPROVED" | "SENT" | "PARTIAL_RECEIVED" | "COMPLETED" | "CANCELLED" = "DRAFT";
      if (statusToSave === "Placed" || statusToSave === "Ordered" || statusToSave === "SENT") mappedStatus = "SENT";
      else if (statusToSave === "Ready" || statusToSave === "APPROVED") mappedStatus = "APPROVED";
      else if (statusToSave === "Partially Received" || statusToSave === "PARTIAL_RECEIVED") mappedStatus = "PARTIAL_RECEIVED";
      else if (statusToSave === "Received" || statusToSave === "COMPLETED") mappedStatus = "COMPLETED";
      else if (statusToSave === "Cancelled" || statusToSave === "CANCELLED") mappedStatus = "CANCELLED";
      const resolvedItems = poItems.map((item) => {
        let resolvedMaterialId = item.materialId || item.inventoryId;
        if (!resolvedMaterialId && item.description && inventoryFields.length > 0) {
          const primaryField = inventoryFields[0];
          const descLower = item.description.trim().toLowerCase();
          const matchedRecord = inventoryRecords.find((rec) => { const recName = String(getRecordValue(rec.values, primaryField) || "").trim().toLowerCase(); return recName === descLower; });
          if (matchedRecord) resolvedMaterialId = matchedRecord.id;
        }
        if (!resolvedMaterialId && item.description) {
          const descLower = item.description.trim().toLowerCase();
          const matched = inventoryItems.find((inv) => inv.material?.name?.trim().toLowerCase() === descLower);
          if (matched?.materialId) resolvedMaterialId = matched.materialId;
        }
        if (!resolvedMaterialId && inventoryItems.length > 0) resolvedMaterialId = inventoryItems[0].materialId;
        return { materialId: resolvedMaterialId || "", quantity: (Number(item.qty) || 0) > 0 ? Number(item.qty) : 1, unitPrice: item.rate > 0 ? item.rate : 0.01, remarks: item.description || "" };
      });
      const existingPOsRes = await apiClient.get("/purchase-order/read");
      const existingPOs = existingPOsRes.data?.data ?? [];
      const matchedPO = existingPOs.find((p: any) => p.poNo === poNumber);
      if (matchedPO) {
        await apiClient.patch(`/purchase-order/update/${matchedPO.id}`, { vendorId: activePoVendor.id, expectedDelivery: null, paymentTerms, shippingTerms: "", remarks, referenceCode, status: mappedStatus, poStatus: statusToSave, items: resolvedItems, linkedSalesOrderId: linkedSalesOrderId || null, poType: linkedSalesOrderId ? "JOB" : "STOCK" });
      } else {
        await apiClient.post("/purchase-order/create", { poNo: poNumber, vendorId: activePoVendor.id, orderDate: poDate, expectedDelivery: null, paymentTerms, shippingTerms: "", remarks, referenceCode, status: mappedStatus, poStatus: statusToSave, items: resolvedItems, linkedSalesOrderId: linkedSalesOrderId || null, poType: linkedSalesOrderId ? "JOB" : "STOCK" });
      }
      const savedRevision = await apiService.revisions.create(newRevision);
      const list = await apiService.revisions.list();
      setRevisions(list);
      void refreshNextPoNo();
      setSelectedRevisionId(savedRevision?.id || newRevision.id);
      if (overrideStatus === "Ready") toast.success(`PO marked Ready — Revision R${newRevision.revisionNo} saved`);
      else if (overrideStatus === "Placed") toast.success(`PO marked Placed — Revision R${newRevision.revisionNo} saved`);
      else toast.success(`Revision R${newRevision.revisionNo} saved successfully`);
    } catch (err: any) { toast.error("Failed to save PO revision"); }
  };

  // When `overrideRev` is given, renders THAT saved revision read-only
  // (used by the Revision History viewer) without touching wizard state.
  const buildPoDocumentHtml = (overrideRev?: PORevision | null): string => {
    const revVendor = overrideRev ? vendors.find((v) => v.id === overrideRev.vendorId) : activePoVendor;
    if (!revVendor) return "";
    const revItems: POItem[] = overrideRev ? (overrideRev.lineItems as POItem[]) || [] : poItems;
    const revNo = overrideRev ? overrideRev.poNumber : poNumber;
    const revDate = overrideRev ? overrideRev.poDate : poDate;
    const revPaymentTerms = overrideRev ? overrideRev.paymentTerms || "" : paymentTerms;
    const revMaterialStatus = overrideRev ? overrideRev.materialStatus || "" : materialStatus;
    const revRemarks = overrideRev ? overrideRev.remarks || "" : remarks;
    const revTerms = overrideRev ? overrideRev.termsAndConditions || "" : terms;
    const revAdvance = overrideRev ? Number(overrideRev.advance) || 0 : advance;
    const revCgst = overrideRev ? Number(overrideRev.cgstPercent) || 0 : cgstPercent;
    const revSgst = overrideRev ? Number(overrideRev.sgstPercent) || 0 : sgstPercent;
    const revIgst = overrideRev ? Number(overrideRev.igstPercent) || 0 : igstPercent;
    const revReference = overrideRev ? overrideRev.referenceCode || "" : referenceCode;
    const revCompanyDetails = overrideRev?.companyDetails || companyDetails;
    const wizardRevision = overrideRev ? null : revisions.find((r) => r.id === selectedRevisionId);
    const revisionNoStr = overrideRev ? `R${overrideRev.revisionNo}` : (wizardRevision ? `R${wizardRevision.revisionNo}` : "R0");
    const revSubtotal = revItems.reduce((sum, item) => sum + item.total, 0);
    const revTotals = {
      subtotal: revSubtotal,
      cgstAmt: (revSubtotal * revCgst) / 100,
      sgstAmt: (revSubtotal * revSgst) / 100,
      igstAmt: (revSubtotal * revIgst) / 100,
      grandTotal: 0,
      balance: 0,
    };
    revTotals.grandTotal = revSubtotal + revTotals.cgstAmt + revTotals.sgstAmt + revTotals.igstAmt;
    revTotals.balance = revTotals.grandTotal - revAdvance;
    const printColumns = orderedPoColumnIds.filter((id) => id !== "delete");
    const headersHtml = printColumns.map((id) => `<th>${getPoColumnLabel(id)}</th>`).join("");
    const itemsHtml = revItems.map((item, idx) => {
      const tdsHtml = printColumns.map((id) => {
        if (id === "sno") return `<td style="text-align: center;">${idx + 1}</td>`;
        const field = inventoryFieldsMap.get(id);
        const val = item[id];
        const isPrice = id === "net" || id === "total" || id === "rate" || (field?.label.toLowerCase().includes("price") && typeof val === "number");
        const isNumber = field?.type === "NUMBER" || id === "qty" || id === "rate" || id === "discountPercent" || id === "net" || id === "total";
        const displayVal = isPrice ? `₹${Number(val || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : val !== undefined && val !== null ? String(val) : "—";
        return `<td style="${isNumber ? "text-align: right;" : ""}">${displayVal}</td>`;
      }).join("");
      return `<tr>${tdsHtml}</tr>`;
    }).join("");
    const colSpan = printColumns.length;
    return `
      <html><head><style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; color: #1f2937; line-height: 1.3; font-size: 11px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #111827; padding-bottom: 10px; }
        .company-name { font-size: 18px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; margin: 0 0 4px 0; }
        .company-address { font-size: 10.5px; color: #4b5563; margin: 0 0 2px 0; max-width: 380px; }
        .po-title { font-size: 22px; font-weight: 900; color: #111827; margin: 0 0 6px 0; text-align: right; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; }
        .meta-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #2563eb; margin: 0 0 4px 0; letter-spacing: 0.5px; }
        .meta-body { font-size: 11px; margin: 0; color: #1f2937; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 10.5px; }
        th { background-color: #f3f4f6; color: #374151; text-transform: uppercase; font-size: 9px; font-weight: 700; border: 1px solid #e5e7eb; padding: 6px 4px; text-align: left; }
        td { border: 1px solid #e5e7eb; padding: 6px 4px; }
        .totals-box { margin-top: 15px; float: right; width: 280px; font-size: 11px; }
        .totals-row { display: flex; justify-content: space-between; padding: 4px 0; color: #4b5563; }
        .grand-total { font-weight: 800; border-top: 1.5px double #111827; padding-top: 6px; font-size: 13px; color: #111827; }
        .terms-box { float: left; width: calc(100% - 310px); margin-top: 15px; font-size: 10px; color: #4b5563; }
        .sig-section { margin-top: 70px; display: flex; justify-content: space-between; clear: both; page-break-inside: avoid; }
        .sig-box { border-top: 1px solid #111827; padding-top: 6px; text-align: center; width: 180px; font-size: 11px; }
        .sig-title { font-weight: 700; color: #111827; margin: 0; }
        .sig-desc { font-size: 9px; color: #4b5563; margin: 1px 0 0 0; }
        @media print { @page { size: A4; margin: 0; } html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } body { margin: 0; padding: 10mm; } * { box-shadow: none !important; } }
      </style></head><body>
        <div class="header"><div>
          <h2 class="company-name">${revCompanyDetails.name}</h2>
          <p class="company-address">${revCompanyDetails.address}</p>
          <p class="company-address">Phone: ${revCompanyDetails.phone} | Email: ${revCompanyDetails.email}</p>
          <p class="company-address">GSTIN: ${revCompanyDetails.gstin} | ${revCompanyDetails.iso}</p>
          <p class="company-address">Dept: ${revCompanyDetails.division}</p>
        </div><div style="text-align: right;">
          <h1 class="po-title">PURCHASE ORDER</h1>
          <p style="margin: 0; font-size: 12px;"><strong>PO Number:</strong> ${revNo}</p>
          <p style="margin: 2px 0 0 0; font-size: 12px;"><strong>Date:</strong> ${revDate}</p>
          <p style="margin: 2px 0 0 0; font-size: 12px;"><strong>Revision:</strong> ${revisionNoStr}</p>
          ${revReference ? `<p style="margin: 2px 0 0 0; font-size: 12px;"><strong>Reference Code:</strong> ${revReference}</p>` : ""}
        </div></div>
        <div class="meta-grid">
          <div><h3 class="meta-title">Order Placed To (Vendor):</h3><div class="meta-body">
            <p style="margin: 0 0 2px 0; font-weight: bold; font-size: 12px;">${revVendor.name}</p>
            <p style="margin: 0 0 2px 0;">Category: ${revVendor.category}</p>
            <p style="margin: 0 0 2px 0;">Phone: ${revVendor.phone} | Email: ${revVendor.email}</p>
            <p style="margin: 0 0 2px 0;">GSTIN: ${revVendor.gstNumber}</p>
          </div></div>
          <div><h3 class="meta-title">Delivery & Shipping Terms:</h3><div class="meta-body">
            <p style="margin: 0 0 2px 0;"><strong>Material Status:</strong> ${revMaterialStatus}</p>
            <p style="margin: 0 0 2px 0;"><strong>Payment Terms:</strong> ${revPaymentTerms}</p>
            <p style="margin: 0 0 2px 0;"><strong>Remarks:</strong> ${revRemarks || "None"}</p>
          </div></div>
        </div>
        <table><thead><tr>${headersHtml}</tr></thead><tbody>
          ${itemsHtml}
          ${revItems.length === 0 ? `<tr><td colspan="${colSpan}" style="text-align: center; padding: 15px; color: #6b7280;">No items added.</td></tr>` : ""}
        </tbody></table>
        <div class="terms-box"><h4 style="margin: 0 0 2px 0; color: #1f2937; font-size: 11px; text-transform: uppercase;">Terms & Conditions:</h4><p style="margin: 0; white-space: pre-wrap; font-size: 9.5px; line-height: 1.2;">${revTerms}</p></div>
        <div class="totals-box">
          <div class="totals-row"><span>Subtotal:</span> <span>₹${revTotals.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
          <div class="totals-row"><span>CGST (${revCgst}%):</span> <span>₹${revTotals.cgstAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
          <div class="totals-row"><span>SGST (${revSgst}%):</span> <span>₹${revTotals.sgstAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
          <div class="totals-row"><span>IGST (${revIgst}%):</span> <span>₹${revTotals.igstAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
          <div class="totals-row grand-total"><span>Grand Total:</span> <span>₹${revTotals.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
          <div class="totals-row"><span>Advance Paid:</span> <span>₹${revAdvance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
          <div class="totals-row" style="font-weight: 700; color: #111827; border-top: 1px solid #e5e7eb; padding-top: 4px;"><span>Balance Due:</span> <span>₹${revTotals.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
        </div>
        <div class="sig-section">
          <div class="sig-box" style="border: none; text-align: left;"><p class="sig-desc">Prepared By: ${revCompanyDetails.name}</p></div>
          <div class="sig-box"><p class="sig-title">${revCompanyDetails.signatory}</p><p class="sig-desc">Authorized Signatory</p></div>
        </div>
      </body></html>`;
  };

  const generatePoCanvas = (): HTMLCanvasElement | null => {
    if (!activePoVendor) return null;
    const currentRevision = revisions.find((r) => r.id === selectedRevisionId);
    const revisionNoStr = currentRevision ? `R${currentRevision.revisionNo}` : "R0";
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = Math.max(800, 520 + poItems.length * 32 + 260);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1e3a8a"; ctx.font = "bold 22px sans-serif"; ctx.fillText(companyDetails.name, 40, 60);
    ctx.fillStyle = "#4b5563"; ctx.font = "13px sans-serif";
    ctx.fillText(companyDetails.address, 40, 85);
    ctx.fillText(`Phone: ${companyDetails.phone} | Email: ${companyDetails.email}`, 40, 105);
    ctx.fillText(`GSTIN: ${companyDetails.gstin} | ${companyDetails.iso}`, 40, 125);
    ctx.fillStyle = "#111827"; ctx.font = "bold 28px sans-serif"; ctx.fillText("PURCHASE ORDER", 620, 60);
    ctx.font = "14px sans-serif"; ctx.fillText(`PO Number: ${poNumber}`, 620, 85);
    ctx.fillText(`Date: ${poDate}`, 620, 105);
    ctx.fillText(`Revision: ${revisionNoStr}`, 620, 125);
    if (referenceCode) ctx.fillText(`Ref Code: ${referenceCode}`, 620, 142);
    ctx.strokeStyle = "#111827"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(40, 150); ctx.lineTo(960, 150); ctx.stroke();
    ctx.fillStyle = "#2563eb"; ctx.font = "bold 12px sans-serif";
    ctx.fillText("ORDER PLACED TO (VENDOR):", 40, 180);
    ctx.fillText("DELIVERY & SHIPPING TERMS:", 500, 180);
    ctx.fillStyle = "#111827"; ctx.font = "bold 14px sans-serif"; ctx.fillText(activePoVendor.name, 40, 205);
    ctx.font = "13px sans-serif"; ctx.fillText(`Category: ${activePoVendor.category}`, 40, 225);
    ctx.fillText(`Phone: ${activePoVendor.phone} | Email: ${activePoVendor.email}`, 40, 245);
    ctx.fillText(`GSTIN: ${activePoVendor.gstNumber}`, 40, 265);
    ctx.fillText(`Material Status: ${materialStatus}`, 500, 205); ctx.fillText(`Payment Terms: ${paymentTerms}`, 500, 225); ctx.fillText(`Remarks: ${remarks || "None"}`, 500, 245);
    const printColumns = orderedPoColumnIds.filter((id) => id !== "delete");
    const colWidths: Record<string, number> = { sno: 50, qty: 60, rate: 80, discountPercent: 60, net: 90, total: 100 };
    const fixedWidthSum = printColumns.reduce((sum, colId) => sum + (colWidths[colId] || 0), 0);
    const dynamicColsCount = printColumns.filter((colId) => !colWidths[colId]).length;
    const defaultColWidth = dynamicColsCount > 0 ? (920 - fixedWidthSum) / dynamicColsCount : 100;
    let currentX = 40;
    const colPositions = printColumns.map((colId) => { const w = colWidths[colId] || defaultColWidth; const x = currentX; currentX += w; return { id: colId, x, w }; });
    let y = 300;
    ctx.fillStyle = "#f3f4f6"; ctx.fillRect(40, y, 920, 32);
    ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1; ctx.strokeRect(40, y, 920, 32);
    ctx.fillStyle = "#374151"; ctx.font = "bold 11px sans-serif";
    colPositions.forEach((col) => {
      const label = getPoColumnLabel(col.id);
      const isRight = col.id === "rate" || col.id === "total" || col.id === "net" || inventoryFieldsMap.get(col.id)?.label.toLowerCase().includes("price");
      if (isRight) { ctx.textAlign = "right"; ctx.fillText(label, col.x + col.w - 10, y + 20); }
      else { ctx.textAlign = "left"; ctx.fillText(label, col.x + 10, y + 20); }
    });
    ctx.textAlign = "left"; ctx.fillStyle = "#1f2937"; ctx.font = "13px sans-serif";
    poItems.forEach((item, idx) => {
      y += 32; ctx.strokeRect(40, y, 920, 32);
      colPositions.forEach((col) => {
        const val = item[col.id]; const field = inventoryFieldsMap.get(col.id);
        const isPrice = col.id === "net" || col.id === "total" || (field?.label.toLowerCase().includes("price") && typeof val === "number");
        const displayVal = col.id === "sno" ? String(idx + 1) : isPrice ? `₹${Number(val || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : val !== undefined && val !== null ? String(val) : "—";
        const isRight = col.id === "rate" || col.id === "total" || col.id === "net" || field?.label.toLowerCase().includes("price");
        if (isRight) { ctx.textAlign = "right"; if (col.id === "total") { ctx.font = "bold 13px sans-serif"; ctx.fillStyle = "#1e4620"; } ctx.fillText(displayVal, col.x + col.w - 10, y + 20); ctx.font = "13px sans-serif"; ctx.fillStyle = "#1f2937"; }
        else { ctx.textAlign = "left"; ctx.fillText(displayVal, col.x + 10, y + 20); }
      });
      ctx.textAlign = "left";
    });
    y += 50; const rightX = 640;
    ctx.font = "13px sans-serif"; ctx.fillStyle = "#4b5563"; ctx.fillText("Subtotal:", rightX, y);
    ctx.fillStyle = "#111827"; ctx.fillText(`₹${totals.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 860, y);
    y += 24; ctx.fillStyle = "#4b5563"; ctx.fillText(`CGST (${cgstPercent}%):`, rightX, y);
    ctx.fillStyle = "#111827"; ctx.fillText(`₹${totals.cgstAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 860, y);
    y += 24; ctx.fillStyle = "#4b5563"; ctx.fillText(`SGST (${sgstPercent}%):`, rightX, y);
    ctx.fillStyle = "#111827"; ctx.fillText(`₹${totals.sgstAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 860, y);
    y += 24; ctx.fillStyle = "#4b5563"; ctx.fillText(`IGST (${igstPercent}%):`, rightX, y);
    ctx.fillStyle = "#111827"; ctx.fillText(`₹${totals.igstAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 860, y);
    y += 12; ctx.strokeStyle = "#111827"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(rightX, y); ctx.lineTo(960, y); ctx.stroke();
    y += 20; ctx.fillStyle = "#111827"; ctx.font = "bold 14px sans-serif"; ctx.fillText("Grand Total:", rightX, y);
    ctx.fillStyle = "#1e4620"; ctx.fillText(`₹${totals.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 860, y);
    y += 24; ctx.font = "13px sans-serif"; ctx.fillStyle = "#4b5563"; ctx.fillText("Advance Paid:", rightX, y);
    ctx.fillStyle = "#111827"; ctx.fillText(`₹${advance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 860, y);
    y += 24; ctx.fillStyle = "#111827"; ctx.font = "bold 13px sans-serif"; ctx.fillText("Balance Due:", rightX, y);
    ctx.fillStyle = "#1e4620"; ctx.fillText(`₹${totals.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 860, y);
    y += 80; ctx.strokeStyle = "#111827"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(680, y); ctx.lineTo(920, y); ctx.stroke();
    y += 20; ctx.fillStyle = "#111827"; ctx.font = "bold 13px sans-serif"; ctx.fillText(companyDetails.signatory, 700, y);
    ctx.font = "11px sans-serif"; ctx.fillStyle = "#4b5563"; ctx.fillText("Authorized Signatory", 700, y + 16);
    return canvas;
  };

  const triggerExport = (format: string) => {
    if (!canExport || !activePoVendor) return;
    if (format === "pdf") {
      const html = buildPoDocumentHtml();
      if (!html) { toast.error("No PO data to export."); return; }
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed"; iframe.style.width = "0px"; iframe.style.height = "0px"; iframe.style.border = "none"; iframe.style.left = "-9999px";
      document.body.appendChild(iframe);
      const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!iframeDoc) { toast.error("Unable to create print context."); document.body.removeChild(iframe); return; }
      iframeDoc.open(); iframeDoc.write(html); iframeDoc.close();
      setTimeout(() => { try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { toast.error("Print failed."); } setTimeout(() => document.body.removeChild(iframe), 1000); }, 600);
    } else {
      const canvas = generatePoCanvas();
      if (!canvas) return;
      const a = document.createElement("a"); a.setAttribute("href", canvas.toDataURL(format === "png" ? "image/png" : "image/jpeg", 0.95));
      a.setAttribute("download", `${poNumber}.${format}`); document.body.appendChild(a); a.click(); a.remove();
    }
  };

  const openPoPreview = () => {
    if (!activePoVendor) { toast.error("No vendor context found."); return; }
    if (poItems.length === 0) { toast.error("Add at least one line item to preview."); return; }
    setIsPoPreviewOpen(true);
  };

  const buildPoMessageText = (): string => {
    const itemsLine = poItems.length === 1 ? "1 item" : poItems.length + " items";
    const lines = ["PURCHASE ORDER", "PO Number: " + poNumber, "Date: " + poDate, "Vendor: " + (activePoVendor?.name || ""), "Items: " + itemsLine, "Grand Total: Rs. " + totals.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 }), "Payment Terms: " + paymentTerms, "Material Status: " + materialStatus];
    if (remarks) lines.push("Remarks: " + remarks);
    lines.push("", "Please confirm receipt of this Purchase Order.", "", "- " + companyDetails.name);
    return lines.join("\n");
  };

  const openPoPlacedDialog = () => {
    if (!activePoVendor) { toast.error("No vendor context found."); return; }
    if (poItems.length === 0) { toast.error("Add at least one line item before placing the PO."); return; }
    setPlacePhone(activePoVendor.phone || ""); setPlaceSendWhatsapp(true); setPlaceSendEmail(false); setIsPoPlacedDialogOpen(true);
  };

  const handleConfirmPoPlaced = async () => {
    if (!activePoVendor) { toast.error("No vendor context found."); return; }
    if (!placeSendWhatsapp && !placeSendEmail) { toast.error("Select at least one channel."); return; }
    if (placeSendWhatsapp && !placePhone.trim()) { toast.error("Enter a WhatsApp number."); return; }
    if (placeSendEmail && !activePoVendor?.email?.trim()) { toast.error("Add an email to the vendor."); return; }
    triggerExport("pdf");
    const message = buildPoMessageText();
    const sentChannels: string[] = [];
    if (placeSendWhatsapp) { const cleanPhone = placePhone.replace(/[^\d]/g, ""); window.open("https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(message), "_blank"); sentChannels.push("WhatsApp"); }
    if (placeSendEmail) {
      const emailToast = toast.loading("Sending PO email...");
      const placedDoc = buildPoPdfDocument();
      if (!placedDoc) { toast.error("Unable to generate PO document.", { id: emailToast }); return; }
      const base64Pdf = placedDoc.output("datauristring").split(",")[1];
      const subject = `Purchase Order ${poNumber} from ${companyDetails.name}`;
      const emailHtml = `<p>Dear Vendor,</p><p>Please find attached our Purchase Order <strong>${poNumber}</strong> dated ${poDate}.</p><p><strong>Summary:</strong></p><ul><li><strong>Material Status:</strong> ${materialStatus}</li><li><strong>Payment Terms:</strong> ${paymentTerms}</li></ul><p>Best regards,<br>${companyDetails.name}</p>`;
      try {
        const res = await securityApi.settings.sendPoEmail({ vendorId: activePoVendor.id, subject, html: emailHtml, pdfBase64: base64Pdf, poNumber });
        if (res?.success) { sentChannels.push("Email"); toast.success("PO email sent!", { id: emailToast }); }
        else toast.error(res?.message || "Failed to send PO email.", { id: emailToast });
      } catch (err: any) { toast.error(err?.response?.data?.message || err?.message || "Error sending PO email.", { id: emailToast }); }
    }
    if (sentChannels.length === 0) return;
    setPoStatus("Placed");
    await handleSavePoRevision("Placed");
    toast.success("PO marked as Placed - sent via " + sentChannels.join(" & "));
    setIsPoPlacedDialogOpen(false);
  };

  // ── Row-level quick actions (⋮ menu on the PO table) ──────────────────
  // loadRevision() batches state updates, so PDF/email/excel generation must
  // wait until the next render — otherwise the generators read stale data.
  const [pendingRowAction, setPendingRowAction] = useState<string | null>(null);

  const runRowActionOnRevision = (rev: PORevision, action: "preview" | "pdf" | "email" | "excel") => {
    const v = vendors.find((x) => x.id === rev.vendorId);
    if (!v) { toast.error("Vendor not found for this PO."); return; }
    setActivePoVendor(v);
    loadRevision(rev);
    if (action === "preview") { setIsPoPreviewOpen(true); return; }
    setPendingRowAction(action);
  };

  // Builds a clean vector A4 purchase-order document (crisp text, real table).
  // Shared by "Save PO (PDF)" and "Send PO to Mail" so both produce identical,
  // well-formatted output instead of a blurry canvas screenshot.
  const buildPoPdfDocument = (): jsPDF | null => {
    if (!activePoVendor) return null;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 12;
    const contentW = pageW - marginX * 2;
    const inr = (n: any) => `Rs. ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    const currentRevision = revisions.find((r) => r.id === selectedRevisionId);
    const revisionNoStr = currentRevision ? `R${currentRevision.revisionNo}` : "R0";

    let y = 16;
    // ── Header ──
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(30, 58, 138);
    doc.text((companyDetails.name || "").toUpperCase(), marginX, y);
    doc.setTextColor(17, 24, 39); doc.setFontSize(20);
    doc.text("PURCHASE ORDER", pageW - marginX, y, { align: "right" });

    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(75, 85, 99);
    y += 5.5;
    const companyLines = [
      companyDetails.address || "",
      `Phone: ${companyDetails.phone || "-"}  |  Email: ${companyDetails.email || "-"}`,
      `GSTIN: ${companyDetails.gstin || "-"}${companyDetails.iso ? `  |  ${companyDetails.iso}` : ""}${companyDetails.division ? `  |  Dept: ${companyDetails.division}` : ""}`,
    ].filter(Boolean) as string[];
    companyLines.forEach((line) => { doc.text(line, marginX, y); y += 4.2; });

    let ry = 21.5;
    doc.setFontSize(9.5); doc.setTextColor(17, 24, 39);
    [`PO Number: ${poNumber}`, `Date: ${poDate}`, `Revision: ${revisionNoStr}`, ...(referenceCode ? [`Reference Code: ${referenceCode}`] : [])].forEach((line) => {
      doc.text(line, pageW - marginX, ry, { align: "right" }); ry += 4.6;
    });

    y = Math.max(y + 1.5, ry) ;
    doc.setDrawColor(17, 24, 39); doc.setLineWidth(0.5);
    doc.line(marginX, y, pageW - marginX, y);

    // ── Vendor / delivery meta blocks ──
    y += 7;
    const colSplit = marginX + contentW * 0.55;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(37, 99, 235);
    doc.text("ORDER PLACED TO (VENDOR):", marginX, y);
    doc.text("DELIVERY & SHIPPING TERMS:", colSplit, y);
    doc.setFontSize(9); doc.setTextColor(31, 41, 55);
    let vy = y + 5;
    doc.setFont("helvetica", "bold");
    doc.text(activePoVendor.name || "-", marginX, vy);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(75, 85, 99);
    [
      `Category: ${activePoVendor.category || "-"}`,
      `Phone: ${activePoVendor.phone || "-"}  |  Email: ${activePoVendor.email || "-"}`,
      `GSTIN: ${activePoVendor.gstNumber || "-"}`,
    ].forEach((line) => { vy += 4.2; doc.text(line, marginX, vy); });
    let ty = y + 5;
    doc.setFontSize(9); doc.setTextColor(31, 41, 55);
    [
      `Material Status: ${materialStatus || "-"}`,
      `Payment Terms: ${paymentTerms || "-"}`,
      `Remarks: ${remarks || "None"}`,
    ].forEach((line) => { doc.text(line, colSplit, ty); ty += 4.6; });
    y = Math.max(vy, ty) + 3;

    // ── Line items table ──
    const printColumns = orderedPoColumnIds.filter((id) => id !== "delete");
    const head = printColumns.map((id) => getPoColumnLabel(id));
    const body = poItems.map((item, idx) => printColumns.map((id) => {
      if (id === "sno") return String(idx + 1);
      const field = inventoryFieldsMap.get(id);
      const val = item[id];
      const isPrice = id === "net" || id === "total" || id === "rate" || (field?.label.toLowerCase().includes("price") && typeof val === "number");
      if (isPrice) return inr(val);
      return val !== undefined && val !== null && String(val).length > 0 ? String(val) : "-";
    }));
    autoTable(doc, {
      startY: y,
      head: [head],
      body: body.length > 0 ? body : [printColumns.map(() => "")],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.8, lineColor: [229, 231, 235], textColor: [31, 41, 55] },
      headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: [250, 250, 251] },
      columnStyles: Object.fromEntries(
        printColumns.map((id, i) => {
          const field = inventoryFieldsMap.get(id);
          const isPrice = id === "net" || id === "total" || id === "rate";
          const isNumber = isPrice || id === "qty" || id === "discountPercent" || id === "sno" || field?.type === "NUMBER";
          return [i, { halign: isNumber ? "right" : "left", ...(id === "sno" ? { cellWidth: 10 } : {}) }];
        }),
      ),
      margin: { left: marginX, right: marginX },
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 6;

    // ── Totals (right) & terms (left) ──
    const totalsRows: Array<[string, string, boolean?]> = [
      ["Subtotal:", inr(totals.subtotal)],
      [`CGST (${cgstPercent}%):`, inr(totals.cgstAmt)],
      [`SGST (${sgstPercent}%):`, inr(totals.sgstAmt)],
      [`IGST (${igstPercent}%):`, inr(totals.igstAmt)],
      ["Grand Total:", inr(totals.grandTotal), true],
      ["Advance Paid:", inr(advance)],
      ["Balance Due:", inr(totals.balance), true],
    ];
    const boxX = pageW - marginX - 78;
    doc.setFontSize(9);
    totalsRows.forEach(([label, value, strong]) => {
      doc.setFont("helvetica", strong ? "bold" : "normal");
      doc.setTextColor(strong ? 17 : 75, strong ? 24 : 85, strong ? 39 : 99);
      doc.text(label, boxX, y);
      doc.text(value, pageW - marginX, y, { align: "right" });
      y += 5;
    });

    let termsY = y - totalsRows.length * 5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(31, 41, 55);
    doc.text("TERMS & CONDITIONS:", marginX, termsY);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(75, 85, 99);
    const termsLines = doc.splitTextToSize(terms || "—", boxX - marginX - 8);
    termsLines.forEach((line: string) => { termsY += 4; doc.text(line, marginX, termsY); });

    // ── Signature section ──
    let sigY = Math.max(y, termsY) + 18;
    if (sigY > doc.internal.pageSize.getHeight() - 25) { doc.addPage(); sigY = 25; }
    doc.setDrawColor(17, 24, 39); doc.setLineWidth(0.3);
    doc.line(marginX, sigY, marginX + 60, sigY);
    doc.line(pageW - marginX - 60, sigY, pageW - marginX, sigY);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(75, 85, 99);
    doc.text(`Prepared By: ${companyDetails.name || "-"}`, marginX, sigY + 4.5);
    doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
    doc.text(companyDetails.signatory || "Authorized Signatory", pageW - marginX - 30, sigY + 4.5, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(107, 114, 128);
    doc.text("Authorized Signatory", pageW - marginX - 30, sigY + 8, { align: "center" });

    return doc;
  };

  const downloadPoPdf = () => {
    if (!canExport) { toast.error("You do not have export permission."); return; }
    if (!activePoVendor) { toast.error("No vendor context found."); return; }
    const doc = buildPoPdfDocument();
    if (!doc) { toast.error("Unable to generate PO document."); return; }
    doc.save(`${poNumber || "purchase-order"}.pdf`);
    toast.success("PO PDF saved to your downloads folder.");
  };

  const sendPoEmailDirect = async () => {
    if (!activePoVendor) { toast.error("No vendor context found."); return; }
    if (!activePoVendor.email?.trim()) { toast.error("This vendor has no email address on file."); return; }
    const emailToast = toast.loading("Sending PO email...");
    try {
      const doc = buildPoPdfDocument();
      if (!doc) { toast.error("Unable to generate PO document.", { id: emailToast }); return; }
      const base64Pdf = doc.output("datauristring").split(",")[1];
      const subject = `Purchase Order ${poNumber} from ${companyDetails.name}`;
      const emailHtml = `<p>Dear Vendor,</p><p>Please find attached our Purchase Order <strong>${poNumber}</strong> dated ${poDate}.</p><p><strong>Summary:</strong></p><ul><li><strong>Material Status:</strong> ${materialStatus}</li><li><strong>Payment Terms:</strong> ${paymentTerms}</li></ul><p>Best regards,<br>${companyDetails.name}</p>`;
      const res = await securityApi.settings.sendPoEmail({ vendorId: activePoVendor.id, subject, html: emailHtml, pdfBase64: base64Pdf, poNumber });
      if (res?.success) toast.success(`PO emailed to ${activePoVendor.email}`, { id: emailToast });
      else toast.error(res?.message || "Failed to send PO email.", { id: emailToast });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Error sending PO email.", { id: emailToast });
    }
  };

  const exportPoItemsExcel = () => {
    if (!canExport) { toast.error("You do not have export permission."); return; }
    if (poItems.length === 0) { toast.error("No line items to export."); return; }
    // "sno" is excluded because we add our own S.No column — including it
    // produced a duplicated serial-number column in the export.
    const itemCols = orderedPoColumnIds.filter((id) => id !== "delete" && id !== "sno");
    const headers = ["S.No", ...itemCols.map((id) => getPoColumnLabel(id))];
    const rows = poItems.map((item, idx) => [
      idx + 1,
      ...itemCols.map((id) => {
        if (id === "qty") return Number(item.qty) || 0;
        if (id === "discountPercent") return item.discountPercent ?? 0;
        if (id === "net") return item.net ?? 0;
        if (id === "total") return item.total ?? 0;
        return (item as any)[id] ?? "";
      }),
    ]);
    const lastColIdx = headers.length - 1;
    const padToLast = (label: string, value: number) => {
      const row: any[] = [label];
      for (let i = 1; i < lastColIdx; i++) row.push("");
      row.push(value);
      return row;
    };
    const summary = [
      [],
      padToLast("Subtotal", totals.subtotal),
      padToLast(`CGST (${cgstPercent}%)`, totals.cgstAmt),
      padToLast(`SGST (${sgstPercent}%)`, totals.sgstAmt),
      padToLast(`IGST (${igstPercent}%)`, totals.igstAmt),
      padToLast("Grand Total", totals.grandTotal),
      padToLast("Advance Paid", advance),
      padToLast("Balance Due", totals.balance),
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows, ...summary]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PO Items");
    XLSX.writeFile(wb, `${poNumber || "purchase-order"}-line-items.xlsx`);
    toast.success("PO line items exported to Excel.");
  };

  React.useEffect(() => {
    if (!pendingRowAction) return;
    const action = pendingRowAction;
    setPendingRowAction(null);
    if (action === "pdf") downloadPoPdf();
    else if (action === "email") void sendPoEmailDirect();
    else if (action === "excel") exportPoItemsExcel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRowAction]);

  const handlePoColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const isPoColumnDraggable = (id: string) => id !== "sno" && id !== "delete" && id !== "qty" && id !== "discountPercent" && id !== "total";
    if (!isPoColumnDraggable(activeId) || !isPoColumnDraggable(overId)) return;
    const oldIndex = orderedPoColumnIds.indexOf(activeId);
    const newIndex = orderedPoColumnIds.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;
    setPoColumnOrder(arrayMove(orderedPoColumnIds, oldIndex, newIndex));
  };

  const renderPoHeader = (id: string) => {
    const label = getPoColumnLabel(id);
    const className = getPoColumnClassName(id);
    const width = getPoColumnWidth(id);
    if (id === "sno" || id === "delete" || id === "qty" || id === "discountPercent" || id === "total") {
      return <th key={id} className={className} style={{ width, minWidth: width }}>{label}</th>;
    }
    if (id.startsWith("custom_")) {
      return (
        <SortableHeaderCell key={id} id={id} className={className} width={width}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", width: "100%" }}>
            <span>{getCustomColumnName(id)}</span>
            <button type="button" onClick={() => handleRemoveCustomColumn(getCustomColumnName(id))} style={{ color: "#ef4444", cursor: "pointer", border: "none", background: "none", fontSize: "12px", fontWeight: "bold" }} title={`Remove column ${getCustomColumnName(id)}`}>✕</button>
          </div>
        </SortableHeaderCell>
      );
    }
    return <SortableHeaderCell key={id} id={id} className={className} width={width}>{label}</SortableHeaderCell>;
  };

  const renderPoCell = (item: POItem, id: string, idx: number) => {
    if (id === "sno") return <td key={id} style={{ textAlign: "center", fontWeight: "bold" }}>{idx + 1}</td>;
    if (inventoryFieldsMap.has(id)) {
      const field = inventoryFieldsMap.get(id);
      const val = item[id] || "";
      const isNumber = field?.type === "NUMBER";
      return (
        <td key={id} style={{ position: "relative", overflow: "visible" }}>
          <input type={isNumber ? "number" : "text"} value={val}
            onChange={(e) => { const typedVal = e.target.value; updatePoItemField(item.id, id, typedVal); setInventoryDropdownRowId(`${item.id}_${id}`); if (typedVal.trim()) { const matches = getInventoryMatches(typedVal); const exactMatch = matches.find((inv) => { const fv = getRecordValue(inv.values, inventoryFieldsMap.get(id)); return String(fv || "").trim().toLowerCase() === typedVal.trim().toLowerCase(); }); if (exactMatch) applyInventoryItemToRow(item.id, exactMatch); } }}
            onFocus={() => setInventoryDropdownRowId(`${item.id}_${id}`)}
            onBlur={() => { const cv = item[id] || ""; if (String(cv).trim()) { const matches = getInventoryMatches(String(cv)); const exactMatch = matches.find((inv) => { const fv = getRecordValue(inv.values, inventoryFieldsMap.get(id)); return String(fv || "").trim().toLowerCase() === String(cv).trim().toLowerCase(); }); if (exactMatch) applyInventoryItemToRow(item.id, exactMatch); } setTimeout(() => setInventoryDropdownRowId((prev) => prev === `${item.id}_${id}` ? null : prev), 150); }}
            placeholder={field?.placeholder || field?.label || ""} autoComplete="off"
          />
          {inventoryDropdownRowId === `${item.id}_${id}` && (
            <div className="absolute left-0 top-full mt-1 w-72 rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 z-50" onMouseDown={(e) => e.preventDefault()}>
              <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-muted/30"><Package className="size-3.5 text-muted-foreground" /><span className="text-[11px] font-semibold text-muted-foreground">INVENTORY MATCHES</span></div>
              <div className="max-h-64 overflow-y-auto divide-y">
                {getInventoryMatches(String(val)).length === 0 && <div className="p-3 text-center text-xs text-muted-foreground">No matching items.</div>}
                {getInventoryMatches(String(val)).map((inv) => {
                  const pf = inventoryFields[0]; const nameVal = getRecordValue(inv.values, pf); const dn = nameVal || Object.values(inv.values || {})[0] || "Unnamed";
                  const priceField = inventoryFields.find((f) => f.label.toLowerCase().includes("price") || f.label.toLowerCase().includes("rate"));
                  const priceVal = priceField ? Number(getRecordValue(inv.values, priceField)) || 0 : 0;
                  return (
                    <button type="button" key={inv.id} onClick={() => applyInventoryItemToRow(item.id, inv)} className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40 text-left transition-colors">
                      <div className="min-w-0"><div className="text-xs font-semibold text-foreground truncate">{dn}</div></div>
                      {priceVal > 0 && <div className="text-xs font-bold text-[#137333] shrink-0">₹{priceVal.toLocaleString("en-IN")}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </td>
      );
    }
    if (id === "qty") return <td key={id}><input type="number" min={0.01} step="any" value={item.qty === "" ? "" : item.qty} onChange={(e) => updatePoItemField(item.id, "qty", e.target.value)} /></td>;
    if (id === "rate") return <td key={id}><input type="number" value={item.rate === 0 ? "" : item.rate} onChange={(e) => updatePoItemField(item.id, "rate", Number(e.target.value) || 0)} placeholder="0" /></td>;
    if (id === "discountPercent") return <td key={id}><input type="number" value={item.discountPercent === 0 ? "" : item.discountPercent} onChange={(e) => updatePoItemField(item.id, "discountPercent", Number(e.target.value) || 0)} placeholder="0" /></td>;
    if (id === "net") return <td key={id} className="td-net">₹{(item.net || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>;
    if (id === "total") return <td key={id} className="td-total">₹{(item.total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>;
    if (id === "delete") return <td key={id} style={{ textAlign: "center" }}><button type="button" className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md inline-flex items-center justify-center" onClick={() => handleDeletePoRow(item.id)} style={{ border: "none", background: "transparent", cursor: "pointer" }}><Trash2 className="size-4" /></button></td>;
    if (id.startsWith("custom_")) { const key = getCustomColumnName(id); return <td key={id}><input type="text" value={item[key] || ""} onChange={(e) => updatePoItemField(item.id, key, e.target.value)} /></td>; }
    return <td key={id}>{item[id] ?? ""}</td>;
  };

  const filteredPoRevisions = useMemo(() => {
    let result = revisions;
    const q = globalSearch.trim().toLowerCase();
    if (q) {
      result = result.filter((r) => (r.poNumber ?? "").toLowerCase().includes(q) || (r.poStatus ?? "").toLowerCase().includes(q) || (r.createdBy ?? "").toLowerCase().includes(q) || (r.referenceCode ?? "").toLowerCase().includes(q));
    }
    const fq = fieldSearch.trim().toLowerCase();
    if (fq && searchField !== "all") {
      result = result.filter((r) => {
        if (searchField === "poNo") return (r.poNumber ?? "").toLowerCase().includes(fq);
        if (searchField === "status") return (r.poStatus ?? "").toLowerCase().includes(fq);
        if (searchField === "vendor") { const v = vendors.find((v) => v.id === r.vendorId); return (v?.name ?? "").toLowerCase().includes(fq); }
        return true;
      });
    }
    // One row per PO: keep only the LATEST revision of each PO number.
    // Older revisions remain accessible via the Revision History panel.
    const seen = new Set<string>();
    return result
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((r) => {
        if (seen.has(r.poNumber)) return false;
        seen.add(r.poNumber);
        return true;
      });
  }, [revisions, globalSearch, fieldSearch, searchField, vendors]);

  const activePoRevisions = useMemo(() => {
    if (!activePoVendor) return [];
    return revisions.filter((r) => r.vendorId === activePoVendor.id && r.poNumber === poNumber).sort((a, b) => b.revisionNo - a.revisionNo);
  }, [revisions, activePoVendor, poNumber]);

  const tableColumns = useMemo(() => [
    { accessorKey: "poNumber", header: sortableHeader("PO Number") },
    {
      accessorKey: "vendorId", header: "Vendor",
      cell: ({ row }: any) => { const rev = row.original as PORevision; const v = vendors.find((v) => v.id === rev.vendorId); return v?.name || "—"; },
    },
    { accessorKey: "poDate", header: "Date", cell: ({ getValue }: any) => { const d = getValue() as string; return d ? new Date(d).toLocaleDateString("en-IN") : "—"; } },
    { accessorKey: "poStatus", header: "Status", cell: ({ getValue }: any) => { const s = getValue() as string; const colors: Record<string, string> = { Pending: "bg-slate-500/10 text-slate-600", Ready: "bg-blue-500/10 text-blue-600", Placed: "bg-green-500/10 text-green-600", Ordered: "bg-indigo-500/10 text-indigo-600", Cancelled: "bg-red-500/10 text-red-600", "Partially Received": "bg-amber-500/10 text-amber-600", Received: "bg-emerald-500/10 text-emerald-600", "Needs Revision": "bg-orange-500/10 text-orange-600" }; return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${colors[s] || "bg-gray-100 text-gray-600"}`}>{s || "—"}</span>; } },
    {
      accessorKey: "grandTotal", header: "Grand Total",
      cell: ({ getValue }: any) => `₹${Number(getValue() || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    },
    {
      accessorKey: "revisionNo", header: "Rev",
      cell: ({ getValue }: any) => <span className="text-xs font-mono text-muted-foreground">R{getValue()}</span>,
    },
    {
      accessorKey: "createdAt", header: "Created",
      cell: ({ getValue }: any) => { const d = getValue() as string; return d ? new Date(d).toLocaleDateString("en-IN") : "—"; },
    },
    {
      id: "actions", header: "Actions",
      cell: ({ row }: any) => {
        const rev = row.original as PORevision;
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
                    aria-label="Actions"
                    title="Actions"
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
                <DropdownMenuItem
                  onClick={() => {
                    const v = vendors.find((v) => v.id === rev.vendorId);
                    if (v) {
                      setActivePoVendor(v);
                      loadRevision(rev);
                      setIsDataEntryOpen(true);
                    }
                  }}
                  className="gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold cursor-pointer text-amber-600 dark:text-amber-400 focus:text-amber-600 dark:focus:text-amber-400"
                >
                  <Edit className="h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => runRowActionOnRevision(rev, "preview")}
                  className="gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold cursor-pointer"
                >
                  <Eye className="h-3.5 w-3.5 text-primary" />
                  View / Print Preview
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => runRowActionOnRevision(rev, "pdf")}
                  className="gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold cursor-pointer"
                >
                  <FileDown className="h-3.5 w-3.5 text-primary" />
                  Save PO (PDF)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => runRowActionOnRevision(rev, "email")}
                  className="gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold cursor-pointer"
                >
                  <Mail className="h-3.5 w-3.5 text-primary" />
                  Send PO to Mail
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => runRowActionOnRevision(rev, "excel")}
                  className="gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold cursor-pointer"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                  Excel Download
                </DropdownMenuItem>
                {canDelete && (
                  <>
                    <div className="-mx-1 my-1 h-px bg-border" />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setRevisionToDelete(rev.id);
                        setDeleteRevisionConfirmOpen(true);
                      }}
                      className="gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
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
    },
  ] as any[], [vendors, canDelete]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3">
          {linkedOrderId && (
            <button
              onClick={() => navigate(`/orders/${linkedOrderId}?tab=workflow`)}
              className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <ArrowLeft className="size-4" /> Back to Order
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xl">📋</div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
              <p className="mt-1 text-xs text-muted-foreground">{new Set(revisions.map((r) => r.poNumber)).size} purchase orders • {revisions.length} revisions in history</p>
            </div>
          </div>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <Button onClick={() => fetchAllData()} variant="outline" size="sm" className="gap-2 font-medium h-10 rounded-lg px-4">
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button onClick={() => { setIsRevisionsPanelOpen(true); setRevisionSearch(""); }} variant="outline" size="sm" className="gap-2 font-medium h-10 rounded-lg px-4">
              <History className="size-4" /> Revision History
            </Button>
            <Button onClick={() => openNewDataEntry(null)} className="gap-2 bg-primary text-white font-semibold h-10 rounded-lg px-4">
              <Plus className="size-4" /> New PO
            </Button>
          </div>
        )}
      </div>

      {/* Linked sales-order reference banner (deep-link from Orders page) */}
      {linkedRefCode && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-blue-500/25 bg-blue-500/5 px-4 py-3">
          <p className="text-xs font-semibold text-foreground flex items-center gap-2 flex-wrap">
            {linkedMode === "view" ? "Viewing purchase order" : "Generating purchase order"} for Sales
            Order Reference:{" "}
            <span className="font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
              {linkedRefCode || linkedOrderId}
            </span>
            {linkedOrderId && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded-full">
                JO-linked (direct)
              </span>
            )}
          </p>
          <button
            onClick={clearLinkedPoParams}
            className="text-xs font-semibold text-muted-foreground hover:text-rose-500 transition-colors"
          >
            ✕ Clear link
          </button>
        </div>
      )}

      {/* Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center w-full sm:w-72 h-10 bg-card border border-primary/50 rounded-sm shadow-xs hover:border-primary/30 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all duration-200 overflow-hidden">
            <Search className="size-4 text-muted-foreground ml-4 mr-2 shrink-0" />
            <input type="text" placeholder="Search all POs..." className="flex-1 h-full bg-transparent pr-4 text-sm placeholder:text-muted-foreground focus:outline-none border-none ring-0 outline-none" value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} />
          </div>
          <div className="flex items-center w-full sm:w-[280px] h-10 bg-card border border-primary/50 rounded-sm shadow-xs hover:border-primary/30 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all duration-200 overflow-hidden">
            <Select value={searchField} onValueChange={(val) => { setSearchField(val as any); setFieldSearch(""); }}>
              <SelectTrigger className="border-none shadow-none focus:ring-0 focus:ring-offset-0 w-[120px] h-full pl-4 pr-1 text-xs font-semibold text-muted-foreground bg-transparent hover:text-foreground cursor-pointer transition-colors shrink-0">
                <SelectValue placeholder="Filter by">
                  {(value) => { if (value === "all") return "Filter By"; if (value === "poNo") return "PO Number"; if (value === "status") return "Status"; if (value === "vendor") return "Vendor"; return value || ""; }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Filter By</SelectItem>
                <SelectItem value="poNo">PO Number</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="vendor">Vendor</SelectItem>
              </SelectContent>
            </Select>
            <div className="w-px h-5 bg-border shrink-0" />
            <input type="text" className="flex-1 h-full bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none border-none ring-0 outline-none" disabled={searchField === "all"} placeholder={searchField === "all" ? "Select a filter..." : `Search by ${searchField}...`} value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total POs</div>
          <div className="text-2xl font-bold text-foreground mt-1">{new Set(revisions.map((r) => r.poNumber)).size}</div>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total PO Value</div>
          <div className="text-2xl font-bold text-foreground mt-1">₹{revisions.reduce((sum, r) => sum + (r.grandTotal || 0), 0).toLocaleString("en-IN", { minimumFractionDigits: 0 })}</div>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Revisions</div>
          <div className="text-2xl font-bold text-foreground mt-1">{revisions.length}</div>
        </div>
      </div>

      {/* PO Revisions Table */}
      <GenericTable columns={tableColumns} data={filteredPoRevisions} storageKey="purchaseOrders" />

      {/* ── DATA ENTRY PANEL ── */}
      {isDataEntryOpen && (
        <div className="de-overlay" style={deMaximized ? { padding: 0 } : undefined}>
          <div className={`de-modal ${deMaximized ? "rounded-none" : ""}`} style={deMaximized ? { width: "100vw", height: "100vh", maxWidth: "100vw", maxHeight: "100vh" } : undefined}>
            {deMaximized && (
              <div className="de-restore-bar">
                <span>⛶ Table Maximized — <strong>{activePoVendor?.name}</strong></span>
                <button className="de-restore-btn" onClick={() => setDeMaximized(false)}>✕ Restore</button>
              </div>
            )}

            {/* Header */}
            <div className="de-header">
              <div className="de-header-left">
                <div className="de-header-icon">📋</div>
                <div>
                  <div className="de-header-title">Data Entry — Purchase Order</div>
                  <div className="de-header-sub">
                    {activePoVendor ? (
                      <>Vendor: <strong className="de-vendor-accent">{activePoVendor.name}</strong></>
                    ) : (
                      <span style={{ color: "#f59e0b" }}>Select a vendor to continue</span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="de-status-pill">Draft</span>
                <button className="de-close-btn" onClick={() => { setIsDataEntryOpen(false); setActivePoVendor(null); }}>✕</button>
              </div>
            </div>

            {/* Steps */}
            <div className="de-steps">
              <div className={`de-step ${activePoVendor ? "done" : "active"}`}><span className={`de-step-dot ${activePoVendor ? "done-dot" : "active-dot"}`}>{activePoVendor ? "✓" : "1"}</span><span>Vendor Selected</span></div>
              <div className={`de-step-line ${activePoVendor ? "done-line" : ""}`}></div>
              <div className={`de-step ${activePoVendor ? "active" : "inactive"}`}><span className={`de-step-dot ${activePoVendor ? "active-dot" : "inactive-dot"}`}>{activePoVendor ? "2" : "2"}</span><span>Data Entry</span></div>
              <div className="de-step-line"></div>
              <div className="de-step inactive"><span className="de-step-dot inactive-dot">3</span><span>Export</span></div>
            </div>

            {/* Revisions Bar */}
            <div className="de-revision-bar">
              <span className="de-rev-label">📁 REVISIONS:</span>
              <div className="de-rev-pills">
                {activePoRevisions.map((rev) => (
                  <span key={rev.id} onClick={() => loadRevision(rev)} className={`de-rev-pill ${selectedRevisionId === rev.id ? "active" : ""}`}>R{rev.revisionNo}</span>
                ))}
                {activePoRevisions.length === 0 && <span className="de-rev-pill">R0</span>}
              </div>
              <button
                type="button"
                onClick={() => { setIsRevisionsPanelOpen(true); setRevisionSearch(""); }}
                style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}
                title="Open the full revision history for every PO"
              >
                🕘 View all revisions
              </button>
            </div>

            {/* Form Body */}
            <div className="flex-1 overflow-y-auto">
              {/* Company Details */}
              <div className="de-company-section">
                <div className="de-company-section-title">🏢 OUR COMPANY DETAILS (FOR PO HEADER)</div>
                <div className="de-company-grid">
                  <div className="de-po-field"><label>Company Name</label><input type="text" value={companyDetails.name} onChange={(e) => setCompanyDetails({ ...companyDetails, name: e.target.value })} placeholder="e.g. D.V. Electromatic Pvt. Ltd." /></div>
                  <div className="de-po-field"><label>Company Address</label><input type="text" value={companyDetails.address} onChange={(e) => setCompanyDetails({ ...companyDetails, address: e.target.value })} placeholder="F-003, Industrial Growth Centre…" /></div>
                  <div className="de-po-field"><label>Company Phone</label><input type="text" value={companyDetails.phone} onChange={(e) => setCompanyDetails({ ...companyDetails, phone: e.target.value })} placeholder="+91 92572-17609" /></div>
                  <div className="de-po-field"><label>Company Email</label><input type="text" value={companyDetails.email} onChange={(e) => setCompanyDetails({ ...companyDetails, email: e.target.value })} placeholder="office@dvepl.com" /></div>
                  <div className="de-po-field"><label>Company GSTIN</label><input type="text" value={companyDetails.gstin} onChange={(e) => setCompanyDetails({ ...companyDetails, gstin: e.target.value })} placeholder="03AABCD4308A1ZL" /></div>
                  <div className="de-po-field"><label>ISO / Certification</label><input type="text" value={companyDetails.iso} onChange={(e) => setCompanyDetails({ ...companyDetails, iso: e.target.value })} placeholder="AN ISO 9001:2008 CERTIFIED CO." /></div>
                  <div className="de-po-field"><label>Authorized Signatory</label><input type="text" value={companyDetails.signatory} onChange={(e) => setCompanyDetails({ ...companyDetails, signatory: e.target.value })} placeholder="Name of signatory" /></div>
                  <div className="de-po-field"><label>Division / Dept</label><input type="text" value={companyDetails.division} onChange={(e) => setCompanyDetails({ ...companyDetails, division: e.target.value })} placeholder="Industrial Division" /></div>
                </div>
              </div>

              {/* PO Header */}
              <div className="de-po-header">
                <div className="de-po-field"><label>Order Place To *</label>
                  <select value={activePoVendor?.id || ""} onChange={(e) => { const v = vendors.find((v) => v.id === e.target.value); if (v) setActivePoVendor(v); }} style={!activePoVendor ? { borderColor: "#f59e0b" } : undefined}>
                    <option value="">— Select Vendor —</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  {!activePoVendor && <span style={{ color: "#f59e0b", fontSize: "11px", marginTop: "2px" }}>Vendor is required</span>}
                </div>
                <div className="de-po-field"><label>PO Number *</label><input type="text" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="e.g. PO-2025-001" style={!poNumber.trim() ? { borderColor: "#f59e0b" } : undefined} />{!poNumber.trim() && <span style={{ color: "#f59e0b", fontSize: "11px", marginTop: "2px" }}>PO Number is required</span>}</div>
                <div className="de-po-field"><label>PO Date *</label><input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} style={!poDate ? { borderColor: "#f59e0b" } : undefined} />{!poDate && <span style={{ color: "#f59e0b", fontSize: "11px", marginTop: "2px" }}>PO Date is required</span>}</div>
                <div className="de-po-field"><label>Reference Code</label><input type="text" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} placeholder="e.g. REF-2026-001" /></div>
                <div className="de-po-field"><label>PO Status</label><select value={poStatus} onChange={(e) => setPoStatus(e.target.value)}><option value="Pending">Pending</option><option value="Ready">Ready</option><option value="Needs Revision">Needs Revision</option><option value="Placed">Placed</option><option value="Ordered">Ordered</option><option value="Partially Received">Partially Received</option><option value="Received">Received</option><option value="Cancelled">Cancelled</option></select></div>
                <div className="de-po-field"><label>Payment Terms</label><input type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 30 days net / 50% Advance" /></div>
                <div className="de-po-field"><label>Material Status</label><select value={materialStatus} onChange={(e) => setMaterialStatus(e.target.value)}><option value="Pending">Pending</option><option value="Ordered">Ordered</option><option value="In Transit">In Transit</option><option value="Received">Received</option><option value="Ready for Dispatch">Ready for Dispatch</option></select></div>
                <div className="de-po-field"><label>Advance (₹)</label><input type="number" min={0} value={advance} onChange={(e) => { const val = Math.max(0, Number(e.target.value) || 0); setAdvance(val); }} placeholder="0.00" style={advance > totals.grandTotal && totals.grandTotal > 0 ? { borderColor: "#ef4444" } : undefined} />{advance > totals.grandTotal && totals.grandTotal > 0 && <span style={{ color: "#ef4444", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>⚠ Advance exceeds grand total</span>}</div>
                <div className="de-po-field"><label>Remarks</label><input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any remarks…" /></div>
                <div className="de-po-field">
                  <label>Order Type</label>
                  <input type="text" value={orderType} disabled style={{ background: linkedSalesOrderId ? "#ecfdf5" : "#f1f5f9", border: "1px solid #cbd5e1", fontWeight: 600, color: linkedSalesOrderId ? "#137333" : undefined }} />
                </div>
                <div className="de-po-field">
                  <label>Linked Sales Order {linkedSalesOrderId ? "(JO Order PO)" : "(Stock Order)"}</label>
                  <select value={linkedSalesOrderId} onChange={(e) => setLinkedSalesOrderId(e.target.value)}>
                    <option value="">— None (Stock Order) —</option>
                    {salesOrders.map((so: any) => (
                      <option key={so.id} value={so.id}>{so.dveplCode || so.orderNo || so.caNo || so.partyName || so.id}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tax Section */}
              <div className="de-tax-section">
                <span className="de-tax-label">📊 TAX:</span>
                <div className="de-tax-field"><label>CGST %</label><input type="number" min={0} max={100} value={cgstPercent} onChange={(e) => setCgstPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /></div>
                <div className="de-tax-field"><label>SGST %</label><input type="number" min={0} max={100} value={sgstPercent} onChange={(e) => setSgstPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /></div>
                <div className="de-tax-field"><label>IGST %</label><input type="number" min={0} max={100} value={igstPercent} onChange={(e) => setIgstPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /></div>
                <div className="de-fin-sep"></div>
                <div className="de-fin-item"><span>Subtotal:</span> <strong>₹{totals.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></div>
                <div className="de-fin-sep"></div>
                <div className="de-fin-item"><span>CGST:</span> <strong>₹{totals.cgstAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></div>
                <div className="de-fin-item"><span>SGST:</span> <strong>₹{totals.sgstAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></div>
                <div className="de-fin-item"><span>IGST:</span> <strong>₹{totals.igstAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></div>
                <div className="de-fin-sep"></div>
                <div className="de-fin-item"><span>Grand Total:</span> <strong style={{ color: "#1e4620", fontSize: "15px" }}>₹{totals.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></div>
              </div>

              {/* Terms */}
              <div className="de-terms-section">
                <div className="de-terms-title">📜 TERMS &amp; CONDITIONS (SHOWN ON PO)</div>
                <textarea className="de-terms-textarea" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Terms..."></textarea>
              </div>

              {/* Toolbar */}
              <div className="de-toolbar">
                <span className="de-toolbar-label">LINE ITEMS</span>
                <button className="de-tbtn" onClick={handleAddPoRow}>➕ Add Row</button>
                <button className="de-tbtn" onClick={handleImportExcelClick} disabled={isImportingExcel}>{isImportingExcel ? "⏳ Importing..." : "📥 Import Excel"}</button>
                <button className="de-tbtn" onClick={handleDownloadPoItemsTemplate} title="Download template">📄 Template</button>
                <input ref={excelImportInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleExcelFileChange} />
                <button className="de-tbtn" onClick={handleDuplicateLastRow}>📋 Duplicate Last</button>
                <div className="de-tbtn-sep"></div>
                <button className="de-tbtn de-tbtn-danger" onClick={handleClearAllRows}>🗑️ Clear All</button>
                <div style={{ flex: 1 }}></div>
                <span className="de-row-count">{poItems.length} items</span>
                <div className="de-tbtn-sep"></div>
                {isAddingCol ? (
                  <div className="flex items-center gap-1">
                    <input type="text" value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="Column name" className="de-tbtn" style={{ padding: "4px 8px", fontSize: "12px" }} onKeyDown={(e) => { if (e.key === "Enter") handleAddCustomColumn(); if (e.key === "Escape") { setIsAddingCol(false); setNewColName(""); } }} autoFocus />
                    <button className="de-tbtn" onClick={handleAddCustomColumn} style={{ padding: "4px 8px" }}>✓</button>
                    <button className="de-tbtn" onClick={() => { setIsAddingCol(false); setNewColName(""); }} style={{ padding: "4px 8px" }}>✕</button>
                  </div>
                ) : (
                  <button className="de-tbtn" onClick={() => setIsAddingCol(true)}>➕ Add Column</button>
                )}
                <button className="de-tbtn de-maximize-btn" onClick={() => setDeMaximized(!deMaximized)}>⛶ Maximize</button>
              </div>

              {/* Line Items Table */}
              <div className="de-table-wrap">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePoColumnDragEnd}>
                  <SortableContext items={orderedPoColumnIds} strategy={horizontalListSortingStrategy}>
                    <table className="de-table">
                      <thead><tr>{orderedPoColumnIds.map((id) => renderPoHeader(id))}</tr></thead>
                      <tbody>
                        {poItems.map((item, idx) => <tr key={item.id}>{orderedPoColumnIds.map((id) => renderPoCell(item, id, idx))}</tr>)}
                        {poItems.length === 0 && <tr><td colSpan={orderedPoColumnIds.length} style={{ padding: "24px", textAlign: "center", color: "#9ca3af", fontSize: "14px" }}>No items added yet. Click "Add Row" or search/type in the description to start.</td></tr>}
                      </tbody>
                      <tfoot><tr className="de-tfoot-row"><td colSpan={orderedPoColumnIds.length} className="p-3 text-right"><div className="flex items-center justify-end gap-6 text-sm font-bold text-foreground"><span>Total items: <span className="text-primary">{poItems.length}</span></span><span>Grand Total (excl. tax): <span className="text-[#137333]">₹{totals.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></span></div></td></tr></tfoot>
                    </table>
                  </SortableContext>
                </DndContext>
              </div>
            </div>

            {/* Finance Bar */}
            <div className="de-finance-bar">
              <div className="de-fin-item"><span>Total Amount:</span> <strong>₹{totals.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></div>
              <div className="de-fin-sep"></div>
              <div className="de-fin-item"><span>Advance:</span> <strong className="de-fin-adv">₹{advance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></div>
              <div className="de-fin-sep"></div>
              <div className="de-fin-item"><span>Balance:</span> <strong className="de-fin-bal">₹{totals.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></div>
            </div>

            {/* Footer */}
            <div className="de-footer">
              <div className="de-export-section">
                <div className="de-export-label">EXPORT AS:</div>
                <div className="de-export-btns">
                  <button className="de-exp-btn" onClick={() => triggerExport("pdf")}><span className="de-exp-icon">📕</span><span className="de-exp-name">PDF</span><span className="de-exp-ext">.pdf</span></button>
                </div>
              </div>
              <div className="de-footer-actions">
                <button className="de-tbtn" style={{ padding: "10px 18px", fontSize: "13.5px" }} onClick={() => { setIsDataEntryOpen(false); setActivePoVendor(null); }}>Cancel</button>
                <button className="de-tbtn" style={{ padding: "10px 18px", fontSize: "13.5px" }} onClick={openPoPreview}>👁️ View PO</button>
                <button className="btn-save-rev" style={{ background: "#4f46e5", color: "#fff" }} onClick={() => handleSavePoRevision()}>💾 Save Revision</button>
                <button className="btn-save-rev" onClick={() => { setPoStatus("Ready"); void handleSavePoRevision("Ready"); }}>✅ PO Ready</button>
                <button className="btn-export-pdf" style={{ background: "#0f766e" }} onClick={openPoPlacedDialog}>📨 PO Placed</button>
                {canExport && <button className="btn-export-pdf" onClick={() => triggerExport("pdf")}>📘 Export PDF</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PO Preview Dialog */}
      <Dialog open={isPoPreviewOpen} onOpenChange={setIsPoPreviewOpen}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-primary"><Eye className="size-5" /> PO Preview — {poNumber}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 border rounded-lg overflow-hidden bg-white">
            {isPoPreviewOpen && <iframe ref={poPreviewIframeRef} title="po-preview" srcDoc={buildPoDocumentHtml()} className="w-full h-full" />}
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t">
            <Button variant="outline" size="sm" className="h-9 cursor-pointer" onClick={() => setIsPoPreviewOpen(false)}>
              Close
            </Button>
            <Button
              size="sm"
              className="h-9 gap-2 bg-primary text-white font-semibold cursor-pointer"
              onClick={() => {
                const win = poPreviewIframeRef.current?.contentWindow;
                if (!win) { toast.error("Unable to access the preview document."); return; }
                win.focus();
                win.print();
              }}
            >
              <Printer className="size-4" /> Print
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── REVISION HISTORY PANEL ── */}
      <Dialog open={isRevisionsPanelOpen} onOpenChange={setIsRevisionsPanelOpen}>
        <DialogContent className="max-w-3xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-primary"><History className="size-5" /> Revision History</DialogTitle>
            <p className="text-xs text-muted-foreground">All saved purchase order revisions across every vendor.</p>
          </DialogHeader>
          {(() => {
            const sorted = [...revisions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const latestByPo = new Map<string, number>();
            sorted.forEach((r) => { if (!latestByPo.has(r.poNumber)) latestByPo.set(r.poNumber, r.revisionNo); });
            const q = revisionSearch.trim().toLowerCase();
            const filtered = q ? sorted.filter((r) => {
              const vName = vendors.find((v) => v.id === r.vendorId)?.name || "";
              return [r.poNumber, r.referenceCode, r.poStatus, vName].some((s) => String(s || "").toLowerCase().includes(q));
            }) : sorted;
            return (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border bg-card px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Total POs</div>
                    <div className="text-xl font-bold">{new Set(revisions.map((r) => r.poNumber)).size}</div>
                  </div>
                  <div className="rounded-xl border bg-card px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Revisions</div>
                    <div className="text-xl font-bold text-primary">{revisions.length}</div>
                  </div>
                  <div className="rounded-xl border bg-card px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Shown</div>
                    <div className="text-xl font-bold">{filtered.length}</div>
                  </div>
                </div>
                <div className="flex items-center w-full sm:w-72 h-9 bg-card border rounded-lg overflow-hidden mt-1">
                  <span className="px-3 text-muted-foreground"><Search className="size-3.5" /></span>
                  <input value={revisionSearch} onChange={(e) => setRevisionSearch(e.target.value)} placeholder="Search PO no, vendor, reference, status…" className="flex-1 h-full bg-transparent text-xs outline-none" />
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2.5">
                  {filtered.map((rev) => {
                    const revVendor = vendors.find((v) => v.id === rev.vendorId);
                    const isLatest = latestByPo.get(rev.poNumber) === rev.revisionNo;
                    const statusChip = String(rev.poStatus || "").toLowerCase();
                    const chipCls = statusChip.includes("cancel") ? "bg-rose-500/10 text-rose-600 border-rose-500/25"
                      : statusChip.includes("place") || statusChip.includes("order") || statusChip.includes("sent") ? "bg-blue-500/10 text-blue-600 border-blue-500/25"
                      : statusChip.includes("ready") || statusChip.includes("approv") ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25"
                      : statusChip.includes("receiv") || statusChip.includes("complet") ? "bg-violet-500/10 text-violet-600 border-violet-500/25"
                      : "bg-amber-500/10 text-amber-600 border-amber-500/25";
                    return (
                      <div key={rev.id} className="rounded-xl border bg-card p-3 hover:border-primary/40 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="shrink-0 size-9 rounded-lg bg-primary/10 text-primary flex flex-col items-center justify-center leading-none">
                              <span className="text-[8px] font-bold">REV</span>
                              <span className="text-xs font-extrabold">{rev.revisionNo}</span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-bold truncate">{rev.poNumber}</span>
                                {isLatest ? (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">LATEST</span>
                                ) : (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">SAVED</span>
                                )}
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${chipCls}`}>{rev.poStatus}</span>
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                                {revVendor?.name || "Unknown vendor"}{revVendor?.category ? ` • ${revVendor.category}` : ""}
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                                <span>{rev.poDate}</span>
                                <span>•</span><span>{(rev.lineItems as unknown[])?.length ?? 0} items</span>
                                {rev.referenceCode && (<><span>•</span><span className="font-semibold text-primary">Ref: {rev.referenceCode}</span></>)}
                              </div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                By {rev.createdBy || "Unknown"} • {rev.createdAt ? new Date(rev.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className="text-sm font-extrabold">₹{(Number(rev.grandTotal) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] gap-1 cursor-pointer" onClick={() => setViewingRevision(rev)}>
                                <Eye className="size-3" /> View
                              </Button>
                              {canCreate && (
                                <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] cursor-pointer" onClick={() => {
                                  const v = vendors.find((vv) => vv.id === rev.vendorId);
                                  loadRevision(rev);
                                  if (v) setActivePoVendor(v);
                                  setIsDataEntryOpen(true);
                                  setIsRevisionsPanelOpen(false);
                                  toast.success(`Loaded ${rev.poNumber} R${rev.revisionNo} into the editor.`);
                                }}>
                                  Load
                                </Button>
                              )}
                              {canDelete && (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer" onClick={() => { setRevisionToDelete(rev.id); setDeleteRevisionConfirmOpen(true); }}>
                                  <Trash2 className="size-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-14 text-center">
                      <div className="text-3xl mb-2">📂</div>
                      <p className="text-xs text-muted-foreground">{q ? "No revisions match your search." : "No revisions found. Create a PO to get started."}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end pt-3 border-t">
                  <Button variant="outline" size="sm" className="h-9 cursor-pointer" onClick={() => setIsRevisionsPanelOpen(false)}>Close</Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── SINGLE REVISION VIEWER ── */}
      <Dialog open={!!viewingRevision} onOpenChange={(open) => { if (!open) setViewingRevision(null); }}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-primary">
              <FileText className="size-5" /> {viewingRevision?.poNumber} — Revision R{viewingRevision?.revisionNo}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 border rounded-lg overflow-hidden bg-white">
            {viewingRevision && <iframe title="revision-viewer" srcDoc={buildPoDocumentHtml(viewingRevision)} className="w-full h-full" />}
          </div>
          <div className="flex items-center justify-between gap-2 pt-3 border-t">
            <p className="text-[11px] text-muted-foreground truncate">
              Read-only view of this saved revision.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="h-9 cursor-pointer" onClick={() => setViewingRevision(null)}>Close</Button>
              <Button
                size="sm"
                className="h-9 gap-2 bg-primary text-white font-semibold cursor-pointer"
                onClick={() => {
                  const win = revisionViewerIframeRef.current?.contentWindow;
                  if (!win) { toast.error("Unable to access the document."); return; }
                  win.focus();
                  win.print();
                }}
              >
                <Printer className="size-4" /> Print
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PO Placed Dialog */}
      <Dialog open={isPoPlacedDialogOpen} onOpenChange={setIsPoPlacedDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-primary">📨 Place PO — Send to Vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer"><Checkbox checked={placeSendWhatsapp} onCheckedChange={(v) => setPlaceSendWhatsapp(!!v)} /> Send via WhatsApp</label>
              {placeSendWhatsapp && <Input placeholder="Vendor WhatsApp number (with country code)" value={placePhone} onChange={(e) => setPlacePhone(e.target.value)} className="ml-6 h-9 text-xs" />}
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer"><Checkbox checked={placeSendEmail} onCheckedChange={(v) => setPlaceSendEmail(!!v)} /> Send via Email</label>
              {placeSendEmail && <Input value={activePoVendor?.email || "No email address saved for this vendor"} readOnly className="ml-6 h-9 text-xs bg-muted" />}
            </div>
            <p className="text-[11px] text-muted-foreground">This will generate the PDF purchase order for you to save or print.</p>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setIsPoPlacedDialogOpen(false)}>Cancel</Button>
              <Button size="sm" className="bg-primary text-white" onClick={handleConfirmPoPlaced}>Send PO</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialogs */}
      <ConfirmDialog open={clearRowsConfirmOpen} onOpenChange={setClearRowsConfirmOpen} title="Clear All Line Items?" description="All line items in this PO draft will be removed." confirmText="Clear All" variant="warning" onConfirm={() => setPoItems([])} />
      <ConfirmDialog open={removeColConfirmOpen} onOpenChange={setRemoveColConfirmOpen} title="Remove Column?" description={`The column "${colToRemove}" will be removed.`} confirmText="Remove Column" variant="warning" onConfirm={() => { if (!colToRemove) return; setCustomColumns((prev) => prev.filter((c) => c !== colToRemove)); setPoItems((prev) => prev.map((item) => { const updated = { ...item }; delete updated[colToRemove]; return updated; })); toast.success(`Column "${colToRemove}" removed`); setColToRemove(null); }} />
      <ConfirmDialog open={deleteRevisionConfirmOpen} onOpenChange={setDeleteRevisionConfirmOpen} variant="danger" showRecycleHint={Boolean(revisionToDelete?.startsWith("synthesized-"))} title={revisionToDelete?.startsWith("synthesized-") ? "Delete Purchase Order?" : "Delete PO Revision?"} description={revisionToDelete?.startsWith("synthesized-") ? "This PO has no saved revisions — the purchase order itself will be removed." : "This saved PO revision will be permanently removed."} confirmText={revisionToDelete?.startsWith("synthesized-") ? "Delete PO" : "Delete Revision"} onConfirm={async () => { if (!revisionToDelete) return; const wasSynthesized = revisionToDelete.startsWith("synthesized-"); try { await apiService.revisions.delete(revisionToDelete); const list = await apiService.revisions.list(); setRevisions(list); void refreshNextPoNo(); if (selectedRevisionId === revisionToDelete) setSelectedRevisionId(null); toast.success(wasSynthesized ? "Purchase Order moved to Recycle Bin." : "Revision deleted."); } catch { toast.error(wasSynthesized ? "Failed to delete Purchase Order." : "Failed to delete revision."); } finally { setRevisionToDelete(null); } }} />
    </div>
  );
}

export default PurchaseOrdersPage;
