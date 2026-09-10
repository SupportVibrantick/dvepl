import { useERPStore } from "@/store/erpStore";
import { securityApi } from "@/services/modules";

export type AddOrderFormFieldKey =
  | "companyName"
  | "dveplCode"
  | "contactPerson"
  | "mobileNo"
  | "emailId"
  | "billingAddress"
  | "shippingAddress"
  | "orderDate"
  | "commitment"
  | "customerPoNo"
  | "totalPanels"
  | "advance"
  | "projectReference"
  | "orderTakenBy";

export type AddOrderFormFieldsMap = Partial<Record<AddOrderFormFieldKey, boolean>>;

export interface AddOrderFormFieldDef {
  key: AddOrderFormFieldKey;
  label: string;
  isRequired: boolean;
}

/**
 * Field registry for the "Start New Order" (Add Order Manually) form.
 * Default required flags mirror the historical hardcoded validation so the
 * feature is backward-compatible until an admin reconfigures it.
 */
export const INITIAL_ADD_ORDER_FORM_FIELDS: AddOrderFormFieldDef[] = [
  { key: "companyName", label: "Customer / Company Name", isRequired: true },
  { key: "dveplCode", label: "DVEPL Ref Code", isRequired: true },
  { key: "contactPerson", label: "Contact Person", isRequired: false },
  { key: "mobileNo", label: "Mobile No", isRequired: false },
  { key: "emailId", label: "Email ID", isRequired: false },
  { key: "billingAddress", label: "Billing Address", isRequired: false },
  { key: "shippingAddress", label: "Shipping Address", isRequired: false },
  { key: "orderDate", label: "Date of Order", isRequired: false },
  { key: "commitment", label: "Date of Commitment", isRequired: true },
  { key: "customerPoNo", label: "Customer PO No", isRequired: false },
  { key: "totalPanels", label: "Total Panels / Units", isRequired: false },
  { key: "advance", label: "Advance", isRequired: true },
  { key: "projectReference", label: "Project Reference", isRequired: true },
  { key: "orderTakenBy", label: "Order Taken By / Concerned Person", isRequired: false },
];

export const ADD_ORDER_FIELDS_CHANGED_EVENT = "dvepl_add_order_form_fields_changed";

/**
 * Retrieves the current required/optional configuration for the Add Order form.
 * Reads from the backend company settings (via store.settings) so it applies
 * company-wide; falls back to defaults when nothing has been configured yet.
 */
export function getAddOrderFormFieldConfig(
  settings?: any,
): Record<AddOrderFormFieldKey, boolean> {
  const stored: AddOrderFormFieldsMap | null =
    settings?.addOrderFormFields &&
    typeof settings.addOrderFormFields === "object"
      ? settings.addOrderFormFields
      : null;

  const result = {} as Record<AddOrderFormFieldKey, boolean>;
  for (const field of INITIAL_ADD_ORDER_FORM_FIELDS) {
    const value = stored?.[field.key];
    result[field.key] = typeof value === "boolean" ? value : field.isRequired;
  }
  return result;
}

/**
 * Persists the required/optional configuration to backend company settings
 * and notifies all active consumers via a global event. Stored company-wide,
 * never in local browser storage.
 */
export async function saveAddOrderFormFieldConfig(
  fields: Record<AddOrderFormFieldKey, boolean>,
  updateSettingsFn?: (payload: any) => Promise<void>,
): Promise<void> {
  try {
    if (updateSettingsFn) {
      await updateSettingsFn({ addOrderFormFields: fields });
    } else {
      await securityApi.settings.update({ addOrderFormFields: fields });
    }
    useERPStore.setState((prev) => ({
      settings: { ...prev.settings, addOrderFormFields: fields },
    }));
  } catch (e) {
    console.error("Failed to update backend add order field config:", e);
    throw e;
  }

  window.dispatchEvent(
    new CustomEvent(ADD_ORDER_FIELDS_CHANGED_EVENT, { detail: fields }),
  );
}