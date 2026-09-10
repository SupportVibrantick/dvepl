import { useERPStore } from "@/store/erpStore";
import { securityApi } from "@/services/modules";

export interface StageDef {
  key: string;
  name: string;
  department: string;
}

/**
 * Default fallback workflow stages with department labels.
 * Used until the company workflow template is loaded from the backend.
 */
export const DEFAULT_STAGE_ROWS: StageDef[] = [
  {
    key: "UPLOAD_CUSTOMER_ORDER_DETAILS",
    name: "Upload Customer Order Details For Accounts",
    department: "Costing",
  },
  {
    key: "UPLOAD_PO_VENDOR",
    name: "Upload Purchase Order (PO) for Vendor",
    department: "Accounts",
  },
  {
    key: "UPLOAD_DRAWINGS",
    name: "Upload Drawings",
    department: "Design",
  },
  {
    key: "UPLOAD_APPROVED_DRAWINGS",
    name: "Upload Customer Approved Drawings",
    department: "Design",
  },
  {
    key: "TEST_STAGE",
    name: "test stage",
    department: "Costing",
  },
];

export type OrderStageRequirementsMap = Record<string, boolean>;

export const ORDER_STAGE_REQUIREMENTS_CHANGED_EVENT =
  "dvepl_add_order_stage_requirements_changed";

/**
 * Retrieves the current per-stage required/optional configuration for the
 * Job Responsibility section. Reads from the backend company settings (via
 * store.settings) so it applies company-wide. Stages not present in the map
 * default to optional (false) so no order is blocked unless an admin
 * explicitly marks the stage as required.
 */
export function getOrderStageRequirements(
  settings?: any,
): OrderStageRequirementsMap {
  const stored: OrderStageRequirementsMap | null =
    settings?.orderStageRequirements &&
    typeof settings.orderStageRequirements === "object"
      ? (settings.orderStageRequirements as OrderStageRequirementsMap)
      : null;

  const result: OrderStageRequirementsMap = {};
  if (stored) {
    for (const key of Object.keys(stored)) {
      if (typeof stored[key] === "boolean") {
        result[key] = stored[key];
      }
    }
  }
  return result;
}

/**
 * Persists the per-stage required/optional configuration to backend company
 * settings and notifies all active consumers. Stored company-wide, never in
 * local browser storage.
 */
export async function saveOrderStageRequirements(
  requirements: OrderStageRequirementsMap,
  updateSettingsFn?: (payload: any) => Promise<void>,
): Promise<void> {
  try {
    if (updateSettingsFn) {
      await updateSettingsFn({ orderStageRequirements: requirements });
    } else {
      await securityApi.settings.update({
        orderStageRequirements: requirements,
      });
    }
    useERPStore.setState((prev) => ({
      settings: { ...prev.settings, orderStageRequirements: requirements },
    }));
  } catch (e) {
    console.error("Failed to update backend order stage requirements:", e);
    throw e;
  }

  window.dispatchEvent(
    new CustomEvent(ORDER_STAGE_REQUIREMENTS_CHANGED_EVENT, {
      detail: requirements,
    }),
  );
}