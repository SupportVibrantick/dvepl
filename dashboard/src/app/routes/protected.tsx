import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/authContext';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { useERPStore } from '@/store/erpStore';
import { isAdminUser } from '@/utils/pagePermissions';
import { toast } from 'react-hot-toast';

import { useNavigate } from 'react-router-dom';

const getRequiredPermission = (pathname: string): string | null => {
  // exact matches
  if (pathname === '/profile') return null;
  if (pathname === '/') return 'dashboard';
  
  if (pathname.startsWith('/export-orders')) return 'export_orders';
  if (pathname.startsWith('/tasks')) return 'tasks';
  if (pathname.startsWith('/hrms/leaves')) return 'leaves';
  if (pathname.startsWith('/workflow')) return 'workflow_tracker';
  if (pathname.startsWith('/purchase/orders')) return 'purchase_orders';
  if (pathname.startsWith('/logistics/delivery')) return 'delivery';
  if (pathname.startsWith('/tender/orders')) return 'orders';
  if (pathname.startsWith('/orders')) return 'orders';
  if (pathname.startsWith('/accounts')) return 'orders';
  if (pathname.startsWith('/production/plans')) return 'production_plans';
  if (pathname.startsWith('/production/work-orders')) return 'work_orders';
  if (pathname.startsWith('/quality/inspections')) return 'inspections';
  if (pathname.startsWith('/material/materials')) return 'materials';
  if (pathname.startsWith('/material/categories')) return 'material_categories';
  if (pathname.startsWith('/purchase/requests')) return 'purchase_requests';
  
  if (pathname.startsWith('/finance')) return 'finance';
  if (pathname.startsWith('/settings/custom-fields')) return 'custom_fields';
  if (pathname.startsWith('/settings/recycle-bin')) return 'recycle_bin';
  if (pathname.startsWith('/settings/notifications')) return 'notifications';
  if (pathname.startsWith('/settings')) return 'settings';

  const routePermissionMap: Record<string, string> = {
    '/organization/companies': 'companies',
    '/organization/branches': 'branches',
    '/organization/departments': 'departments',
    '/organization/teams': 'teams',
    '/organization/designations': 'designations',
    '/organization/cost-centers': 'cost_centers',
    '/hrms/employees': 'employees',
    '/hrms/attendance': 'attendance',
    '/hrms/holidays': 'holidays',
    '/hrms/payroll': 'payroll',
    '/hrms/documents': 'documents',
    '/crm/customers': 'customers',
    '/tender/sections': 'sections',
    '/tender/divisions': 'divisions',
    '/tender/subdivisions': 'sub_divisions',
    '/tender/reference-codes': 'reference_codes',
    '/tender/clarifications': 'technical_clarifications',
    '/tender/quotations': 'quotations',
    '/tender/orders': 'orders',
    '/purchase/vendors': 'vendors',
    '/purchase/orders': 'purchase_orders',
    '/logistics/delivery': 'delivery',
    '/tender/boqs': 'boqs',
    '/security/roles': 'roles',
    '/security/approval-requests': 'approval_requests',
    '/engineering/projects': 'engineering_projects',
    '/engineering/drawings': 'engineering_drawings',
    '/engineering/boms': 'boms',
    '/material/materials': 'materials',
    '/material/categories': 'material_categories',
    '/purchase/requests': 'purchase_requests',
    '/inventory/warehouses': 'inventory',
    '/inventory/stocks': 'inventory',
    '/inventory/transfers': 'inventory',
    '/logistics/dispatches': 'inventory',
    '/production/plans': 'production_plans',
    '/production/work-orders': 'work_orders',
    '/quality/inspections': 'inspections',
    '/audit-logs': 'audit_logs',
    '/reports': 'reports'
  };

  return routePermissionMap[pathname] || null;
};

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const store = useERPStore();
  const navigate = useNavigate();

  const currentUser = store.users.find((u) => u.id === store.currentUserId) as any;
  const isAdmin = currentUser ? isAdminUser(currentUser) : false;
  const requiredPermission = getRequiredPermission(location.pathname);
  
  const hasPermission = !requiredPermission || (
    currentUser && (
      isAdmin || 
      (Array.isArray(currentUser.pageAccess) && currentUser.pageAccess.includes(requiredPermission))
    )
  );

  React.useEffect(() => {
    if (isAuthenticated && currentUser && !hasPermission) {
      toast.error("You do not have enough permissions to perform this operation.");
      navigate("/profile", { replace: true });
    }
  }, [isAuthenticated, currentUser, hasPermission, navigate]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser && !hasPermission) {
    return null;
  }

  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}
