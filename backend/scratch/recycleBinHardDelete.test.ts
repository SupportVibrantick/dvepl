import { prisma } from "../src/lib/prisma";
import { hardDelete, resetForeignKeyCatalogCache } from "../src/utils/fkSafeHardDelete";

const suffix = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const ROLLBACK = "__ROLLBACK__";

const expectRollback = (label: string, run: () => Promise<void>) =>
  run()
    .then(() => {
      throw new Error(`${label}: transaction did not roll back`);
    })
    .catch((error) => {
      if (error.message !== ROLLBACK) throw error;
      console.log(`PASS  ${label}`);
    });

async function main() {
  const company = await prisma.company.findFirst();
  const admin = await prisma.user.findFirst();
  if (!company || !admin) throw new Error("seed data missing");

  // ------------------------------------------------------------------ order
  await expectRollback(
    "order: items + attachments + cascade children removed",
    () =>
      prisma.$transaction(async (tx) => {
        const order = await tx.salesOrder.create({
          data: {
            companyId: company.id,
            createdById: admin.id,
            dveplCode: `TEST-${suffix()}`,
            partyName: "Recycle Bin Test",
          },
        });
        const item = await tx.salesOrderItem.create({
          data: {
            salesOrderId: order.id,
            itemCode: `I-${suffix()}`,
            description: "Widget",
            quantity: 2,
            unitPrice: 100,
            totalPrice: 200,
            gstPercentage: 18,
          },
        });
        const attachment = await tx.salesOrderAttachment.create({
          data: {
            salesOrderId: order.id,
            fileName: "drawing.pdf",
            fileUrl: "/uploads/drawing.pdf",
            uploadedById: admin.id,
          },
        });
        const takenBy = await tx.salesOrderTakenBy.create({
          data: { salesOrderId: order.id, userId: admin.id },
        });
        const event = await tx.workflowEvent.create({
          data: { salesOrderId: order.id, stage: "X", title: "t" },
        });
        // two required-FK levels: order -> dispatch -> dispatch item
        const dispatch = await tx.dispatch.create({
          data: {
            companyId: company.id,
            dispatchNo: `D-${suffix()}`,
            salesOrderId: order.id,
            createdById: admin.id,
          },
        });
        const dispatchItem = await tx.dispatchItem.create({
          data: { dispatchId: dispatch.id, salesOrderItemId: item.id, quantity: 1 },
        });

        await hardDelete({ prisma: tx, delegate: "salesOrder", id: order.id, adminId: admin.id });

        const left = await tx.salesOrder.findMany({ where: { id: order.id } });
        const items = await tx.salesOrderItem.findMany({ where: { id: item.id } });
        const atts = await tx.salesOrderAttachment.findMany({ where: { id: attachment.id } });
        const tb = await tx.salesOrderTakenBy.findMany({ where: { id: takenBy.id } });
        const ev = await tx.workflowEvent.findMany({ where: { id: event.id } });
        const dispatches = await tx.dispatch.findMany({ where: { id: dispatch.id } });
        const dItems = await tx.dispatchItem.findMany({ where: { id: dispatchItem.id } });
        if (
          left.length ||
          items.length ||
          atts.length ||
          tb.length ||
          ev.length ||
          dispatches.length ||
          dItems.length
        ) {
          throw new Error("order cascade left rows behind");
        }
        throw new Error(ROLLBACK);
      })
  );

  // --------------------------------------------------------------- customer
  await expectRollback(
    "customer: quotations purged, sales order kept (customerId -> null)",
    () =>
      prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: { companyId: company.id, name: `Test Customer ${suffix()}` },
        });
        const quotation = await tx.quotation.create({
          data: {
            companyId: company.id,
            customerId: customer.id,
            createdById: admin.id,
            quotationNo: `Q-${suffix()}`,
            validUntil: new Date(),
            materialCost: 0,
            gst: 0,
            finalAmount: 0,
            profitMargin: 0,
          },
        });
        const attachment = await tx.quotationAttachment.create({
          data: {
            quotationId: quotation.id,
            fileName: "a.pdf",
            fileUrl: "/uploads/a.pdf",
            uploadedById: admin.id,
          },
        });
        const order = await tx.salesOrder.create({
          data: {
            companyId: company.id,
            createdById: admin.id,
            customerId: customer.id,
            dveplCode: `TEST-${suffix()}`,
            partyName: customer.name,
          },
        });

        await hardDelete({ prisma: tx, delegate: "customer", id: customer.id, adminId: admin.id });

        const orders = await tx.salesOrder.findMany({ where: { id: order.id } });
        if (orders.length !== 1 || orders[0].customerId !== null) {
          throw new Error("nullable FK was not nulled out");
        }
        const quotes = await tx.quotation.findMany({ where: { id: quotation.id } });
        const atts = await tx.quotationAttachment.findMany({ where: { id: attachment.id } });
        if (quotes.length || atts.length) throw new Error("quotation children survived");
        throw new Error(ROLLBACK);
      })
  );

  // ------------------------------------------------------------------- user
  await expectRollback(
    "user: business records re-pointed at admin, user removed",
    () =>
      prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            companyId: company.id,
            name: "Doomed User",
            email: `test-${suffix()}@example.com`,
            passwordHash: "x",
          },
        });
        const order = await tx.salesOrder.create({
          data: {
            companyId: company.id,
            createdById: user.id,
            dveplCode: `TEST-${suffix()}`,
            partyName: "User Cascade Test",
          },
        });
        const attachment = await tx.salesOrderAttachment.create({
          data: {
            salesOrderId: order.id,
            fileName: "d.pdf",
            fileUrl: "/uploads/d.pdf",
            uploadedById: user.id,
          },
        });

        await hardDelete({
          prisma: tx,
          delegate: "user",
          id: user.id,
          adminId: admin.id,
          reassignTables: ["users"],
        });

        const kept = await tx.salesOrder.findMany({ where: { id: order.id } });
        if (kept.length !== 1 || kept[0].createdById !== admin.id) {
          throw new Error("sales order not re-pointed at admin");
        }
        const att = await tx.salesOrderAttachment.findMany({ where: { id: attachment.id } });
        if (att.length !== 1 || att[0].uploadedById !== admin.id) {
          throw new Error("attachment not re-pointed at admin");
        }
        const gone = await tx.user.findMany({ where: { id: user.id } });
        if (gone.length) throw new Error("user survived");
        throw new Error(ROLLBACK);
      })
  );

  // ------------------------------------------------------------------- role
  await expectRollback("role: role permissions purged", () =>
    prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: { companyId: company.id, name: `Test Role ${suffix()}` },
      });
      const permission = await tx.permission.create({
        data: { code: `p-${suffix()}` },
      });
      const rolePermission = await tx.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
      const approvalLevel = await tx.approvalLevel.create({
        data: { roleId: role.id, level: 1 },
      }).catch(() => null);

      await hardDelete({ prisma: tx, delegate: "role", id: role.id, adminId: admin.id });

      const rp = await tx.rolePermission.findMany({ where: { id: rolePermission.id } });
      if (rp.length) throw new Error("role permissions survived");
      if (approvalLevel) {
        const al = await tx.approvalLevel.findMany({ where: { id: approvalLevel.id } });
        if (al.length) throw new Error("approval levels survived");
      }
      throw new Error(ROLLBACK);
    })
  );

  // ----------------------------------------------------------- custom field
  await expectRollback("customfield: options + values purged", () =>
    prisma.$transaction(async (tx) => {
      const customField = await tx.customField.create({
        data: { module: "salesOrder", name: `cf-${suffix()}`, key: `k-${suffix()}`, type: "text" },
      });
      const option = await tx.customFieldOption.create({
        data: { customFieldId: customField.id, label: "A", value: "a" },
      });
      const value = await tx.customFieldValue.create({
        data: { customFieldId: customField.id, entityId: "x", stringValue: "y" },
      });

      await hardDelete({
        prisma: tx,
        delegate: "customField",
        id: customField.id,
        adminId: admin.id,
      });

      const o = await tx.customFieldOption.findMany({ where: { id: option.id } });
      const v = await tx.customFieldValue.findMany({ where: { id: value.id } });
      if (o.length || v.length) throw new Error("custom field children survived");
      throw new Error(ROLLBACK);
    })
  );

  // ------------------------------------------------------------ deep chain
  await expectRollback(
    "branch: required children purged recursively (departments -> employees)",
    () =>
      prisma.$transaction(async (tx) => {
        const branch = await tx.branch.create({
          data: { companyId: company.id, name: `Test Branch ${suffix()}`, code: `B-${suffix()}` },
        });
        const department = await tx.department.create({
          data: { branchId: branch.id, name: `D-${suffix()}`, code: `DC-${suffix()}` },
        });
        const employee = await tx.employee.create({
          data: {
            companyId: company.id,
            branchId: branch.id,
            departmentId: department.id,
            employeeCode: `E-${suffix()}`,
            firstName: "Test",
            lastName: "Employee",
            status: "ACTIVE",
          },
        });
        const document = await tx.employeeDocument.create({
          data: {
            employeeId: employee.id,
            documentType: "AADHAR",
            fileName: "aadhaar.pdf",
            fileUrl: "/uploads/aadhaar.pdf",
          },
        });

        await hardDelete({ prisma: tx, delegate: "branch", id: branch.id, adminId: admin.id });

        const departments = await tx.department.findMany({ where: { id: department.id } });
        const employees = await tx.employee.findMany({ where: { id: employee.id } });
        const docs = await tx.employeeDocument.findMany({ where: { id: document.id } });
        const branches = await tx.branch.findMany({ where: { id: branch.id } });
        if (branches.length || departments.length) {
          throw new Error("branch chain left rows behind");
        }
        // employees only reference the branch/department optionally, so the
        // database detaches them instead of deleting them
        if (employees.length !== 1 || employees[0].branchId !== null) {
          throw new Error("detached employee was not nulled out");
        }
        if (docs.length !== 1) throw new Error("employee document was deleted");
        throw new Error(ROLLBACK);
      })
  );

  // ------------------------------------------------- already deleted record
  await hardDelete({
    prisma,
    delegate: "salesOrder",
    id: "00000000-0000-0000-0000-000000000000",
  });
  console.log("PASS  missing record is a no-op");

  resetForeignKeyCatalogCache();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("FAIL", error);
    await prisma.$disconnect();
    process.exit(1);
  });
