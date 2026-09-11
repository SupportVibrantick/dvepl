import React, { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  GripVertical,
  Plus,
  Trash2,
  Layers,
  RotateCcw,
  Loader2,
} from "lucide-react";
import workflowApi, {
  WorkflowTemplate,
  WorkflowTemplateStep,
} from "@/services/workflowApi";
import {
  WORKFLOW_REDIRECT_OPTIONS,
  parseStageRoutes,
  serializeStageRoutes,
} from "@/hooks/useWorkflowTemplate";

interface StageDef {
  value: string;
  label: string;
  color: string;
  isFinal: boolean;
}

const DEFAULT_STAGES: StageDef[] = [
  { value: "ORDER_CONFIRMED", label: "Order Confirmed", color: "#3b82f6", isFinal: false },
  { value: "ACCOUNTS_COSTING", label: "Accounts & Costing", color: "#0284c7", isFinal: false },
  { value: "PO_READY", label: "PO Ready", color: "#8b5cf6", isFinal: false },
  { value: "DRAWING_ASSIGNED", label: "Drawing Assigned", color: "#a855f7", isFinal: false },
  { value: "DRAWING_SENT", label: "Drawing Sent", color: "#6366f1", isFinal: false },
  { value: "REVISION_REQUIRED", label: "Revision Required", color: "#f97316", isFinal: false },
  { value: "DRAWING_APPROVED", label: "Drawing Approved", color: "#22c55e", isFinal: false },
  { value: "PO_PLACED", label: "PO Placed", color: "#10b981", isFinal: false },
  { value: "INVENTORY_FOLLOW_UP", label: "Inventory Follow-up", color: "#f59e0b", isFinal: false },
  { value: "PRODUCTION_FOLLOW_UP", label: "Production Follow-up", color: "#06b6d4", isFinal: true },
];

const FALLBACK_COLOR = "#64748b";

interface DraftStep {
  key: string;
  name: string;
  color: string;
  targetPage?: string;
  isFinal?: boolean;
}

const STAGE_RANDOM_COLORS = [
  "#3b82f6",
  "#0284c7",
  "#06b6d4",
  "#10b981",
  "#22c55e",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
  "#64748b",
];

function getRandomStageColor(index?: number) {
  if (typeof index === "number") {
    return STAGE_RANDOM_COLORS[index % STAGE_RANDOM_COLORS.length];
  }
  return STAGE_RANDOM_COLORS[Math.floor(Math.random() * STAGE_RANDOM_COLORS.length)];
}

interface SortableStageRowProps {
  step: DraftStep;
  index: number;
  totalSteps: number;
  updateStep: (index: number, patch: Partial<DraftStep>) => void;
  removeStep: (index: number) => void;
}

function SortableStageRow({
  step,
  index,
  totalSteps,
  updateStep,
  removeStep,
}: SortableStageRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.key });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2.5 rounded-xl border border-border/80 bg-card px-3 py-2.5 shadow-3xs transition-all duration-150 ${
        isDragging
          ? "border-primary/50 bg-primary/[0.03] shadow-md"
          : "hover:border-border hover:shadow-xs"
      }`}
    >
      {/* Drag Handle on Left */}
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground/40 hover:text-foreground rounded-md hover:bg-muted transition-colors touch-none shrink-0"
        title="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </span>

      {/* Step Sequence Badge with Color Indicator */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className="size-2 rounded-full shrink-0"
          style={{ backgroundColor: step.color || FALLBACK_COLOR }}
        />
        <span className="size-6 rounded-lg bg-muted text-muted-foreground font-bold text-[11px] flex items-center justify-center border border-border/50">
          {index + 1}
        </span>
      </div>

      {/* Stage Name Input */}
      <Input
        value={step.name}
        onChange={(e) => updateStep(index, { name: e.target.value })}
        placeholder="Enter stage name..."
        className="h-8 flex-1 min-w-[130px] text-xs font-semibold rounded-lg bg-muted/20 focus-visible:bg-background border-border/80"
      />

      {/* Redirection Page Selector */}
      <div className="shrink-0">
        <select
          value={step.targetPage || ""}
          onChange={(e) => updateStep(index, { targetPage: e.target.value })}
          className="h-8 text-[11px] font-medium rounded-lg border border-border/80 bg-muted/30 px-2 text-foreground focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer transition-colors"
          title="Redirect to page on click"
        >
          {WORKFLOW_REDIRECT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Delete Stage on Right */}
      <button
        type="button"
        onClick={() => removeStep(index)}
        disabled={totalSteps <= 1}
        title={
          totalSteps <= 1
            ? "At least one stage is required"
            : `Remove "${step.name || "Stage"}"`
        }
        className="shrink-0 p-1.5 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
        aria-label={`Remove ${step.name}`}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

interface ManageWorkflowStagesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function ManageWorkflowStagesModal({
  open,
  onOpenChange,
  onSaved,
}: ManageWorkflowStagesModalProps) {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

  const loadTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await workflowApi.getTemplate();
      setTemplate(res.data?.data ?? null);
    } catch (err) {
      console.error("Failed to load workflow template:", err);
      setTemplate(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadTemplate();
  }, [open, loadTemplate]);

  useEffect(() => {
    if (!open) return;
    setName(template?.name || "Default Order Workflow");
    const routes = parseStageRoutes(template?.description);
    const base: WorkflowTemplateStep[] = template?.steps?.length
      ? template.steps
      : DEFAULT_STAGES.map((s, i) => ({
          id: s.value,
          key: s.value,
          name: s.label,
          color: s.color,
          position: i,
          isFinal: i === DEFAULT_STAGES.length - 1,
          isActive: true,
        }));
    setSteps(
      base
        .filter((s) => s.isActive)
        .sort((a, b) => a.position - b.position)
        .map((s, idx) => ({
          key: s.key,
          name: s.name,
          color: s.color || getRandomStageColor(idx),
          targetPage: routes[s.key] ?? routes[s.key.toUpperCase()] ?? "",
          isFinal: s.isFinal,
        })),
    );
  }, [open, template]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSteps((prev) => {
      const oldIndex = prev.findIndex((s) => s.key === active.id);
      const newIndex = prev.findIndex((s) => s.key === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const updateStep = (index: number, patch: Partial<DraftStep>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  };

  const addStep = () => {
    const newIdx = steps.length + 1;
    setSteps((prev) => [
      ...prev,
      {
        key: `STAGE_${Date.now()}`,
        name: `New Stage ${newIdx}`,
        color: getRandomStageColor(prev.length),
        targetPage: "",
      },
    ]);
  };

  const resetToDefault = () => {
    const defaultRoutes = parseStageRoutes(null);
    setSteps(
      DEFAULT_STAGES.map((s, idx) => ({
        key: s.value,
        name: s.label,
        color: s.color || getRandomStageColor(idx),
        targetPage: defaultRoutes[s.value] || "",
      })),
    );
    toast.success("Stages reset to default workflow sequence.");
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) {
      toast.error("At least one stage is required.");
      return;
    }
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const cleaned = steps
      .map((s) => ({ ...s, name: s.name.trim() }))
      .filter((s) => s.name.length > 0);
    if (cleaned.length === 0) {
      toast.error("At least one workflow stage is required.");
      return;
    }

    const stageRoutes: Record<string, string> = {};
    cleaned.forEach((s) => {
      if (s.targetPage) {
        stageRoutes[s.key] = s.targetPage;
      }
    });
    const serializedDesc = serializeStageRoutes(
      stageRoutes,
      template?.description,
    );

    setSaving(true);
    try {
      await workflowApi.updateTemplate({
        name: name.trim() || template?.name || "Default Order Workflow",
        description: serializedDesc,
        steps: cleaned.map((s, i) => ({
          key: s.key || undefined,
          name: s.name,
          color: s.color || null,
          isFinal: i === cleaned.length - 1 || s.isFinal,
          isActive: true,
        })),
      });
      toast.success("Workflow stages updated successfully.");
      window.dispatchEvent(new CustomEvent("WORKFLOW_STAGES_UPDATED"));
      onSaved?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to update workflow template:", error);
      toast.error(
        error?.response?.data?.message ?? "Failed to update workflow template.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="overflow-hidden rounded-2xl p-0 sm:max-w-xl border shadow-2xl">
        {/* Header */}
        <DialogHeader className="border-b bg-muted/20 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 border border-primary/20">
                <Layers className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Workflow Stages
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Configure and sequence stages for order workflow tracking
                </DialogDescription>
              </div>
            </div>
            <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
              {steps.length} {steps.length === 1 ? "Stage" : "Stages"}
            </span>
          </div>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-6">
          {/* Template Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              Template Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Default Order Workflow"
              className="h-9 text-xs rounded-xl"
              disabled={loading || saving}
            />
          </div>

          {/* Stages List Controls */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pt-1">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Pipeline Stages ({steps.length})
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetToDefault}
                  disabled={loading || saving}
                  className="h-7 text-[11px] font-semibold text-muted-foreground hover:text-foreground gap-1 px-2 cursor-pointer"
                >
                  <RotateCcw className="size-3" /> Reset Default
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addStep}
                  disabled={saving}
                  className="h-7 text-[11px] font-semibold gap-1 px-2.5 rounded-lg cursor-pointer"
                >
                  <Plus className="size-3.5" /> Add Stage
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading stages...
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={steps.map((s) => s.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {steps.map((step, index) => (
                      <SortableStageRow
                        key={step.key}
                        step={step}
                        index={index}
                        totalSteps={steps.length}
                        updateStep={updateStep}
                        removeStep={removeStep}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {/* Add Stage Bottom Dashed Button */}
            <button
              type="button"
              onClick={addStep}
              disabled={saving}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-border/80 text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/[0.02] flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="size-4" /> Add Next Stage
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t bg-muted/20 px-6 py-3.5">
          <p className="text-xs text-muted-foreground font-medium hidden sm:block">
            Drag handle to reorder stages
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="h-9 rounded-xl text-xs font-semibold px-4 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
              className="h-9 rounded-xl text-xs font-bold px-5 gap-1.5 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Stages"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ManageWorkflowStagesModal;