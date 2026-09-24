import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { adminLogs } from "../../../services/logger/contextLogger";

interface Query {
  module?: string;
}

interface ItemParams {
  module: string;
  id: string;
}

type RecycleBinModelConfig = {
  module: string;
  label: string;
  delegate: string;
  select: Record<string, boolean>;
  where?: Record<string, any>;
  formatName: (record: Record<string, any>) => string;
  permanentDelete?: (fastify: FastifyInstance, id: string, adminId: string) => Promise<void>;
};

const recycleBinModels: RecycleBinModelConfig[] = [
  {
    module: "company",
    label: "Company",
    delegate: "company",
    select: { id: true, name: true, email: true, deletedAt: true, updatedAt: true },
    formatName: (record) => record.name || record.email || "Company Record",
  },
  {
    module: "branch",
    label: "Branch",
    delegate: "branch",
    select: { id: true, name: true, code: true, deletedAt: true, updatedAt: true },
    formatName: (record) => `${record.name || "Branch"}${record.code ? ` (${record.code})` : ""}`,
  },
  {
    module: "department",
    label: "Department",
    delegate: "department",
    select: { id: true, name: true, code: true, deletedAt: true, updatedAt: true },
    formatName: (record) => `${record.name || "Department"}${record.code ? ` (${record.code})` : ""}`,
  },
  {
    module: "team",
    label: "Team",
    delegate: "team",
    select: { id: true, name: true, deletedAt: true, updatedAt: true },
    formatName: (record) => record.name || "Team Record",
  },
  {
    module: "designation",
    label: "Designation",
    delegate: "designation",
    select: { id: true, title: true, deletedAt: true, updatedAt: true },
    formatName: (record) => record.title || "Designation Record",
  },
  {
    module: "costcenter",
    label: "Cost Center",
    delegate: "costCenter",
    select: { id: true, name: true, code: true, deletedAt: true, updatedAt: true },
    formatName: (record) => `${record.name || "Cost Center"}${record.code ? ` (${record.code})` : ""}`,
  },
  {
    module: "user",
    label: "User",
    delegate: "user",
    select: { id: true, name: true, email: true, deletedAt: true, updatedAt: true },
    formatName: (record) => `${record.name || "User"}${record.email ? ` (${record.email})` : ""}`,
    permanentDelete: async (fastify, id, adminId) => {
      await fastify.prisma.userRole.deleteMany({ where: { userId: id } });
      await fastify.prisma.userPermission.deleteMany({ where: { userId: id } });
      await fastify.prisma.userAccessProfile.deleteMany({ where: { userId: id } });
      await fastify.prisma.userSession.deleteMany({ where: { userId: id } });
      await fastify.prisma.refreshToken.deleteMany({ where: { userId: id } });
      await fastify.prisma.otpRequest.deleteMany({ where: { userId: id } });
      await fastify.prisma.passwordReset.deleteMany({ where: { userId: id } });
      await fastify.prisma.auditLog.deleteMany({ where: { userId: id } });
      await fastify.prisma.dashboardWidget.deleteMany({ where: { createdById: id } });

      await fastify.prisma.employee.updateMany({
        where: { userId: id },
        data: { userId: null },
      });

      if (adminId && adminId !== id) {
        // Reassign every RESTRICT FK column referencing the user to the
        // acting admin so the user can be permanently deleted. Columns with
        // SET NULL / CASCADE constraints are handled by the database.
        const userRefDelegates: Array<[string, string]> = [
          ["approvalHistory", "performedById"],
          ["approvalRequest", "requestedById"],
          ["bOM", "createdById"],
          ["bOMRevision", "revisedById"],
          ["bOQAttachment", "uploadedById"],
          ["creditNote", "createdById"],
          ["customerDrawingReview", "sentById"],
          ["debitNote", "createdById"],
          ["deliveryProof", "uploadedById"],
          ["dispatch", "createdById"],
          ["drawingRevision", "createdById"],
          ["engineeringDrawing", "createdById"],
          ["engineeringProject", "createdById"],
          ["expense", "createdById"],
          ["goodsReceipt", "receivedById"],
          ["inspection", "inspectedById"],
          ["inventoryTransaction", "createdById"],
          ["invoice", "createdById"],
          ["ledgerEntry", "createdById"],
          ["material", "createdById"],
          ["payment", "receivedById"],
          ["productionLog", "operatorId"],
          ["productionPlan", "createdById"],
          ["purchaseOrder", "createdById"],
          ["purchaseRequest", "requestedById"],
          ["quotation", "createdById"],
          ["quotationAttachment", "uploadedById"],
          ["quotationRevision", "revisedById"],
          ["reportDefinition", "createdById"],
          ["reportSchedule", "createdById"],
          ["rework", "assignedToId"],
          ["salesOrder", "createdById"],
          ["salesOrderAssignment", "userId"],
          ["salesOrderAttachment", "uploadedById"],
          ["stockTransfer", "requestedById"],
          ["technicalClarification", "raisedById"],
          ["technicalClarificationAttachment", "uploadedById"],
          ["technicalClarificationReply", "repliedById"],
          ["tender", "createdById"],
          ["vendor", "createdById"],
          ["vendorProduct", "createdById"],
          ["vendorRevision", "createdById"],
          ["workOrder", "createdById"],
        ];

        await Promise.all(
          userRefDelegates.map(([delegate, field]) =>
            (fastify.prisma as any)[delegate].updateMany({
              where: { [field]: id },
              data: { [field]: adminId },
            })
          )
        );
      }

      await (fastify.prisma as any).user.deleteMany({ where: { id } });
    },
  },
  {
    module: "role",
    label: "Role",
    delegate: "role",
    select: { id: true, name: true, deletedAt: true, updatedAt: true },
    formatName: (record) => record.name || "Role Record",
  },
  {
    module: "employee",
    label: "Employee",
    delegate: "employee",
    select: { id: true, employeeCode: true, firstName: true, lastName: true, deletedAt: true, updatedAt: true },
    formatName: (record) => `${[record.firstName, record.lastName].filter(Boolean).join(" ") || "Employee"}${record.employeeCode ? ` (${record.employeeCode})` : ""}`,
    permanentDelete: async (fastify, id) => {
      await fastify.prisma.employeeContact.deleteMany({ where: { employeeId: id } });
      await fastify.prisma.employeeEmergencyContact.deleteMany({ where: { employeeId: id } });
      await fastify.prisma.employeeEducation.deleteMany({ where: { employeeId: id } });
      await fastify.prisma.employeeExperience.deleteMany({ where: { employeeId: id } });
      await fastify.prisma.employeeDocument.deleteMany({ where: { employeeId: id } });
      await fastify.prisma.employeeShift.deleteMany({ where: { employeeId: id } });
      await fastify.prisma.attendance.deleteMany({ where: { employeeId: id } });
      await fastify.prisma.leave.deleteMany({ where: { employeeId: id } });
      await fastify.prisma.salary.deleteMany({ where: { employeeId: id } });
      await fastify.prisma.taskAssignment.deleteMany({ where: { employeeId: id } });
      await (fastify.prisma as any).employee.deleteMany({ where: { id } });
    },
  },
  {
    module: "customer",
    label: "Customer",
    delegate: "customer",
    select: { id: true, name: true, gst: true, deletedAt: true, updatedAt: true },
    formatName: (record) => `${record.name || "Customer"}${record.gst ? ` (${record.gst})` : ""}`,
    permanentDelete: async (fastify, id) => {
      // communication_history references customers with RESTRICT FK
      await fastify.prisma.communicationHistory.deleteMany({
        where: { customerId: id },
      });

      // contact_persons block with RESTRICT FK; their child
      // customer_drawing_reviews block via contactPersonId with RESTRICT FK
      const contactPersons = await fastify.prisma.contactPerson.findMany({
        where: { customerId: id },
        select: { id: true },
      });
      const contactIds = contactPersons.map((contact) => contact.id);

      if (contactIds.length > 0) {
        await fastify.prisma.customerDrawingReview.deleteMany({
          where: { contactPersonId: { in: contactIds } },
        });
      }
      await fastify.prisma.contactPerson.deleteMany({ where: { customerId: id } });

      // quotations block with RESTRICT FKs; remove their children first
      const quotations = await fastify.prisma.quotation.findMany({
        where: { customerId: id },
        select: { id: true },
      });
      const quotationIds = quotations.map((quotation) => quotation.id);

      if (quotationIds.length > 0) {
        await fastify.prisma.quotationAttachment.deleteMany({
          where: { quotationId: { in: quotationIds } },
        });
        await fastify.prisma.quotationCharge.deleteMany({
          where: { quotationId: { in: quotationIds } },
        });
        await fastify.prisma.quotationItem.deleteMany({
          where: { quotationId: { in: quotationIds } },
        });
        await fastify.prisma.quotationRevision.deleteMany({
          where: { quotationId: { in: quotationIds } },
        });
      }
      await fastify.prisma.quotation.deleteMany({ where: { customerId: id } });

      await fastify.prisma.customer.delete({ where: { id } });
    },
  },
  {
    module: "contact",
    label: "Contact",
    delegate: "contactPerson",
    select: { id: true, name: true, email: true, phone: true, deletedAt: true, updatedAt: true },
    formatName: (record) => `${record.name || "Contact"}${record.email || record.phone ? ` (${record.email || record.phone})` : ""}`,
  },
  {
    module: "tender",
    label: "Tender",
    delegate: "tender",
    select: { id: true, tenderNo: true, tenderCode: true, title: true, deletedAt: true, updatedAt: true },
    formatName: (record) => record.title || record.tenderNo || record.tenderCode || "Tender Record",
  },
  {
    module: "tenderrequest",
    label: "Tender Request",
    delegate: "tenderRequest",
    select: { id: true, title: true, deletedAt: true, updatedAt: true },
    formatName: (record) => record.title || "Tender Request Record",
  },
  {
    module: "section",
    label: "Section",
    delegate: "section",
    select: { id: true, name: true, code: true, deletedAt: true, updatedAt: true },
    formatName: (record) => `${record.name || "Section"}${record.code ? ` (${record.code})` : ""}`,
  },
  {
    module: "division",
    label: "Division",
    delegate: "division",
    select: { id: true, name: true, code: true, deletedAt: true, updatedAt: true },
    formatName: (record) => `${record.name || "Division"}${record.code ? ` (${record.code})` : ""}`,
  },
  {
    module: "subdivision",
    label: "Sub Division",
    delegate: "subDivision",
    select: { id: true, name: true, code: true, deletedAt: true, updatedAt: true },
    formatName: (record) => `${record.name || "Sub Division"}${record.code ? ` (${record.code})` : ""}`,
  },
  {
    module: "order",
    label: "Sales Order",
    delegate: "salesOrder",
    select: { id: true, dveplCode: true, partyName: true, deletedAt: true, updatedAt: true },
    formatName: (record) => `${record.dveplCode || "Sales Order"}${record.partyName ? ` - ${record.partyName}` : ""}`,
    permanentDelete: async (fastify, id) => {
      await fastify.prisma.salesOrderItem.deleteMany({ where: { salesOrderId: id } });
      await (fastify.prisma as any).salesOrder.delete({ where: { id } });
    },
  },
  {
    module: "task",
    label: "Task",
    delegate: "task",
    select: { id: true, title: true, deletedAt: true, updatedAt: true },
    formatName: (record) => record.title || "Task Record",
  },
  {
    module: "payment",
    label: "Payment",
    delegate: "payment",
    select: { id: true, paymentNo: true, amount: true, deletedAt: true, updatedAt: true },
    formatName: (record) => record.paymentNo || "Payment Record",
  },
  {
    module: "vendor",
    label: "Vendor",
    delegate: "vendor",
    select: { id: true, name: true, email: true, deletedAt: true, updatedAt: true },
    formatName: (record) => record.name || record.email || "Vendor Profile",
    permanentDelete: async (fastify, id) => {
      await fastify.prisma.customFieldValue.deleteMany({ where: { entityId: id } });
      await fastify.prisma.material.updateMany({
        where: { vendorId: id },
        data: { vendorId: null },
      });
      await fastify.prisma.material.updateMany({
        where: { preferredVendorId: id },
        data: { preferredVendorId: null },
      });
      await fastify.prisma.vendorProduct.deleteMany({ where: { vendorId: id } });
      await (fastify.prisma as any).vendor.delete({ where: { id } });
    },
  },
  {
    module: "purchaseorder",
    label: "Purchase Order",
    delegate: "purchaseOrder",
    select: { id: true, poNo: true, referenceCode: true, deletedAt: true, updatedAt: true },
    formatName: (record) =>
      `${record.poNo || "Purchase Order"}${record.referenceCode ? ` (Ref: ${record.referenceCode})` : ""}`,
    permanentDelete: async (fastify, id) => {
      // FKs are RESTRICT on goods_receipt_items / goods_receipts /
      // purchase_order_items, so children must be removed before the PO.
      // Revisions cascade and invoices SET NULL at the database level.
      await fastify.prisma.goodsReceiptItem.deleteMany({
        where: { grn: { poId: id } },
      });
      await fastify.prisma.goodsReceipt.deleteMany({ where: { poId: id } });
      await fastify.prisma.purchaseOrderItem.deleteMany({ where: { poId: id } });
      await (fastify.prisma as any).purchaseOrder.delete({ where: { id } });
    },
  },
  {
    module: "customfield",
    label: "Custom Field",
    delegate: "customField",
    select: { id: true, name: true, module: true, deletedAt: true, updatedAt: true },
    formatName: (record) => `Custom Field${record.module ? ` (${record.module})` : ""}: ${record.name || "Field"}`,
    permanentDelete: async (fastify, id) => {
      await fastify.prisma.customFieldOption.deleteMany({ where: { customFieldId: id } });
      await fastify.prisma.customFieldValue.deleteMany({ where: { customFieldId: id } });
      await (fastify.prisma as any).customField.delete({ where: { id } });
    },
  },
  {
    module: "permissiongroup",
    label: "Permission Group",
    delegate: "permissionGroup",
    select: { id: true, name: true, deletedAt: true },
    formatName: (record) => record.name || "Permission Group",
  },
  {
    module: "employeecontact",
    label: "Employee Contact",
    delegate: "employeeContact",
    select: { id: true, type: true, value: true, deletedAt: true },
    formatName: (record) => `${record.type || "Contact"}: ${record.value || "Employee Contact"}`,
  },
  {
    module: "employeeemergencycontact",
    label: "Employee Emergency Contact",
    delegate: "employeeEmergencyContact",
    select: { id: true, name: true, relationship: true, phone: true, deletedAt: true },
    formatName: (record) => `${record.name || "Emergency Contact"}${record.phone ? ` (${record.phone})` : ""}`,
  },
  {
    module: "employeeeducation",
    label: "Employee Education",
    delegate: "employeeEducation",
    select: { id: true, degree: true, institution: true, deletedAt: true },
    formatName: (record) => `${record.degree || "Education"}${record.institution ? ` - ${record.institution}` : ""}`,
  },
  {
    module: "employeeexperience",
    label: "Employee Experience",
    delegate: "employeeExperience",
    select: { id: true, companyName: true, designation: true, deletedAt: true },
    formatName: (record) => `${record.designation || "Experience"}${record.companyName ? ` at ${record.companyName}` : ""}`,
  },
  {
    module: "employeedocument",
    label: "Employee Document",
    delegate: "employeeDocument",
    select: { id: true, documentType: true, fileName: true, deletedAt: true },
    formatName: (record) => `${record.documentType || "Document"}${record.fileName ? ` - ${record.fileName}` : ""}`,
  },
  {
    module: "employeeshift",
    label: "Employee Shift Assignment",
    delegate: "employeeShift",
    select: { id: true, effectiveFrom: true, effectiveTo: true, deletedAt: true },
    formatName: (record) => `Shift Assignment${record.effectiveFrom ? ` from ${new Date(record.effectiveFrom).toLocaleDateString()}` : ""}`,
  },
  {
    module: "holiday",
    label: "Holiday",
    delegate: "holiday",
    select: { id: true, name: true, date: true, deletedAt: true },
    formatName: (record) => `${record.name || "Holiday"}${record.date ? ` (${new Date(record.date).toLocaleDateString()})` : ""}`,
  },
  {
    module: "attendance",
    label: "Attendance",
    delegate: "attendance",
    select: { id: true, date: true, status: true, deletedAt: true },
    formatName: (record) => `Attendance${record.date ? ` - ${new Date(record.date).toLocaleDateString()}` : ""}${record.status ? ` (${record.status})` : ""}`,
  },
  {
    module: "leave",
    label: "Leave",
    delegate: "leave",
    select: { id: true, leaveType: true, fromDate: true, toDate: true, deletedAt: true },
    formatName: (record) => `${record.leaveType || "Leave"}${record.fromDate ? ` from ${new Date(record.fromDate).toLocaleDateString()}` : ""}`,
  },
  {
    module: "salary",
    label: "Salary",
    delegate: "salary",
    select: { id: true, effectiveFrom: true, ctc: true, deletedAt: true },
    formatName: (record) => `Salary${record.effectiveFrom ? ` from ${new Date(record.effectiveFrom).toLocaleDateString()}` : ""}`,
  },
  {
    module: "communication",
    label: "Communication History",
    delegate: "communicationHistory",
    select: { id: true, type: true, subject: true, deletedAt: true },
    formatName: (record) => `${record.type || "Communication"}${record.subject ? ` - ${record.subject}` : ""}`,
  },
  {
    module: "tenderfile",
    label: "Tender File",
    delegate: "tenderFile",
    select: { id: true, fileName: true, fileType: true, deletedAt: true },
    formatName: (record) => record.fileName || "Tender File",
  },
  {
    module: "tenderactivity",
    label: "Tender Activity",
    delegate: "tenderActivity",
    select: { id: true, action: true, deletedAt: true },
    formatName: (record) => `Tender Activity${record.action ? ` (${record.action})` : ""}`,
  },
  {
    module: "tenderrequestactivity",
    label: "Tender Request Activity",
    delegate: "auditLog",
    select: { id: true, module: true, action: true, recordId: true, deletedAt: true },
    where: { module: "TenderRequest" },
    formatName: (record) => `Tender Request Activity${record.action ? ` (${record.action})` : ""}`,
  },
  {
    module: "referencecodecounter",
    label: "Reference Code Counter",
    delegate: "referenceCodeCounter",
    select: { id: true, prefix: true, lastSequence: true, deletedAt: true },
    formatName: (record) => `${record.prefix || "Reference Code Counter"} (${record.lastSequence ?? 0})`,
  },
];

const recycleBinModelMap = new Map(
  recycleBinModels.map((config) => [config.module, config])
);

const getDelegate = (fastify: FastifyInstance, config: RecycleBinModelConfig) => {
  const delegate = (fastify.prisma as any)[config.delegate];

  if (!delegate) {
    throw new Error(`Recycle bin delegate not found: ${config.delegate}`);
  }

  return delegate;
};

export async function recycleBinRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  // 1. Get all soft-deleted records across modules
  fastify.get<{ Querystring: Query }>(
    "/list",
    {
      preHandler: [fastify.verifyToken, fastify.authorizePermissions(["recycle_bin.view"])],
      schema: {
        tags: ["Recycle Bin"],
        summary: "Get soft-deleted items",
        description: "List all soft-deleted records across system modules",
      },
    },
    async (request: FastifyRequest<{ Querystring: Query }>, reply: FastifyReply) => {
      try {
        const { module } = request.query;
        const normalizedModule = module?.toLowerCase();
        const configs = normalizedModule
          ? recycleBinModels.filter((config) => config.module === normalizedModule)
          : recycleBinModels;

        if (normalizedModule && configs.length === 0) {
          return reply.status(400).send({ success: false, message: "Invalid module specified." });
        }

        const deletedRecords = await Promise.all(
          configs.map(async (config) => {
            const delegate = getDelegate(fastify, config);
            const records = await delegate.findMany({
              where: { ...config.where, NOT: { deletedAt: null } },
              select: config.select,
            });

            return records.map((record: Record<string, any>) => ({
              id: record.id,
              module: config.module,
              moduleLabel: config.label,
              name: config.formatName(record),
              deletedBy: "Admin",
              deletedAt: record.deletedAt,
            }));
          })
        );

        const formatted = deletedRecords
          .flat()
          .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

        return reply.status(200).send({
          success: true,
          data: formatted,
          modules: recycleBinModels.map(({ module, label }) => ({ module, label })),
        });
      } catch (error) {
        adminLogs.error("Failed to fetch recycle bin items", { error });
        return reply.status(500).send({
          success: false,
          message: "Internal server error fetching recycle bin items.",
        });
      }
    }
  );

  // 2. Restore a soft-deleted record (set deletedAt = null)
  fastify.post<{ Params: ItemParams }>(
    "/restore/:module/:id",
    {
      preHandler: [fastify.verifyToken, fastify.authorizePermissions(["recycle_bin.update"])],
      schema: {
        tags: ["Recycle Bin"],
        summary: "Restore soft-deleted item",
        description: "Restores a soft-deleted item by setting deletedAt back to null",
      },
    },
    async (request: FastifyRequest<{ Params: ItemParams }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const module = request.params.module.toLowerCase();
        const config = recycleBinModelMap.get(module);

        if (!config) {
          return reply.status(400).send({ success: false, message: "Invalid module specified." });
        }

        await getDelegate(fastify, config).update({
          where: { id },
          data: { deletedAt: null, ...(module === "company" || module === "user" || module === "branch" ? { isActive: true } : {}) },
        });

        return reply.status(200).send({
          success: true,
          message: `${config.label} record restored successfully.`,
        });
      } catch (error) {
        adminLogs.error("Failed to restore recycle bin item", { error });
        return reply.status(500).send({
          success: false,
          message: "Failed to restore record.",
        });
      }
    }
  );

  // 3. Permanent delete a record from database
  fastify.delete<{ Params: ItemParams }>(
    "/permanent-delete/:module/:id",
    {
      preHandler: [fastify.verifyToken, fastify.authorizePermissions(["recycle_bin.delete"])],
      schema: {
        tags: ["Recycle Bin"],
        summary: "Permanently delete item",
        description: "Deletes a record permanently from the database",
      },
    },
    async (request: FastifyRequest<{ Params: ItemParams }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const module = request.params.module.toLowerCase();
        const config = recycleBinModelMap.get(module);

        if (!config) {
          return reply.status(400).send({ success: false, message: "Invalid module specified." });
        }

        const adminId = (request as any).admin?.id || "";
        if (config.permanentDelete) {
          await config.permanentDelete(fastify, id, adminId);
        } else {
          await getDelegate(fastify, config).delete({ where: { id } });
        }

        return reply.status(200).send({
          success: true,
          message: `${config.label} record permanently deleted.`,
        });
      } catch (error) {
        adminLogs.error("Failed to permanently delete item", { error });
        return reply.status(500).send({
          success: false,
          message: "Failed to permanently delete record.",
          details:
            process.env.NODE_ENV === "development"
              ? (error as Error).message
              : undefined,
        });
      }
    }
  );

  // 4. Empty entire Recycle Bin
  fastify.delete(
    "/empty",
    {
      preHandler: [fastify.verifyToken, fastify.authorizePermissions(["recycle_bin.delete"])],
      schema: {
        tags: ["Recycle Bin"],
        summary: "Empty entire recycle bin",
        description: "Permanently deletes all soft-deleted records",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const adminId = (request as any).admin?.id || "";
        for (const config of recycleBinModels) {
          const delegate = getDelegate(fastify, config);
          const deletedRecords = await delegate.findMany({
            where: { ...config.where, NOT: { deletedAt: null } },
            select: { id: true },
          });

          for (const record of deletedRecords) {
            if (config.permanentDelete) {
              await config.permanentDelete(fastify, record.id, adminId);
            } else {
              await delegate.delete({ where: { id: record.id } });
            }
          }
        }

        return reply.status(200).send({
          success: true,
          message: "Recycle bin emptied successfully.",
        });
      } catch (error) {
        adminLogs.error("Failed to empty recycle bin", { error });
        return reply.status(500).send({
          success: false,
          message: "Failed to empty recycle bin.",
        });
      }
    }
  );
}

export default recycleBinRoutes;
