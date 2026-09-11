import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ClockTimePicker } from "@/components/ui/clock-time-picker";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  GripVertical,
  Plus,
  Search,
  Send,
  Settings2,
  ShoppingCart,
  Trash2,
  FileSpreadsheet,
  Layers,
  Users,
  RotateCcw,
  Loader2,
} from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import workflowApi, {
  WorkflowOrder,
  WorkflowEvent,
  WorkflowTemplate,
  WorkflowTemplateStep,
} from "@/services/workflowApi";
import { useERPStore } from "@/store/erpStore";
import { canPerformPageAction } from "@/utils/pagePermissions";
import { canWorkOnOrder } from "@/utils/salesOrderAccess";
import {
  WORKFLOW_REDIRECT_OPTIONS,
  parseStageRoutes,
  serializeStageRoutes,
} from "@/hooks/useWorkflowTemplate";

interface StageDef {
  value: string;
  label: string;
  color: string | null;
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

function stageDefOf(stages: StageDef[], key?: string | null): StageDef | undefined {
  return stages.find((s) => s.value === key);
}

function stageLabelOf(stages: StageDef[], key?: string | null) {
  return stageDefOf(stages, key)?.label ?? (key ? key.replace(/_/g, " ") : "—");
}

function stageColorOf(stages: StageDef[], key?: string | null) {
  return stageDefOf(stages, key)?.color ?? FALLBACK_COLOR;
}

function chipStyle(color?: string | null) {
  const c = color || FALLBACK_COLOR;
  return {
    color: c,
    backgroundColor: `${c}1a`,
    borderColor: `${c}33`,
  };
}

function dotStyle(color?: string | null) {
  return { backgroundColor: color || FALLBACK_COLOR };
}

function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const d = new Date(value);
  const datePart = d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  // Show time only if it's not midnight UTC (i.e. a real time was set)
  const hasTime =
    d.getHours() !== 0 || d.getMinutes() !== 0;
  if (!hasTime) return datePart;
  const timePart = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

function overdue(value?: string | Date | null) {
  return !!value && new Date(value).getTime() < Date.now();
}

function StageChip({
  stages,
  stage,
}: {
  stages: StageDef[];
  stage?: string | null;
}) {
  const style = chipStyle(stageColorOf(stages, stage));
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium"
      style={style}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={dotStyle(stageColorOf(stages, stage))}
      />
      {stageLabelOf(stages, stage)}
    </span>
  );
}

export default function WorkflowTrackerPage() {
  const store = useERPStore();
  const currentUser = store.users?.find(
    (u: any) => u.id === store.currentUserId,
  ) as any;
  const canEdit = canPerformPageAction(
    currentUser?.actionPermissions,
    "workflow_tracker",
    "edit",
  );

  const canWorkOrder = useCallback(
    (order: WorkflowOrder) =>
      canWorkOnOrder(
        {
          assignments: order.assignments,
          workflowStage: order.workflowStage,
        },
        store.currentUserId,
      ),
    [store.currentUserId],
  );

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<WorkflowOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<WorkflowOrder | null>(
    null,
  );
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const [timeline, setTimeline] = useState<WorkflowEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(() => {
    return searchParams.get("stages") === "true" || searchParams.get("open") === "stages";
  });
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    if (searchParams.get("stages") === "true" || searchParams.get("open") === "stages") {
      setEditorOpen(true);
    }
  }, [searchParams]);

  const [reminderOpen, setReminderOpen] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const [reminderForm, setReminderForm] = useState({
    nextAction: "",
    dueDate: "",
    dueTime: "",
    description: "",
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

  const loadTemplate = useCallback(async () => {
    try {
      const response = await workflowApi.getTemplate();
      if (response.data.success) {
        setTemplate(response.data.data);
      }
    } catch (error) {
      console.error("Failed to load workflow template:", error);
    } finally {
      setTemplateLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplate();
  }, [loadTemplate]);

  const pipelineStages: StageDef[] = useMemo(() => {
    if (template?.steps?.length) {
      return template.steps
        .filter((s) => s.isActive)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          value: s.key,
          label: s.name,
          color: s.color,
          isFinal: s.isFinal,
        }));
    }
    return DEFAULT_STAGES;
  }, [template]);

  const finalStageKey = useMemo(
    () =>
      pipelineStages.find((s) => s.isFinal)?.value ??
      pipelineStages[pipelineStages.length - 1]?.value,
    [pipelineStages],
  );

  const loadTracker = useCallback(async (orderId: string) => {
    setLoadingTimeline(true);
    try {
      const response = await workflowApi.getOrderTracker(orderId);
      if (response.data.success) {
        setTimeline(response.data.data.timeline || []);
      }
    } catch (error) {
      console.error("Failed to load workflow tracker:", error);
      setTimeline([]);
    } finally {
      setLoadingTimeline(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await workflowApi.getOrders({
        search: search.trim() || undefined,
      });
      if (response.data.success) {
        const data = response.data.data || [];
        setOrders(data);
        setSelectedOrder((current) =>
          current
            ? data.find((x) => x.id === current.id) || data[0] || null
            : data[0] || null,
        );
      }
    } catch (error) {
      console.error("Failed to load workflow orders:", error);
      toast.error("Failed to load workflow orders.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const selectedOrderId = selectedOrder?.id;
  useEffect(() => {
    if (selectedOrderId) {
      void loadTracker(selectedOrderId);
    } else {
      setTimeline([]);
    }
  }, [selectedOrderId, loadTracker]);

  const handleSelectOrder = (order: WorkflowOrder) => {
    setSelectedOrder(order);
    void loadTracker(order.id);
  };

  const handleStageChange = async (
    orderId: string,
    stage: string,
    extra?: {
      nextAction?: string | null;
      dueDate?: string | null;
      description?: string | null;
    },
  ) => {
    const order = orders.find((item) => item.id === orderId);
    if (
      !order ||
      (order.workflowStage === stage && !extra) ||
      updatingOrderId === orderId
    )
      return;

    if (!canWorkOrder(order)) {
      toast.error(
        "Access denied: you are not assigned to this order's current stage.",
      );
      return;
    }

    try {
      setUpdatingOrderId(orderId);
      await workflowApi.updateOrderWorkflowStage(orderId, stage, extra);
      toast.success(
        extra
          ? "Workflow details updated successfully."
          : `Order moved to "${stageLabelOf(pipelineStages, stage)}".`,
      );
      await loadOrders();
      await loadTracker(orderId);
    } catch (error: any) {
      console.error("Failed to update workflow stage:", error);
      toast.error(
        error?.response?.data?.message ?? "Failed to update workflow stage.",
      );
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const orderId = active.id.toString().replace("order:", "");
    const targetStage = over.id.toString().replace("stage:", "");
    if (
      !orderId ||
      !targetStage ||
      !pipelineStages.some((s) => s.value === targetStage)
    )
      return;

    const order = orders.find((item) => item.id === orderId);
    if (!order || order.workflowStage === targetStage) return;

    void handleStageChange(orderId, targetStage);
  };

  const handleMarkAsDone = async () => {
    if (!selectedOrder) return;
    const currentIndex = pipelineStages.findIndex(
      (s) => s.value === selectedOrder.workflowStage,
    );
    const nextStage = pipelineStages[currentIndex + 1];
    if (!nextStage) {
      toast.success("Order is already in the final stage.");
      return;
    }
    await handleStageChange(selectedOrder.id, nextStage.value, {
      description: `Marked as done — advanced to ${nextStage.label}`,
    });
  };

  const openReminder = () => {
    if (!selectedOrder) return;
    let dateStr = "";
    let timeStr = "";
    if (selectedOrder.dueDate) {
      const d = new Date(selectedOrder.dueDate);
      dateStr = d.toISOString().slice(0, 10);
      // Extract local HH:mm if a real time was set
      const h = d.getHours();
      const m = d.getMinutes();
      if (h !== 0 || m !== 0) {
        timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      }
    }
    setReminderForm({
      nextAction: selectedOrder.nextAction || "",
      dueDate: dateStr,
      dueTime: timeStr,
      description: "",
    });
    setReminderOpen(true);
  };

  const handleSaveReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    // Combine date + time into a full ISO datetime string
    let combinedDueDate: string | null = null;
    if (reminderForm.dueDate) {
      if (reminderForm.dueTime) {
        // Build a local datetime string and convert to ISO
        combinedDueDate = new Date(
          `${reminderForm.dueDate}T${reminderForm.dueTime}:00`,
        ).toISOString();
      } else {
        combinedDueDate = new Date(`${reminderForm.dueDate}T00:00:00`).toISOString();
      }
    }

    setSavingReminder(true);
    try {
      await workflowApi.updateOrderWorkflowStage(
        selectedOrder.id,
        selectedOrder.workflowStage,
        {
          nextAction: reminderForm.nextAction.trim() || null,
          dueDate: combinedDueDate,
          description:
            reminderForm.description.trim() || "Reminder / follow-up scheduled",
        },
      );
      toast.success("Reminder details saved successfully.");
      setReminderOpen(false);
      await loadOrders();
      await loadTracker(selectedOrder.id);
    } catch (error: any) {
      console.error("Failed to save reminder:", error);
      toast.error(error?.response?.data?.message ?? "Failed to save reminder.");
    } finally {
      setSavingReminder(false);
    }
  };

  const stats = useMemo(() => {
    const total = orders.length;
    const completed = finalStageKey
      ? orders.filter((o) => o.workflowStage === finalStageKey).length
      : 0;
    const inProgress = total - completed;
    const overdueCount = orders.filter((o) => overdue(o.dueDate)).length;
    return { total, inProgress, completed, overdue: overdueCount };
  }, [orders, finalStageKey]);

  const columns = useMemo(
    () =>
      pipelineStages.map((stage) => ({
        ...stage,
        orders: orders.filter((o) => o.workflowStage === stage.value),
      })),
    [pipelineStages, orders],
  );

  const sortedOrders = useMemo(
    () =>
      [...orders].sort(
        (a, b) =>
          (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) -
          (b.dueDate ? new Date(b.dueDate).getTime() : Infinity),
      ),
    [orders],
  );

  return (
    <div className="min-h-full bg-background p-3 text-foreground lg:p-5">
      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* HEADER */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Workflow Tracker
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {template?.name || "Track orders from confirmation to completion"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-full max-w-xs items-center rounded-lg border border-border bg-card px-3">
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadOrders()}
                placeholder="Search order, PO, customer..."
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditorOpen(true)}
                disabled={templateLoading}
                className="h-9 gap-1.5 rounded-lg text-xs font-semibold"
              >
                <Settings2 className="h-3.5 w-3.5" /> Stages
              </Button>
            )}
          </div>
        </header>

        {/* KPI STRIP */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Summary
            icon={<ShoppingCart className="h-4 w-4" />}
            title="Total Orders"
            value={stats.total}
            note="All orders in view"
            cls="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          />
          <Summary
            icon={<Clock3 className="h-4 w-4" />}
            title="In Progress"
            value={stats.inProgress}
            note="Awaiting completion"
            cls="bg-violet-500/10 text-violet-600 dark:text-violet-400"
          />
          <Summary
            icon={<CheckCircle2 className="h-4 w-4" />}
            title="Completed"
            value={stats.completed}
            note={finalStageKey ? stageLabelOf(pipelineStages, finalStageKey) : "Done"}
            cls="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          />
          <Summary
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Overdue"
            value={stats.overdue}
            note="Past due date"
            cls="bg-red-500/10 text-red-600 dark:text-red-400"
          />
        </div>

        {/* PIPELINE BOARD */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Pipeline</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Drag an order card to move it to another stage
              </p>
            </div>
          </div>

          <div className="w-full overflow-x-auto pb-2">
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div className="flex min-w-max gap-3">
                {columns.map((column) => (
                  <PipelineColumn
                    key={column.value}
                    stage={column}
                    onSelect={handleSelectOrder}
                  />
                ))}
              </div>
            </DndContext>
          </div>
        </section>

        {/* ALL ORDERS + ORDER DETAIL */}
        <div className="space-y-4">
          {/* ALL ORDERS */}
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">All Orders</h2>
              <span className="text-xs text-muted-foreground">
                {orders.length} order{orders.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5">Order / PO</th>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5">Value</th>
                    <th className="px-4 py-2.5">Stage</th>
                    <th className="px-4 py-2.5">Next Action</th>
                    <th className="px-4 py-2.5">Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-xs text-muted-foreground"
                      >
                        Loading workflow...
                      </td>
                    </tr>
                  ) : !sortedOrders.length ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-xs text-muted-foreground"
                      >
                        No orders found.
                      </td>
                    </tr>
                  ) : (
                    sortedOrders.map((order) => {
                      const isOverdue = overdue(order.dueDate);
                      return (
                        <tr
                          key={order.id}
                          onClick={() => handleSelectOrder(order)}
                          className={`cursor-pointer border-b border-border last:border-0 ${
                            selectedOrder?.id === order.id
                              ? "bg-muted/60"
                              : "hover:bg-muted/30"
                          }`}
                        >
                          <td className="px-4 py-2.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            {order.dveplCode}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-foreground/80">
                            {order.partyName || order.caNo || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-foreground/80">
                            {order.grandTotal
                              ? "₹" +
                                Number(order.grandTotal).toLocaleString(
                                  "en-IN",
                                  { maximumFractionDigits: 0 },
                                )
                              : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              value={order.workflowStage}
                              disabled={
                                updatingOrderId === order.id ||
                                !canEdit ||
                                !canWorkOrder(order)
                              }
                              title={
                                !canWorkOrder(order)
                                  ? "View only — you are not assigned to this order's current stage"
                                  : undefined
                              }
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                void handleStageChange(
                                  order.id,
                                  event.target.value,
                                )
                              }
                              aria-label={`Change stage for ${order.dveplCode}`}
                              style={chipStyle(
                                stageColorOf(pipelineStages, order.workflowStage),
                              )}
                              className={`h-7 min-w-[130px] cursor-pointer rounded-md border px-1.5 text-[11px] font-medium ${updatingOrderId === order.id ? "cursor-wait opacity-60" : ""}`}
                            >
                              {pipelineStages.map((stage) => (
                                <option
                                  key={stage.value}
                                  value={stage.value}
                                  className="bg-card text-foreground"
                                >
                                  {stage.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="max-w-[180px] truncate px-4 py-2.5 text-xs text-foreground/80">
                            {order.nextAction || "—"}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-xs ${isOverdue ? "font-semibold text-red-500" : "text-muted-foreground"}`}
                          >
                            {isOverdue && (
                              <span className="mr-1.5 inline-block rounded bg-red-500/10 px-1 py-0.5 text-[10px] font-semibold text-red-500">
                                Overdue
                              </span>
                            )}
                            {formatDate(order.dueDate)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ORDER DETAIL */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm lg:p-6">
            {selectedOrder ? (
              <OrderDetail
                order={selectedOrder}
                stages={pipelineStages}
                timeline={timeline}
                loadingTimeline={loadingTimeline}
                updating={updatingOrderId === selectedOrder.id}
                canEdit={canEdit}
                canWork={canWorkOrder(selectedOrder)}
                onBack={() => setSelectedOrder(null)}
                onMarkAsDone={() => void handleMarkAsDone()}
                onOpenReminder={openReminder}
              />
            ) : (
              <Empty text="Select an order to view its details and workflow history." />
            )}
          </section>
        </div>
      </div>

      {/* TEMPLATE EDITOR DIALOG */}
      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={template}
        saving={savingTemplate}
        onSave={async (steps, meta) => {
          setSavingTemplate(true);
          try {
            await workflowApi.updateTemplate({
              name: meta?.name ?? template?.name ?? "Default Order Workflow",
              description: meta?.description ?? template?.description,
              steps: steps.map((s, i) => ({
                key: s.key || undefined,
                name: s.name,
                color: s.color || null,
                isFinal: i === steps.length - 1 || s.isFinal,
                isActive: true,
              })),
            });
            toast.success("Workflow stages updated successfully.");
            setEditorOpen(false);
            await loadTemplate();
            await loadOrders();

            const fromOrders = searchParams.get("from") === "orders" || searchParams.get("returnTo") === "orders";
            if (fromOrders) {
              // Notify opener window if opened in a popup/tab
              try {
                if (window.opener && !window.opener.closed) {
                  window.opener.postMessage({ type: "WORKFLOW_STAGES_UPDATED" }, "*");
                  window.close();
                  return;
                }
              } catch {}
              // Otherwise navigate back to orders page
              navigate("/tender/orders");
            }
          } catch (error: any) {
            console.error("Failed to update workflow template:", error);
            toast.error(
              error?.response?.data?.message ??
                "Failed to update workflow template.",
            );
          } finally {
            setSavingTemplate(false);
          }
        }}
      />

      {/* REMINDER DIALOG */}
      <Dialog
        open={reminderOpen}
        onOpenChange={(open) => {
          if (!open && !savingReminder) setReminderOpen(false);
        }}
      >
        <DialogContent className="overflow-visible rounded-xl p-0 sm:max-w-md">
          <DialogHeader className="border-b bg-muted/30 px-6 py-4">
            <DialogTitle className="text-base font-bold">
              {selectedOrder?.dveplCode || "Order"} — Follow Up
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Set the next action, due date, and notes for this order.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveReminder} className="space-y-4 p-6">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">
                Next Action
              </Label>
              <Input
                value={reminderForm.nextAction}
                onChange={(e) =>
                  setReminderForm((prev) => ({
                    ...prev,
                    nextAction: e.target.value,
                  }))
                }
                placeholder="e.g. Follow up with customer for drawings"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">
                Due Date &amp; Time
              </Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={reminderForm.dueDate}
                  onChange={(e) =>
                    setReminderForm((prev) => ({
                      ...prev,
                      dueDate: e.target.value,
                    }))
                  }
                  className="h-9 flex-1 text-xs"
                />
              </div>
              <ClockTimePicker
                value={reminderForm.dueTime}
                onChange={(v) =>
                  setReminderForm((prev) => ({ ...prev, dueTime: v }))
                }
              />
              {reminderForm.dueDate && reminderForm.dueTime && (
                <p className="text-[10px] text-muted-foreground">
                  Reminder at{" "}
                  {new Date(
                    `${reminderForm.dueDate}T${reminderForm.dueTime}:00`,
                  ).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">
                Notes
              </Label>
              <Textarea
                value={reminderForm.description}
                onChange={(e) =>
                  setReminderForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Optional note recorded in workflow history"
                className="text-xs"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReminderOpen(false)}
                disabled={savingReminder}
                className="h-9 rounded-lg text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingReminder}
                className="h-9 rounded-lg text-xs font-bold"
              >
                {savingReminder ? "Saving..." : "Save Reminder"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Summary({
  icon,
  title,
  value,
  note,
  cls,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  note: string;
  cls: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cls}`}
        >
          {icon}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className="mt-0.5 text-2xl font-semibold tracking-tight">
            {value}
          </div>
          <div className="text-[10px] text-muted-foreground">{note}</div>
        </div>
      </div>
    </div>
  );
}

function OrderDetail({
  order,
  stages,
  timeline,
  loadingTimeline,
  updating,
  canEdit,
  canWork,
  onBack,
  onMarkAsDone,
  onOpenReminder,
}: {
  order: WorkflowOrder;
  stages: StageDef[];
  timeline: WorkflowEvent[];
  loadingTimeline: boolean;
  updating: boolean;
  canEdit: boolean;
  canWork: boolean;
  onBack: () => void;
  onMarkAsDone: () => void;
  onOpenReminder: () => void;
}) {
  const navigate = useNavigate();
  const isOverdue = overdue(order.dueDate);

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <button
            onClick={onBack}
            className="mb-2 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            ‹ Back to orders
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{order.dveplCode}</h2>
            <StageChip stages={stages} stage={order.workflowStage} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.partyName || order.caNo || "—"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/accounts/${order.id}`)}
            className="gap-1 text-sky-600 dark:text-sky-400 border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10 cursor-pointer shadow-3xs"
            title="Open Accounts Costing & Quotation sheet"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Accounts
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/purchase/vendors?orderId=${order.id}&ref=${encodeURIComponent(order.dveplCode || "")}`)}
            className="gap-1 text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 cursor-pointer shadow-3xs"
            title="Open Vendors & Purchase Orders"
          >
            <Users className="h-3.5 w-3.5" /> Vendors
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/export-orders?orderId=${order.id}`)}
            className="gap-1 text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 cursor-pointer shadow-3xs"
            title="Open Engineering Drawings & Revisions"
          >
            <Layers className="h-3.5 w-3.5" /> Drawings
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenReminder}>
            <Send className="h-3.5 w-3.5" /> Reminder
          </Button>
          <Button
            size="sm"
            onClick={onMarkAsDone}
            disabled={updating || !canEdit || !canWork}
            title={
              !canWork
                ? "View only — you are not assigned to this order's current stage"
                : undefined
            }
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark as Done
          </Button>
        </div>
      </div>

      {/* Pipeline progress */}
      <PipelineProgress stages={stages} current={order.workflowStage} />

      {/* Quick info */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <InfoBox label="Next Action" value={order.nextAction || "No action"} />
        <InfoBox
          label="Due Date"
          value={formatDate(order.dueDate)}
          alert={isOverdue}
        />
        <InfoBox
          label="Order Value"
          value={
            order.grandTotal
              ? "₹" +
                Number(order.grandTotal).toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })
              : "—"
          }
        />
        <InfoBox
          label="Status"
          value={isOverdue ? "Overdue" : "On Track"}
          alert={isOverdue}
        />
      </div>

      {/* Workflow history */}
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold">Activity History</h3>
        {loadingTimeline ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            Loading activity...
          </div>
        ) : timeline.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {timeline.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-3"
              >
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={dotStyle(stageColorOf(stages, event.stage))}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-foreground">
                    {event.title}
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={chipStyle(stageColorOf(stages, event.stage))}
                    >
                      {stageLabelOf(stages, event.stage)}
                    </span>
                  </div>
                  {event.description && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {event.description}
                    </div>
                  )}
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {formatDate(event.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-4 text-xs text-muted-foreground">
            No workflow activity recorded yet.
          </div>
        )}
      </div>
    </div>
  );
}

function InfoBox({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-0.5 truncate text-xs font-medium ${
          alert ? "text-red-500" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function PipelineProgress({
  stages,
  current,
}: {
  stages: StageDef[];
  current: string;
}) {
  const currentIndex = Math.max(
    0,
    stages.findIndex((s) => s.value === current),
  );
  const total = stages.length;
  const percent = Math.round((currentIndex / (total - 1)) * 100);
  const isDone = currentIndex === total - 1;

  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4 lg:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Workflow Progress
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isDone
              ? "This order has completed all stages."
              : `Currently at "${stageLabelOf(stages, current)}" — ${total - 1 - currentIndex} stage${total - 1 - currentIndex === 1 ? "" : "s"} remaining.`}
          </p>
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${
            isDone
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
          }`}
        >
          {isDone ? (
            <>
              <CheckCircle2 className="h-4 w-4" /> 100% Done
            </>
          ) : (
            <>
              <Clock3 className="h-4 w-4" /> {percent}% Complete
            </>
          )}
        </div>
      </div>

      {/* Pipe */}
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <div className="flex items-center gap-1">
            {stages.map((stage, i) => {
              const completed = i < currentIndex;
              const active = i === currentIndex;
              return (
                <div key={stage.value} className="flex flex-1 items-center gap-1">
                  <div
                    className={`h-2.5 flex-1 rounded-full transition-colors ${
                      completed
                        ? "bg-emerald-500"
                        : active
                          ? "bg-blue-500/70"
                          : "bg-border"
                    }`}
                  />
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      completed
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : active
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {completed ? (
                      <CheckCircle2 className="h-2.5 w-2.5" />
                    ) : active ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Stage labels */}
          <div className="mt-2 flex items-center">
            {stages.map((stage, i) => (
              <div
                key={stage.value}
                className={`flex-1 text-center text-[10px] font-medium leading-tight ${
                  i === currentIndex
                    ? "text-blue-600 dark:text-blue-400"
                    : i < currentIndex
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                }`}
              >
                {stage.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PipelineColumn({
  stage,
  onSelect,
}: {
  stage: StageDef & { orders: WorkflowOrder[] };
  onSelect: (order: WorkflowOrder) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage:${stage.value}`,
  });
  const overdueCount = stage.orders.filter((o) => overdue(o.dueDate)).length;

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[230px] shrink-0 flex-col rounded-xl border p-2 transition-all ${
        isOver
          ? "border-emerald-500/60 bg-emerald-500/5 ring-2 ring-emerald-500/20"
          : "border-border bg-muted/20"
      }`}
    >
      <div className="flex items-center justify-between px-1.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={dotStyle(stage.color)}
          />
          <span className="text-xs font-semibold text-foreground">
            {stage.label}
          </span>
        </div>
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={chipStyle(stage.color)}
        >
          {stage.orders.length}
        </span>
      </div>

      {overdueCount > 0 && (
        <div className="mb-1 px-1.5 text-[10px] font-medium text-red-500">
          {overdueCount} overdue
        </div>
      )}

      <div className="space-y-2">
        {stage.orders.map((order) => (
          <PipelineCard key={order.id} order={order} onSelect={onSelect} />
        ))}
        {!stage.orders.length && (
          <div
            className={`rounded-lg border border-dashed px-2 py-6 text-center text-[11px] text-muted-foreground ${
              isOver ? "border-emerald-500/60" : "border-border"
            }`}
          >
            {isOver ? "Drop here" : "No orders"}
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineCard({
  order,
  onSelect,
}: {
  order: WorkflowOrder;
  onSelect: (order: WorkflowOrder) => void;
}) {
  const isOverdue = overdue(order.dueDate);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `order:${order.id}` });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelect(order)}
      {...attributes}
      {...listeners}
      style={{
        transform: transform
          ? `translate(${transform.x}px, ${transform.y}px)`
          : undefined,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 40 : undefined,
        position: "relative",
        touchAction: "none",
      }}
      className="group w-full cursor-grab rounded-lg border border-border bg-card p-2.5 text-left shadow-sm transition-all hover:-translate-y-px hover:border-emerald-500/40 hover:bg-muted/20 active:cursor-grabbing"
    >
      <span className="absolute right-2 top-2 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
        <GripVertical className="h-3 w-3" />
      </span>

      <div className="pr-4">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-bold text-emerald-600 dark:text-emerald-400">
            {order.dveplCode}
          </span>
          {isOverdue && (
            <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-500">
              Overdue
            </span>
          )}
        </div>
      </div>

      <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-foreground/80">
        {order.nextAction || "No action assigned"}
      </p>

      <div className="mt-2 flex items-center gap-1 border-t border-border pt-1.5 text-[10px] text-muted-foreground">
        <CalendarDays className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {order.dueDate ? formatDate(order.dueDate) : "No due date"}
        </span>
      </div>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

// ============================================================
// Template editor
// ============================================================

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

function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: WorkflowTemplate | null;
  saving: boolean;
  onSave: (
    steps: DraftStep[],
    meta: { name?: string; description?: string | null },
  ) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

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

    await onSave(cleaned, {
      name: name.trim(),
      description: serializedDesc,
    });
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
                  className="h-7 text-[11px] font-semibold text-muted-foreground hover:text-foreground gap-1 px-2 cursor-pointer"
                >
                  <RotateCcw className="size-3" /> Reset Default
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addStep}
                  className="h-7 text-[11px] font-semibold gap-1 px-2.5 rounded-lg cursor-pointer"
                >
                  <Plus className="size-3.5" /> Add Stage
                </Button>
              </div>
            </div>

            {/* Draggable Stages */}
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

            {/* Add Stage Bottom Dashed Button */}
            <button
              type="button"
              onClick={addStep}
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