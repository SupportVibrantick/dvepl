import { useEffect, useState } from "react";
import workflowApi, {
  WorkflowTemplateStep,
} from "@/services/workflowApi";

import { sidebarItems } from "@/constants/sidebar";

export interface WorkflowStageMeta {
  key: string;
  name: string;
  color: string;
  isFinal: boolean;
  targetPage?: string;
}

// Dynamically generate redirect options from Sidebar items under CRM section
export const WORKFLOW_REDIRECT_OPTIONS: { value: string; label: string; path: string }[] = [
  { value: "", label: "No redirection", path: "" },
  ...sidebarItems
    .filter((item) => item.section === "CRM")
    .map((item) => ({
      value: item.path,
      label: item.name,
      path: item.path,
    })),
];

export function parseStageRoutes(
  description?: string | null,
): Record<string, string> {
  if (description) {
    try {
      const parsed = JSON.parse(description);
      if (parsed && typeof parsed.stageRoutes === "object") {
        return parsed.stageRoutes;
      }
    } catch {}
  }

  try {
    const cached = localStorage.getItem("dvepl_workflow_stage_routes");
    if (cached) return JSON.parse(cached);
  } catch {}

  return {
    ACCOUNTS_COSTING: "/accounts",
    PO_READY: "/purchase/vendors",
    DRAWING_ASSIGNED: "/export-orders",
    DRAWING_SENT: "/export-orders",
    REVISION_REQUIRED: "/export-orders",
    DRAWING_APPROVED: "/export-orders",
    PO_PLACED: "/purchase/vendors",
    INVENTORY_FOLLOW_UP: "/inventory/stocks",
    PRODUCTION_FOLLOW_UP: "",
  };
}

export function serializeStageRoutes(
  routes: Record<string, string>,
  existingDesc?: string | null,
): string {
  try {
    let base: any = {};
    if (existingDesc) {
      try {
        base = JSON.parse(existingDesc);
      } catch {
        base = { text: existingDesc };
      }
    }
    base.stageRoutes = routes;
    const str = JSON.stringify(base);
    try {
      localStorage.setItem(
        "dvepl_workflow_stage_routes",
        JSON.stringify(routes),
      );
    } catch {}
    return str;
  } catch {
    return JSON.stringify({ stageRoutes: routes });
  }
}

export function getStageRedirectInfo(
  targetPage?: string | null,
  tender?: any,
): { url: string; label: string; pageName: string } | null {
  if (!targetPage) return null;

  // Find matching item from sidebar CRM or legacy shortcut
  const matchingItem = sidebarItems.find(
    (item) => item.path === targetPage || item.path.toLowerCase() === targetPage.toLowerCase()
  );

  const pageName = matchingItem ? matchingItem.name : "Page";

  // Check if it's a known path or legacy key
  if (targetPage === "/accounts" || targetPage === "accounts") {
    return {
      url: tender?.id ? `/accounts/${tender.id}` : "/accounts",
      label: "Open Accounts",
      pageName: matchingItem?.name || "Accounts",
    };
  }

  if (targetPage === "/purchase/vendors" || targetPage === "vendors") {
    return {
      url: tender?.id
        ? `/purchase/vendors?orderId=${tender.id}&ref=${encodeURIComponent(tender.dveplCode || "")}`
        : "/purchase/vendors",
      label: "Open Purchase Orders",
      pageName: matchingItem?.name || "Vendors",
    };
  }

  if (targetPage === "/export-orders" || targetPage === "drawings") {
    return {
      url: tender?.id ? `/export-orders?orderId=${tender.id}` : "/export-orders",
      label: "Open Engineering Drawing",
      pageName: matchingItem?.name || "Engineering Drawing",
    };
  }

  // Generic CRM page from sidebar or other routes
  return {
    url: targetPage,
    label: `Open ${pageName}`,
    pageName: pageName,
  };
}

export const DEFAULT_WORKFLOW_STAGES: WorkflowStageMeta[] = [
  { key: "ORDER_CONFIRMED", name: "Order Confirmed", color: "#3b82f6", isFinal: false, targetPage: "" },
  { key: "ACCOUNTS_COSTING", name: "Accounts & Costing", color: "#0284c7", isFinal: false, targetPage: "/accounts" },
  { key: "PO_READY", name: "PO Ready", color: "#8b5cf6", isFinal: false, targetPage: "/purchase/vendors" },
  { key: "DRAWING_ASSIGNED", name: "Drawing Assigned", color: "#a855f7", isFinal: false, targetPage: "/export-orders" },
  { key: "DRAWING_SENT", name: "Drawing Sent", color: "#6366f1", isFinal: false, targetPage: "/export-orders" },
  { key: "REVISION_REQUIRED", name: "Revision Required", color: "#f97316", isFinal: false, targetPage: "/export-orders" },
  { key: "DRAWING_APPROVED", name: "Drawing Approved", color: "#22c55e", isFinal: false, targetPage: "/export-orders" },
  { key: "PO_PLACED", name: "PO Placed", color: "#10b981", isFinal: false, targetPage: "/purchase/vendors" },
  { key: "INVENTORY_FOLLOW_UP", name: "Inventory Follow-up", color: "#f59e0b", isFinal: false, targetPage: "/inventory/stocks" },
  { key: "PRODUCTION_FOLLOW_UP", name: "Production Follow-up", color: "#06b6d4", isFinal: true, targetPage: "" },
];

function toMeta(
  step: WorkflowTemplateStep,
  routes: Record<string, string>,
): WorkflowStageMeta {
  const targetPage =
    routes[step.key] !== undefined
      ? routes[step.key]
      : routes[step.key.toUpperCase()] !== undefined
        ? routes[step.key.toUpperCase()]
        : undefined;

  return {
    key: step.key,
    name: step.name,
    color: step.color || "#64748b",
    isFinal: step.isFinal,
    targetPage,
  };
}

export function useWorkflowTemplate() {
  const [stages, setStages] = useState<WorkflowStageMeta[]>(DEFAULT_WORKFLOW_STAGES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await workflowApi.getTemplate();
        if (!cancelled && response.data.success) {
          const templateDesc = response.data.data.description;
          const routes = parseStageRoutes(templateDesc);
          const steps = (response.data.data.steps || [])
            .filter((s) => s.isActive)
            .sort((a, b) => a.position - b.position)
            .map((s) => toMeta(s, routes));
          if (steps.length > 0) setStages(steps);
        }
      } catch (error) {
        console.error("Failed to load workflow template:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { stages, loading };
}