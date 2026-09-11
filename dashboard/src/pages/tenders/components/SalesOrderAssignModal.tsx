import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Users,
  X,
  Loader2,
  UserCheck,
  AlertCircle,
  LayoutGrid,
} from "lucide-react";
import { securityApi, salesOrderApi } from "@/services/modules";
import workflowApi from "@/services/workflowApi";
import { toast } from "react-hot-toast";

export interface SalesOrderAssignment {
  id?: string;
  salesOrderId?: string;
  userId: string;
  stage?: string | null;
  remarks?: string | null;
  createdAt?: string | Date | null;
  user?: {
    id: string;
    name: string;
    email?: string;
  };
}

export interface SalesOrderAssignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    tender_no?: string;
    firm_name?: string;
    dveplCode?: string;
    assignments?: SalesOrderAssignment[];
  } | null;
  initialStageKey?: string | null;
  onSuccess: () => void;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  isActive?: boolean;
}

interface StageOption {
  key: string;
  name: string;
  color?: string | null;
}

export const ALL_STAGES_KEY = "__all_stages__";

export function SalesOrderAssignModal({
  open,
  onOpenChange,
  order,
  initialStageKey,
  onSuccess,
}: SalesOrderAssignModalProps) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userFetchError, setUserFetchError] = useState<string | null>(null);
  const [stages, setStages] = useState<StageOption[]>([]);
  const [isLoadingStages, setIsLoadingStages] = useState(false);
  const [activeStageKey, setActiveStageKey] = useState<string>(ALL_STAGES_KEY);
  const [stageAssignments, setStageAssignments] = useState<
    Record<string, string[]>
  >({});
  const [search, setSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    setUserFetchError(null);
    try {
      const response = await securityApi.users.list();
      const userList: UserOption[] = Array.isArray(response)
        ? response
        : (response as any)?.data || [];

      const activeUsers = userList.filter(
        (u) =>
          u.isActive !== false &&
          u.name?.toLowerCase() !== "admin" &&
          u.email?.toLowerCase() !== "admin@dvepl.com"
      );
      setUsers(activeUsers);
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to load eligible users.";
      setUserFetchError(msg);
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  const fetchStages = useCallback(async () => {
    setIsLoadingStages(true);
    try {
      const response = await workflowApi.getTemplate();
      if (response.data.success) {
        const steps = (response.data.data.steps || [])
          .filter((s) => s.isActive)
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            key: s.key,
            name: s.name,
            color: s.color,
          }));
        setStages(steps);
      }
    } catch (err) {
      console.error("Failed to load workflow stages:", err);
      setStages([]);
    } finally {
      setIsLoadingStages(false);
    }
  }, []);

  // Fetch users + stages when modal opens
  useEffect(() => {
    if (open) {
      void fetchUsers();
      void fetchStages();
      setSearch("");
      setValidationError(null);
      setActiveStageKey(initialStageKey ?? ALL_STAGES_KEY);
    }
  }, [open, fetchUsers, fetchStages, initialStageKey]);

  // Sync initial assignments grouped by stage
  useEffect(() => {
    if (open && order) {
      const grouped: Record<string, string[]> = {};
      (order.assignments || []).forEach((a) => {
        const key = a.stage ? a.stage : ALL_STAGES_KEY;
        if (!grouped[key]) grouped[key] = [];
        if (!grouped[key].includes(a.userId)) grouped[key].push(a.userId);
      });
      setStageAssignments(grouped);
    }
  }, [open, order]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q))
    );
  }, [users, search]);

  const currentStageUsers = useMemo(
    () => stageAssignments[activeStageKey] ?? [],
    [stageAssignments, activeStageKey],
  );

  const toggleUserSelection = (userId: string) => {
    setValidationError(null);
    setStageAssignments((prev) => {
      const current = prev[activeStageKey] ?? [];
      const next = current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId];
      return { ...prev, [activeStageKey]: next };
    });
  };

  const selectAllFiltered = () => {
    setValidationError(null);
    const filteredIds = filteredUsers.map((u) => u.id);
    setStageAssignments((prev) => ({
      ...prev,
      [activeStageKey]: Array.from(
        new Set([...(prev[activeStageKey] ?? []), ...filteredIds]),
      ),
    }));
  };

  const clearAllSelection = () => {
    setValidationError(null);
    setStageAssignments((prev) => ({
      ...prev,
      [activeStageKey]: [],
    }));
  };

  const totalAssignedUsers = useMemo(
    () => Array.from(new Set(Object.values(stageAssignments).flat())).length,
    [stageAssignments],
  );

  const isFocusedStage = Boolean(initialStageKey);

  const focusedStage = useMemo(() => {
    if (!initialStageKey) return null;
    const index = stages.findIndex((s) => s.key === initialStageKey);
    return {
      meta: index >= 0 ? stages[index] : undefined,
      index,
    };
  }, [stages, initialStageKey]);

  const focusedStageName =
    focusedStage?.meta?.name ??
    (isFocusedStage ? initialStageKey!.replace(/_/g, " ") : "");
  const focusedStageColor = focusedStage?.meta?.color || "#3b82f6";

  const handleSave = async () => {
    if (!order) return;

    if (totalAssignedUsers === 0) {
      setValidationError("At least one user must be assigned to the order.");
      toast.error("At least one user must be assigned.");
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      const assignments = Object.entries(stageAssignments)
        .filter(([, userIds]) => userIds.length > 0)
        .map(([stageKey, userIds]) => ({
          stage: stageKey === ALL_STAGES_KEY ? null : stageKey,
          userIds,
        }));

      const res = await salesOrderApi.salesOrders.assign(order.id, {
        assignments,
      });
      if (res?.success !== false) {
        toast.success(
          isFocusedStage
            ? `Assignment saved for "${focusedStageName}".`
            : "Sales order assigned successfully.",
        );
        onSuccess();
        onOpenChange(false);
      } else {
        const msg = res?.message || "Failed to assign sales order.";
        setValidationError(msg);
        toast.error(msg);
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Failed to assign sales order.";
      setValidationError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedUsers = useMemo(() => {
    return currentStageUsers
      .map((id) => {
        const found = users.find((u) => u.id === id);
        if (found) return found;
        const existingAssign = order?.assignments?.find((a) => a.userId === id);
        return {
          id,
          name: existingAssign?.user?.name || id,
          email: existingAssign?.user?.email || "",
        };
      })
      .filter(Boolean);
  }, [currentStageUsers, users, order]);

  const stageTabs = useMemo(() => {
    return [
      { key: ALL_STAGES_KEY, name: "All Stages" },
      ...stages.map((s) => ({ key: s.key, name: s.name })),
    ];
  }, [stages]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden rounded-2xl border shadow-xl">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 border border-primary/20">
              <Users className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold text-foreground">
                {isFocusedStage
                  ? `Assign Users — ${focusedStageName}`
                  : "Assign Sales Order"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate">
                {order?.tender_no || order?.dveplCode || "Order"}
                {order?.firm_name ? ` • ${order.firm_name}` : ""}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Validation Alert */}
          {validationError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-semibold">
              <AlertCircle className="size-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* User Fetch Error */}
          {userFetchError && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs">
              <span>{userFetchError}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void fetchUsers()}
                className="h-6 text-xs px-2"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Stage Context: clean banner in focused mode, tabs in multi-stage mode */}
          {isFocusedStage ? (
            isLoadingStages ? (
              <div className="flex items-center gap-2 p-2.5 rounded-xl border text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                Loading stage details...
              </div>
            ) : (
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-border/70 bg-muted/20">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: focusedStageColor }}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {focusedStageName}
                    </p>
                    {focusedStage && focusedStage.index >= 0 && (
                      <p className="text-[10px] text-muted-foreground font-medium">
                        Stage {focusedStage.index + 1} of {stages.length}
                      </p>
                    )}
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="text-[11px] font-medium shrink-0"
                >
                  {currentStageUsers.length} assigned
                </Badge>
              </div>
            )
          ) : isLoadingStages ? (
            <div className="flex items-center gap-2 p-2.5 rounded-xl border text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              Loading workflow stages...
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {stageTabs.map((tab) => {
                const count = (stageAssignments[tab.key] ?? []).length;
                const isActive = activeStageKey === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveStageKey(tab.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      isActive
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-card text-muted-foreground border-border hover:bg-muted/60"
                    }`}
                  >
                    {tab.key === ALL_STAGES_KEY ? (
                      <LayoutGrid className="size-3" />
                    ) : null}
                    {tab.name}
                    {count > 0 && (
                      <span
                        className={`inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold ${
                          isActive
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Assigned Users Chips */}
          {selectedUsers.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Assigned Users ({selectedUsers.length})
                </span>
                <button
                  type="button"
                  onClick={clearAllSelection}
                  className="text-[11px] font-semibold text-muted-foreground hover:text-rose-500 transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border border-border/70 bg-muted/20 max-h-24 overflow-y-auto">
                {selectedUsers.map((u) => (
                  <Badge
                    key={u.id}
                    variant="secondary"
                    className="gap-1.5 pl-2.5 pr-1 py-1 text-xs font-medium bg-background border shadow-2xs hover:bg-muted/60 transition-colors"
                  >
                    <span className="truncate max-w-[140px]">{u.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleUserSelection(u.id)}
                      className="text-muted-foreground hover:text-rose-500 rounded-full transition-colors p-0.5 cursor-pointer"
                      title={`Remove ${u.name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Search & Bulk Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Select Team Members
              </label>
              {filteredUsers.length > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Select all filtered
                  </button>
                  {currentStageUsers.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAllSelection}
                      className="text-[11px] font-semibold text-muted-foreground hover:text-rose-500 cursor-pointer"
                    >
                      Deselect all
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-8 h-9 text-xs rounded-xl"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded-full cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* User Checklist */}
          <div className="rounded-xl border border-border/80 bg-card divide-y divide-border/60 max-h-60 overflow-y-auto">
            {isLoadingUsers ? (
              <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                Loading eligible users...
              </div>
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map((u) => {
                const isSelected = currentStageUsers.includes(u.id);
                return (
                  <label
                    key={u.id}
                    className={`flex items-center justify-between px-3.5 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors ${
                      isSelected ? "bg-primary/[0.04]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleUserSelection(u.id)}
                        className="rounded-md"
                      />
                      <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 border border-primary/20">
                        {u.name ? u.name.charAt(0).toUpperCase() : "U"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {u.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {u.email}
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-semibold text-primary border-primary/30 bg-primary/10 gap-1 shrink-0 px-2 py-0.5"
                      >
                        <UserCheck className="size-3" />
                        Assigned
                      </Badge>
                    )}
                  </label>
                );
              })
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {search
                  ? `No users matching "${search}"`
                  : "No eligible users available"}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="mx-0 mb-0 px-6 py-3.5 border-t bg-muted/20 flex flex-row justify-between items-center gap-3">
          <div className="text-xs text-muted-foreground font-medium">
            <span className="font-semibold text-foreground">
              {currentStageUsers.length}
            </span>{" "}
            {currentStageUsers.length === 1 ? "user" : "users"} selected
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="h-9 px-4 text-xs font-semibold rounded-xl cursor-pointer"
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || isLoadingUsers}
              className="h-9 px-5 text-xs font-semibold gap-2 rounded-xl cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <UserCheck className="size-3.5" />
                  Save
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}