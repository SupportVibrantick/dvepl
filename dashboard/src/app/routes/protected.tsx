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
  
  // Assignment/Task pages where the backend manages row-level access:
  // Allow all logged-in users to load the page structure.
  if (pathname.startsWith('/export-orders')) return null;
  if (pathname.startsWith('/tasks')) return null;
  if (pathname.startsWith('/hrms/leaves')) return null;
  if (pathname.startsWith('/workflow')) return null;
  if (pathname.startsWith('/purchase/orders')) return null;
  if (pathname.startsWith('/logistics/delivery')) return null;
  if (pathname.startsWith('/tender/orders')) return null;
  if (pathname.startsWith('/orders')) return null;
  if (pathname.startsWith('/accounts')) return null;
  
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
    '/crm/communication': 'communication',
    '/tender/requests': 'tender_requests',
    '/tender/tenders': 'tenders',
    '/tender/government': 'government_departments',
    '/tender/sections': 'sections',
    '/tender/divisions': 'divisions',
    '/tender/subdivisions': 'sub_divisions',
    '/tender/reference-codes': 'reference_codes',
    '/tender/clarifications': 'technical_clarifications',
    '/tender/quotations': 'quotations',
    '/tender/orders': 'orders',
    '/purchase/vendors': 'vendors',
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
