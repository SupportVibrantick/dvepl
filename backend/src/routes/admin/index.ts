import adminAuthRouteGroup from "./auth/index";
import adminBranchRouteGroup from "./branch/index";
import adminCompanyRouteGroup from "./company/index";
import adminRoleRouteGroup from "./role";
import adminUserRouteGroup from "./user/index";
import adminDesignationRouteGroup from "./designation/index";
import adminSettingsRouteGroup from "./settings/index";
import adminCostCenterRouteGroup from "./costCenter/index";
import accessRoutes from "./access/index";

import adminEmployeeRouteGroup from "./employee";
import adminEmployeeContactRouteGroup from "./employeeContact";
import adminEmployeeEmergencyContactRouteGroup from "./employeeEmergencyContact";
import adminEmployeeEducationRouteGroup from "./employeeEducation";
import adminEmployeeExperienceRouteGroup from "./employeeExperience";
import adminEmployeeDocumentRouteGroup from "./employeeDocument";
import adminShiftRouteGroup from "./shift";
import adminEmployeeShiftRouteGroup from "./employeeShift";
import adminHolidayRouteGroup from "./employeeHoliday";
import adminAttendanceRouteGroup from "./employeeAttendance";
import adminLeaveRouteGroup from "./employeeLeave";
import adminSalaryRouteGroup from "./salary";
import adminCustomerRouteGroup from "./customer/index";
import adminContactRouteGroup from "./contact/index";
import adminCommunicationRouteGroup from "./communication/index";
import adminTenderRequestRouteGroup from "./tenderRequest/index";
import adminTenderRequestActivityRouteGroup from "./tenderRequestActivity/index";
import adminTenderRouteGroup from "./tender/index";
import adminReferenceCodeRouteGroup from "./referenceCode/index";
import adminReferenceCodeCounterRouteGroup from "./referenceCodeCounter/index";
import adminTenderFileRouteGroup from "./tenderFile/index";
import adminTenderRemarkRouteGroup from "./tenderRemark/index";
import adminTenderActivityRouteGroup from "./tenderActivity/index";
import adminGovernmentDepartmentRouteGroup from "./governmentDepartment/index";
import adminSectionRouteGroup from "./section/index";
import adminDivisionRouteGroup from "./division/index";
import adminSubDivisionRouteGroup from "./subDivision/index";
import adminDeptRouteGroup from "./department/index";
import adminTeamRouteGroup from "./team/index";
import adminTechnicalClarificationRouteGroup from "./technicalClarification/index";
import adminInventoryRouteGroup from "./inventory/index";
import inventoryTrackingRoutes from "./inventoryTracking/index"

import adminOrderRouteGroup from "./salesOrder/index";
import adminVendorRouteGroup from "./vendor/index";
import adminTaskRouteGroup from "./task/index";
import adminReportsRouteGroup from "./reports/index";
import adminPaymentRouteGroup from "./payment/index";
import adminVendorProductRouteGroup from "./vendorProduct/index";
import goodsReceiptRoutes from "./goodsRecipt";

import adminUploadRouteGroup from "./upload/index";
import adminExportOrdersRouteGroup from "./exportOrders/index";
import dynamicRoutes from "./dynamic";

import notificationRoutes from "./notification";

import { FastifyInstance, FastifyPluginOptions } from "fastify";

import adminCustomFieldRouteGroup from "./customField/index";
import recycleBinRoutes from "./recycleBin/index";
import purchaseOrderRoutes from './purchaseOrder'
import workflowRoutes from "./workflow"

import quoteTenderOrderRoutes from "./quotetender";
import adminAuditLogRouteGroup from "./auditLog/index";
import { requestContextStorage } from "../../utils/context";


async function adminRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
) {
  // Public routes
  fastify.register(adminAuthRouteGroup, { prefix: "/auth" });

  fastify.register(async function rolesGroup(instance, opts) {
    //runs automatically before every req
    instance.addHook("preHandler", async (req, reply) => {
      await instance.verifyToken(req, reply); // 1️⃣ Verify token

      // Set request context for audit logging
      const userId = (req as any).admin?.id || undefined;
      const ipAddress = req.ip || undefined;
      const userAgent = req.headers["user-agent"] || undefined;
      requestContextStorage.enterWith({ userId, ipAddress, userAgent });

      // Read requests (GET/HEAD) are available to any authenticated user. Sensitive
      // reads (user list, roles, audit logs, access, payroll, etc.) remain protected
      // by their own route-level authorizePermissions guards. Admin-only notification
      // management reads and permission-group reads stay gated here. The Admin bypass
      // in authorizePermissions also applies.
      const method = req.method;
      if (method === "GET" || method === "HEAD") {
        const readUrl = req.url;
        const adminOnlyRead =
          readUrl.includes("/notification/configuration") ||
          readUrl.includes("/notification/event") ||
          readUrl.includes("/notification/recipient") ||
          readUrl.includes("/notification/template") ||
          readUrl.includes("/permission-group") ||
          readUrl.includes("/access/");
        if (adminOnlyRead) {
          await instance.authorizePermissions(["settings.update"])(req, reply);
        }
        return;
      }

      // Determine required permissions dynamically based on the request URL and method
      const url = req.url;
      let requiredPermissions: string[] = [];

      if (url.includes("/company/")) {
        if (url.includes("/create")) requiredPermissions = ["company.create"];
        else if (url.includes("/update")) requiredPermissions = ["company.update"];
        else if (url.includes("/delete")) requiredPermissions = ["company.delete"];
      } else if (url.includes("/branch/")) {
        if (url.includes("/create")) requiredPermissions = ["branch.create"];
        else if (url.includes("/update")) requiredPermissions = ["branch.update"];
        else if (url.includes("/delete")) requiredPermissions = ["branch.delete"];
        else if (url.includes("/read")) requiredPermissions = ["branch.view"];
      } else if (url.includes("/department/") || url.includes("/designation/") || url.includes("/cost-center/") || url.includes("/team/")) {
        if (url.includes("/create")) requiredPermissions = ["employee.create"];
        else if (url.includes("/update")) requiredPermissions = ["employee.update"];
        else if (url.includes("/delete")) requiredPermissions = ["employee.delete"];
      } else if (url.includes("/employee/")) {
        if (url.includes("/create")) requiredPermissions = ["employee.create"];
        else if (url.includes("/update")) requiredPermissions = ["employee.update"];
        else if (url.includes("/delete")) requiredPermissions = ["employee.delete"];
        // else: read allowed for any authenticated user (tasks/quote/dashboard assignee mapping)
      } else if (url.includes("/task/")) {
        if (url.includes("/create")) requiredPermissions = ["employee.create"];
        else if (url.includes("/update")) requiredPermissions = ["employee.update"];
        else if (url.includes("/delete")) requiredPermissions = ["employee.delete"];
      } else if (url.includes("/settings/")) {
        if (url.includes("/update") || url.includes("/backup") || url.includes("/test-") || url.includes("/send-")) {
          requiredPermissions = ["company.update", "company.create", "role.update"];
        }
      } else if (url.includes("/order/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete") || url.includes("/bulk")) {
          requiredPermissions = ["company.create", "tender.update"];
        } else {
          requiredPermissions = ["company.view", "tender.view"];
        }
      } else if (url.includes("/quotetender/")) {
        if (url.includes("/create") ||
          url.includes("/update") ||
          url.includes("/delete") ||
          url.includes("/bulk")) {
          requiredPermissions = ["company.create", "tender.update"];
        } else {
          requiredPermissions = ["company.view", "tender.view"];
        }
      } else if (url.includes("/vendor/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["company.create", "tender.update"];
        } else {
          requiredPermissions = ["company.view", "tender.view"];
        }
      } else if (url.includes("/audit-log/")) {
        requiredPermissions = ["company.view"];
      } else if (url.includes("/notification/")) {
        // Notification logs are user-facing (the header bell fetches each user's
        // own notifications), so any authenticated user may read them. Admin-only
        // configuration, event, template, recipient and test routes stay gated.
        if (url.includes("/notification/logs")) {
          requiredPermissions = [];
        } else {
          requiredPermissions = ["settings.update"];
        }
      } else if (url.includes("/payment/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["finance.create"];
        } else {
          requiredPermissions = ["finance.view"];
        }
      } else if (url.includes("/reports/")) {
        requiredPermissions = ["reports.view"];
      } else if (url.includes("/vendor-product/")) {
        if (url.includes("/create") || url.includes("/delete")) {
          requiredPermissions = ["vendor.create"];
        } else {
          requiredPermissions = ["vendor.view"];
        }
      } else if (url.includes("/inventory-tracking/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["inventory.create"];
        } else {
          requiredPermissions = ["inventory.view"];
        }
      } else if (url.includes("/goods-receipt/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["inventory.create"];
        } else {
          requiredPermissions = ["inventory.view"];
        }
      } else if (url.includes("/purchase-order/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["inventory.create"];
        } else {
          requiredPermissions = ["inventory.view"];
        }
      } else if (url.includes("/user/")) {
        if (url.includes("/create")) {
          requiredPermissions = ["user.create"];
        } else if (url.includes("/update")) {
          requiredPermissions = ["user.update"];
        } else if (url.includes("/delete")) {
          requiredPermissions = ["user.delete"];
        } else {
          requiredPermissions = ["user.view"];
        }
      } else if (url.includes("/role/")) {
        if (url.includes("/create")) {
          requiredPermissions = ["role.create"];
        } else if (url.includes("/update")) {
          requiredPermissions = ["role.update"];
        } else if (url.includes("/delete")) {
          requiredPermissions = ["role.delete"];
        } else {
          requiredPermissions = ["role.view"];
        }
      } else if (url.includes("/holiday/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["holiday.create"];
        } else {
          requiredPermissions = ["holiday.view"];
        }
      } else if (url.includes("/attendance/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["attendance.create"];
        } else {
          requiredPermissions = ["attendance.view"];
        }
      } else if (url.includes("/leave/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["leave.create"];
        } else {
          requiredPermissions = ["leave.view"];
        }
      } else if (url.includes("/salary/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["salary.create"];
        } else {
          requiredPermissions = ["salary.view"];
        }
      } else if (url.includes("/employee-shift/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["shift.create"];
        } else {
          requiredPermissions = ["shift.view"];
        }
      } else if (url.includes("/contact/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["contact.create"];
        } else {
          requiredPermissions = ["contact.view"];
        }
      } else if (url.includes("/communication/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["communication.create"];
        } else {
          requiredPermissions = ["communication.view"];
        }
      } else if (url.includes("/customer/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["customer.create"];
        } else {
          requiredPermissions = ["customer.view"];
        }
      } else if (url.includes("/tender-request/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["tenderRequest.create"];
        } else {
          requiredPermissions = ["tenderRequest.view"];
        }
      } else if (url.includes("/tender/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["tender.create"];
        } else {
          requiredPermissions = ["tender.view"];
        }
      } else if (url.includes("/reference-code/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["referenceCode.create"];
        } else {
          requiredPermissions = ["referenceCode.view"];
        }
      } else if (url.includes("/government-department/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["governmentDepartment.create"];
        } else {
          requiredPermissions = ["governmentDepartment.view"];
        }
      } else if (url.includes("/section/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["section.create"];
        } else {
          requiredPermissions = ["section.view"];
        }
      } else if (url.includes("/division/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["division.create"];
        } else {
          requiredPermissions = ["division.view"];
        }
      } else if (url.includes("/sub-division/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["subDivision.create"];
        } else {
          requiredPermissions = ["subDivision.view"];
        }
      } else if (url.includes("/technical-clarification/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["technicalClarification.create"];
        } else {
          requiredPermissions = ["technicalClarification.view"];
        }
      } else if (url.includes("/employee-document/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["employeeDocument.create"];
        }
        // else: read allowed for any authenticated user
      } else if (url.includes("/employee-contact/") || url.includes("/employee-emergency-contact/") || url.includes("/employee-education/") || url.includes("/employee-experience/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["employee.create"];
        }
        // else: read allowed for any authenticated user
      } else if (url.includes("/export-orders/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["exportOrder.create"];
        } else {
          requiredPermissions = ["exportOrder.view"];
        }
      } else if (url.includes("/dynamic/")) {
        // Dynamic field/record/schema/module endpoints carry the target module in
        // the URL (moduleKey query/path or a database-owned record/field id),
        // which authorizePermissions resolves. Reads only need that module's page
        // access; writes need the matching action on it.
        if (req.method === "GET") {
          requiredPermissions = ["dashboard.read"];
        } else if (req.method === "DELETE") {
          requiredPermissions = ["settings.delete"];
        } else if (req.method === "PUT" || req.method === "PATCH") {
          requiredPermissions = ["settings.update"];
        } else {
          requiredPermissions = ["settings.create"];
        }
      } else if (url.includes("/upload/")) {
        // Generic file upload is not tied to a module and is used across all
        // pages; the resulting file only becomes data once linked to a
        // module record, which is still authorized on its own endpoint.
        requiredPermissions = [];
      } else if (url.includes("/workflow/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["workflow.update"];
        } else {
          requiredPermissions = ["workflow.view"];
        }
      } else if (url.includes("/custom-fields/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["customField.create"];
        } else {
          requiredPermissions = ["customField.view"];
        }
      } else if (url.includes("/recycle-bin/")) {
        if (url.includes("/restore") || url.includes("/delete")) {
          requiredPermissions = ["recycleBin.update"];
        } else {
          requiredPermissions = ["recycleBin.view"];
        }
      } else if (url.includes("/inventory/")) {
        if (url.includes("/create") || url.includes("/update") || url.includes("/delete")) {
          requiredPermissions = ["inventory.create"];
        } else {
          requiredPermissions = ["inventory.view"];
        }
      }

      // If we identified specific required permissions, authorize them.
      // authorizePermissions sends a 403 reply when access is denied; stopping
      // here prevents the route handler from replying a second time.
      if (requiredPermissions.length > 0) {
        await instance.authorizePermissions(
          requiredPermissions,
        )(req, reply);
        if (reply.sent) return;
      }
    });

    instance.register(adminBranchRouteGroup, { prefix: "/branch" });
    instance.register(adminCompanyRouteGroup, { prefix: "/company" });
    instance.register(adminDeptRouteGroup, { prefix: "/department" });
    instance.register(adminTeamRouteGroup, { prefix: "/team" });
    instance.register(adminRoleRouteGroup, {
      prefix: "/role",
    });
    instance.register(adminUserRouteGroup, {
      prefix: "/user",
    });
    instance.register(adminDesignationRouteGroup, {
      prefix: "/designation",
    });
    instance.register(adminCostCenterRouteGroup, {
      prefix: "/cost-center",
    });
    instance.register(adminSettingsRouteGroup, {
      prefix: "/settings",
    });
    instance.register(adminEmployeeRouteGroup, {
      prefix: "/employee",
    });
    instance.register(adminEmployeeContactRouteGroup, {
      prefix: "/employee-contact",
    });
    instance.register(adminEmployeeEmergencyContactRouteGroup, {
      prefix: "/employee-emergency-contact",
    });
    instance.register(adminEmployeeEducationRouteGroup, {
      prefix: "/employee-education",
    });
    instance.register(adminEmployeeExperienceRouteGroup, {
      prefix: "/employee-experience",
    });
    instance.register(adminEmployeeDocumentRouteGroup, {
      prefix: "/employee-document",
    });
    instance.register(adminShiftRouteGroup, {
      prefix: "/shift",
    });
    instance.register(adminEmployeeShiftRouteGroup, {
      prefix: "/employee-shift",
    });
    instance.register(adminHolidayRouteGroup, {
      prefix: "/holiday",
    });
    instance.register(adminAttendanceRouteGroup, {
      prefix: "/attendance",
    });
    instance.register(adminLeaveRouteGroup, {
      prefix: "/leave",
    });
    instance.register(adminSalaryRouteGroup, {
      prefix: "/salary",
    });
    instance.register(adminCustomerRouteGroup, { prefix: "/customer" });
    instance.register(adminContactRouteGroup, { prefix: "/contact" });
    instance.register(adminCommunicationRouteGroup, {
      prefix: "/communication",
    });
    instance.register(adminTenderRequestRouteGroup, {
      prefix: "/tender-request",
    });
    instance.register(adminTenderRequestActivityRouteGroup, {
      prefix: "/tender-request-activity",
    });
    instance.register(adminTenderRouteGroup, { prefix: "/tender" });
    instance.register(adminReferenceCodeRouteGroup, {
      prefix: "/reference-code",
    });
    instance.register(adminReferenceCodeCounterRouteGroup, {
      prefix: "/reference-code-counter",
    });
    instance.register(adminTenderFileRouteGroup, { prefix: "/tender-file" });
    instance.register(adminTenderRemarkRouteGroup, {
      prefix: "/tender-remark",
    });
    instance.register(adminTenderActivityRouteGroup, {
      prefix: "/tenderActivity",
    });
    instance.register(adminGovernmentDepartmentRouteGroup, {
      prefix: "/government-department",
    });
    instance.register(adminSectionRouteGroup, { prefix: "/section" });
    instance.register(adminDivisionRouteGroup, { prefix: "/division" });
    instance.register(adminSubDivisionRouteGroup, { prefix: "/sub-division" });
    instance.register(adminTechnicalClarificationRouteGroup, {
      prefix: "/technical-clarification",
    });
    instance.register(adminOrderRouteGroup, {
      prefix: "/order",
    });
    instance.register(adminVendorRouteGroup, {
      prefix: "/vendor",
    });
    instance.register(adminTaskRouteGroup, {
      prefix: "/task",
    });
    instance.register(adminReportsRouteGroup, {
      prefix: "/reports",
    });
    instance.register(adminPaymentRouteGroup, {
      prefix: "/payment",
    });
    instance.register(adminInventoryRouteGroup, {
      prefix: "/inventory",
    });
    instance.register(adminVendorProductRouteGroup, {
      prefix: "/vendor-product",
    });
    instance.register(inventoryTrackingRoutes, {
      prefix: "/inventory-tracking",
    });
    instance.register(goodsReceiptRoutes, {
      prefix: "/goods-receipt",
    });
    instance.register(purchaseOrderRoutes, {
      prefix: "/purchase-order",
    });
    instance.register(quoteTenderOrderRoutes, {
      prefix: "/quotetender",
    });

    instance.register(dynamicRoutes, { prefix: "/dynamic" });
    instance.register(adminUploadRouteGroup, {
      prefix: "/upload",
    });
    instance.register(adminExportOrdersRouteGroup, {
      prefix: "/export-orders",
    });
    instance.register(notificationRoutes, {
      prefix: "/notification",
    });
    instance.register(adminAuditLogRouteGroup, {
      prefix: "/audit-log",
    });
    instance.register(adminCustomFieldRouteGroup, { prefix: "/custom-fields" });
    instance.register(recycleBinRoutes, { prefix: "/recycle-bin" });
    instance.register(workflowRoutes, { prefix: "/workflow" });
    instance.register(accessRoutes, { prefix: "/access" });
  });
}

export default adminRoutes;
