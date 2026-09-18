import fp from "fastify-plugin";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminLogs as AdminLogger } from "../services/logger/contextLogger";

const swaggerSafePaths = ["/docs", "/swagger"];

type ActionName = "create" | "edit" | "delete" | "export";
type ModuleActions = Record<ActionName, boolean>;

const legacyActionDefaults: ModuleActions = {
  create: true,
  edit: true,
  delete: false,
  export: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isLegacyActionPermissions = (value: unknown): value is Partial<ModuleActions> =>
  isRecord(value) && ["create", "edit", "delete", "export"].some((action) => typeof value[action] === "boolean");

const getModuleActions = (value: unknown, moduleKey: string): ModuleActions => {
  if (!value || isLegacyActionPermissions(value)) {
    const legacy = (value || {}) as Partial<ModuleActions>;
    return {
      create: legacy.create ?? legacyActionDefaults.create,
      edit: legacy.edit ?? legacyActionDefaults.edit,
      delete: legacy.delete ?? legacyActionDefaults.delete,
      export: legacy.export ?? legacyActionDefaults.export,
    };
  }

  // An empty object is "unset" (matches the login/verifyToken fallback logic),
  // not "no actions" — never lock a user out because of an empty profile.
  if (isRecord(value) && Object.keys(value).length === 0) {
    return legacyActionDefaults;
  }

  const moduleActions = isRecord(value) ? value[moduleKey] : undefined;
  if (!isRecord(moduleActions)) return { create: false, edit: false, delete: false, export: false };

  return {
    create: moduleActions.create === true,
    edit: moduleActions.edit === true,
    delete: moduleActions.delete === true,
    export: moduleActions.export === true,
  };
};

// Transversal /dynamic/ endpoints are module-keyed: the target module is passed
// in the URL (query ?moduleKey= or a path segment such as /record/:moduleKey), so
// authorization must be checked against that module instead of the settings module.
const moduleFromDynamicUrl = (url: string): string | null => {
  if (!url.includes("/dynamic/")) return null;

  const queryMatch = url.match(/[?&]moduleKey=([^&#]+)/);
  if (queryMatch) return decodeURIComponent(queryMatch[1]);

  const pathMatch = url.match(/\/dynamic\/(?:record\/import|schema|record|module)\/([^/?#]+)/);
  if (pathMatch && pathMatch[1] !== "id" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathMatch[1])) {
    return decodeURIComponent(pathMatch[1]);
  }

  return null;
};

export const getModuleForRequest = (url: string): string | null => {
  const dynamicModule = moduleFromDynamicUrl(url);
  if (dynamicModule) return dynamicModule;

  const routeModules: Array<[string, string]> = [
    ["/company/", "companies"], ["/branch/", "branches"], ["/department/", "departments"],
    ["/team/", "teams"], ["/designation/", "designations"], ["/cost-center/", "cost_centers"],
    ["/employee/", "employees"], ["/employee-shift/", "shift_management"], ["/attendance/", "attendance"], ["/leave/", "leaves"],
    ["/holiday/", "holidays"], ["/salary/", "payroll"],
    ["/employee-document/", "documents"], ["/task/", "tasks"], ["/customer/", "customers"],
    ["/contact/", "contacts"], ["/sales-order/", "orders"],
    ["/order/", "orders"], ["/vendor/", "vendors"], ["/inventory/", "inventory"],
    ["/technical-clarification/", "technical_clarifications"],
    ["/section/", "sections"], ["/division/", "divisions"], ["/sub-division/", "sub_divisions"],
    ["/reference-code/", "reference_codes"], ["/user/", "users"], ["/role/", "roles"],
    ["/settings/", "settings"], ["/recycle-bin/", "recycle_bin"], ["/custom-fields/", "custom_fields"],
    ["/notification/", "settings"], ["/payment/", "finance"], ["/reports/", "reports"],
    ["/vendor-product/", "vendors"], ["/inventory-tracking/", "inventory"],
    ["/goods-receipt/", "inventory"], ["/purchase-order/", "inventory"],
    ["/quotetender/", "orders"], ["/dynamic/", "settings"], ["/upload/", "settings"],
    ["/export-orders/", "export_orders"], ["/workflow/", "workflow_tracker"],
    ["/employee-contact/", "employees"], ["/employee-emergency-contact/", "employees"],
    ["/employee-education/", "employees"], ["/employee-experience/", "employees"],
    ["/reference-code-counter/", "reference_codes"],
  ];
  return routeModules.find(([path]) => url.includes(path))?.[1] ?? null;
};

// API routes that do not have a module-specific URL still declare a legacy
// permission code.  Use its resource name only to locate the corresponding
// page-access setting; the permission code itself is never authorized.
const getModuleForPermission = (permissions: string[]): string | null => {
  const prefixToModule: Record<string, string> = {
    dashboard: "dashboard",
    company: "companies",
    branch: "branches",
    department: "departments",
    team: "teams",
    designation: "designations",
    costCenter: "cost_centers",
    employee: "employees",
    attendance: "attendance",
    leave: "leaves",
    holiday: "holidays",
    shift: "shift_management",
    salary: "payroll",
    employeeDocument: "documents",
    task: "tasks",
    customer: "customers",
    contact: "contacts",
    salesOrder: "orders",
    order: "orders",
    vendor: "vendors",
    inventory: "inventory",
    exportOrder: "export_orders",
    workflow: "workflow_tracker",
    payment: "finance",
    technicalClarification: "technical_clarifications",
    section: "sections",
    division: "divisions",
    subDivision: "sub_divisions",
    referenceCode: "reference_codes",
    user: "users",
    role: "roles",
    approvalRequest: "approval_requests",
    report: "reports",
    auditLog: "audit_logs",
    customField: "custom_fields",
    recycleBin: "recycle_bin",
    settings: "settings",
  };

  for (const permission of permissions) {
    const prefix = permission.split(".")[0];
    if (prefixToModule[prefix]) return prefixToModule[prefix];
  }
  return null;
};

const getRequiredAction = (url: string, permissions: string[]): ActionName | null => {
  if (url.includes("/create") || url.includes("/bulk")) return "create";
  if (url.includes("/update") || url.includes("/edit")) return "edit";
  if (url.includes("/delete") || url.includes("/remove")) return "delete";
  if (permissions.some((permission) => permission.includes(".create"))) return "create";
  if (permissions.some((permission) => permission.includes(".update") || permission.includes(".edit"))) return "edit";
  if (permissions.some((permission) => permission.includes(".delete") || permission.includes(".remove"))) return "delete";
  return null;
};

// Permission prefix used by each page-access module key. This mirrors the
// keyword-based rules in routes/admin/index.ts but is resolved from the HTTP
// verb + URL, so writes that reach keyword-less URLs (PATCH /branch/:id,
// DELETE /department/:id, etc.) still get a permission to authorize.
const modulePermissionPrefix: Record<string, string> = {
  companies: "company",
  branches: "branch",
  departments: "department",
  teams: "team",
  designations: "designation",
  cost_centers: "costCenter",
  employees: "employee",
  shift_management: "shift",
  attendance: "attendance",
  leaves: "leave",
  holidays: "holiday",
  payroll: "salary",
  documents: "employeeDocument",
  tasks: "task",
  customers: "customer",
  contacts: "contact",
  communication: "communication",
  orders: "order",
  vendors: "vendor",
  inventory: "inventory",
  tender_requests: "tenderRequest",
  tenders: "tender",
  technical_clarifications: "technicalClarification",
  government_departments: "governmentDepartment",
  sections: "section",
  divisions: "division",
  sub_divisions: "subDivision",
  reference_codes: "referenceCode",
  users: "user",
  roles: "role",
  settings: "settings",
  recycle_bin: "recycleBin",
  custom_fields: "customField",
  finance: "payment",
  reports: "report",
  audit_logs: "auditLog",
  export_orders: "exportOrder",
  workflow_tracker: "workflow",
  approval_requests: "approvalRequest",
};

const writeActionByVerb: Record<string, "create" | "update" | "delete"> = {
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

// Read access on these modules is a "reference read": a user who has any of the
// listed business modules (via pageAccess) may also read the module's base data.
// This mirrors the cross-module lookups the UI performs (e.g. the attendance or
// orders pages loading the employees list) while keeping every other read tied
// to the module's own page-access setting.
const REFERENCE_READS: Record<string, string[]> = {
  employees: [
    "attendance", "leaves", "holidays", "shift_management", "payroll", "documents",
    "tasks", "tenders", "quotations", "orders", "delivery", "communication",
    "finance", "export_orders",
  ],
  customers: [
    "orders", "quotations", "tenders", "export_orders", "finance", "delivery", "vendors",
  ],
  vendors: [
    "orders", "quotations", "tenders", "inventory", "export_orders", "finance",
  ],
  inventory: [
    "orders", "quotations", "tenders", "export_orders", "finance", "vendors",
  ],
  orders: ["finance", "export_orders", "delivery", "tenders", "quotations"],
  designations: ["employees", "attendance", "leaves", "documents", "payroll", "tasks"],
  teams: ["employees", "attendance", "leaves", "tasks", "documents"],
  departments: ["employees", "attendance", "leaves", "documents"],
  cost_centers: ["employees", "payroll", "attendance", "documents"],
  shift_management: ["attendance", "employees"],
};

const hasReferenceReadAccess = (moduleKey: string, pageAccess: string[]): boolean =>
  pageAccess.some((page) => (REFERENCE_READS[moduleKey] || []).includes(page));

export function getRouteWritePermissions(method: string, url: string): string[] {
  const action = writeActionByVerb[method];
  if (!action) return [];
  // Generic cross-module upload is intentionally reachable by every
  // authenticated user; the uploaded file only becomes data once it is linked
  // to a module record, which is authorized on its own endpoint.
  if (url.includes("/upload/")) return [];
  // Task notification settings and reminder dispatch are already guarded by
  // row-level access (canManageTask / admin-only), so don't add page gating on top.
  if (url.includes("/task/notification/")) return [];
  const moduleKey = getModuleForRequest(url);
  const prefix = moduleKey ? modulePermissionPrefix[moduleKey] : undefined;
  if (!prefix) return [];
  return [`${prefix}.${action}`];
}

async function authPlugin(fastify: FastifyInstance) {
  // ==========================
  // Verify JWT
  // ==========================
  fastify.decorate(
    "verifyToken",
    async function verifyToken(request: FastifyRequest, reply: FastifyReply) {
      try {
        // Skip Swagger routes
        if (swaggerSafePaths.some((p) => request.url.startsWith(p))) {
          return;
        }

        const authHeader = request.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
          return reply.status(401).send({
            success: false,
            message: "Invalid Token Format",
          });
        }

        const decoded: any = await request.jwtVerify();

        const dbUser = await fastify.prisma.user.findFirst({
          where: {
            id: decoded.userId,
            isActive: true,
            deletedAt: null,
          },
          include: {
            userRoles: {
              include: {
                role: true,
              },
            },
            accessProfile: true,
          },
        });

        if (!dbUser) {
          return reply.status(401).send({
            success: false,
            message: "User account is inactive or has been deleted.",
          });
        }
        const activeCompanyId = (request.query as any)?.companyId || decoded.companyId;
        if (request.query && (request.query as any).companyId) {
          delete (request.query as any).companyId;
        }

        const up = dbUser.accessProfile;
        const hasOverride = up?.hasOverride ?? false;

        // Merge pageAccess from ALL roles (union) instead of only the first role
        const allRoles = dbUser.userRoles.map((ur) => ur.role);

        const mergedRolePageAccess = [...new Set(
          allRoles.flatMap((role) => (role.pageAccess as string[] || []))
        )];

        const mergedRoleActionPermissions: Record<string, any> = {};
        for (const role of allRoles) {
          const ap = role.actionPermissions as Record<string, any> || {};
          for (const [module, actions] of Object.entries(ap)) {
            if (!mergedRoleActionPermissions[module]) {
              mergedRoleActionPermissions[module] = { ...actions };
            } else {
              // Union: if ANY role grants an action, it's granted
              for (const action of ["create", "edit", "delete", "export"]) {
                if ((actions as any)[action] === true) {
                  mergedRoleActionPermissions[module][action] = true;
                }
              }
            }
          }
        }

        const resolvedPageAccess = hasOverride
          ? (up?.pageAccess as string[] || [])
          : (mergedRolePageAccess.length > 0
              ? mergedRolePageAccess
              : (up?.pageAccess as string[] || []));

        const resolvedActionPermissions = hasOverride
          ? (up?.actionPermissions || { create: true, edit: true, delete: false, export: true })
          : (Object.keys(mergedRoleActionPermissions).length > 0
              ? mergedRoleActionPermissions
              : (up?.actionPermissions || { create: true, edit: true, delete: false, export: true }));

        const tokenUser = {
          id: decoded.userId,
          companyId: activeCompanyId,
          email: dbUser.email,
          roles: dbUser.userRoles.map((ur) => ur.role.name) || [],
          uiAccessProfile: {
            pageAccess: resolvedPageAccess,
            actionPermissions: resolvedActionPermissions,
          },
        };
        (request as any).user = tokenUser;
        (request as any).admin = tokenUser;
      } catch (error: any) {
        AdminLogger.error(`JWT Verification Failed: ${error}`);

        return reply.status(401).send({
          success: false,
          message: "Invalid or expired token",
        });
      }
    }
  );

  // ==========================
  // Role Authorization
  // ==========================
 fastify.decorate(
  "authorizePermissions",
  function authorizePermissions(allowedPermissions: string[]) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        // Skip Swagger routes
        if (swaggerSafePaths.some((p) => request.url.startsWith(p))) {
          return;
        }

        // Allow reading company-level public settings (document categories, theme, etc.) for all authenticated members
        if (request.url.includes("/settings/read")) {
          return;
        }

        // The dynamic module list is app-wide metadata read by every module page on load.
        if (request.method === "GET" && request.url.includes("/dynamic/module")) {
          return;
        }

        const uiAccessProfile = (request.admin as any)?.uiAccessProfile;
        let moduleKey = getModuleForRequest(request.url) ?? getModuleForPermission(allowedPermissions);

        // /dynamic/record/:id and /dynamic/record/id/:id routes don't carry the
        // owning module in the URL, so resolve it from the database.
        if (moduleKey === "settings" && request.url.includes("/dynamic/")) {
          const idRoute = request.url.match(/\/dynamic\/record\/id\/([^/?#]+)/);
          const crudRoute = request.url.match(/\/dynamic\/record\/([^/?#]+)/);
          const candidateId =
            idRoute?.[1] ??
            ((request.method === "PUT" || request.method === "DELETE")
              ? crudRoute?.[1]
              : undefined);
          if (candidateId && !request.url.includes("/dynamic/module")) {
            const dynamicRecord =
              await request.server.prisma.dynamicRecord.findUnique({
                where: { id: candidateId },
                include: { module: true },
              });
            if (dynamicRecord?.module?.moduleKey) {
              moduleKey = dynamicRecord.module.moduleKey;
            }
          }
        }

        const roles: string[] = (request.admin as any)?.roles ?? [];
        const isAdmin = roles.some((r: string) => String(r).toLowerCase().includes("admin"));
        if (isAdmin) return;

        // Page/action access profiles are the single source of authorization.
        // Role permissions and per-user database overrides are deliberately not
        // consulted here.
        if (!uiAccessProfile || !moduleKey) {
          AdminLogger.warn("Unauthorized Permission", {
            endpoint: request.url,
            method: request.method,
            userId: request.admin?.id,
          });

          return reply.status(403).send({
            success: false,
            message: "Access denied: page access profile is missing.",
          });
        }

        const pageAccess = Array.isArray(uiAccessProfile.pageAccess)
          ? uiAccessProfile.pageAccess
          : [];
        const requiredAction = getRequiredAction(request.url, allowedPermissions);

        // Allow reading customer list for order, quotation and tender workflows
        const isCustomerRead =
          (moduleKey === "customers" || request.url.includes("/customer/read") || request.url.includes("/customer/sync")) &&
          !requiredAction;
        const hasCustomerAccessForOrders =
          isCustomerRead &&
          (pageAccess.includes("orders") ||
            pageAccess.includes("quotations") ||
            pageAccess.includes("export_orders"));

        // Cross-module reference reads (e.g. the attendance page loading the
        // employees list). Only relaxes read-like requests; writes stay strict.
        const isReadLike =
          request.method === "GET" ||
          request.method === "HEAD" ||
          !requiredAction;
        const hasReferenceRead =
          isReadLike &&
          (moduleKey === "customers"
            ? hasCustomerAccessForOrders
            : hasReferenceReadAccess(moduleKey, pageAccess));

        const hasPageAccess =
          pageAccess.includes(moduleKey) ||
          hasCustomerAccessForOrders ||
          hasReferenceRead;
        const hasActionAccess =
          !requiredAction ||
          hasCustomerAccessForOrders ||
          getModuleActions(
            uiAccessProfile.actionPermissions,
            moduleKey,
          )[requiredAction];

        if (!hasPageAccess || !hasActionAccess) {
          return reply.status(403).send({
            success: false,
            message: "Access denied: insufficient page permissions.",
          });
        }
      } catch (error: any) {
        AdminLogger.error(`Permission Authorization Failed: ${error}`);

        return reply.status(500).send({
          success: false,
          message: "Server error during authorization.",
        });
      }
    };
  }
);

}

export default fp(authPlugin, {
  name: "auth-plugin",
});
