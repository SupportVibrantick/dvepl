import React, { useState, useEffect, useMemo } from "react";
import { 
  CheckSquare, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  RefreshCw, 
  Bell, 
  Plus, 
  Edit, 
  Trash2, 
  Settings, 
  Calendar, 
  User, 
  X,
  Loader2,
  Info,
  Mail,
  MailCheck,
  MailX,
  Circle,
  Edit3,
  MessageSquare,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { hrmsApi } from "@/services/modules";
import { apiClient } from "@/services/axios";
import { DynamicFormRenderer } from "@/components/customFields/dynamicFormRenderer";
import { useDynamicCustomFields, validateCustomFields } from "@/hooks/useDynamicCustomFields";
import { ConfirmDialog } from "@/components/shared/confirmDialog";
import { useERPStore } from "@/store/erpStore";
import { canPerformPageAction, isAdminUser } from "@/utils/pagePermissions";

// Definitions
interface Task {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  dueDate: string;
  status: "pending" | "in-progress" | "completed";
  assignedUsers: Array<{ id: string; name: string; email?: string | null }>;
  mailDelivery?: {
    status: "SENT" | "FAILED" | "NOT_SENT";
    sentAt: string | null;
    recipient: string | null;
    error: string | null;
    logsCount?: number;
  };
  notifEnabled: boolean;
  notifType: "automatic" | "manual";
  notifDays: number;
  notifUnit: "days" | "hours";
  notifFrequency: "once" | "daily" | "every-12h";
  createdAt: string;
}

// ==========================================
// API ADAPTERS (EASILY REPLACE WITH AXIOS/FETCH LATER)
// ==========================================
export const apiService = {
  tasks: {
    list: async (): Promise<Task[]> => {
      return hrmsApi.tasks.list() as unknown as Task[];
    },
    create: async (task: any): Promise<any> => {
      return hrmsApi.tasks.create(task);
    },
    update: async (id: string, task: any): Promise<any> => {
      return hrmsApi.tasks.update!(id, task);
    },
    delete: async (id: string): Promise<void> => {
      return hrmsApi.tasks.remove!(id);
    },
    updateNotification: async (id: string, config: any): Promise<any> => {
      return hrmsApi.tasks.updateNotification(id, config);
    },
    sendReminders: async (): Promise<any> => {
      return hrmsApi.tasks.sendReminders();
    },
    sendWhatsAppReminder: async (id: string): Promise<any> => {
      return hrmsApi.tasks.sendWhatsAppReminder(id);
    }
  },
  employees: {
    list: async (): Promise<Array<{ id: string; name: string }>> => {
      const employees = await hrmsApi.employees.list();
      return employees.map((emp: any) => ({
        id: emp.userId || emp.id,
        name: emp.user?.name || `${emp.firstName} ${emp.lastName}`
      }));
    }
  }
};

export default function TasksPage() {
  const store = useERPStore();
  const currentUserId = store.currentUserId;
  const currentUser = store.users.find((u: any) => u.id === currentUserId) as any;
  const isAdmin = isAdminUser(currentUser);
  const canCreate = isAdmin || canPerformPageAction(currentUser?.actionPermissions, "tasks", "create");
  const canEdit = isAdmin || canPerformPageAction(currentUser?.actionPermissions, "tasks", "edit");
  const canDelete = isAdmin; // Strictly restricted to admin only

  const isUserAssigned = (task: Task) => {
    if (isAdmin) return true;
    return task.assignedUsers.some(
      (u) =>
        u.id === currentUserId ||
        u.id === currentUser?.id ||
        u.id === currentUser?.employeeId ||
        (currentUser?.email && u.email && u.email.toLowerCase() === currentUser.email.toLowerCase())
    );
  };

  const canManageThisTask = (task: Task) => {
    if (isAdmin) return true;
    return canEdit && isUserAssigned(task);
  };

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "in-progress" | "completed" | "overdue">("all");

  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [sortBy, setSortBy] = useState("due-soonest");

  const { fields: taskCustomFields } = useDynamicCustomFields("task");
  const [taskCustomValues, setTaskCustomValues] = useState<Record<string, any>>({});
  const [taskErrors, setTaskErrors] = useState<Record<string, string>>({});

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formValues, setFormValues] = useState({
    title: "",
    description: "",
    priority: "medium" as "high" | "medium" | "low",
    dueDate: "",
    status: "pending" as "pending" | "in-progress" | "completed",
  });
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifTaskId, setNotifTaskId] = useState<string | null>(null);
  const [notifValues, setNotifValues] = useState({
    enabled: true,
    type: "automatic" as "automatic" | "manual",
    days: 1,
    unit: "days" as "days" | "hours",
    frequency: "once" as "once" | "daily" | "every-12h"
  });

  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [tList, uList] = await Promise.all([
        apiService.tasks.list(),
        apiService.employees.list()
      ]);
      setTasks(tList);
      setUsers(uList);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load tasks from server.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const tList = await apiService.tasks.list();
      setTasks(tList);
      toast.success("Tasks refreshed.");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to refresh tasks.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleQuickToggleComplete = async (task: Task) => {
    if (!canManageThisTask(task)) {
      toast.error("You are not authorized to update this task.");
      return;
    }
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    try {
      await apiService.tasks.update(task.id, { status: nextStatus });
      toast.success(nextStatus === "completed" ? "Task completed! 🎉" : "Task reopened");
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status.");
    }
  };

  const handleQuickStatusChange = async (task: Task, newStatus: "pending" | "in-progress" | "completed") => {
    if (!canManageThisTask(task)) {
      toast.error("You are not authorized to update this task.");
      return;
    }
    try {
      await apiService.tasks.update(task.id, { status: newStatus });
      toast.success(`Status updated to ${newStatus.replace("-", " ")}`);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status.");
    }
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValues.title.trim()) {
      toast.error("Please provide a task title.");
      return;
    }
    if (!formValues.dueDate) {
      toast.error("Please select a due date.");
      return;
    }

    const cfErrs = validateCustomFields(taskCustomFields, taskCustomValues);
    if (Object.keys(cfErrs).length > 0) {
      setTaskErrors(cfErrs);
      toast.error("Please check required custom fields.");
      return;
    }

    try {
      const payload = {
        ...formValues,
        assignedUserIds: selectedUserIds,
        customFields: taskCustomValues
      };

      let taskId = editingTask?.id;
      if (editingTask) {
        await apiService.tasks.update(editingTask.id, payload);
        toast.success("Task updated.");
      } else {
        const res = await apiService.tasks.create(payload);
        taskId = res.data?.id || res.id;
        toast.success("Task created.");
      }

      if (taskId && Object.keys(taskCustomValues).length > 0) {
        await apiClient.post(`/custom-fields/values/task/${taskId}`, { values: taskCustomValues });
      }

      loadData();
      setIsFormOpen(false);
      resetForm();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to save task.");
    }
  };

  const handleDeleteTask = (id: string) => {
    if (!canDelete) {
      toast.error("Only administrators can delete tasks.");
      return;
    }
    setTaskToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      await apiService.tasks.delete(taskToDelete);
      toast.success("Task deleted successfully.");
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to delete task.");
    } finally {
      setTaskToDelete(null);
      setDeleteConfirmOpen(false);
    }
  };

  const handleSendOverdueReminders = async () => {
    setIsSendingReminders(true);
    try {
      const res = await apiService.tasks.sendReminders();
      if (res.success === false) {
        toast.error(res.message || "Failed to trigger overdue reminders.");
      } else {
        toast.success(res.message || "Overdue notifications dispatched.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to trigger overdue reminders.");
    } finally {
      setIsSendingReminders(false);
    }
  };

  const handleSendWhatsAppReminder = async (task: Task) => {
    const toastId = toast.loading(`Sending WhatsApp reminder for "${task.title}"...`);
    try {
      const res = await apiService.tasks.sendWhatsAppReminder(task.id);
      if (res.success === false) {
        toast.error(res.message || "Failed to send WhatsApp reminder.", { id: toastId });
      } else {
        toast.success(res.message || "WhatsApp reminder sent!", { id: toastId });
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to send WhatsApp reminder.", { id: toastId });
    }
  };

  const handleSaveNotifSettings = async () => {
    if (!notifTaskId) return;
    try {
      const payload = {
        notifEnabled: notifValues.enabled,
        notifType: notifValues.type,
        notifDays: notifValues.days,
        notifUnit: notifValues.unit,
        notifFrequency: notifValues.frequency
      };

      await apiService.tasks.updateNotification(notifTaskId, payload);
      toast.success("Notification settings updated.");
      loadData();
      setIsNotifOpen(false);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to save notification settings.");
    }
  };

  const openEdit = (task: Task) => {
    if (!canManageThisTask(task)) {
      toast.error("You are not authorized to edit this task.");
      return;
    }
    setEditingTask(task);
    setTaskCustomValues((task as any).customFields || {});
    setFormValues({
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate,
      status: task.status
    });
    setSelectedUserIds(task.assignedUsers.map((u) => u.id));
    setIsFormOpen(true);
  };

  const openNotifSettings = (task: Task) => {
    if (!canManageThisTask(task)) {
      toast.error("You are not authorized to modify settings for this task.");
      return;
    }
    setNotifTaskId(task.id);
    setNotifValues({
      enabled: task.notifEnabled,
      type: task.notifType,
      days: task.notifDays,
      unit: task.notifUnit,
      frequency: task.notifFrequency
    });
    setIsNotifOpen(true);
  };

  const resetForm = () => {
    setEditingTask(null);
    setTaskCustomValues({});
    setFormValues({
      title: "",
      description: "",
      priority: "medium",
      dueDate: "",
      status: "pending"
    });
    setSelectedUserIds([]);
  };

  const stats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const total = tasks.length;
    const pending = tasks.filter((t) => t.status === "pending").length;
    const inProgress = tasks.filter((t) => t.status === "in-progress").length;
    const completed = tasks.filter((t) => t.status === "completed").length;
    const overdue = tasks.filter((t) => t.status !== "completed" && t.dueDate < today).length;
    return { total, pending, inProgress, completed, overdue };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let result = [...tasks];
    const today = new Date().toISOString().split("T")[0];

    if (activeTab === "pending") result = result.filter((t) => t.status === "pending");
    else if (activeTab === "in-progress") result = result.filter((t) => t.status === "in-progress");
    else if (activeTab === "completed") result = result.filter((t) => t.status === "completed");
    else if (activeTab === "overdue") result = result.filter((t) => t.status !== "completed" && t.dueDate < today);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.assignedUsers.some((u) => u.name.toLowerCase().includes(q))
      );
    }

    if (filterPriority) {
      result = result.filter((t) => t.priority === filterPriority);
    }

    if (filterUser) {
      result = result.filter((t) => t.assignedUsers.some((u) => u.id === filterUser));
    }

    result.sort((a, b) => {
      if (sortBy === "due-soonest") return (a.dueDate || "").localeCompare(b.dueDate || "");
      if (sortBy === "due-latest") return (b.dueDate || "").localeCompare(a.dueDate || "");
      if (sortBy === "created-newest") return (b.createdAt || "").localeCompare(a.createdAt || "");
      if (sortBy === "priority-high") {
        const pWeight = { high: 3, medium: 2, low: 1 };
        return (pWeight[b.priority] || 0) - (pWeight[a.priority] || 0);
      }
      return 0;
    });

    return result;
  }, [tasks, activeTab, searchQuery, filterPriority, filterUser, sortBy]);

  const hasActiveFilters = searchQuery || filterPriority || filterUser || activeTab !== "all";

  return (
    <div className="flex-1 flex flex-col p-6 space-y-5 bg-slate-50/50 dark:bg-background overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-card p-4 rounded-xl border border-slate-200/80 dark:border-border shadow-xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
              <CheckSquare className="size-5" />
            </div>
            Task Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 ml-9.5">
            Track assignments, workflow responsibilities, and automated email alerts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-9 px-3 text-xs gap-1.5"
            title="Refresh list"
          >
            <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {stats.overdue > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendOverdueReminders}
              disabled={isSendingReminders}
              className="h-9 px-3 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/30 gap-1.5 font-medium"
            >
              {isSendingReminders ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Bell className="size-3.5" />
              )}
              <span>Alert Overdue ({stats.overdue})</span>
            </Button>
          )}

          {canCreate && (
            <Button
              onClick={() => {
                resetForm();
                setIsFormOpen(true);
              }}
              size="sm"
              className="h-9 px-3.5 text-xs font-semibold gap-1.5 shadow-xs"
            >
              <Plus className="size-4" /> New Task
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: "all", label: "All Tasks", count: stats.total, color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
          { id: "pending", label: "Pending", count: stats.pending, color: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
          { id: "in-progress", label: "In Progress", count: stats.inProgress, color: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
          { id: "completed", label: "Completed", count: stats.completed, color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
          { id: "overdue", label: "Overdue", count: stats.overdue, color: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? "bg-foreground text-background shadow-xs font-semibold"
                  : "bg-white dark:bg-card border border-slate-200/80 dark:border-border text-muted-foreground hover:text-foreground hover:bg-slate-50 dark:hover:bg-muted/40"
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10.5px] font-bold ${isActive ? "bg-background/20 text-background" : tab.color}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white dark:bg-card p-3 rounded-xl border border-slate-200/80 dark:border-border shadow-xs">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search task title, description, assignee..."
            className="pl-9 pr-8 h-8.5 text-xs bg-slate-50 dark:bg-muted/30 border-slate-200 dark:border-border/80 focus-visible:ring-1"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="h-8.5 px-2.5 rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted/30 text-foreground text-xs outline-none focus:border-primary"
          >
            <option value="">Priority: All</option>
            <option value="high">🔴 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🔵 Low</option>
          </select>

          {users.length > 0 && (
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="h-8.5 px-2.5 rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted/30 text-foreground text-xs outline-none focus:border-primary max-w-[150px] truncate"
            >
              <option value="">Assignee: All</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="h-8.5 px-2.5 rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted/30 text-foreground text-xs outline-none focus:border-primary"
          >
            <option value="due-soonest">Due: Soonest</option>
            <option value="due-latest">Due: Latest</option>
            <option value="priority-high">Priority: High First</option>
            <option value="created-newest">Created: Newest</option>
          </select>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setFilterPriority("");
                setFilterUser("");
                setActiveTab("all");
              }}
              className="h-8.5 text-xs text-muted-foreground hover:text-foreground px-2"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 dark:border-border bg-white dark:bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-muted/40 border-b border-slate-200/80 dark:border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="py-3 px-4 w-10 text-center">Done</th>
                <th className="py-3 px-4 min-w-[240px]">Task</th>
                <th className="py-3 px-4 min-w-[140px]">Assigned To</th>
                <th className="py-3 px-4 min-w-[130px]">Email Status</th>
                <th className="py-3 px-4 w-24 text-center">Priority</th>
                <th className="py-3 px-4 min-w-[130px]">Due Date</th>
                <th className="py-3 px-4 min-w-[120px]">Status</th>
                <th className="py-3 px-4 w-24 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-border/60 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="size-6 animate-spin mx-auto mb-2 text-primary" />
                    Loading tasks...
                  </td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-muted-foreground">
                    <div className="max-w-xs mx-auto space-y-2">
                      <div className="p-3 bg-slate-100 dark:bg-muted/40 rounded-full w-fit mx-auto text-muted-foreground">
                        <CheckSquare className="size-6" />
                      </div>
                      <p className="font-semibold text-foreground text-sm">No tasks found</p>
                      <p className="text-xs text-muted-foreground">
                        {hasActiveFilters ? "Try clearing your search or filters." : "Create your first task using the button above."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  const isCompleted = task.status === "completed";
                  const isOverdue =
                    !isCompleted &&
                    task.dueDate < new Date().toISOString().split("T")[0];
                  const canManage = canManageThisTask(task);

                  const assignedDateStr = task.createdAt
                    ? new Date(task.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })
                    : null;

                  return (
                    <tr
                      key={task.id}
                      className={`hover:bg-slate-50/60 dark:hover:bg-muted/30 transition-colors ${
                        isCompleted ? "opacity-60 bg-slate-50/30" : ""
                      }`}
                    >
                      <td className="py-3 px-4 text-center align-top">
                        <button
                          type="button"
                          onClick={() => handleQuickToggleComplete(task)}
                          disabled={!canManage}
                          title={
                            !canManage
                              ? "Only assigned user or admin can update status"
                              : isCompleted
                              ? "Mark pending"
                              : "Mark completed"
                          }
                          className={`mt-0.5 rounded-md p-1 transition-colors ${
                            !canManage
                              ? "cursor-not-allowed opacity-40"
                              : "cursor-pointer hover:bg-slate-200/60 dark:hover:bg-muted"
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="size-4.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Circle className="size-4.5 text-slate-300 dark:text-muted-foreground hover:text-emerald-500 transition-colors" />
                          )}
                        </button>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="space-y-0.5">
                          <p
                            className={`font-semibold text-sm text-foreground leading-snug ${
                              isCompleted ? "line-through text-muted-foreground font-normal" : ""
                            }`}
                          >
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-[11.5px] text-muted-foreground line-clamp-1 leading-relaxed">
                              {task.description}
                            </p>
                          )}
                          {assignedDateStr && (
                            <span className="inline-block text-[10.5px] text-slate-400 dark:text-muted-foreground">
                              Created on {assignedDateStr}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="flex flex-wrap gap-1">
                          {task.assignedUsers.length === 0 ? (
                            <span className="text-muted-foreground text-[11px] italic">Unassigned</span>
                          ) : (
                            task.assignedUsers.map((u) => (
                              <span
                                key={u.id}
                                title={u.email || u.name}
                                className="inline-flex items-center gap-1 bg-slate-100 dark:bg-muted text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-border px-2 py-0.5 rounded-md text-[11px] font-medium"
                              >
                                <User className="size-2.5 text-slate-400" />
                                {u.name}
                              </span>
                            ))
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top">
                        {task.mailDelivery?.status === "SENT" ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60"
                            title={`Email sent on ${task.mailDelivery.sentAt ? new Date(task.mailDelivery.sentAt).toLocaleString() : ""}${task.mailDelivery.recipient ? ` to ${task.mailDelivery.recipient}` : ""}`}
                          >
                            <MailCheck className="size-3 text-emerald-600 dark:text-emerald-400" />
                            Sent
                          </span>
                        ) : task.mailDelivery?.status === "FAILED" ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60"
                            title={`Delivery error: ${task.mailDelivery.error || "Failed to send"}`}
                          >
                            <MailX className="size-3 text-rose-600 dark:text-rose-400" />
                            Failed
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-500 dark:bg-muted dark:text-muted-foreground border border-slate-200/60 dark:border-border"
                            title="No email dispatched"
                          >
                            <Mail className="size-3 text-slate-400" />
                            Not Sent
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center align-top">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold uppercase tracking-wider ${
                            task.priority === "high"
                              ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60"
                              : task.priority === "medium"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60"
                              : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60"
                          }`}
                        >
                          {task.priority}
                        </span>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="flex items-center gap-1.5">
                          <Calendar className={`size-3.5 ${isOverdue ? "text-rose-600 font-bold" : "text-slate-400"}`} />
                          <span className={`font-medium ${isOverdue ? "text-rose-600 font-bold" : "text-foreground"}`}>
                            {task.dueDate}
                          </span>
                        </div>
                        {isOverdue && (
                          <span className="inline-block mt-0.5 text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-1 rounded">
                            Overdue
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top">
                        {canManage ? (
                          <select
                            value={task.status}
                            onChange={(e) => handleQuickStatusChange(task, e.target.value as any)}
                            className={`h-7 px-2 border rounded-md text-xs font-semibold outline-none cursor-pointer transition-colors ${
                              task.status === "completed"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                                : task.status === "in-progress"
                                ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                                : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-muted dark:text-slate-300 dark:border-border"
                            }`}
                          >
                            <option value="pending">Pending</option>
                            <option value="in-progress">In Progress</option>
                            <option value="completed">Completed</option>
                          </select>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                              task.status === "completed"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : task.status === "in-progress"
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                                : "bg-slate-100 text-slate-700 dark:bg-muted dark:text-slate-300"
                            }`}
                          >
                            {task.status.replace("-", " ")}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-slate-500 hover:text-foreground hover:bg-slate-100 dark:hover:bg-muted"
                              onClick={() => openEdit(task)}
                              title="Edit Task"
                            >
                              <Edit3 className="size-3.5" />
                            </Button>
                          )}
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-muted"
                              onClick={() => openNotifSettings(task)}
                              title="Notification Settings"
                            >
                              <Bell className="size-3.5" />
                            </Button>
                          )}
                          {canManage && task.status !== "completed" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-slate-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30"
                              onClick={() => handleSendWhatsAppReminder(task)}
                              title="Send WhatsApp Reminder to assigned users"
                            >
                              <MessageSquare className="size-3.5" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              onClick={() => handleDeleteTask(task.id)}
                              title="Delete Task (Admin Only)"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-lg p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              {editingTask ? "Edit Task" : "Create New Task"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveTask} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">Task Title *</Label>
              <Input
                value={formValues.title}
                onChange={(e) => setFormValues((v) => ({ ...v, title: e.target.value }))}
                placeholder="e.g. Follow up on drawings approval"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">Description</Label>
              <textarea
                value={formValues.description}
                onChange={(e) => setFormValues((v) => ({ ...v, description: e.target.value }))}
                placeholder="Add details, instructions, or notes..."
                rows={3}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-border bg-background text-foreground outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground">Priority</Label>
                <select
                  value={formValues.priority}
                  onChange={(e) =>
                    setFormValues((v) => ({ ...v, priority: e.target.value as any }))
                  }
                  className="w-full h-9 px-3 border border-slate-200 dark:border-border bg-background text-foreground rounded-lg text-xs outline-none focus:border-primary"
                >
                  <option value="low">🔵 Low</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="high">🔴 High</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground">Due Date *</Label>
                <Input
                  type="date"
                  value={formValues.dueDate}
                  onChange={(e) => setFormValues((v) => ({ ...v, dueDate: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground">Status</Label>
                <select
                  value={formValues.status}
                  onChange={(e) => setFormValues((v) => ({ ...v, status: e.target.value as any }))}
                  className="w-full h-9 px-3 border border-slate-200 dark:border-border bg-background text-foreground rounded-lg text-xs outline-none focus:border-primary"
                >
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            {taskCustomFields.length > 0 && (
              <div className="border-t pt-3">
                <DynamicFormRenderer
                  fields={taskCustomFields}
                  values={taskCustomValues}
                  onChange={(key, val) => {
                    setTaskCustomValues((prev) => ({ ...prev, [key]: val }));
                    if (taskErrors[key]) setTaskErrors((prev) => ({ ...prev, [key]: "" }));
                  }}
                  errors={taskErrors}
                />
              </div>
            )}

            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs font-semibold text-foreground">Assign To Team Members</Label>
              
              {selectedUserIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-muted/30 border border-slate-200 dark:border-border">
                  {users
                    .filter((u) => selectedUserIds.includes(u.id))
                    .map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-1 bg-white dark:bg-card border border-slate-200 dark:border-border text-foreground px-2 py-0.5 rounded-md text-[11px] font-medium"
                      >
                        {u.name}
                        <X
                          className="size-3 cursor-pointer text-slate-400 hover:text-rose-500"
                          onClick={() => setSelectedUserIds((ids) => ids.filter((id) => id !== u.id))}
                        />
                      </span>
                    ))}
                </div>
              )}

              <select
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (val && !selectedUserIds.includes(val)) {
                    setSelectedUserIds((prev) => [...prev, val]);
                  }
                }}
                className="w-full h-9 px-3 border border-slate-200 dark:border-border bg-background text-foreground rounded-lg text-xs outline-none focus:border-primary"
              >
                <option value="">+ Select team member...</option>
                {users
                  .filter((u) => !selectedUserIds.includes(u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsFormOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="h-9 text-xs font-semibold">
                {editingTask ? "Update Task" : "Save Task"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isNotifOpen} onOpenChange={setIsNotifOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Bell className="size-4 text-primary" /> Automated Reminder Settings
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="flex items-start gap-3 bg-slate-50 dark:bg-muted/30 p-3 rounded-xl border border-slate-200 dark:border-border">
              <input
                type="checkbox"
                id="notif-enabled"
                checked={notifValues.enabled}
                onChange={(e) => setNotifValues((v) => ({ ...v, enabled: e.target.checked }))}
                className="size-4 mt-0.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
              <div>
                <Label htmlFor="notif-enabled" className="text-xs font-bold text-foreground cursor-pointer">
                  Enable automated email reminders
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Sends scheduled reminder emails to assigned team members before the deadline.
                </p>
              </div>
            </div>

            {notifValues.enabled && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Trigger Schedule</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={notifValues.days}
                      onChange={(e) =>
                        setNotifValues((v) => ({ ...v, days: Math.max(0, Number(e.target.value)) }))
                      }
                      className="w-16 h-8.5 text-xs text-center"
                    />
                    <select
                      value={notifValues.unit}
                      onChange={(e) => setNotifValues((v) => ({ ...v, unit: e.target.value as any }))}
                      className="h-8.5 px-2.5 border border-slate-200 dark:border-border bg-background text-foreground rounded-lg text-xs outline-none"
                    >
                      <option value="days">days</option>
                      <option value="hours">hours</option>
                    </select>
                    <span className="text-xs text-muted-foreground">before due date</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Reminder Frequency</Label>
                  <select
                    value={notifValues.frequency}
                    onChange={(e) => setNotifValues((v) => ({ ...v, frequency: e.target.value as any }))}
                    className="w-full h-8.5 px-3 border border-slate-200 dark:border-border bg-background text-foreground rounded-lg text-xs outline-none"
                  >
                    <option value="once">Send once only</option>
                    <option value="daily">Send daily until completed</option>
                    <option value="every-12h">Send every 12 hours until completed</option>
                  </select>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsNotifOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveNotifSettings}
                size="sm"
                className="h-9 text-xs font-semibold"
              >
                Save Settings
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Task"
        description="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete Task"
        onConfirm={confirmDeleteTask}
      />
    </div>
  );
}
