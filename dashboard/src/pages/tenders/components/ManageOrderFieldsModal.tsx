import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Check,
  RotateCcw,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useERPStore } from "@/store/erpStore";
import workflowApi from "@/services/workflowApi";
import {
  AddOrderFormFieldKey,
  INITIAL_ADD_ORDER_FORM_FIELDS,
  saveAddOrderFormFieldConfig,
} from "./addOrderModalFieldsConfig";
import {
  DEFAULT_STAGE_ROWS,
  StageDef,
  saveOrderStageRequirements,
} from "./orderStageRequirementsConfig";

interface ManageOrderFieldsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: Record<AddOrderFormFieldKey, boolean>;
  stageRequirements?: Record<string, boolean>;
  onSaved?: (fields: Record<AddOrderFormFieldKey, boolean>) => void;
}

export function ManageOrderFieldsModal({
  open,
  onOpenChange,
  fields,
  stageRequirements,
  onSaved,
}: ManageOrderFieldsModalProps) {
  const store = useERPStore();
  const [draft, setDraft] = useState<Record<AddOrderFormFieldKey, boolean>>(
    {} as Record<AddOrderFormFieldKey, boolean>,
  );
  const [stageDraft, setStageDraft] = useState<Record<string, boolean>>({});
  const [stageList, setStageList] = useState<StageDef[]>(DEFAULT_STAGE_ROWS);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingStages, setIsLoadingStages] = useState(false);

  React.useEffect(() => {
    if (open) {
      setDraft({ ...fields });
      setStageDraft({ ...(stageRequirements || {}) });
      void loadStageList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fields, stageRequirements]);

  const loadStageList = async () => {
    setIsLoadingStages(true);
    try {
      const res = await workflowApi.getTemplate();
      if (res.data?.success && Array.isArray(res.data?.data?.steps)) {
        const steps = res.data.data.steps
          .filter((s) => s.isActive)
          .sort((a, b) => a.position - b.position);
        if (steps.length > 0) {
          setStageList(
            steps.map((s) => ({
              key: s.key,
              name: s.name,
              department: "",
            })),
          );
          return;
        }
      }
    } catch (e) {
      console.error("Failed to load workflow stages:", e);
    }
    setStageList(DEFAULT_STAGE_ROWS.map((s) => ({ ...s })));
  };

  const handleToggle = (key: AddOrderFormFieldKey) => {
    setDraft((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStageToggle = (key: string) => {
    setStageDraft((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleResetToDefaults = () => {
    const defaults = {} as Record<AddOrderFormFieldKey, boolean>;
    for (const field of INITIAL_ADD_ORDER_FORM_FIELDS) {
      defaults[field.key] = field.isRequired;
    }
    setDraft(defaults);
    setStageDraft({});
    toast.success("Reset to system default required fields.");
  };

  const requiredCount =
    INITIAL_ADD_ORDER_FORM_FIELDS.filter((field) => draft[field.key]).length +
    Object.values(stageDraft).filter(Boolean).length;

  const totalCount = INITIAL_ADD_ORDER_FORM_FIELDS.length + stageList.length;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveAddOrderFormFieldConfig(draft, store.updateSettings);
      await saveOrderStageRequirements(stageDraft, store.updateSettings);
      toast.success("Order form field requirements saved successfully.");
      onSaved?.(draft);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border-border">
        {/* Modal Header */}
        <DialogHeader className="px-6 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <ListChecks className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Order Form Requirements
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose which fields and workflow stages are mandatory in the
                  "Start New Order" form. Applies company-wide to all users.
                </p>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold px-1">
              <span>FORM FIELDS ({INITIAL_ADD_ORDER_FORM_FIELDS.length})</span>
              <div className="flex items-center gap-8">
                <span className="w-24 text-center">REQUIRED *</span>
              </div>
            </div>

            <div className="divide-y divide-border border border-border rounded-xl bg-card overflow-hidden">
              {INITIAL_ADD_ORDER_FORM_FIELDS.map((field, index) => (
                <div
                  key={field.key}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground/60 w-5">
                      {index + 1}.
                    </span>
                    <span className="text-xs font-semibold text-foreground truncate">
                      {field.label}
                    </span>
                  </div>

                  <div className="w-24 flex justify-center shrink-0">
                    <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none">
                      <Checkbox
                        checked={Boolean(draft[field.key])}
                        onCheckedChange={() => handleToggle(field.key)}
                      />
                      <span
                        className={`text-[11px] font-bold ${
                          draft[field.key]
                            ? "text-red-500"
                            : "text-muted-foreground"
                        }`}
                      >
                        {draft[field.key] ? "Required *" : "Optional"}
                      </span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ==========================================================
              JOB RESPONSIBILITY STAGES (per-stage required control)
              ========================================================== */}
          <div className="space-y-2 mt-6">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold px-1">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" />
                <span>
                  JOB RESPONSIBILITY STAGES ({stageList.length})
                </span>
              </div>
              <div className="flex items-center gap-8">
                <span className="w-24 text-center">REQUIRED *</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground px-1 -mt-1">
              Mark individual workflow stages as required. Stages marked{" "}
              <strong className="text-red-500">Required *</strong> must have a
              responsible person assigned before the order can be submitted.
            </p>

            <div className="divide-y divide-border border border-border rounded-xl bg-card overflow-hidden">
              {isLoadingStages ? (
                <div className="p-4 text-xs text-muted-foreground text-center">
                  Loading workflow stages...
                </div>
              ) : (
                stageList.map((stage, index) => {
                  const checked = Boolean(stageDraft[stage.key]);
                  return (
                    <div
                      key={stage.key}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <span className="text-xs font-bold text-muted-foreground/60 w-5">
                          {index + 1}.
                        </span>
                        <span className="text-xs font-semibold text-foreground truncate">
                          {stage.name}
                        </span>
                        {stage.department ? (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {stage.department}
                          </span>
                        ) : null}
                      </div>

                      <div className="w-24 flex justify-center shrink-0">
                        <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() =>
                              handleStageToggle(stage.key)
                            }
                          />
                          <span
                            className={`text-[11px] font-bold ${
                              checked
                                ? "text-red-500"
                                : "text-muted-foreground"
                            }`}
                          >
                            {checked ? "Required *" : "Optional"}
                          </span>
                        </label>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground font-semibold px-1 mt-4">
            {requiredCount} required · {totalCount - requiredCount} optional
          </p>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetToDefaults}
            disabled={isSaving}
            className="h-9 text-xs rounded-lg font-semibold"
          >
            <RotateCcw className="size-3.5 mr-1.5" />
            Reset Defaults
          </Button>
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

export default ManageOrderFieldsModal;