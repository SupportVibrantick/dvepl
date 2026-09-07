import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ColumnDef } from "@tanstack/react-table";
import {
  Building2,
  Search,
  X,
  AlertCircle,
  SlidersHorizontal,
  RefreshCw,
  Package,
} from "lucide-react";
import { GenericTable, sortableHeader } from "@/components/tables/genericTable";
import { canPerformPageAction } from "@/utils/pagePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "react-hot-toast";
import { tenderApi, inventoryApi } from "@/services/modules";

import { apiClient } from "@/services/axios";
import { useERPStore } from "@/store/erpStore";
import { DynamicFormRenderer } from "@/components/customFields/dynamicFormRenderer";
import {
  useDynamicCustomFields,
  validateCustomFields,
} from "@/hooks/useDynamicCustomFields";
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

/**
 * Resolve a value from a dynamic record's `values` object using the field's
 * fieldName, label, or a normalized comparison. Imported records store values
 * under their original Excel header (label) keys, while manually created
 * records store them under fieldName keys, so we have to handle both.
 */
function getRecordValue(
  recordValues: Record<string, any> | string | null | undefined,
  field: { fieldName: string; label: string } | undefined,
): any {
  if (!field) return undefined;

  let saved: Record<string, any> = {};
  if (typeof recordValues === "string") {
    try {
      saved = JSON.parse(recordValues);
    } catch {
      saved = {};
    }
  } else if (recordValues && typeof recordValues === "object") {
    saved = recordValues;
  }

  if (
    field.fieldName &&
    Object.prototype.hasOwnProperty.call(saved, field.fieldName)
  ) {
    return saved[field.fieldName];
  }

  if (
    field.label &&
    Object.prototype.hasOwnProperty.call(saved, field.label)
  ) {
    return saved[field.label];
  }

  const normalizeKey = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const normalizedFieldName = normalizeKey(field.fieldName);
  const normalizedLabel = normalizeKey(field.label);

  const matchingEntry = Object.entries(saved).find(([key]) => {
    const normalizedKey = normalizeKey(key);
    return (
      normalizedKey === normalizedFieldName ||
      normalizedKey === normalizedLabel
    );
  });

  return matchingEntry?.[1];
}

// Interfaces
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
  currentStock?: number;
  reorderLevel?: number;
  preferredVendor?: { vendorName?: string };
  customFields?: Record<string, any>;
}

interface VendorProductAssoc {
  id: string;
  vendorId: string;
  materialId: string;
  vendorRate: number | null;
  vendorMaterialCode: string | null;
  isPreferred: boolean;
  material: InventoryMaterial;
}

// ==========================================
// API ADAPTERS (EASILY REPLACE WITH AXIOS/FETCH LATER)
// ==========================================
export const apiService = {
  vendors: {
    list: async (): Promise<Vendor[]> => {
      return tenderApi.vendors.list() as unknown as Vendor[];
    },
    create: async (
      vendor: Omit<Vendor, "id" | "createdAt">,
    ): Promise<Vendor> => {
      const companyId = useERPStore.getState().currentCompanyId;
      return tenderApi.vendors.create({
        ...vendor,
        companyId,
      }) as unknown as Vendor;
    },
    update: async (id: string, vendor: Partial<Vendor>): Promise<Vendor> => {
      const companyId = useERPStore.getState().currentCompanyId;
      return tenderApi.vendors.update!(id, {
        ...vendor,
        companyId,
      }) as unknown as Vendor;
    },
    delete: async (id: string): Promise<void> => {
      return tenderApi.vendors.remove!(id);
    },
  },
  inventory: {
    list: async (): Promise<InventoryItem[]> => {
      return inventoryApi.list() as unknown as Promise<InventoryItem[]>;
    },
  },
  vendorProducts: {
    list: async (vendorId: string): Promise<VendorProductAssoc[]> => {
      return tenderApi.vendorProducts.list(
        vendorId,
      ) as unknown as VendorProductAssoc[];
    },
    listByMaterial: async (
      materialId: string,
    ): Promise<VendorProductAssoc[]> => {
      return tenderApi.vendorProducts.listByMaterial(
        materialId,
      ) as unknown as VendorProductAssoc[];
    },
    attach: async (
      vendorId: string,
      materialIds: string[],
    ): Promise<VendorProductAssoc[]> => {
      return tenderApi.vendorProducts.attach(
        vendorId,
        materialIds,
      ) as unknown as VendorProductAssoc[];
    },
    detach: async (id: string): Promise<void> => {
      return tenderApi.vendorProducts.detach(id);
    },
  },
};

export function VendorsPage() {
  const { users, currentUserId } = useERPStore();
  const currentUser = users?.find((u: any) => u.id === currentUserId) as any;
  const canCreate = canPerformPageAction(currentUser?.actionPermissions, "vendors", "create");
  const canEdit = canPerformPageAction(currentUser?.actionPermissions, "vendors", "edit");
  const canDelete = canPerformPageAction(currentUser?.actionPermissions, "vendors", "delete");

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryFields, setInventoryFields] = useState<DynamicField[]>([]);
  const [inventoryRecords, setInventoryRecords] = useState<DynamicRecord[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allVendorProducts, setAllVendorProducts] = useState<
    VendorProductAssoc[]
  >([]);
  const [vendorProductsLoaded, setVendorProductsLoaded] = useState(false);

  const fetchAllData = async () => {
    setLoading(true);
    setInventoryLoading(true);
    try {
      const [vList, invList, dynFieldsRes, dynRecordsRes] =
        await Promise.all([
          apiService.vendors.list(),
          apiService.inventory.list(),
          dynamicApi.getFields("inventory"),
          dynamicApi.getRecords("inventory"),
        ]);
      if (invList[0]) {
        console.log(invList[0].material);
        console.log(invList[0].material?.name);
      }
      setVendors(vList);
      setInventoryItems(invList);
      setInventoryFields(
        (dynFieldsRes.data?.data || []).sort(
          (a: any, b: any) => a.orderNo - b.orderNo,
        ),
      );
      setInventoryRecords(dynRecordsRes.data?.data || []);
      console.log("Inventory Loaded");
      console.log(invList);
      console.log(invList.length);
    } catch (err: any) {
      toast.error("Failed to sync data");
    } finally {
      setLoading(false);
      setInventoryLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlRef = searchParams.get("ref");
  const urlOrderId = searchParams.get("orderId");

  // UI States
  const [globalSearch, setGlobalSearch] = useState(() => searchParams.get("search") || "");
  const [fieldSearch, setFieldSearch] = useState("");
  const [productOnlySearch, setProductOnlySearch] = useState("");

  const [searchField, setSearchField] = useState<
    | "all"
    | "name"
    | "category"
    | "contactPerson"
    | "phone"
    | "email"
    | "gstNumber"
    | "products"
  >("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [overviewVendor, setOverviewVendor] = useState<Vendor | null>(null);
  const [formTab, setFormTab] = useState<"details" | "products">("details");

  // Revisions Modal States


  // Product picker (used in Vendor form)
  const [productSearch, setProductSearch] = useState("");
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(
    new Set(),
  );
  const [existingVendorProducts, setExistingVendorProducts] = useState<
    VendorProductAssoc[]
  >([]);


  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState<string | null>(null);

  // Dynamic EAV Custom Fields
  const {
    fields: vendorCustomFields,
    tableCustomColumns: vendorTableCustomCols,
  } = useDynamicCustomFields("vendor");
  const [vCustomFields, setVCustomFields] = useState<Record<string, any>>({});















  // Vendor Form Fields
  const [vName, setVName] = useState("");
  const [vCategory, setVCategory] = useState("");
  const [vContact, setVContact] = useState("");
  const [vPhone, setVPhone] = useState("");
  const [vEmail, setVEmail] = useState("");
  const [vGst, setVGst] = useState("");
  const [vAddress, setVAddress] = useState("");
  const [vNotes, setVNotes] = useState("");

  // Vendor Form Errors
  const [vErrors, setVErrors] = useState<Record<string, string>>({});

  const validateVendorForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!vName.trim() || vName.trim().length < 2) {
      errs.name = "Vendor name must be at least 2 characters";
    }
    const email = (vEmail ?? "").trim();

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Enter a valid email address";
    }
    const phone = (vPhone ?? "").trim();

    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      errs.phone = "Enter a valid 10-digit Indian mobile number";
    }

    const gstin = (vGst ?? "").trim().toUpperCase();

    if (
      gstin &&
      !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)
    ) {
      errs.gst = "Enter a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5)";
    }

    const cfErrs = validateCustomFields(vendorCustomFields, vCustomFields);
    const combinedErrs = { ...errs, ...cfErrs };
    setVErrors(combinedErrs);
    return Object.keys(combinedErrs).length === 0;
  };

  // PO Form Fields


  useEffect(() => {
    if (searchField === "products" || productOnlySearch.trim()) {
      loadAllVendorProducts();
    }
  }, [searchField, productOnlySearch, vendors]);

  const filteredVendors = useMemo(() => {
    let result = vendors;

    // 1. Apply Global Search (searches name, category, gstNumber, contactPerson, and custom fields)
    const globalQuery = globalSearch.trim().toLowerCase();
    if (globalQuery) {
      result = result.filter(
        (v) =>
          (v.name ?? "").toLowerCase().includes(globalQuery) ||
          (v.category ?? "").toLowerCase().includes(globalQuery) ||
          (v.gstNumber ?? "").toLowerCase().includes(globalQuery) ||
          (v.contactPerson ?? "").toLowerCase().includes(globalQuery) ||
          Object.values((v as any).customFields || {}).some((val) =>
            String(val ?? "")
              .toLowerCase()
              .includes(globalQuery),
          ),
      );
    }

    // 2. Apply Column-specific Search
    const columnQuery = fieldSearch.trim().toLowerCase();
    if (columnQuery && searchField !== "all") {
      if (searchField === "products") {
        const matchingVendorIds = new Set(
          allVendorProducts
            .filter(
              (a) =>
                (a.material?.name ?? "").toLowerCase().includes(columnQuery) ||
                (a.material?.materialCode ?? "")
                  .toLowerCase()
                  .includes(columnQuery) ||
                (a.material?.category ?? "")
                  .toLowerCase()
                  .includes(columnQuery) ||
                (a.vendorMaterialCode ?? "")
                  .toLowerCase()
                  .includes(columnQuery),
            )
            .map((a) => a.vendorId),
        );
        result = result.filter((v) => matchingVendorIds.has(v.id));
      } else {
        const fieldValue = (v: Vendor) => {
          if (searchField.startsWith("cf_")) {
            const key = searchField.substring(3);
            return (v as any).customFields?.[key] ?? "";
          }
          return (v as any)[searchField] ?? "";
        };
        result = result.filter((v) =>
          fieldValue(v).toString().toLowerCase().includes(columnQuery),
        );
      }
    }

    // 3. Product Search
    const productQuery = productOnlySearch.trim().toLowerCase();

    if (productQuery) {
      const matchingVendorIds = new Set(
        allVendorProducts
          .filter(
            (a) =>
              (a.material?.name ?? "").toLowerCase().includes(productQuery) ||
              (a.material?.materialCode ?? "")
                .toLowerCase()
                .includes(productQuery) ||
              (a.material?.category ?? "")
                .toLowerCase()
                .includes(productQuery) ||
              (a.vendorMaterialCode ?? "").toLowerCase().includes(productQuery),
          )
          .map((a) => a.vendorId),
      );

      result = result.filter((vendor) => matchingVendorIds.has(vendor.id));
    }
    return result;
  }, [
    vendors,
    globalSearch,
    fieldSearch,
    searchField,
    allVendorProducts,
    productOnlySearch,
  ]);

  const dynamicInventoryWithMaterial = useMemo(() => {
    return inventoryRecords.map((rec) => {
      const invItem = inventoryItems.find((inv) => inv.id === rec.id);
      return {
        ...rec,
        materialId: invItem?.materialId || "",
        materialCode: invItem?.material?.materialCode || "",
        category: invItem?.material?.category || "Uncategorized",
        unit: invItem?.material?.unit || "",
        quantity: invItem?.quantity || 0,
      };
    });
  }, [inventoryRecords, inventoryItems]);

  // Filtered inventory for Vendor form "Products Supplied" tab
  const filteredInventoryForForm = useMemo(() => {
    const primaryField = inventoryFields[0];
    const pool = dynamicInventoryWithMaterial;

    if (!productSearch.trim()) return pool;
    const q = productSearch.toLowerCase();

    return pool.filter((rec) => {
      const nameVal = String(
        getRecordValue(rec.values, primaryField) || "",
      ).toLowerCase();
      const codeVal = String(rec.materialCode || "").toLowerCase();
      const catVal = String(rec.category || "").toLowerCase();

      if (nameVal.includes(q) || codeVal.includes(q) || catVal.includes(q)) {
        return true;
      }

      return Object.values(rec.values || {}).some((val) =>
        String(val || "")
          .toLowerCase()
          .includes(q),
      );
    });
  }, [dynamicInventoryWithMaterial, productSearch, inventoryFields]);

  // Inline inventory matches for a PO line-item row, based on its description text
  // Inline inventory matches for a PO line-item row, based on its description text

  const ALL_VENDOR_COLUMNS = useMemo(() => {
    const base = [
      { id: "name", label: "Vendor Name" },
      { id: "category", label: "Category" },
      { id: "contactPerson", label: "Contact Person" },
      { id: "phone", label: "Phone" },
      { id: "email", label: "Email" },
      { id: "gstNumber", label: "GSTIN" },
      { id: "products", label: "Products" },
      // { id: "revisions", label: "Revision History" },
      { id: "purchaseOrders", label: "Purchase Orders" },
      { id: "dataEntry", label: "Data Entry" },
    ];
    const cfCols = vendorCustomFields
      .filter((f) => f.isActive && f.showInTable)
      .map((f) => ({ id: `cf_${f.key}`, label: f.name }));
    return [...base, ...cfCols];
  }, [vendorCustomFields]);

  // Column Visibility State
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => {
      try {
        const saved = localStorage.getItem("vendors-table-column-visibility");
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    },
  );

  useEffect(() => {
    setVisibleColumns((prev) => {
      const next = { ...prev };
      ALL_VENDOR_COLUMNS.forEach((col) => {
        if (next[col.id] === undefined) {
          next[col.id] = true;
        }
      });
      return next;
    });
  }, [ALL_VENDOR_COLUMNS]);

  useEffect(() => {
    localStorage.setItem(
      "vendors-table-column-visibility",
      JSON.stringify(visibleColumns),
    );
  }, [visibleColumns]);

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAllColumns = (val: boolean) => {
    const next: Record<string, boolean> = {};
    ALL_VENDOR_COLUMNS.forEach((c) => {
      next[c.id] = val;
    });
    setVisibleColumns(next);
  };

  const loadAllVendorProducts = async () => {
    if (vendorProductsLoaded || vendors.length === 0) return;
    try {
      const results = await Promise.all(
        vendors.map((v) =>
          apiService.vendorProducts.list(v.id).catch(() => []),
        ),
      );
      setAllVendorProducts(results.flat());
      setVendorProductsLoaded(true);
    } catch {
      toast.error("Failed to load vendor products for search");
    }
  };
  // Count of products per vendor (from currently-loaded associations is per-vendor lazy;
  // for table display we keep a lightweight cache populated on demand)
  const [vendorProductCounts, setVendorProductCounts] = useState<
    Record<string, number>
  >({});

  // Products Supplied quick-view dialog
  const [productsQuickViewVendor, setProductsQuickViewVendor] =
    useState<Vendor | null>(null);
  const [productsQuickViewList, setProductsQuickViewList] = useState<
    VendorProductAssoc[]
  >([]);
  const [productsQuickViewLoading, setProductsQuickViewLoading] =
    useState(false);

  const openProductsQuickView = async (vendor: Vendor) => {
    setProductsQuickViewVendor(vendor);
    setProductsQuickViewList([]);
    setProductsQuickViewLoading(true);
    try {
      const assocs = await apiService.vendorProducts.list(vendor.id);
      setProductsQuickViewList(assocs);
      setVendorProductCounts((prev) => ({
        ...prev,
        [vendor.id]: assocs.length,
      }));
    } catch {
      toast.error("Failed to load products for this vendor");
    } finally {
      setProductsQuickViewLoading(false);
    }
  };

  // ── NEW: Purchase Orders (backend) quick-view dialog ──


  const allTableColumns = useMemo<ColumnDef<Vendor>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: sortableHeader("Vendor Name"),
        cell: ({ row }) => (
          <span className="font-semibold text-foreground">
            {row.original.name}
          </span>
        ),
      },
      {
        id: "category",
        accessorKey: "category",
        header: "Category",
        cell: ({ getValue }) => (getValue() as string) || "—",
      },
      {
        id: "contactPerson",
        accessorKey: "contactPerson",
        header: "Contact Person",
        cell: ({ getValue }) => (getValue() as string) || "—",
      },
      {
        id: "phone",
        accessorKey: "phone",
        header: "Phone",
        cell: ({ getValue }) => (getValue() as string) || "—",
      },
      {
        id: "email",
        accessorKey: "email",
        header: "Email",
        cell: ({ getValue }) => (getValue() as string) || "—",
      },
      {
        id: "gstNumber",
        accessorKey: "gstNumber",
        header: "GSTIN",
        cell: ({ getValue }) => (getValue() as string) || "—",
      },
      {
        id: "products",
        header: "Products Supplied",
        cell: ({ row }) => {
          const vendor = row.original;
          const count = vendorProductCounts[vendor.id];
          return (
            <button
              onClick={() => openProductsQuickView(vendor)}
              className="bg-[#fff4e5] hover:bg-[#ffe9cc] text-[#b45309] border border-[#fcd9a8] px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors duration-150 inline-flex items-center gap-1"
            >
              <Package className="size-3" />
              {count !== undefined ? `${count} Products` : "View Products"}
            </button>
          );
        },
      },
    ],
    [vendorProductCounts],
  );

  const activeColumns = useMemo<ColumnDef<Vendor>[]>(() => {
    const baseCols = allTableColumns.filter(
      (col) => visibleColumns[col.id || (col as any).accessorKey],
    );
    const cfCols = (vendorTableCustomCols as any[]).filter(
      (col) => visibleColumns[col.id],
    );
    return [...baseCols, ...cfCols] as ColumnDef<Vendor>[];
  }, [allTableColumns, visibleColumns, vendorTableCustomCols]);

  // Form operations
  const resetVendorForm = () => {
    setEditingVendor(null);
    setVName("");
    setVCategory("");
    setVContact("");
    setVPhone("");
    setVEmail("");
    setVGst("");
    setVAddress("");
    setVNotes("");
    setVCustomFields({});
    setVErrors({});
    setFormTab("details");
    setProductSearch("");
    setSelectedMaterialIds(new Set());
    setExistingVendorProducts([]);
    setIsFormOpen(false);
  };

  const openEditVendor = async (vendor: Vendor) => {
    if (!canEdit) return;
    setEditingVendor(vendor);
    setVName(vendor.name);
    setVCategory(vendor.category);
    setVContact(vendor.contactPerson);
    setVPhone(vendor.phone);
    setVEmail(vendor.email);
    setVGst(vendor.gstNumber);
    setVAddress(vendor.address);
    setVNotes(vendor.notes);
    setVCustomFields((vendor as any).customFields || {});
    setFormTab("details");
    setProductSearch("");
    setIsFormOpen(true);

    // Load existing vendor-product associations
    try {
      const assocs = await apiService.vendorProducts.list(vendor.id);
      setExistingVendorProducts(assocs);
      setSelectedMaterialIds(new Set(assocs.map((a) => a.materialId)));
      setVendorProductCounts((prev) => ({
        ...prev,
        [vendor.id]: assocs.length,
      }));
    } catch {
      setExistingVendorProducts([]);
      setSelectedMaterialIds(new Set());
    }
  };

  const toggleMaterialSelection = (materialId: string) => {
    setSelectedMaterialIds((prev) => {
      const next = new Set(prev);
      if (next.has(materialId)) next.delete(materialId);
      else next.add(materialId);
      return next;
    });
  };

  const handleDetachExistingProduct = async (assoc: VendorProductAssoc) => {
    try {
      await apiService.vendorProducts.detach(assoc.id);
      setExistingVendorProducts((prev) =>
        prev.filter((a) => a.id !== assoc.id),
      );
      setSelectedMaterialIds((prev) => {
        const next = new Set(prev);
        next.delete(assoc.materialId);
        return next;
      });
      if (editingVendor) {
        setVendorProductCounts((prev) => ({
          ...prev,
          [editingVendor.id]: Math.max(0, (prev[editingVendor.id] || 1) - 1),
        }));
      }
      toast.success("Product detached from vendor");
    } catch {
      toast.error("Failed to detach product");
    }
  };

  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateVendorForm()) {
      toast.error(
        "Please review highlighted fields and correct required details.",
      );
      return;
    }

    try {
      let vendorId = editingVendor?.id;
      if (editingVendor) {
        await apiService.vendors.update(editingVendor.id, {
          name: vName,
          category: vCategory,
          contactPerson: vContact,
          phone: vPhone,
          email: vEmail,
          gstNumber: vGst,
          address: vAddress,
          notes: vNotes,
        });
        toast.success("Vendor updated successfully");
      } else {
        const created = await apiService.vendors.create({
          name: vName,
          category: vCategory,
          contactPerson: vContact,
          phone: vPhone,
          email: vEmail,
          gstNumber: vGst,
          address: vAddress,
          notes: vNotes,
        });
        vendorId = created.id;
        toast.success("New vendor registered successfully");
      }

      if (vendorId && Object.keys(vCustomFields).length > 0) {
        await apiClient.post(`/custom-fields/values/vendor/${vendorId}`, {
          values: vCustomFields,
        });
      }

      // Attach newly-selected products (skip ones already attached)
      if (vendorId && selectedMaterialIds.size > 0) {
        const alreadyAttachedIds = new Set(
          existingVendorProducts.map((a) => a.materialId),
        );
        const toAttach = Array.from(selectedMaterialIds).filter(
          (id) => !alreadyAttachedIds.has(id),
        );
        if (toAttach.length > 0) {
          await apiService.vendorProducts.attach(vendorId, toAttach);
        }
        setVendorProductCounts((prev) => ({
          ...prev,
          [vendorId!]: selectedMaterialIds.size,
        }));
      }

      const list = await apiService.vendors.list();
      setVendors(list);
      resetVendorForm();
    } catch (err: any) {
      toast.error("Failed to save vendor");
    }
  };

  const handleDeleteVendor = (id: string) => {
    if (!canDelete) return;
    setVendorToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteVendor = async () => {
    if (!vendorToDelete) return;
    try {
      await apiService.vendors.delete(vendorToDelete);
      const list = await apiService.vendors.list();
      setVendors(list);

      toast.success("Vendor deleted successfully");
    } catch (err: any) {
      toast.error("Failed to delete vendor");
    } finally {
      setVendorToDelete(null);
      setDeleteConfirmOpen(false);
    }
  };

  // Revisions details




















  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* ── Page Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xl">
            🏭
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {vendors.length} registered vendors
            </p>
          </div>
        </div>
        {canCreate && (
          <Button
            onClick={() => setIsFormOpen(true)}
            className="gap-2 bg-primary text-white font-semibold"
          >
            + Add Vendor
          </Button>
        )}
      </div>

      {/* ── Linked Order / PO Banner ── */}
      {(urlRef || urlOrderId) && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-300 shadow-3xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-base">🏭</span>
            <div className="min-w-0">
              <p className="text-xs font-medium">
                Linked for Order / PO:{" "}
                <span className="font-bold text-foreground">
                  {urlRef || urlOrderId}
                </span>
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("ref");
              next.delete("orderId");
              setSearchParams(next);
            }}
            className="h-7 text-xs px-2.5 rounded-lg border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 cursor-pointer shrink-0"
          >
            Clear Filter
          </Button>
        </div>
      )}

      {/* ── Add/Edit Vendor Form Section ── */}
      {isFormOpen && (
        <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4 w-full animate-in fade-in-50 duration-200">
          <div className="border-b pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-primary">
                {editingVendor ? "Edit Vendor" : "Add New Vendor"}
              </h2>
              <p className="text-xs text-muted-foreground">
                Enter vendor company details, GST, contact info, and supplied
                products
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={resetVendorForm}
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-1 border-b">
            <button
              type="button"
              onClick={() => setFormTab("details")}
              className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${formTab === "details" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Vendor Details
            </button>
            <button
              type="button"
              onClick={() => setFormTab("products")}
              className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${formTab === "products" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <Package className="size-3.5" />
              Products Supplied
              {selectedMaterialIds.size > 0 && (
                <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                  {selectedMaterialIds.size}
                </span>
              )}
            </button>
          </div>

          <form onSubmit={handleSaveVendor} className="w-full">
            {formTab === "details" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold">
                    Vendor / Company Name *
                  </Label>
                  <Input
                    value={vName}
                    onChange={(e) => {
                      setVName(e.target.value);
                      if (vErrors.name) setVErrors((p) => ({ ...p, name: "" }));
                    }}
                    placeholder="e.g. Acme Pvt. Ltd."
                    className={
                      vErrors.name
                        ? "border-destructive focus-visible:ring-destructive"
                        : ""
                    }
                  />
                  {vErrors.name && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="size-3" />
                      {vErrors.name}
                    </p>
                  )}
                </div>
                {vendorCustomFields.some((f) => f.afterField === "name") && (
                  <DynamicFormRenderer
                    fields={vendorCustomFields}
                    values={vCustomFields}
                    onChange={(key, val) => {
                      setVCustomFields((prev) => ({ ...prev, [key]: val }));
                      if (vErrors[key])
                        setVErrors((prev) => ({ ...prev, [key]: "" }));
                    }}
                    errors={vErrors}
                    afterFieldPosition="name"
                  />
                )}

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold">Category</Label>
                  <Input
                    value={vCategory}
                    onChange={(e) => setVCategory(e.target.value)}
                    placeholder="e.g. Electrical, Mechanical"
                  />
                </div>
                {vendorCustomFields.some(
                  (f) => f.afterField === "category",
                ) && (
                  <DynamicFormRenderer
                    fields={vendorCustomFields}
                    values={vCustomFields}
                    onChange={(key, val) => {
                      setVCustomFields((prev) => ({ ...prev, [key]: val }));
                      if (vErrors[key])
                        setVErrors((prev) => ({ ...prev, [key]: "" }));
                    }}
                    errors={vErrors}
                    afterFieldPosition="category"
                  />
                )}

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold">
                    Contact Person
                  </Label>
                  <Input
                    value={vContact}
                    onChange={(e) => setVContact(e.target.value)}
                    placeholder="e.g. Rajesh Kumar"
                  />
                </div>
                {vendorCustomFields.some(
                  (f) => f.afterField === "contactPerson",
                ) && (
                  <DynamicFormRenderer
                    fields={vendorCustomFields}
                    values={vCustomFields}
                    onChange={(key, val) => {
                      setVCustomFields((prev) => ({ ...prev, [key]: val }));
                      if (vErrors[key])
                        setVErrors((prev) => ({ ...prev, [key]: "" }));
                    }}
                    errors={vErrors}
                    afterFieldPosition="contactPerson"
                  />
                )}

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold">Phone</Label>
                  <Input
                    value={vPhone}
                    onChange={(e) => {
                      const digits = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 10);
                      setVPhone(digits);
                      if (vErrors.phone)
                        setVErrors((p) => ({ ...p, phone: "" }));
                    }}
                    placeholder="9876543210"
                    maxLength={10}
                    inputMode="numeric"
                    className={
                      vErrors.phone
                        ? "border-destructive focus-visible:ring-destructive"
                        : ""
                    }
                  />
                  {vErrors.phone && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="size-3" />
                      {vErrors.phone}
                    </p>
                  )}
                </div>
                {vendorCustomFields.some((f) => f.afterField === "phone") && (
                  <DynamicFormRenderer
                    fields={vendorCustomFields}
                    values={vCustomFields}
                    onChange={(key, val) => {
                      setVCustomFields((prev) => ({ ...prev, [key]: val }));
                      if (vErrors[key])
                        setVErrors((prev) => ({ ...prev, [key]: "" }));
                    }}
                    errors={vErrors}
                    afterFieldPosition="phone"
                  />
                )}

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input
                    type="text"
                    value={vEmail}
                    onChange={(e) => {
                      setVEmail(e.target.value);
                      if (vErrors.email)
                        setVErrors((p) => ({ ...p, email: "" }));
                    }}
                    placeholder="vendor@company.com"
                    className={
                      vErrors.email
                        ? "border-destructive focus-visible:ring-destructive"
                        : ""
                    }
                  />
                  {vErrors.email && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="size-3" />
                      {vErrors.email}
                    </p>
                  )}
                </div>
                {vendorCustomFields.some((f) => f.afterField === "email") && (
                  <DynamicFormRenderer
                    fields={vendorCustomFields}
                    values={vCustomFields}
                    onChange={(key, val) => {
                      setVCustomFields((prev) => ({ ...prev, [key]: val }));
                      if (vErrors[key])
                        setVErrors((prev) => ({ ...prev, [key]: "" }));
                    }}
                    errors={vErrors}
                    afterFieldPosition="email"
                  />
                )}

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold">GST Number</Label>
                  <Input
                    value={vGst}
                    onChange={(e) => {
                      setVGst(e.target.value.toUpperCase());
                      if (vErrors.gst) setVErrors((p) => ({ ...p, gst: "" }));
                    }}
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                    className={
                      vErrors.gst
                        ? "border-destructive focus-visible:ring-destructive"
                        : ""
                    }
                  />
                  {vErrors.gst && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="size-3" />
                      {vErrors.gst}
                    </p>
                  )}
                </div>
                {vendorCustomFields.some(
                  (f) => f.afterField === "gstNumber",
                ) && (
                  <DynamicFormRenderer
                    fields={vendorCustomFields}
                    values={vCustomFields}
                    onChange={(key, val) => {
                      setVCustomFields((prev) => ({ ...prev, [key]: val }));
                      if (vErrors[key])
                        setVErrors((prev) => ({ ...prev, [key]: "" }));
                    }}
                    errors={vErrors}
                    afterFieldPosition="gstNumber"
                  />
                )}

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold">Address</Label>
                  <Input
                    value={vAddress}
                    onChange={(e) => setVAddress(e.target.value)}
                    placeholder="Full address"
                  />
                </div>
                {vendorCustomFields.some((f) => f.afterField === "address") && (
                  <DynamicFormRenderer
                    fields={vendorCustomFields}
                    values={vCustomFields}
                    onChange={(key, val) => {
                      setVCustomFields((prev) => ({ ...prev, [key]: val }));
                      if (vErrors[key])
                        setVErrors((prev) => ({ ...prev, [key]: "" }));
                    }}
                    errors={vErrors}
                    afterFieldPosition="address"
                  />
                )}

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold">Notes</Label>
                  <Textarea
                    value={vNotes}
                    onChange={(e) => setVNotes(e.target.value)}
                    placeholder="Any additional notes..."
                    rows={2}
                  />
                </div>
                {vendorCustomFields.some((f) => f.afterField === "notes") && (
                  <DynamicFormRenderer
                    fields={vendorCustomFields}
                    values={vCustomFields}
                    onChange={(key, val) => {
                      setVCustomFields((prev) => ({ ...prev, [key]: val }));
                      if (vErrors[key])
                        setVErrors((prev) => ({ ...prev, [key]: "" }));
                    }}
                    errors={vErrors}
                    afterFieldPosition="notes"
                  />
                )}

                {/* Dynamic EAV Custom Fields without specific afterField position or assigned to end */}
                {vendorCustomFields.some(
                  (f) =>
                    !f.afterField ||
                    f.afterField === "end" ||
                    ![
                      "name",
                      "category",
                      "contactPerson",
                      "phone",
                      "email",
                      "gstNumber",
                      "address",
                      "notes",
                    ].includes(f.afterField),
                ) && (
                  <DynamicFormRenderer
                    fields={vendorCustomFields.filter(
                      (f) =>
                        !f.afterField ||
                        f.afterField === "end" ||
                        ![
                          "name",
                          "category",
                          "contactPerson",
                          "phone",
                          "email",
                          "gstNumber",
                          "address",
                          "notes",
                        ].includes(f.afterField),
                    )}
                    values={vCustomFields}
                    onChange={(key, val) => {
                      setVCustomFields((prev) => ({ ...prev, [key]: val }));
                      if (vErrors[key])
                        setVErrors((prev) => ({ ...prev, [key]: "" }));
                    }}
                    errors={vErrors}
                  />
                )}
              </div>
            )}

            {formTab === "products" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border rounded-xl px-3 bg-background shadow-xs focus-within:ring-1 focus-within:ring-primary">
                  <Search className="size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products by name, code, or category..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="h-9 border-none shadow-none focus-visible:ring-0 px-0"
                  />
                </div>

                {selectedMaterialIds.size > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(selectedMaterialIds).map((matId) => {
                      const dynamicItem = dynamicInventoryWithMaterial.find(
                        (rec) => rec.materialId === matId,
                      );
                      const staticItem = inventoryItems.find(
                        (i) => i.materialId === matId,
                      );

                      const primaryField = inventoryFields[0];
                      const dynamicName = getRecordValue(
                        dynamicItem?.values,
                        primaryField,
                      );
                      const name =
                        dynamicName ||
                        staticItem?.material?.name ||
                        "Unnamed Product";

                      const existing = existingVendorProducts.find(
                        (a) => a.materialId === matId,
                      );
                      return (
                        <span
                          key={matId}
                          className="inline-flex items-center gap-1.5 bg-[#f3f0ff] text-[#5b33b5] border border-[#cbbff5] px-2 py-1 rounded-md text-xs font-medium"
                        >
                          {name}
                          <button
                            type="button"
                            onClick={() =>
                              existing
                                ? handleDetachExistingProduct(existing)
                                : toggleMaterialSelection(matId)
                            }
                            className="hover:text-red-600"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="border rounded-xl max-h-72 overflow-y-auto divide-y">
                  {inventoryLoading && (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      Loading products…
                    </div>
                  )}
                  {!inventoryLoading &&
                    filteredInventoryForForm.length === 0 && (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        No products found in inventory.
                      </div>
                    )}
                  {!inventoryLoading &&
                    filteredInventoryForForm.map((item) => {
                      const isSelected = item.materialId
                        ? selectedMaterialIds.has(item.materialId)
                        : false;

                      const primaryField = inventoryFields[0];
                      const nameVal = getRecordValue(item.values, primaryField);
                      const displayName =
                        nameVal ||
                        Object.values(item.values || {})[0] ||
                        "Unnamed Item";

                      const subtitleParts = inventoryFields
                        .filter((f) => f.fieldName !== primaryField?.fieldName)
                        .map((f) => {
                          const val = getRecordValue(item.values, f);
                          if (val === undefined || val === null || val === "")
                            return null;
                          return `${f.label}: ${val}`;
                        })
                        .filter(Boolean);

                      const priceField = inventoryFields.find(
                        (f) =>
                          f.label.toLowerCase().includes("price") ||
                          f.label.toLowerCase().includes("rate"),
                      );
                      const priceVal = priceField
                        ? Number(getRecordValue(item.values, priceField)) || 0
                        : 0;

                      return (
                        <label
                          key={item.id}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 cursor-pointer transition-colors"
                        >
                          <Checkbox
                            checked={isSelected}
                            disabled={!item.materialId}
                            onCheckedChange={() => {
                              if (item.materialId) {
                                toggleMaterialSelection(item.materialId);
                              }
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground truncate">
                                {displayName}
                              </span>
                              {item.materialCode && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {item.materialCode}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {item.category || "Uncategorized"} • Stock:{" "}
                              {item.quantity} • ₹
                              {priceVal.toLocaleString("en-IN")}
                              {subtitleParts.length > 0 &&
                                ` • ${subtitleParts.join(" • ")}`}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t pt-4 mt-4">
              <Button type="button" variant="outline" onClick={resetVendorForm}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary text-white">
                Save Vendor
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ── Search Bar & Column Visibility ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search Bars Container */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* 1. Global Search Bar */}
          <div className="flex items-center w-full sm:w-72 h-10 bg-card border border-primary/50 rounded-sm shadow-xs hover:border-primary/30 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all duration-200 overflow-hidden">
            <Search className="size-4 text-muted-foreground ml-4 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search all fields..."
              className="flex-1 h-full bg-transparent pr-4 text-sm placeholder:text-muted-foreground focus:outline-none border-none ring-0 outline-none"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
          </div>

          {/* 2. Column-specific Search Bar */}
          <div className="flex items-center w-full sm:w-[360px] h-10 bg-card border border-primary/50 rounded-sm shadow-xs hover:border-primary/30 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all duration-200 overflow-hidden">
            <Select
              value={searchField}
              onValueChange={(val) => {
                setSearchField(val as any);
                setFieldSearch("");
              }}
            >
              <SelectTrigger className="border-none shadow-none focus:ring-0 focus:ring-offset-0 w-[125px] h-full pl-4 pr-1 text-xs font-semibold text-muted-foreground bg-transparent hover:text-foreground cursor-pointer transition-colors shrink-0">
                <SelectValue placeholder="Search in">
                  {(value) => {
                    if (value === "all") return "Select Column";
                    if (value === "name") return "Vendor Name";
                    if (value === "category") return "Category";
                    if (value === "contactPerson") return "Contact Person";
                    if (value === "phone") return "Phone";
                    if (value === "email") return "Email";
                    if (value === "gstNumber") return "GSTIN";
                    if (value === "products") return "Products Supplied";
                    if (value && value.startsWith("cf_")) {
                      const key = value.substring(3);
                      const field = vendorCustomFields.find(
                        (f: any) => f.key === key,
                      );
                      return field ? field.name || field.key : key;
                    }
                    return value || "";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Select Column</SelectItem>
                <SelectItem value="name">Vendor Name</SelectItem>
                <SelectItem value="category">Category</SelectItem>
                <SelectItem value="contactPerson">Contact Person</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="gstNumber">GSTIN</SelectItem>
                <SelectItem value="products">Products Supplied</SelectItem>
                {vendorCustomFields.map((field: any) => (
                  <SelectItem key={field.id} value={`cf_${field.key}`}>
                    {field.name || field.key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="w-px h-5 bg-border shrink-0" />

            <input
              type="text"
              className="flex-1 h-full bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none border-none ring-0 outline-none"
              disabled={searchField === "all"}
              placeholder={
                searchField === "all"
                  ? "Select a column to filter..."
                  : searchField.startsWith("cf_")
                    ? `Search by ${(() => {
                        const key = searchField.substring(3);
                        const field = vendorCustomFields.find(
                          (f: any) => f.key === key,
                        );
                        return field ? field.name || field.key : key;
                      })()}...`
                    : `Search by ${
                        searchField === "gstNumber"
                          ? "GSTIN"
                          : searchField === "contactPerson"
                            ? "contact person"
                            : searchField
                      }...`
              }
              value={fieldSearch}
              onChange={(e) => setFieldSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center w-full sm:w-80 h-10 bg-card border border-primary/50 rounded-sm shadow-xs hover:border-primary/30 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all duration-200 overflow-hidden">
            <Package className="size-4 text-muted-foreground ml-4 mr-2 shrink-0" />

            <input
              type="text"
              placeholder="Search Products..."
              className="flex-1 h-full bg-transparent pr-4 text-sm placeholder:text-muted-foreground focus:outline-none border-none ring-0 outline-none"
              value={productOnlySearch}
              onChange={(e) => setProductOnlySearch(e.target.value)}
            />

            {productOnlySearch && (
              <button
                type="button"
                onClick={() => setProductOnlySearch("")}
                className="mr-3 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Actions Container */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchAllData()}
            className="gap-2 font-medium h-10 rounded-lg px-4"
            title="Refresh Vendors"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 font-medium h-10 rounded-lg px-4"
                >
                  <SlidersHorizontal className="size-4" />
                  Customize Columns
                </Button>
              }
            />
            <PopoverContent align="end" className="w-56 p-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs font-semibold text-foreground">
                    Toggle Columns
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const allSelected = ALL_VENDOR_COLUMNS.every(
                          (c) => visibleColumns[c.id],
                        );
                        toggleAllColumns(!allSelected);
                      }}
                      className="h-6 px-1.5 text-[11px] font-medium text-primary hover:text-primary hover:bg-primary/10 gap-1.5"
                    >
                      <Checkbox
                        checked={ALL_VENDOR_COLUMNS.every(
                          (c) => visibleColumns[c.id],
                        )}
                        className="pointer-events-none size-3.5"
                      />
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleAllColumns(false)}
                      className="h-6 px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {ALL_VENDOR_COLUMNS.map((col) => {
                    const isChecked = !!visibleColumns[col.id];
                    return (
                      <label
                        key={col.id}
                        className="flex items-center gap-2.5 px-1 py-1 rounded hover:bg-muted/50 text-xs font-medium cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleColumn(col.id)}
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* ── Vendor Table ── */}
      <GenericTable
        columns={activeColumns}
        data={filteredVendors}
        onView={(row) => setOverviewVendor(row)}
        onEdit={canEdit ? openEditVendor : undefined}
        onDelete={canDelete ? (row) => handleDeleteVendor(row.id) : undefined}
        showColumnVisibility={false}
        storageKey="vendors"
      />

      {/* ── OVERVIEW MODAL ── */}
      <Dialog
        open={!!overviewVendor}
        onOpenChange={(open) => !open && setOverviewVendor(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-primary">
              <Building2 className="size-5" />
              Vendor Overview
            </DialogTitle>
          </DialogHeader>

          {overviewVendor && (
            <div className="space-y-4 pt-2 text-sm">
              <div className="bg-muted/40 p-4 rounded-xl space-y-1">
                <h3 className="text-base font-bold text-foreground">
                  {overviewVendor.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Category: {overviewVendor.category || "—"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Contact Person
                  </span>
                  <p className="font-semibold">
                    {overviewVendor.contactPerson || "—"}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Phone
                  </span>
                  <p className="font-semibold">{overviewVendor.phone || "—"}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Email
                  </span>
                  <p className="font-semibold break-all">
                    {overviewVendor.email || "—"}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    GSTIN
                  </span>
                  <p className="font-semibold">
                    {overviewVendor.gstNumber || "—"}
                  </p>
                </div>
              </div>

              <div className="space-y-1 border-t pt-3">
                <span className="text-xs font-medium text-muted-foreground">
                  Address
                </span>
                <p className="text-sm">{overviewVendor.address || "—"}</p>
              </div>

              <div className="space-y-1 border-t pt-3">
                <span className="text-xs font-medium text-muted-foreground">
                  Notes
                </span>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {overviewVendor.notes || "—"}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── PRODUCTS SUPPLIED QUICK VIEW ── */}
      <Dialog
        open={!!productsQuickViewVendor}
        onOpenChange={(open) => {
          if (!open) setProductsQuickViewVendor(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-primary">
              <Package className="size-5" />
              Products Supplied
            </DialogTitle>
          </DialogHeader>
          {productsQuickViewVendor && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between border rounded-lg px-3 py-2 bg-muted/30">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {productsQuickViewVendor.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {productsQuickViewVendor.category} • GSTIN:{" "}
                    {productsQuickViewVendor.gstNumber || "—"}
                  </div>
                </div>
                <span className="text-xs font-semibold text-[#b45309] bg-[#fff4e5] border border-[#fcd9a8] px-2.5 py-1 rounded-md">
                  {productsQuickViewList.length} product
                  {productsQuickViewList.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="border rounded-xl max-h-96 overflow-y-auto divide-y">
                {productsQuickViewLoading && (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Loading products...
                  </div>
                )}
                {!productsQuickViewLoading &&
                  productsQuickViewList.length === 0 && (
                    <div className="p-6 flex flex-col items-center gap-2 text-center">
                      <span className="text-xs text-muted-foreground">
                        This vendor has no products linked from Inventory yet.
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-8 text-xs cursor-pointer"
                        onClick={() => {
                          const vendor = productsQuickViewVendor;
                          setProductsQuickViewVendor(null);
                          if (vendor) {
                            openEditVendor(vendor);
                            setFormTab("products");
                          }
                        }}
                      >
                        <Package className="size-3.5" /> Attach Products from
                        Inventory
                      </Button>
                    </div>
                  )}
                {!productsQuickViewLoading &&
                  productsQuickViewList.map((assoc) => (
                    <div
                      key={assoc.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {assoc.material.name}
                          </span>
                          {assoc.isPreferred && (
                            <span className="text-[10px] font-semibold text-[#137333] bg-[#e6f4ea] border border-[#b7e1c1] px-1.5 py-0.5 rounded">
                              PREFERRED
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          Code:{" "}
                          {assoc.vendorMaterialCode ||
                            assoc.material.materialCode}{" "}
                          • Category: {assoc.material.category || "—"} • HSN:{" "}
                          {assoc.material.hsnCode || "—"} • Unit:{" "}
                          {assoc.material.unit || "—"}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-[#137333]">
                          {(() => {
                            const invItem = inventoryItems.find(
                              (i) => i.materialId === assoc.materialId,
                            );
                            const rate = invItem
                              ? Number(invItem.unitPrice)
                              : null;
                            return rate != null && !isNaN(rate)
                              ? `₹${rate.toLocaleString("en-IN")}`
                              : "—";
                          })()}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Item Rate
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Move Vendor to Recycle Bin?"
        description="This vendor will be moved to the Recycle Bin. You can restore it anytime from Settings → Recycle Bin."
        confirmText="Move to Bin"
        onConfirm={confirmDeleteVendor}
      />
    </div>
  );
}

export default VendorsPage;
