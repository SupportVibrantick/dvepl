import {
  LayoutDashboard,
  Building2,
  GitBranch,
  Network,
  Users2,
  Award,
  Wallet,
  UserCheck,
  CalendarDays,
  Briefcase,
  Clock,
  DollarSign,
  Handshake,
  MessageSquare,
  // FolderGit2,
  ShieldCheck,
  FileText,
  History as AuditIcon,
  Settings2,
  // FolderOpen,
  // FileCheck,
  Zap,
  // HelpCircle,
  FileSpreadsheet,
  ShoppingCart,
  CheckSquare,
  Truck,
  Package,
  Trash2,
  PenTool,
  Workflow,
} from "lucide-react";
import { ROUTES } from "./routes";

export interface SidebarItem {
  name: string;
  icon: any;
  path: string;
  section?: string;
}

export const sidebarItems: SidebarItem[] = [
  { name: "Dashboard", icon: LayoutDashboard, path: ROUTES.DASHBOARD },

  // Organization
  {
    name: "Companies",
    icon: Building2,
    path: ROUTES.ORGANIZATION_COMPANIES,
    section: "Organization",
  },
  {
    name: "Branches",
    icon: GitBranch,
    path: ROUTES.ORGANIZATION_BRANCHES,
    section: "Organization",
  },
  {
    name: "Departments",
    icon: Network,
    path: ROUTES.ORGANIZATION_DEPARTMENTS,
    section: "Organization",
  },
  {
    name: "Teams",
    icon: Users2,
    path: ROUTES.ORGANIZATION_TEAMS,
    section: "Organization",
  },
  // {
  //   name: "Designations",
  //   icon: Award,
  //   path: ROUTES.ORGANIZATION_DESIGNATIONS,
  //   section: "Organization",
  // },
  {
    name: "Cost Centers",
    icon: Wallet,
    path: ROUTES.ORGANIZATION_COST_CENTERS,
    section: "Organization",
  },

  // HRMS
  {
    name: "Employees",
    icon: UserCheck,
    path: ROUTES.HRMS_EMPLOYEES,
    section: "HRMS",
  },
  {
    name: "Attendance",
    icon: Clock,
    path: ROUTES.HRMS_ATTENDANCE,
    section: "HRMS",
  },
  {
    name: "Leaves",
    icon: CalendarDays,
    path: ROUTES.HRMS_LEAVES,
    section: "HRMS",
  },
  {
    name: "Holidays",
    icon: CalendarDays,
    path: ROUTES.HRMS_HOLIDAYS,
    section: "HRMS",
  },
  // {
  //   name: "Payroll",
  //   icon: DollarSign,
  //   path: ROUTES.HRMS_PAYROLL,
  //   section: "HRMS",
  // },
  // {
  //   name: "Documents",
  //   icon: FileText,
  //   path: ROUTES.HRMS_DOCUMENTS,
  //   section: "HRMS",
  // },
  {
    name: "Tasks",
    icon: CheckSquare,
    path: ROUTES.TASKS,
  },

  // CRM
  {
    name: "Customers",
    icon: Handshake,
    path: ROUTES.CRM_CUSTOMERS,
    section: "CRM",
  },
  {
    name: "Roles",
    icon: ShieldCheck,
    path: ROUTES.SECURITY_ROLES,
    section: "HRMS",
  },
  // {
  //   name: "Communication History",
  //   icon: MessageSquare,
  //   path: ROUTES.CRM_COMMUNICATION,
  //   section: "CRM",
  // },
  {
    name: "Orders",
    icon: ShoppingCart,
    path: ROUTES.TENDER_ORDERS,
    section: "CRM",
  },
  {
    name: "Accounts",
    icon: FileSpreadsheet,
    path: ROUTES.ACCOUNTS,
    section: "CRM",
  },
  {
    name: "Delivery",
    icon: Truck,
    path: ROUTES.LOGISTICS_DELIVERY,
    section: "CRM",
  },
  {
    name: "Vendors",
    icon: Truck,
    path: ROUTES.PURCHASE_VENDORS,
    section: "CRM",
  },
  {
    name: "Purchase Orders",
    icon: FileText,
    path: ROUTES.PURCHASE_ORDERS,
    section: "CRM",
  },
  {
    name: "Inventory",
    icon: Package,
    path: ROUTES.INVENTORY_STOCKS,
    section: "CRM",
  },
  {
    name: "Engineering Drawing",
    icon: FileText,
    path: ROUTES.EXPORT_ORDERS,
    section: "CRM",
  },
  
  // Finance
  {
    name: "Finance",
    icon: DollarSign,
    path: ROUTES.FINANCE,
  },
  {
    name: "Workflow Tracker",
    icon: Workflow,
    path: ROUTES.WORKFLOW_TRACKER,
  },

  // Lead Management & Tenders (parked — routes render 404)
  // {
  //   name: "Tender Requests",
  //   icon: FolderOpen,
  //   path: ROUTES.TENDER_REQUESTS,
  //   section: "Lead Management",
  // },
  // {
  //   name: "Tenders",
  //   icon: FolderGit2,
  //   path: ROUTES.TENDER_TENDERS,
  //   section: "Lead Management",
  // },
  // {
  //   name: "Technical Clarifications",
  //   icon: HelpCircle,
  //   path: ROUTES.TENDER_CLARIFICATIONS,
  //   section: "Lead Management",
  // },
  // {
  //   name: "Government Departments",
  //   icon: Building2,
  //   path: ROUTES.TENDER_GOVERNMENT,
  //   section: "Lead Management",
  // },
  // {
  //   name: "Sections",
  //   icon: GitBranch,
  //   path: ROUTES.TENDER_SECTIONS,
  //   section: "Lead Management",
  // },
  // {
  //   name: "Divisions",
  //   icon: Network,
  //   path: ROUTES.TENDER_DIVISIONS,
  //   section: "Lead Management",
  // },
  // {
  //   name: "Sub Divisions",
  //   icon: Users2,
  //   path: ROUTES.TENDER_SUBDIVISIONS,
  //   section: "Lead Management",
  // },
  // {
  //   name: "Reference Codes",
  //   icon: FileCheck,
  //   path: ROUTES.TENDER_REF_CODES,
  //   section: "Lead Management",
  // },

  // Security (PRBAC)
  
  // {
  //   name: "Approval Requests",
  //   icon: CheckSquare,
  //   path: ROUTES.SECURITY_APPROVAL_REQUESTS,
  //   section: "Security",
  // },

  { name: "Reports", icon: FileSpreadsheet, path: ROUTES.REPORTS },
  { name: "Audit Logs", icon: AuditIcon, path: ROUTES.AUDIT_LOGS },
  {
    name: "Custom Fields",
    icon: Settings2,
    path: ROUTES.CUSTOM_FIELDS,
    section: "Settings",
  },
  {
    name: "Recycle Bin",
    icon: Trash2,
    path: ROUTES.RECYCLE_BIN,
    section: "Settings",
  },
  {
    name: "Settings",
    icon: Settings2,
    path: ROUTES.SETTINGS,
    section: "Settings",
  },
];
