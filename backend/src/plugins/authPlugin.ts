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

const getModuleForRequest = (url: string): string | null => {
  const routeModules: Array<[string, string]> = [
    ["/company/", "companies"], ["/branch/", "branches"], ["/department/", "departments"],
    ["/team/", "teams"], ["/designation/", "designations"], ["/cost-center/", "cost_centers"],
    ["/employee/", "employees"], ["/employee-shift/", "shift_management"], ["/attendance/", "attendance"], ["/leave/", "leaves"],
    ["/holiday/", "holidays"], ["/salary/", "payroll"],
    ["/employee-document/", "documents"], ["/task/", "tasks"], ["/customer/", "customers"],
    ["/contact/", "contacts"], ["/communication/", "communication"], ["/sales-order/", "orders"],
    ["/order/", "orders"], ["/vendor/", "vendors"], ["/inventory/", "inventory"],
    ["/tender-request/", "tender_requests"], ["/tender/", "tenders"],
    ["/technical-clarification/", "technical_clarifications"], ["/government-department/", "government_departments"],
    ["/section/", "sections"], ["/division/", "divisions"], ["/sub-division/", "sub_divisions"],
    ["/reference-code/", "reference_codes"], ["/user/", "users"], ["/role/", "roles"],
    ["/settings/", "settings"], ["/recycle-bin/", "recycle_bin"], ["/custom-fields/", "custom_fields"],
    ["/notification/", "settings"], ["/payment/", "finance"], ["/reports/", "reports"],
    ["/vendor-product/", "vendors"], ["/inventory-tracking/", "inventory"],
    ["/goods-receipt/", "inventory"], ["/purchase-order/", "inventory"],
    ["/quotetender/", "orders"], ["/dynamic/", "settings"], ["/upload/", "settings"],
    ["/export-orders/", "export_orders"], ["/workflow/", "settings"],
    ["/employee-contact/", "employees"], ["/employee-emergency-contact/", "employees"],
    ["/employee-education/", "employees"], ["/employee-experience/", "employees"],
    ["/reference-code-counter/", "reference_codes"],
    ["/tender-request-activity/", "tender_requests"], ["/tender-activity/", "tenders"],
    ["/tender-file/", "tenders"], ["/tender-remark/", "tenders"],
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
    communication: "communication",
    salesOrder: "orders",
    order: "orders",
    vendor: "vendors",
    inventory: "inventory",
    exportOrder: "export_orders",
    payment: "finance",
    tenderRequest: "tender_requests",
    tender: "tenders",
    technicalClarification: "technical_clarifications",
    governmentDepartment: "government_departments",
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

// Maps PRBAC field-permission keys to the exact response field names exposed by
// the corresponding module API.  These are used to strip fields the requesting
// user is explicitly denied from seeing (view === false).
const FIELD_PERMISSION_RESPONSE_MAP: Record<string, Record<string, string[]>> = {
  companies: {
    company_name: ["name"],
    company_tax_id: ["gst", "pan"],
  },
  branches: {
    branch_name: ["name"],
    branch_code: ["code"],
  },
  departments: {
    department_name: ["name"],
    department_code: ["code"],
  },
  teams: {
    team_name: ["name"],
  },
  designations: {
    designation_title: ["title"],
  },
  cost_centers: {
    budget_limit: ["budget"],
  },
  employees: {
    employee_code: ["employeeCode"],
    employee_first_name: ["firstName"],
    employee_last_name: ["lastName"],
    date_of_birth: ["dateOfBirth"],
  },
  attendance: {
    attendance_date: ["date"],
    check_in: ["checkIn"],
    check_out: ["checkOut"],
  },
  leaves: {
    leave_type: ["leaveType"],
    leave_reason: ["reason"],
  },
  holidays: {
    holiday_name: ["name"],
  },
  shift_management: {
    shift_name: ["name"],
  },
  payroll: {
    basic_salary: ["basic"],
    hra_allowance: ["hra"],
    allowances: ["allowances"],
    deductions: ["deductions"],
    total_ctc: ["ctc"],
  },
  documents: {
    document_name: ["fileName"],
  },
  tasks: {
    task_title: ["title"],
    task_priority: ["priority"],
    task_due_date: ["dueDate"],
  },
  customers: {
    customer_name: ["name"],
    customer_company: ["firmName"],
    customer_pan: ["pan"],
    customer_gstin: ["gst"],
    payment_terms: ["paymentTerms"],
  },
  contacts: {
    contact_name: ["name"],
  },
  communication: {
    communication_date: ["createdAt"],
  },
  vendors: {
    vendor_name: ["name"],
    vendor_category: ["category"],
    vendor_contact_person: ["contactPerson"],
    vendor_phone: ["phone"],
    vendor_email: ["email"],
    vendor_gstin: ["gstNumber"],
    vendor_address: ["address"],
  },
  inventory: {
    inventory_qty: ["quantity"],
  },
  users: {
    password_hash: ["passwordHash"],
  },
  roles: {
    is_system_role: ["isSystem"],
  },
  orders: {
    po_value: ["grandTotal"],
    delivery_month_target: ["deliveryMonthTarget"],
    concerned_person: ["drawingConcernedPerson"],
    drawing_status: ["drawingStatus"],
    order_client_name: ["partyName"],
    po_date: ["poDate"],
  },
  delivery: {
    dispatch_date: ["dispatchDate"],
    delivery_status: ["status"],
  },
  tenders: {
    tender_no: ["tenderNo"],
    tender_name: ["title"],
    tender_value: ["estimatedCost"],
  },
  technical_clarifications: {
    clarification_query: ["question"],
  },
  government_departments: {
    gov_dept_name: ["name"],
  },
  sections: {
    section_name: ["name"],
  },
  divisions: {
    division_name: ["name"],
  },
  sub_divisions: {
    sub_division_name: ["name"],
  },
};

const snakeToCamel = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());

// Collect the exact response field names that must be hidden for the current
// module based on the user's fieldPermissions (view === false).
const collectHiddenResponseFields = (
  moduleKey: string,
  fieldPermissions: unknown,
): Set<string> => {
  const hidden = new Set<string>();
  if (!isRecord(fieldPermissions)) return hidden;

  const moduleMap = FIELD_PERMISSION_RESPONSE_MAP[moduleKey];
  for (const [permissionKey, config] of Object.entries(fieldPermissions)) {
    const isHidden = isRecord(config) ? config.view === false : config === false;
    if (!isHidden) continue;

    const responseFields = moduleMap?.[permissionKey];
    if (responseFields && responseFields.length > 0) {
      responseFields.forEach((field) => hidden.add(field));
    } else {
      hidden.add(snakeToCamel(permissionKey));
    }
  }
  return hidden;
};

// Strip hidden fields from the payload at the record level (mirrors the
// client-side column hiding behaviour in the dashboard tables).
const stripHiddenFields = (value: unknown, hidden: Set<string>): void => {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => stripHiddenFields(item, hidden));
    return;
  }
  const record = value as Record<string, unknown>;
  if (
    Object.prototype.hasOwnProperty.call(record, "data") &&
    record.data !== undefined &&
    record.data !== null &&
    typeof record.data === "object"
  ) {
    stripHiddenFields(record.data, hidden);
    return;
  }
  for (const key of Object.keys(record)) {
    if (hidden.has(key)) delete record[key];
  }
};

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

        const mergedRoleFieldPermissions: Record<string, any> = {};
        for (const role of allRoles) {
          const fp = (role.fieldPermissions as Record<string, any>) || {};
          for (const [field, config] of Object.entries(fp)) {
            if (!mergedRoleFieldPermissions[field]) {
              mergedRoleFieldPermissions[field] = { ...config };
            } else {
              // Union: if ANY role grants view, it's granted
              if ((config as any)?.view === true) {
                mergedRoleFieldPermissions[field].view = true;
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

        const resolvedFieldPermissions = hasOverride
          ? (up?.fieldPermissions || {})
          : (Object.keys(mergedRoleFieldPermissions).length > 0
              ? mergedRoleFieldPermissions
              : (up?.fieldPermissions || {}));

        const tokenUser = {
          id: decoded.userId,
          companyId: activeCompanyId,
          email: dbUser.email,
          roles: dbUser.userRoles.map((ur) => ur.role.name) || [],
          uiAccessProfile: {
            pageAccess: resolvedPageAccess,
            actionPermissions: resolvedActionPermissions,
            fieldPermissions: resolvedFieldPermissions,
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

        const uiAccessProfile = (request.admin as any)?.uiAccessProfile;
        const moduleKey = getModuleForRequest(request.url) ?? getModuleForPermission(allowedPermissions);

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
            pageAccess.includes("tenders") ||
            pageAccess.includes("quotations") ||
            pageAccess.includes("export_orders"));

        const hasPageAccess = pageAccess.includes(moduleKey) || hasCustomerAccessForOrders;
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

  // ==========================
  // Server-side field permission enforcement
  // ==========================
  fastify.addHook("onSend", async (request: FastifyRequest, reply: FastifyReply, payload: any) => {
    try {
      if (reply.statusCode >= 400 || typeof payload !== "string") return payload;
      if (swaggerSafePaths.some((p) => request.url.startsWith(p))) return payload;

      const fieldPermissions = (request.admin as any)?.uiAccessProfile?.fieldPermissions;
      if (!fieldPermissions || Object.keys(fieldPermissions).length === 0) return payload;

      const moduleKey = getModuleForRequest(request.url);
      if (!moduleKey) return payload;

      const hidden = collectHiddenResponseFields(moduleKey, fieldPermissions);
      if (hidden.size === 0) return payload;

      const parsed = JSON.parse(payload);
      stripHiddenFields(parsed, hidden);
      return JSON.stringify(parsed);
    } catch {
      return payload;
    }
  });
}

export default fp(authPlugin, {
  name: "auth-plugin",
});
