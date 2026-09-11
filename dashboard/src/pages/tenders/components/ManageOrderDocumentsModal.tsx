import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Trash2,
  FileText,
  RotateCcw,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useERPStore } from "@/store/erpStore";
import {
  DocumentCategoryDef,
  INITIAL_DOCUMENT_CATEGORIES,
  saveOrderDocumentCategories,
} from "./orderDocumentsConfig";

interface ManageOrderDocumentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: DocumentCategoryDef[];
  onSaved?: (updated: DocumentCategoryDef[]) => void;
}

export function ManageOrderDocumentsModal({
  open,
  onOpenChange,
  categories: initialCategories,
  onSaved,
}: ManageOrderDocumentsModalProps) {
  const store = useERPStore();
  const [list, setList] = useState<DocumentCategoryDef[]>([]);
  const [newDocName, setNewDocName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Sync list when modal opens
  React.useEffect(() => {
    if (open) {
      setList(initialCategories.map((c) => ({ ...c })));
      setNewDocName("");
    }
  }, [open, initialCategories]);

  const handleUpdateName = (index: number, name: string) => {
    setList((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, name } : item))
    );
  };

  const handleRemove = (index: number) => {
    setList((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAdd = () => {
    const trimmed = newDocName.trim();
    if (!trimmed) {
      toast.error("Please enter a document title.");
      return;
    }
    if (
      list.some(
        (item) => item.name.trim().toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      toast.error(`"${trimmed}" already exists in the document list.`);
      return;
    }

    setList((prev) => [
      ...prev,
      {
        name: trimmed,
        isMandatory: false,
        description: "",
      },
    ]);
    setNewDocName("");
  };

  const handleResetToDefaults = () => {
    setList(INITIAL_DOCUMENT_CATEGORIES.map((c) => ({ ...c })));
    toast.success("Reset to system default document list.");
  };

  const handleSave = async () => {
    const cleaned = list
      .map((item) => ({
        ...item,
        name: item.name.trim(),
      }))
      .filter((item) => item.name.length > 0);

    if (cleaned.length === 0) {
      toast.error("At least one document type must be configured.");
      return;
    }

    // Check duplicate names
    const names = new Set<string>();
    for (const item of cleaned) {
      const lower = item.name.toLowerCase();
      if (names.has(lower)) {
        toast.error(`Duplicate document "${item.name}" found. Names must be unique.`);
        return;
      }
      names.add(lower);
    }

    setIsSaving(true);
    try {
      await saveOrderDocumentCategories(cleaned, store.updateSettings);
      toast.success("Order documents configuration saved successfully.");
      onSaved?.(cleaned);
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border border-gray-300 dark:border-gray-700 shadow-2xl">
        {/* Modal Header */}
        <DialogHeader className="px-6 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <FileText className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Manage Order Document Uploads
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure the list of documents shown when creating orders and mark mandatory ones.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetToDefaults}
              className="h-8 text-xs font-semibold gap-1.5 border-border"
              title="Reset to initial default categories"
            >
              <RotateCcw className="size-3.5" />
              Reset Defaults
            </Button>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Quick Add Bar */}
          <div className="p-3.5 bg-muted/40 rounded-xl border border-border space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Plus className="size-3.5 text-primary" /> Add New Document Type
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <Input
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder="e.g. Tax Invoice Copy, Client Specification Sheet"
                className="h-9 text-xs rounded-lg flex-1 bg-background"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleAdd}
                className="h-9 text-xs font-bold bg-primary hover:bg-primary/90 text-white rounded-lg px-4 shrink-0"
              >
                <Plus className="size-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>

          {/* Configured Documents Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold px-1">
              <span>DOCUMENT TITLE ({list.length})</span>
              <div className="flex items-center gap-8">
                <span className="w-24 text-center">REQUIRED</span>
                <span className="w-10 text-center">ACTION</span>
              </div>
            </div>

            <div className="divide-y divide-border border border-border rounded-xl bg-card overflow-hidden">
              {list.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No document categories configured. Add one above or click Reset Defaults.
                </div>
              ) : (
                list.map((item, index) => (
                  <div
                    key={index}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span className="text-xs font-bold text-muted-foreground/60 w-5">
                        {index + 1}.
                      </span>
                      <Input
                        value={item.name}
                        onChange={(e) => handleUpdateName(index, e.target.value)}
                        placeholder="Document title"
                        className="h-8 text-xs rounded-md bg-background flex-1"
                      />
                    </div>

                    <div className="flex items-center gap-8 shrink-0">
                      <div className="w-24 flex justify-center">
                        <span
                          className={`text-[11px] font-bold ${
                            item.isMandatory
                              ? "text-red-500"
                              : "text-muted-foreground"
                          }`}
                        >
                          {item.isMandatory ? "Required *" : "Optional"}
                        </span>
                      </div>

                      <div className="w-10 flex justify-center">
                        <button
                          type="button"
                          onClick={() => handleRemove(index)}
                          className="text-muted-foreground hover:text-red-500 transition-colors p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                          title="Remove document"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="h-9 text-xs rounded-lg font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="h-9 text-xs font-bold bg-[#15803d] hover:bg-[#166534] text-white rounded-lg px-6 shadow-sm"
          >
            {isSaving ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" /> Saving...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Check className="size-3.5" /> Save Changes
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ManageOrderDocumentsModal;
