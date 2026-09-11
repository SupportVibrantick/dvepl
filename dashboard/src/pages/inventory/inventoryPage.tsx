import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import { tenderApi } from "../../services/modules";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Mail,
  Package,
  Plus,
  Settings,
  Truck,
  Upload,
  Users,
} from "lucide-react";

import { cn, getFieldLabel } from "@/utils/helpers";
import { Button } from "@/components/ui/button";
import { BackToOrderWorkflowButton } from "@/components/shared/backToOrderWorkflowButton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/services/axios";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import DynamicTable from "@/components/dynamic/DynamicTable";
import DynamicForm from "@/components/dynamic/DynamicForm";
import DynamicFieldManager from "@/components/dynamic/DynamicFieldManager";
import useDynamicModule from "@/hooks/useDynamicModule";
import VendorTracking from "./vendorTracking";
import { DynamicRecord } from "@/types/dynamic";
import { ConfirmDialog } from "@/components/shared/confirmDialog";
import { useERPStore } from "@/store/erpStore";
import { canPerformPageAction } from "@/utils/pagePermissions";

type StockStatus = "all" | "in-stock" | "low-stock" | "out-of-stock";

type SupplierMailRecipient = {
  id: string;
  name?: string | null;
  email: string;
};

export default function InventoryPage() {
  const navigate = useNavigate();
  const importInputRef = useRef<HTMLInputElement>(null);
  const store = useERPStore();
  const currentUser = store.users?.find((u: any) => u.id === store.currentUserId) as any;
  const canCreate = canPerformPageAction(currentUser?.actionPermissions, "inventory", "create");
  const canEdit = canPerformPageAction(currentUser?.actionPermissions, "inventory", "edit");
  const canDelete = canPerformPageAction(currentUser?.actionPermissions, "inventory", "delete");
  const canExport = canPerformPageAction(currentUser?.actionPermissions, "inventory", "export");

  const {
    module,
    fields,
    records,
    loading,
    search,
    setSearch,
    createRecord,
    updateRecord,
    deleteRecord,
    loadFields,
    loadRecords,
  } = useDynamicModule({ moduleKey: "inventory" });

  const [mainView, setMainView] = useState<"inventory" | "tracking">(
    "inventory",
  );
  const [formOpen, setFormOpen] = useState(false);
  const [fieldManagerOpen, setFieldManagerOpen] = useState(false);
  const [editing, setEditing] = useState<DynamicRecord | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [searchField, setSearchField] = useState<string>("all");
  const [fieldSearch, setFieldSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockStatus>("all");
  const [stockOpen, setStockOpen] = useState(false);
  const [stockRecord, setStockRecord] = useState<DynamicRecord | null>(null);
  const [stockMovType, setStockMovType] = useState<
    "IN" | "OUT" | "ADJUST" | "RETURN"
  >("IN");
  const [stockQty, setStockQty] = useState("");
  const [stockDate, setStockDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [stockRate, setStockRate] = useState("");
  const [stockVendorName, setStockVendorName] = useState("");
  const [stockInvoiceNo, setStockInvoiceNo] = useState("");
  const [stockOrderCode, setStockOrderCode] = useState("");
  const [stockReason, setStockReason] = useState("");
  const [stockLoading, setStockLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // States for Record Saving/Deletion
  const [deleteRecordOpen, setDeleteRecordOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<DynamicRecord | null>(
    null,
  );
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [isSavingRecord, setIsSavingRecord] = useState(false);

  const [selectedVendorItem, setSelectedVendorItem] =
    useState<DynamicRecord | null>(null);

  const [itemVendors, setItemVendors] = useState<any[]>([]);

  const [itemVendorsLoading, setItemVendorsLoading] = useState(false);

  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [supplierMailRecipient, setSupplierMailRecipient] =
    useState<SupplierMailRecipient | null>(null);
  const [supplierMailSubject, setSupplierMailSubject] = useState("");
  const [supplierMailText, setSupplierMailText] = useState("");
  const [supplierMailSending, setSupplierMailSending] = useState(false);

  const buildFormValues = (
    recordValues?: Record<string, any> | string | null,
  ) => {
    const base: Record<string, any> = {};
    fields.forEach((field) => {
      base[field.fieldName] = field.defaultValue ?? "";
    });

    let savedValues: Record<string, any> = {};
    if (typeof recordValues === "string") {
      try {
        savedValues = JSON.parse(recordValues);
      } catch {
        savedValues = {};
      }
    } else if (recordValues && typeof recordValues === "object") {
      savedValues = recordValues;
    }

    const savedEntries = Object.entries(savedValues);
    fields.forEach((field) => {
      const savedValue = savedEntries.find(
        ([key]) => key.toLowerCase() === field.fieldName.toLowerCase(),
      )?.[1];

      if (savedValue !== undefined) {
        base[field.fieldName] = savedValue;
      }
    });

    return base;
  };

  const getDynamicFieldValue = (
    recordValues: Record<string, any> | string | null | undefined,
    field: (typeof fields)[number],
  ) => {
    let savedValues: Record<string, any> = {};

    if (typeof recordValues === "string") {
      try {
        savedValues = JSON.parse(recordValues);
      } catch {
        savedValues = {};
      }
    } else if (recordValues && typeof recordValues === "object") {
      savedValues = recordValues;
    }

    // 1. Exact fieldName
    if (
      field.fieldName &&
      Object.prototype.hasOwnProperty.call(savedValues, field.fieldName)
    ) {
      return savedValues[field.fieldName];
    }

    // 2. Exact label
    if (
      field.label &&
      Object.prototype.hasOwnProperty.call(savedValues, field.label)
    ) {
      return savedValues[field.label];
    }

    // 3. Normalized comparison
    const normalizeKey = (value: string) =>
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    const normalizedFieldName = normalizeKey(field.fieldName);
    const normalizedLabel = normalizeKey(field.label);

    const matchingEntry = Object.entries(savedValues).find(([key]) => {
      const normalizedKey = normalizeKey(key);

      return (
        normalizedKey === normalizedFieldName ||
        normalizedKey === normalizedLabel
      );
    });

    return matchingEntry?.[1];
  };

  const normalizedRecords = useMemo(() => {
    return (records || []).map((record) => {
      const normalizedValues: Record<string, any> = {};

      fields.forEach((field) => {
        const value = getDynamicFieldValue(record.values, field);

        if (value !== undefined) {
          normalizedValues[field.fieldName] = value;
        }
      });

      return {
        ...record,
        values: normalizedValues,
      };
    });
  }, [records, fields]);

  const openCreate = () => {
    setEditing(null);
    setValues(buildFormValues());
    setFormOpen(true);
  };

  const openEdit = (record: DynamicRecord) => {
    setEditing(record);
    setValues(buildFormValues(record.values));
    setFormOpen(true);
  };

  const confirmDeleteRecord = (record: DynamicRecord) => {
    setRecordToDelete(record);
    setDeleteRecordOpen(true);
  };
  const getMaterialId = (record: DynamicRecord): string => {
    return record.inventory?.materialId ?? "";
  };
  const handleViewItemVendors = async (record: DynamicRecord) => {
    const materialId = getMaterialId(record);

    if (!materialId) {
      toast.error("This inventory item is not linked to a material.");
      return;
    }

    setSelectedVendorItem(record);
    setVendorDialogOpen(true);
    setItemVendorsLoading(true);
    setItemVendors([]);

    try {
      const vendors = await tenderApi.vendorProducts.listByMaterial(materialId);

      console.log("VENDORS FOR ITEM:", JSON.stringify(vendors, null, 2));

      setItemVendors(vendors);
    } catch (error: any) {
      console.error("Failed to load item vendors:", error);

      toast.error(
        error?.response?.data?.message ??
          "Failed to load vendors for this item.",
      );
    } finally {
      setItemVendorsLoading(false);
    }
  };

  const openSupplierMail = (
    vendor: SupplierMailRecipient,
    materialName: string,
  ) => {
    const vendorName = vendor.name || "Supplier";
    setSupplierMailRecipient(vendor);
    setSupplierMailSubject(`Inventory enquiry: ${materialName}`);
    setSupplierMailText(
      [
        `Dear ${vendorName},`,
        "",
        `We would like to discuss the availability and pricing of ${materialName}.`,
        "Please share the current availability, lead time, and any relevant terms.",
        "",
        "Regards,",
        "DVEPL Procurement Team",
      ].join("\n"),
    );
  };

  const closeSupplierMail = () => {
    setSupplierMailRecipient(null);
    setSupplierMailSubject("");
    setSupplierMailText("");
  };

  const sendSupplierMail = async () => {
    if (!supplierMailRecipient) return;
    if (!supplierMailSubject.trim() || !supplierMailText.trim()) {
      toast.error("Enter a subject and message before sending");
      return;
    }

    try {
      setSupplierMailSending(true);
      const response = await apiClient.post(
        "/settings/send-vendor-follow-up-email",
        {
          vendorId: supplierMailRecipient.id,
          subject: supplierMailSubject.trim(),
          text: supplierMailText.trim(),
        },
      );
      toast.success(
        response.data?.message || "Supplier email sent successfully",
      );
      closeSupplierMail();
    } catch (error: any) {
      console.error("Failed to send supplier email:", error);
      toast.error(
        error?.response?.data?.message || "Failed to send supplier email",
      );
    } finally {
      setSupplierMailSending(false);
    }
  };

  const handleConfirmDeleteRecord = async () => {
    if (!recordToDelete) return;
    try {
      setIsDeletingRecord(true);
      await deleteRecord(recordToDelete.id);
      toast.success("Record deleted successfully");
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to delete record");
    } finally {
      setIsDeletingRecord(false);
      setDeleteRecordOpen(false);
      setRecordToDelete(null);
    }
  };

  const saveRecord = async () => {
    try {
      setIsSavingRecord(true);
      if (editing) {
        await updateRecord(editing.id, values);
        toast.success("Record updated successfully");
      } else {
        await createRecord(values);
        toast.success("Record created successfully");
      }
      setFormOpen(false);
      setValues({});
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to save record");
    } finally {
      setIsSavingRecord(false);
    }
  };

  const getStockStatus = (record: DynamicRecord) => {
    const quantityField = fields.find((field) => {
      const label = field.label.toLowerCase();
      return (
        label.includes("qty") ||
        label.includes("quantity") ||
        label.includes("stock") ||
        label.includes("balance")
      );
    });

    const quantityValue = quantityField
      ? Number(record.values?.[quantityField.fieldName] ?? 0)
      : Number(record.values?.quantity ?? record.values?.qty ?? 0);

    if (Number.isNaN(quantityValue)) return "in-stock" as const;
    if (quantityValue <= 0) return "out-of-stock" as const;
    if (quantityValue <= 5) return "low-stock" as const;
    return "in-stock" as const;
  };

  const getItemName = (record: DynamicRecord) => {
    const nameField =
      fields.find((field) => {
        const label = field.label.toLowerCase();
        return label.includes("name") || label.includes("item");
      }) || fields[0];
    return record.values?.[nameField?.fieldName ?? ""] ?? "Selected item";
  };

  const filteredRecords = useMemo(() => {
    const searchQuery = `${search} ${fieldSearch}`.trim().toLowerCase();
    const selectedField = fields.find(
      (field) => field.fieldName === searchField,
    );

    return normalizedRecords.filter((record) => {
      const status = getStockStatus(record);
      if (stockFilter !== "all" && status !== stockFilter) return false;

      if (!searchQuery) return true;

      const parsedValues =
        typeof record.values === "string"
          ? (() => {
              try {
                return JSON.parse(record.values);
              } catch {
                return {};
              }
            })()
          : record.values || {};

      if (searchField !== "all" && selectedField) {
        return String(parsedValues[selectedField.fieldName] ?? "")
          .toLowerCase()
          .includes(searchQuery);
      }

      const searchableText = fields
        .map((field) => String(parsedValues[field.fieldName] ?? ""))
        .join(" ")
        .toLowerCase();

      return searchableText.includes(searchQuery);
    });
  }, [
    normalizedRecords,
    search,
    fieldSearch,
    searchField,
    stockFilter,
    fields,
  ]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [customPageSize, setCustomPageSize] = useState("10");

  useEffect(() => {
    setCurrentPage(1);
  }, [search, fieldSearch, searchField, stockFilter]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize);
  const paginatedRecords = useMemo(() => {
    return filteredRecords.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize,
    );
  }, [filteredRecords, currentPage, pageSize]);

  const getVisiblePages = () => {
    const delta = 1;
    const range: number[] = [];
    const rangeWithDots: (number | string)[] = [];
    let l: number | null = null;

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - delta && i <= currentPage + delta)
      ) {
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

  const handleExportExcel = () => {
    const rows = filteredRecords.map((record) => {
      const row: Record<string, any> = {};
      fields.forEach((field) => {
        row[field.label] = record.values?.[field.fieldName];
      });
      row["Stock Status"] = getStockStatus(record);
      return row;
    });

    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Inventory");
    XLSX.writeFile(workbook, "inventory.xlsx");
    toast.success("Inventory exported to Excel");
  };

  const handleImportExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        toast.error("The Excel file does not contain a worksheet");
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        defval: "",
      });

      if (rows.length === 0) {
        toast.error("The Excel file does not contain any records");
        return;
      }

      // Convert an Excel header into a safe DynamicField fieldName.
      // Existing fields are matched against their fieldName/label first,
      // so existing columns keep their original fieldName.
      const toFieldName = (header: string) => {
        const cleaned = header
          .trim()
          .replace(/[^a-zA-Z0-9]+(.)/g, (_, char: string) =>
            char ? char.toUpperCase() : "",
          )
          .replace(/[^a-zA-Z0-9]/g, "");

        if (!cleaned) return "field";

        return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
      };

      const inferColumnType = (header: string, values: any[]) => {
        const field = fields.find((candidate) => {
          const normalizedHeader = header.trim().toLowerCase();
          return (
            candidate.fieldName.toLowerCase() === normalizedHeader ||
            candidate.label.toLowerCase() === normalizedHeader
          );
        });

        if (field) {
          if (field.type === "NUMBER") return "NUMBER" as const;
          if (field.type === "DATE") return "DATE" as const;
          return "TEXT" as const;
        }

        const nonEmptyValues = values.filter(
          (value) => value !== null && value !== undefined && value !== "",
        );

        if (
          nonEmptyValues.length > 0 &&
          nonEmptyValues.every(
            (value) =>
              typeof value === "number" ||
              (typeof value === "string" &&
                value.trim() !== "" &&
                !Number.isNaN(Number(value))),
          )
        ) {
          return "NUMBER" as const;
        }

        // SheetJS commonly returns Excel dates as numbers unless cellDates
        // is enabled. We keep generic imported values as TEXT unless an
        // existing field already tells us that the column is a DATE.
        return "TEXT" as const;
      };

      const firstRow = rows[0];
      const headers = Object.keys(firstRow);

      if (headers.length === 0) {
        toast.error("The Excel file does not contain column headers");
        return;
      }

      // Build the schema expected by the dynamic import API.
      // Existing columns are matched by fieldName or label.
      // New Excel columns automatically become new DynamicFields.
      const columns = headers.map((header) => {
        const normalizedHeader = header.trim().toLowerCase();
        const existingField = fields.find(
          (field) =>
            field.fieldName.toLowerCase() === normalizedHeader ||
            field.label.toLowerCase() === normalizedHeader,
        );

        return {
          label: header.trim(),
          fieldName: existingField?.fieldName ?? toFieldName(header),
          type: inferColumnType(
            header,
            rows.map((row) => row[header]),
          ),
        };
      });

      // Prevent duplicate field definitions if Excel contains headers that
      // normalize to the same fieldName.
      const uniqueColumns = Array.from(
        new Map(columns.map((column) => [column.fieldName, column])).values(),
      );

      // Send the complete Excel dataset to the backend in one request.
      // The backend creates missing DynamicFields and DynamicRecords and,
      // for inventory, synchronizes Material + Inventory records.
      const response = await apiClient.post(
        "/dynamic/record/import/inventory",
        {
          columns: uniqueColumns,
          rows,
        },
      );

      const result = response.data?.data;
      const importedCount = result?.rowCount ?? rows.length;
      const createdFieldCount = result?.createdFields?.length ?? 0;

      // Refresh the dynamic schema and records so newly created columns
      // immediately appear in the Inventory table.
      await loadFields();
      await loadRecords();

      if (createdFieldCount > 0) {
        toast.success(
          `Imported ${importedCount} record${importedCount === 1 ? "" : "s"} and added ${createdFieldCount} new column${createdFieldCount === 1 ? "" : "s"}`,
        );
      } else {
        toast.success(
          `Imported ${importedCount} inventory record${importedCount === 1 ? "" : "s"}`,
        );
      }
    } catch (error: any) {
      console.error("Excel import failed:", error);

      const message =
        error?.response?.data?.message || "Unable to import Excel file";

      toast.error(message);
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const getStockQuantityFieldName = (record: DynamicRecord) => {
    const quantityField = fields.find((field) => {
      const label = field.label.toLowerCase();
      return (
        label.includes("qty") ||
        label.includes("quantity") ||
        label.includes("stock") ||
        label.includes("balance")
      );
    });

    if (quantityField) return quantityField.fieldName;
    if (record.values?.quantity !== undefined) return "quantity";
    if (record.values?.qty !== undefined) return "qty";
    if (record.values?.currentStock !== undefined) return "currentStock";
    return "quantity";
  };

  const getCurrentStock = (record: DynamicRecord) => {
    const fieldName = getStockQuantityFieldName(record);
    return Number(record.values?.[fieldName] ?? 0);
  };

  const getNameValue = (record: DynamicRecord) => {
    const nameField = fields.find((field) => {
      const label = field.label.toLowerCase();
      const key = field.fieldName.toLowerCase();
      return label.includes("name") || key === "name" || key === "materialcode";
    });

    return String(
      nameField?.fieldName
        ? record.values?.[nameField.fieldName]
        : (record.values?.name ?? record.values?.materialCode ?? "Item"),
    );
  };

  const getUnitValue = (record: DynamicRecord) => {
    const unitField = fields.find((field) => {
      const label = field.label.toLowerCase();
      const key = field.fieldName.toLowerCase();
      return label.includes("unit") || key === "unit";
    });

    return String(
      unitField?.fieldName
        ? record.values?.[unitField.fieldName]
        : (record.values?.unit ?? ""),
    );
  };

  const resetStockForm = () => {
    setStockQty("");
    setStockDate(new Date().toISOString().split("T")[0]);
    setStockRate("");
    setStockVendorName("");
    setStockInvoiceNo("");
    setStockOrderCode("");
    setStockReason("");
  };

  const handleOpenStockModal = (
    record: DynamicRecord,
    type: "IN" | "OUT" | "ADJUST" | "RETURN",
  ) => {
    setStockRecord(record);
    setStockMovType(type);
    resetStockForm();
    setStockOpen(true);
  };

  const handleSaveStock = async () => {
    if (!stockRecord) return;

    const qty = parseFloat(stockQty);
    if (Number.isNaN(qty) || qty < 0) {
      toast.error("Enter a valid quantity");
      return;
    }

    if (
      (stockMovType === "IN" ||
        stockMovType === "OUT" ||
        stockMovType === "RETURN") &&
      qty <= 0
    ) {
      toast.error("Quantity must be greater than zero");
      return;
    }

    setStockLoading(true);

    try {
      if (stockMovType === "ADJUST") {
        await apiClient.patch(`/inventory/update/${stockRecord.id}`, {
          currentStock: qty,
        });
      } else {
        const body: Record<string, any> = {
          // Older records created before the DynamicRecord ↔ Inventory
          // relationship was introduced share the same id, so retain that
          // fallback until the migration has linked them.
          inventoryId: stockRecord.inventory?.id ?? stockRecord.id,
          quantity: qty,
          referenceType: "MANUAL",
          referenceId: stockRecord.id,
          remarks: stockReason || `${stockMovType} stock movement`,
        };

        if (stockMovType === "IN") {
          body.referenceType = stockInvoiceNo ? "INVOICE" : "MANUAL";
          if (stockRate) body.unitPrice = parseFloat(stockRate);
          if (stockVendorName) body.vendorName = stockVendorName;
          if (stockInvoiceNo) body.invoiceNo = stockInvoiceNo;
        }

        if (stockMovType === "OUT" || stockMovType === "RETURN") {
          body.referenceType = stockOrderCode ? "SALES_ORDER" : "MANUAL";
          body.referenceId = stockOrderCode || stockRecord.id;
        }

        if (stockMovType === "RETURN") {
          await apiClient.post("/inventory/stock-in", body);
        } else if (stockMovType === "IN") {
          await apiClient.post("/inventory/stock-in", body);
        } else {
          await apiClient.post("/inventory/stock-out", body);
        }
      }

      toast.success("Stock transaction completed successfully");
      setStockOpen(false);
      await loadRecords();
    } catch (error: any) {
      console.error(error);
      toast.error(
        error?.response?.data?.message ?? "Failed to submit stock transaction",
      );
    } finally {
      setStockLoading(false);
    }
  };

  const handleRestockAction = (record: DynamicRecord) => {
    handleOpenStockModal(record, "IN");
  };

  const stockOptions: Array<{ value: StockStatus; label: string }> = [
    { value: "all", label: "All" },
    { value: "in-stock", label: "In Stock" },
    { value: "low-stock", label: "Low Stock" },
    { value: "out-of-stock", label: "Out of Stock" },
  ];

  const stockPreview = (() => {
    const qtyVal = parseFloat(stockQty) || 0;
    const current = stockRecord ? getCurrentStock(stockRecord) : 0;
    const unit = stockRecord ? getUnitValue(stockRecord) : "";
    let calculatedAfter = current;

    if (stockMovType === "IN" || stockMovType === "RETURN") {
      calculatedAfter += qtyVal;
    } else if (stockMovType === "OUT") {
      calculatedAfter -= qtyVal;
    } else if (stockMovType === "ADJUST") {
      calculatedAfter = qtyVal;
    }

    return {
      qtyVal,
      current,
      unit,
      calculatedAfter,
      isNegative: calculatedAfter < 0,
    };
  })();

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Inventory</h1>
          <p className="text-muted-foreground">Dynamic Inventory Management</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <BackToOrderWorkflowButton />
          {canExport && (
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="mr-2 h-4 w-4" />
              Export Excel
            </Button>
          )}

          {canCreate && (
            <Button
              variant="outline"
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
            >
              <Upload className="mr-2 h-4 w-4" />
              {importing ? "Importing..." : "Import Excel"}
            </Button>
          )}

          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleImportExcel}
          />

          <Button variant="outline" onClick={() => setMainView("tracking")}>
            <Truck className="mr-2 h-4 w-4" />
            Vendor Tracking
          </Button>

          {canEdit && (
            <Button variant="outline" onClick={() => setFieldManagerOpen(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Manage Fields
            </Button>
          )}

          {canCreate && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          )}
        </div>
      </div>

      {mainView === "inventory" ? (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Input
              placeholder="Search inventory"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Select
              value={searchField}
              onValueChange={(value) => setSearchField(value ?? "all")}
            >
              <SelectTrigger className="w-full md:w-[240px]">
                <SelectValue placeholder="Search field">
                  {(value) => {
                    if (value === "all") return "All fields";
                    return getFieldLabel(fields, value);
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All fields</SelectItem>
                {fields.map((field) => (
                  <SelectItem key={field.id} value={field.fieldName}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder={
                searchField === "all"
                  ? "Search in selected field"
                  : `Search ${fields.find((field) => field.fieldName === searchField)?.label ?? "field"}`
              }
              value={fieldSearch}
              onChange={(e) => setFieldSearch(e.target.value)}
              disabled={searchField === "all"}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {stockOptions.map((item) => (
              <Button
                key={item.value}
                variant={stockFilter === item.value ? "default" : "outline"}
                size="sm"
                onClick={() => setStockFilter(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>

          {/* Table Toolbar */}
          {!loading && filteredRecords.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Left Side: Pagination & Bulk Actions */}
              <div className="flex flex-wrap items-center gap-3">
                {/* 1. Page Numbers Navigation Pill */}
                <div className="flex items-center gap-1 bg-muted/60 border border-border/70 p-1 h-11 rounded-xl shadow-xs">
                  {/* Prev Arrow */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card border border-transparent hover:border-border/30 hover:shadow-3xs transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none"
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
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
                              : "text-muted-foreground hover:text-foreground hover:bg-card border border-transparent hover:border-border/30 hover:shadow-3xs",
                          )}
                          onClick={() => setCurrentPage(page as number)}
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
                    onClick={() =>
                      setCurrentPage((p) => Math.min(p + 1, totalPages))
                    }
                    disabled={currentPage === totalPages}
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
                          setPageSize(valNum);
                          setCurrentPage(1);
                        }
                      }
                    }}
                    onBlur={() => {
                      if (
                        !customPageSize ||
                        parseInt(customPageSize, 10) <= 0
                      ) {
                        setPageSize(10);
                        setCustomPageSize("10");
                        setCurrentPage(1);
                      }
                    }}
                  />
                  <span>entries per page</span>
                  <div className="w-px h-4 bg-border/80 mx-1.5" />
                  <button
                    type="button"
                    className="text-primary hover:text-primary/80 font-bold uppercase text-[10px] tracking-wider transition-colors"
                    onClick={() => {
                      setPageSize(
                        filteredRecords.length || Number.MAX_SAFE_INTEGER,
                      );
                      setCustomPageSize(
                        String(
                          filteredRecords.length || Number.MAX_SAFE_INTEGER,
                        ),
                      );
                      setCurrentPage(1);
                    }}
                  >
                    Show All
                  </button>
                </div>
              </div>

              {/* Right Side: Info */}
              <div className="text-xs text-muted-foreground font-medium">
                Showing{" "}
                {Math.min(
                  (currentPage - 1) * pageSize + 1,
                  filteredRecords.length,
                )}{" "}
                to {Math.min(currentPage * pageSize, filteredRecords.length)} of{" "}
                {filteredRecords.length} entries
              </div>
            </div>
          )}

          <DynamicTable
            fields={fields}
            records={paginatedRecords}
            loading={loading}
            onStock={handleRestockAction}
            onEdit={canEdit ? openEdit : undefined}
            onDelete={canDelete ? confirmDeleteRecord : undefined}
            onVendors={handleViewItemVendors}
          />
        </>
      ) : (
        <>
          <Button
            variant="outline"
            onClick={() => setMainView("inventory")}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Inventory
          </Button>
          <VendorTracking />
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Record" : "Add Record"}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <DynamicForm
              key={editing?.id ?? "new-record"}
              fields={fields}
              values={values}
              loading={loading}
              onChange={(field, value) =>
                setValues((prev) => ({
                  ...prev,
                  [field]: value,
                }))
              }
              onSubmit={saveRecord}
              onCancel={() => setFormOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={fieldManagerOpen} onOpenChange={setFieldManagerOpen}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Manage Fields</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <DynamicFieldManager
              moduleId={module?.id ?? ""}
              fields={fields}
              onRefresh={async () => {
                await loadFields();
                await loadRecords();
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={stockOpen} onOpenChange={setStockOpen}>
        <DialogContent className="max-w-md h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Stock Movement</DialogTitle>
          </DialogHeader>

          {stockRecord ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              <div className="rounded-lg border bg-muted/40 p-4">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  <p className="font-medium">{getNameValue(stockRecord)}</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Current stock: {getCurrentStock(stockRecord)}{" "}
                  {getUnitValue(stockRecord)}
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {(["IN", "OUT", "ADJUST", "RETURN"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setStockMovType(type)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      stockMovType === type
                        ? "bg-card text-foreground border-border"
                        : "bg-muted/20 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {stockMovType === "ADJUST" ? "New Level" : "Quantity"} *
                    </label>
                    <Input
                      type="number"
                      required
                      min={0}
                      step="any"
                      placeholder="0"
                      value={stockQty}
                      onChange={(e) => setStockQty(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Transaction Date
                    </label>
                    <Input
                      type="date"
                      value={stockDate}
                      onChange={(e) => setStockDate(e.target.value)}
                    />
                  </div>
                </div>

                {stockMovType === "IN" && (
                  <div className="grid grid-cols-1 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold tracking-wider text-muted-foreground">
                        Supplier Name
                      </label>
                      <Input
                        placeholder="Supplier name"
                        value={stockVendorName}
                        onChange={(e) => setStockVendorName(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {(stockMovType === "OUT" || stockMovType === "RETURN") && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold tracking-wider text-muted-foreground">
                      Sales Order / Project Code Reference
                    </label>
                    <Input
                      placeholder="Order or project code"
                      value={stockOrderCode}
                      onChange={(e) => setStockOrderCode(e.target.value)}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Reason / Note
                  </label>
                  <Textarea
                    placeholder="Enter reason or comments"
                    value={stockReason}
                    onChange={(e) => setStockReason(e.target.value)}
                    rows={3}
                  />
                </div>

                {stockQty && (
                  <div className="p-3 border rounded-lg bg-primary/5 text-sm text-muted-foreground">
                    <div className="font-semibold text-foreground">
                      Stock Level Preview: {stockPreview.current}{" "}
                      {stockPreview.unit} ?{" "}
                      <strong className="text-primary">
                        {stockPreview.calculatedAfter}
                      </strong>{" "}
                      {stockPreview.unit}
                    </div>
                    {stockPreview.isNegative && (
                      <div className="text-rose-500 font-bold mt-1">
                        Warning: Insufficient stock after this action
                      </div>
                    )}
                  </div>
                )}

                <div className="border-t pt-4 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStockOpen(false)}
                    disabled={stockLoading}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveStock} disabled={stockLoading}>
                    {stockLoading ? "Submitting..." : "Submit"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              Select an item to manage stock.
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteRecordOpen}
        onOpenChange={setDeleteRecordOpen}
        title="Delete Inventory Record?"
        description="Are you sure you want to permanently delete this inventory record? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="warning"
        onConfirm={handleConfirmDeleteRecord}
        loading={isDeletingRecord}
      />

      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle className="text-lg">
              Vendors Supplying This Item
            </DialogTitle>

            {selectedVendorItem && (
              <p className="text-sm text-muted-foreground">
                Select a supplier below to contact them about this item.
              </p>
            )}
          </DialogHeader>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {itemVendorsLoading ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                Loading vendors...
              </div>
            ) : itemVendors.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center px-6">
                <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />

                <p className="text-sm font-medium">No vendors found</p>

                <p className="text-xs text-muted-foreground mt-1">
                  No suppliers are currently associated with this item.
                </p>
              </div>
            ) : (
              <div className="h-full overflow-y-auto px-6 py-4">
                <div className="space-y-3">
                  {itemVendors.map((association) => {
                    const vendor = association.vendor;
                    const material = association.material;

                    return (
                      <div
                        key={association.id}
                        className="rounded-lg border bg-background p-4 hover:bg-muted/30 transition-colors"
                      >
                        {/* Vendor Header */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold truncate">
                                {vendor?.name ?? "Unnamed Vendor"}
                              </h3>

                              {association.isPreferred && (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                                  Preferred
                                </span>
                              )}
                            </div>

                            {vendor?.contactPerson && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Contact: {vendor.contactPerson}
                              </p>
                            )}
                          </div>

                          {/* Email Button */}
                          <Button
                            type="button"
                            size="sm"
                            className="shrink-0"
                            onClick={() =>
                              openSupplierMail(
                                vendor,
                                material?.name ?? "this item",
                              )
                            }
                            disabled={!vendor?.email}
                          >
                            <Mail className="h-4 w-4 mr-1.5" />
                            Email Vendor
                          </Button>
                        </div>

                        {/* Vendor Contact */}
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="rounded-md bg-muted/40 px-3 py-2">
                            <p className="text-[11px] text-muted-foreground">
                              Email
                            </p>

                            <p className="text-sm truncate">
                              {vendor?.email ?? "No email available"}
                            </p>
                          </div>

                          <div className="rounded-md bg-muted/40 px-3 py-2">
                            <p className="text-[11px] text-muted-foreground">
                              Phone
                            </p>

                            <p className="text-sm">
                              {vendor?.phone ?? "No phone available"}
                            </p>
                          </div>
                        </div>

                        {/* Material Details */}
                        <div className="mt-3 pt-3 border-t">
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">
                                Item:
                              </span>{" "}
                              <span className="font-medium">
                                {material?.name ?? "Unknown"}
                              </span>
                            </div>

                            <div>
                              <span className="text-muted-foreground">
                                Code:
                              </span>{" "}
                              <span className="font-medium">
                                {material?.materialCode ?? "—"}
                              </span>
                            </div>

                            <div>
                              <span className="text-muted-foreground">
                                Unit:
                              </span>{" "}
                              <span className="font-medium">
                                {material?.unit ?? "—"}
                              </span>
                            </div>

                            <div>
                              <span className="text-muted-foreground">
                                Vendor Rate:
                              </span>{" "}
                              <span className="font-medium">
                                {association.vendorRate ?? "—"}
                              </span>
                            </div>

                            {association.vendorMaterialCode && (
                              <div>
                                <span className="text-muted-foreground">
                                  Vendor Code:
                                </span>{" "}
                                <span className="font-medium">
                                  {association.vendorMaterialCode}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Notes */}
                        {association.notes && (
                          <div className="mt-3 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              Notes:
                            </span>{" "}
                            {association.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {!itemVendorsLoading && itemVendors.length > 0 && (
            <div className="px-6 py-3 border-t bg-muted/20 shrink-0">
              <p className="text-xs text-muted-foreground">
                {itemVendors.length}{" "}
                {itemVendors.length === 1 ? "vendor" : "vendors"} found
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!supplierMailRecipient}
        onOpenChange={(open) => {
          if (!open) closeSupplierMail();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Email {supplierMailRecipient?.name || "Supplier"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              To: {supplierMailRecipient?.email}
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="supplier-mail-subject"
              >
                Subject
              </label>
              <Input
                id="supplier-mail-subject"
                value={supplierMailSubject}
                onChange={(event) => setSupplierMailSubject(event.target.value)}
                disabled={supplierMailSending}
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="supplier-mail-message"
              >
                Message
              </label>
              <Textarea
                id="supplier-mail-message"
                rows={8}
                value={supplierMailText}
                onChange={(event) => setSupplierMailText(event.target.value)}
                disabled={supplierMailSending}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeSupplierMail}
                disabled={supplierMailSending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={sendSupplierMail}
                disabled={supplierMailSending}
                className="gap-2"
              >
                <Mail className="h-4 w-4" />
                {supplierMailSending ? "Sending..." : "Send Email"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
