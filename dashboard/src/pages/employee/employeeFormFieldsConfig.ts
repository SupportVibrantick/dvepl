import { useERPStore } from "@/store/erpStore";
import { securityApi } from "@/services/modules";

export type EmployeeFormFieldKey =
  | "employeeCode"
  | "firstName"
  | "lastName"
  | "gender"
  | "branchId"
  | "departmentId"
  | "designationId"
  | "email"
  | "status";

export type EmployeeFormFieldsMap = Partial<Record<EmployeeFormFieldKey, boolean>>;

export interface EmployeeFormFieldDef {
  key: EmployeeFormFieldKey;
  label: string;
  isRequired: boolean;
}

/**
 * Field registry for the Employee edit/create form.
 * Default required flags mirror the historical hardcoded validation so the
 * feature is backward-compatible until an admin reconfigures it.
 */
export const INITIAL_EMPLOYEE_FORM_FIELDS: EmployeeFormFieldDef[] = [
  { key: "employeeCode", label: "Employee Code", isRequired: true },
  { key: "firstName", label: "First Name", isRequired: true },
  { key: "lastName", label: "Last Name", isRequired: false },
  { key: "gender", label: "Gender", isRequired: false },
  { key: "branchId", label: "Work Branch", isRequired: false },
  { key: "departmentId", label: "Department", isRequired: false },
  { key: "designationId", label: "Designation", isRequired: false },
  { key: "email", label: "Official Email Address", isRequired: false },
  { key: "status", label: "Employment Status", isRequired: false },
];

export const EMPLOYEE_FIELDS_CHANGED_EVENT = "dvepl_employee_form_fields_changed";

/**
 * Retrieves the current required/optional configuration for the Employee form.
 * Reads from the backend company settings (via store.settings) so it applies
 * company-wide; falls back to defaults when nothing has been configured yet.
 */
export function getEmployeeFormFieldConfig(
  settings?: any,
): Record<EmployeeFormFieldKey, boolean> {
  const stored: EmployeeFormFieldsMap | null =
    settings?.employeeFormFields &&
    typeof settings.employeeFormFields === "object"
      ? settings.employeeFormFields
      : null;

  const result = {} as Record<EmployeeFormFieldKey, boolean>;
  for (const field of INITIAL_EMPLOYEE_FORM_FIELDS) {
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
export async function saveEmployeeFormFieldConfig(
  fields: Record<EmployeeFormFieldKey, boolean>,
  updateSettingsFn?: (payload: any) => Promise<void>,
): Promise<void> {
  try {
    if (updateSettingsFn) {
      await updateSettingsFn({ employeeFormFields: fields });
    } else {
      await securityApi.settings.update({ employeeFormFields: fields });
    }
    useERPStore.setState((prev) => ({
      settings: { ...prev.settings, employeeFormFields: fields },
    }));
  } catch (e) {
    console.error("Failed to update backend employee field config:", e);
    throw e;
  }

  window.dispatchEvent(
    new CustomEvent(EMPLOYEE_FIELDS_CHANGED_EVENT, { detail: fields }),
  );
}
