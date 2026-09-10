import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./routes/protected";
import { PublicRoute } from "@/app/routes/public";
import { UiConfigProvider } from "@/contexts/ui/uiConfigContext";
import NotFound from "@/pages/notFound";
import PageLoader from "@/components/ui/pageLoader";
import InventoryPage from "@/pages/inventory/inventoryPage";
import WorkflowTrackerPage from "../pages/workflow/WorkflowTrackerPage";
import OrderDetailPage from "../pages/tenders/orderdetailPage";
// const InventoryTrackingPage = lazy(
//   () => import("@/pages/inventory/inventoryTrackingPage"),
// );

// Auth
const LoginPage = lazy(() => import("@/pages/auth/loginPage"));

// Dashboard
const DashboardOverview = lazy(
  () => import("@/pages/dashboard/dashboardOverview"),
);

// Organization
const CompanyPage = lazy(() => import("@/pages/organization/companyPage"));
const BranchPage = lazy(() => import("@/pages/organization/branchPage"));
const DepartmentPage = lazy(
  () => import("@/pages/organization/departmentPage"),
);
const TeamPage = lazy(() => import("@/pages/organization/teamPage"));
const DesignationPage = lazy(
  () => import("@/pages/organization/designationPage"),
);
const CostCenterPage = lazy(
  () => import("@/pages/organization/costCenterPage"),
);

// Employee
const EmployeePage = lazy(() => import("@/pages/employee/employeePage"));
const AttendancePage = lazy(() => import("@/pages/attendance/attendancePage"));
const LeavePage = lazy(() => import("@/pages/leave/leavePage"));
const HolidaysPage = lazy(() => import("@/pages/holidays/holidaysPage"));
const PayrollPage = lazy(() => import("@/pages/payroll/payrollPage"));
const DocumentsPage = lazy(() => import("@/pages/documents/documentsPage"));
const TasksPage = lazy(() => import("@/pages/tasks/tasksPage"));
const ReportsPage = lazy(() => import("@/pages/reports/reportsPage"));

// CRM
const CustomersPage = lazy(() => import("@/pages/customers/customersPage"));
const CommunicationHistoryPage = lazy(
  () => import("@/pages/communication/communicationHistoryPage"),
);

// Tender Management
// NOTE: Lead Management module is parked — its routes render NotFound below.
// Page components remain untouched in the codebase under src/pages/.

const OrdersPage = lazy(() => import("@/pages/tenders/ordersPage"));
const VendorsPage = lazy(() => import("@/pages/vendors/vendorsPage"));

// Security & Audit
const RolesPage = lazy(() => import("@/pages/roles/rolesPage"));
const ApprovalRequestsPage = lazy(
  () => import("@/pages/roles/approvalRequestsPage"),
);
const AuditLogsPage = lazy(() => import("@/pages/audit/auditLogsPage"));

const SettingsPage = lazy(() => import("@/pages/settings/settingsPage"));
const CustomFieldsPage = lazy(
  () => import("@/pages/settings/customFieldsPage"),
);
const RecycleBinPage = lazy(() => import("@/pages/settings/recycleBinPage"));
const ProfilePage = lazy(() => import("@/pages/profile/profilePage"));

// Materials & Master Catalog
const MaterialsPage = lazy(() => import("@/pages/material/materialsPage"));
const MaterialCategoriesPage = lazy(
  () => import("@/pages/material/materialCategoriesPage"),
);

// Procurement & Purchase
const PurchaseRequestsPage = lazy(
  () => import("@/pages/purchase/purchaseRequestsPage"),
);
const PurchaseOrdersPage = lazy(
  () => import("@/pages/purchase/purchaseOrdersPage"),
);

// Inventory & Warehousing
const WarehousesPage = lazy(() => import("@/pages/inventory/inventoryPage"));
const InventoryStocksPage = lazy(
  () => import("@/pages/inventory/inventoryPage"),
);
const StockTransfersPage = lazy(
  () => import("@/pages/inventory/inventoryPage"),
);
const LogisticsDispatchesPage = lazy(
  () => import("@/pages/inventory/inventoryPage"),
);

// Production
const ProductionPlansPage = lazy(
  () => import("@/pages/production/productionPlansPage"),
);
const WorkOrdersPage = lazy(() => import("@/pages/production/workOrdersPage"));

// Quality Assurance
const InspectionsPage = lazy(() => import("@/pages/qc/inspectionsPage"));

// Finance & Accounts
const PaymentsPage = lazy(() => import("@/pages/finance/paymentsPage"));
const PaymentHistoryPage = lazy(
  () => import("@/pages/finance/paymentHistoryPage"),
);
const NotificationsPage = lazy(
  () => import("@/pages/notifications/notificationsPage"),
);
const DeliveryPage = lazy(() => import("@/pages/delivery/deliveryPage"));
const ExportOrdersPage = lazy(
  () => import("@/pages/exportOrders/ExportOrdersPage"),
);
const AccountsPage = lazy(() => import("@/pages/accounts/AccountsPage"));


export function AppRouter() {
  return (
    <UiConfigProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Auth Routes */}
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>

            {/* Direct preview routes (accessible without login) */}
            <Route path="/accounts-preview" element={<AccountsPage />} />
            <Route path="/accounts-preview/:id" element={<AccountsPage />} />
            <Route path="/drawings-preview" element={<ExportOrdersPage />} />
            <Route path="/drawings-preview/:id" element={<ExportOrdersPage />} />


            {/* Protected Application Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<DashboardOverview />} />
              {/* Organization */}
              <Route path="/organization/companies" element={<CompanyPage />} />
              <Route path="/organization/branches" element={<BranchPage />} />
              <Route
                path="/organization/departments"
                element={<DepartmentPage />}
              />
              <Route path="/organization/teams" element={<TeamPage />} />
              <Route
                path="/organization/designations"
                element={<DesignationPage />}
              />
              <Route
                path="/organization/cost-centers"
                element={<CostCenterPage />}
              />
              {/* HRMS */}
              <Route path="/hrms/employees" element={<EmployeePage />} />
              <Route path="/hrms/attendance" element={<AttendancePage />} />
              <Route path="/hrms/leaves" element={<LeavePage />} />
              <Route path="/hrms/holidays" element={<HolidaysPage />} />
              <Route path="/hrms/payroll" element={<PayrollPage />} />
              <Route path="/hrms/documents" element={<DocumentsPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              {/* CRM */}
              <Route path="/crm/customers" element={<CustomersPage />} />
              <Route
                path="/crm/communication"
                element={<CommunicationHistoryPage />}
              />
              <Route path="/tender/orders" element={<OrdersPage />} />
              {/* Tender Management — parked, renders NotFound (pages kept in src/pages/) */}
              <Route path="/tender/requests" element={<NotFound />} />
              <Route path="/tender/tenders" element={<NotFound />} />
              <Route
                path="/tender/government"
                element={<NotFound />}
              />
              <Route path="/tender/sections" element={<NotFound />} />
              <Route path="/tender/divisions" element={<NotFound />} />
              <Route
                path="/tender/subdivisions"
                element={<NotFound />}
              />
              <Route
                path="/tender/reference-codes"
                element={<NotFound />}
              />
              <Route
                path="/tender/clarifications"
                element={<NotFound />}
              />
              <Route path="/tender/quotations" element={<NotFound />} />
              <Route path="/purchase/vendors" element={<VendorsPage />} />
              <Route path="/tender/boqs" element={<NotFound />} />
              <Route path="/security/roles" element={<RolesPage />} />
              <Route
                path="/security/approval-requests"
                element={<ApprovalRequestsPage />}
              />

              {/* Materials & Master Catalog */}
              <Route path="/material/materials" element={<MaterialsPage />} />
              <Route
                path="/material/categories"
                element={<MaterialCategoriesPage />}
              />

              {/* Procurement & Purchase */}
              <Route
                path="/purchase/requests"
                element={<PurchaseRequestsPage />}
              />
              <Route path="/purchase/orders" element={<PurchaseOrdersPage />} />

              {/* Inventory & Warehousing */}
              <Route
                path="/inventory/warehouses"
                element={<WarehousesPage />}
              />
              <Route
                path="/inventory/stocks"
                element={<InventoryStocksPage />}
              />
              <Route
                path="/inventory/transfers"
                element={<StockTransfersPage />}
              />
              <Route
                path="/logistics/dispatches"
                element={<LogisticsDispatchesPage />}
              />
              <Route path="/logistics/delivery" element={<DeliveryPage />} />
              {/* <Route
                path="/inventory/tracking"
                element={<InventoryTrackingPage />}
              /> */}

              {/* Production */}
              <Route
                path="/production/plans"
                element={<ProductionPlansPage />}
              />
              <Route
                path="/production/work-orders"
                element={<WorkOrdersPage />}
              />

              {/* Quality Assurance */}
              <Route
                path="/quality/inspections"
                element={<InspectionsPage />}
              />

              {/* Finance & Accounts */}
              <Route path="/finance" element={<PaymentsPage />} />
              <Route
                path="/finance/history/:orderId"
                element={<PaymentHistoryPage />}
              />
              <Route path="/workflow" element={<WorkflowTrackerPage />} />

              <Route path="/audit-logs" element={<AuditLogsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              {/* Settings */}
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/settings/custom-fields"
                element={<CustomFieldsPage />}
              />
              <Route
                path="/settings/recycle-bin"
                element={<RecycleBinPage />}
              />
              <Route path="/profile" element={<ProfilePage />} />
              <Route
                path="/settings/notifications"
                element={<NotificationsPage />}
              />
              <Route path="/export-orders" element={<ExportOrdersPage />} />
              <Route path="/export-orders/:id" element={<ExportOrdersPage />} />
              <Route path="/orders/:id" element={<OrderDetailPage />} />
              <Route path="/accounts" element={<AccountsPage />} />
              <Route path="/accounts/:id" element={<AccountsPage />} />
            </Route>

            {/* 404 Fallback */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </UiConfigProvider>
  );
}
