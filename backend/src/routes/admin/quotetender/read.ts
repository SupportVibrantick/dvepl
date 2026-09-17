import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { fetchAwardTenders } from "../../../services/quoteTender.service";
import { syncCustomersFromQuoteTender } from "../../../services/quoteTenderCustomerSync.service";
import { SalesOrderStatus } from "@prisma/client";

function getSalesOrderStatus(statusStr: string): SalesOrderStatus {
  const s = (statusStr || "").toUpperCase();
  if (s.includes("ACCEPT") || s.includes("CONFIRM") || s.includes("PROGRESS")) {
    return "IN_PROGRESS";
  }
  if (s.includes("COMPLET")) {
    return "COMPLETED";
  }
  if (s.includes("HOLD")) {
    return "ON_HOLD";
  }
  return "PENDING";
}

async function quoteTenderOrderReadRoutes(
  fastify: FastifyInstance,
) {
  // This endpoint creates / updates customers and sales orders, so it is a
  // POST, not a GET, and is guarded like any other create.
  fastify.post(
    "/",
    {
      schema: {
        tags: ["Quote Tender Order"],
        summary: "Read Orders from Quote Tender Portal",
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["order.create"]),
      ],
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      try {
        const awardTenders = await fetchAwardTenders();

        const companyId = (request as any).user?.companyId;
        const userId = (request as any).user?.id;

        if (!companyId || !userId) {
          return reply.status(401).send({
            success: false,
            message: "Unauthorized: Missing user or company context.",
          });
        }

        let tendersArray: any[] = [];
        if (Array.isArray(awardTenders)) {
          tendersArray = awardTenders;
        } else if (awardTenders && Array.isArray((awardTenders as any).data)) {
          tendersArray = (awardTenders as any).data;
        } else if (awardTenders && (awardTenders as any).data && Array.isArray((awardTenders as any).data.data)) {
          tendersArray = (awardTenders as any).data.data;
        }

        fastify.log.info(`Sync found ${tendersArray.length} tenders to process.`);

        // Import / update customers from the portal data and link sales orders.
        const syncedCustomers = await syncCustomersFromQuoteTender(
          fastify.prisma,
          companyId,
          tendersArray
        );
        const customerByFirm = new Map<string, string>();
        for (const customer of syncedCustomers) {
          customerByFirm.set(customer.name.toLowerCase(), customer.id);
        }
        fastify.log.info(
          `Customer sync found/updated ${syncedCustomers.length} customers.`
        );

        const syncedOrders: any[] = [];

        for (const order of tendersArray) {
          const t_id = order.t_id;
          if (!t_id) continue;

          const dveplCode = `QT-ORDER-${t_id}`;
          const referenceCode = order.reference_code || order.tenderID || String(t_id);
          const customerId =
            customerByFirm.get(String(order.firm_name || "").trim().toLowerCase()) ||
            null;

          const remarks = [
            `Work: ${order.name_of_work || ""}`,
            `Department: ${order.department_name || ""}`,
            `Section: ${order.section_name || ""}`,
            `Division: ${order.division_name || ""}`,
            `Sub Division: ${order.subdivision || ""}`,
            `Location: ${[order.state_name, order.city_name].filter(Boolean).join(", ")}`,
            `Tender ID: ${order.tenderID || ""}`,
            `Reference Code: ${referenceCode}`,
            `File Name: ${order.file_name || ""}`,
          ].join("\n");

          // Check if already exists in database
          const existing = await fastify.prisma.salesOrder.findFirst({
            where: {
              OR: [
                { dveplCode },
                { remarks: { contains: `Reference Code: ${t_id}` } },
                { remarks: { contains: `Reference Code: ${referenceCode}` } }
              ],
            },
          });

          if (!existing) {
            fastify.log.info(`Sync creating new order for t_id: ${t_id}`);

            const subtotal = Number((order as any).amount || (order as any).tender_value || (order as any).value || 0);
            const gstTotal = Math.round(subtotal * 0.18 * 100) / 100;
            const grandTotal = subtotal + gstTotal;

            const contactDetails = [order.name, order.mobile, order.email_id]
              .filter(Boolean)
              .join(" | ");

            const newOrder = await fastify.prisma.salesOrder.create({
              data: {
                companyId,
                createdById: userId,
                orderTakenById: userId,
                customerId,
                partyName: order.firm_name || "Unknown Firm",
                caNo: order.tender_no || null,
                dveplCode,
                contactDetails,
                remarks,
                status: getSalesOrderStatus(order.remark || order.status),
                subtotal,
                gstTotal,
                grandTotal,
                sendNotification: false,
              },
            });
            syncedOrders.push(newOrder);
          } else {
            // Update the existing order to backfill remarks if they were never set,
            // or update the file name if it was previously synced without one.
            const existingRemarks = existing.remarks || "";
            const hasWorkLine = existingRemarks.includes("Work:");
            const hasFileNameLine = existingRemarks.includes("File Name:");

            let updatedRemarks = existingRemarks;
            let needsUpdate = false;

            if (!hasWorkLine) {
              // The remarks were never set on creation (due to the bug)
              updatedRemarks = remarks;
              needsUpdate = true;
            } else if (!hasFileNameLine && order.file_name) {
              // Just append file name
              updatedRemarks = `${existingRemarks}\nFile Name: ${order.file_name}`;
              needsUpdate = true;
            }

            if (needsUpdate) {
              fastify.log.info(`Sync updating remarks/file name for t_id: ${t_id}`);
              const updatedOrder = await fastify.prisma.salesOrder.update({
                where: { id: existing.id },
                data: {
                  remarks: updatedRemarks,
                  ...(existing.customerId ? {} : { customerId }),
                },
              });
              syncedOrders.push(updatedOrder);
            }
          }
        }

        return reply.status(200).send({
          success: true,
          message: "Quote Tender Orders fetched and synced successfully.",
          data: awardTenders,
          syncedCount: syncedOrders.length,
          syncedCustomersCount: syncedCustomers.length,
        });
      } catch (error: any) {
        fastify.log.error(error);

        return reply.status(502).send({
          success: false,
          message: "Failed to fetch and sync orders from Quote Tender Portal.",
          error: error.message,
        });
      }
    },
  );
}

export default quoteTenderOrderReadRoutes;