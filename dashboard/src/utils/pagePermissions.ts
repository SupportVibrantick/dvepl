import { useERPStore } from "@/store/erpStore";

export const ACTION_PERMISSION_KEYS = ["create", "edit", "delete", "export"] as const;

export type ActionPermissionKey = (typeof ACTION_PERMISSION_KEYS)[number];

export interface ModuleActionPermissions {
  create: boolean;
  edit: boolean;
  delete: boolean;
  export: boolean;
}

export type PageActionPermissions = Record<string, ModuleActionPermissions>;

export type StoredActionPermissions = PageActionPermissions | Partial<ModuleActionPermissions>;

export const LEGACY_ACTION_DEFAULTS: ModuleActionPermissions = {
  create: true,
  edit: true,
  delete: false,
  export: true,
};

export const NO_ACTIONS: ModuleActionPermissions = {
  create: false,
  edit: false,
  delete: false,
  export: false,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function isLegacyActionPermissions(value: unknown): value is Partial<ModuleActionPermissions> {
  return isRecord(value) && ACTION_PERMISSION_KEYS.some((action) => typeof value[action] === "boolean");
}

export function getModuleActions(
  actionPermissions: unknown,
  moduleKey: string,
): ModuleActionPermissions {
  if (!actionPermissions) return LEGACY_ACTION_DEFAULTS;

  if (isLegacyActionPermissions(actionPermissions)) {
    return {
      create: actionPermissions.create ?? LEGACY_ACTION_DEFAULTS.create,
      edit: actionPermissions.edit ?? LEGACY_ACTION_DEFAULTS.edit,
      delete: actionPermissions.delete ?? LEGACY_ACTION_DEFAULTS.delete,
      export: actionPermissions.export ?? LEGACY_ACTION_DEFAULTS.export,
    };
  }

  // An empty object is "unset" (matches the backend resolution logic): treat
  // it as the default action set so a no-op modal save can never lock a user out.
  if (isRecord(actionPermissions) && Object.keys(actionPermissions).length === 0) {
    return LEGACY_ACTION_DEFAULTS;
  }

  const moduleActions = isRecord(actionPermissions) ? actionPermissions[moduleKey] : undefined;
  if (!isRecord(moduleActions)) return NO_ACTIONS;

  return {
    create: moduleActions.create === true,
    edit: moduleActions.edit === true,
    delete: moduleActions.delete === true,
    export: moduleActions.export === true,
  };
}

export function normalizePageActionPermissions(
  actionPermissions: unknown,
  moduleKeys: string[],
): PageActionPermissions {
  return Object.fromEntries(
    moduleKeys.map((moduleKey) => [moduleKey, getModuleActions(actionPermissions, moduleKey)]),
  );
}

export function isAdminUser(user: any): boolean {
  if (!user) return false;
  const roleValues = Array.isArray(user.roles) ? user.roles : user.role ? [user.role] : [];
  return roleValues.some((r: any) => {
    const roleName = typeof r === "string" ? r : (r?.name ?? r?.label ?? "");
    return roleName.toLowerCase().includes("admin");
  });
}

export function canPerformPageAction(
  actionPermissions: unknown,
  moduleKey: string,
  action: ActionPermissionKey,
) {
  try {
    const store = useERPStore.getState();
    const currentUser = store.users.find((u) => u.id === store.currentUserId) as any;
    if (isAdminUser(currentUser)) return true;
  } catch (e) {
    // Fallback if store is not initialized
  }
  return getModuleActions(actionPermissions, moduleKey)[action];
}
