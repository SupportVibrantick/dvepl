import React, { createContext, useContext } from 'react';
import { useERPStore } from '@/store/erpStore';
import { getModuleActions, isAdminUser } from '@/utils/pagePermissions';

interface PermissionContextType {
  hasPermission: (permissionCode: string) => boolean;
  permissions: string[];
}

const PERMISSION_CODE_MODULE_MAP: Record<string, string> = {
  dashboard: 'dashboard',
  company: 'companies',
  branch: 'branches',
  department: 'departments',
  team: 'teams',
  designation: 'designations',
  costCenter: 'cost_centers',
  employee: 'employees',
  attendance: 'attendance',
  leave: 'leaves',
  holiday: 'holidays',
  salary: 'payroll',
  employeeDocument: 'documents',
  task: 'tasks',
  customer: 'customers',
  communication: 'communication',
  salesOrder: 'orders',
  order: 'orders',
  vendor: 'vendors',
  inventory: 'inventory',
  exportOrder: 'export_orders',
  workflow: 'workflow_tracker',
  payment: 'finance',
  tenderRequest: 'tender_requests',
  tender: 'tenders',
  technicalClarification: 'technical_clarifications',
  governmentDepartment: 'government_departments',
  section: 'sections',
  division: 'divisions',
  subDivision: 'sub_divisions',
  referenceCode: 'reference_codes',
  user: 'users',
  role: 'roles',
  approvalRequest: 'approval_requests',
  report: 'reports',
  auditLog: 'audit_logs',
  customField: 'custom_fields',
  recycleBin: 'recycle_bin',
  settings: 'settings',
};

const getRequiredAction = (permissionCode: string): 'create' | 'edit' | 'delete' | null => {
  if (permissionCode.includes('.create')) return 'create';
  if (permissionCode.includes('.update') || permissionCode.includes('.edit')) return 'edit';
  if (permissionCode.includes('.delete') || permissionCode.includes('.remove')) return 'delete';
  return null;
};

const getCurrentUser = () => {
  const store = useERPStore.getState();
  return store.users.find((u) => u.id === store.currentUserId) as any;
};

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const permissions = React.useMemo(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) return [] as string[];
    const pageAccess = Array.isArray(currentUser.pageAccess) ? currentUser.pageAccess : [];
    return pageAccess as string[];
  }, []);

  const hasPermission = React.useCallback((permissionCode: string) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) return false;
      if (isAdminUser(currentUser)) return true;

      const moduleKey = PERMISSION_CODE_MODULE_MAP[permissionCode.split('.')[0]];
      if (!moduleKey) return false;

      const pageAccess = Array.isArray(currentUser.pageAccess) ? currentUser.pageAccess : [];
      if (!pageAccess.includes(moduleKey)) return false;

      const requiredAction = getRequiredAction(permissionCode);
      if (!requiredAction) return true;
      return getModuleActions(currentUser.actionPermissions, moduleKey)[requiredAction] === true;
    } catch (e) {
      return false;
    }
  }, []);

  return (
    <PermissionContext.Provider value={{ hasPermission, permissions }}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionProvider');
  }
  return context;
}
