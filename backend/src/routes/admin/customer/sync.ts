import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { fetchAllPortalCustomers } from "../../../services/quoteTender.service";
import { syncCustomersFromPortal } from "../../../services/quoteTenderCustomerSync.service";
import { adminLogs } from "../../../services/logger/contextLogger";

async function syncCustomerRoute(
  fastify: FastifyInstance
) {
  fastify.post(
    "/",
    {
      schema: {
        tags: ["Customer"],
        summary: "Sync Customers from Quote Tender Portal",
        description:
          "Imports and updates customers from the Quote Tender portal, linking them to matching sales orders.",
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["customer.view"]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const companyId = request.admin?.companyId;

        if (!companyId) {
          return reply.status(401).send({
            success: false,
            message: "Company information missing from token.",
          });
        }

        const body = (request.body ?? {}) as { limit?: number; all?: boolean };
        const requested = Number(body.limit);
        const limit = body.all
          ? 0
          : requested > 0
            ? requested
            : Number(process.env.QUOTE_TENDER_CUSTOMER_FETCH_LIMIT) || 100;

        const portalCustomers = await fetchAllPortalCustomers(limit);

        fastify.log.info(`Customer sync found ${portalCustomers.length} customer(s) to process (limit ${limit}).`);

        const customers = await syncCustomersFromPortal(
          fastify.prisma,
          companyId,
          portalCustomers
        );

        adminLogs.info("Customers synced from Quote Tender portal", {
          syncedCount: customers.length,
        });

        return reply.status(200).send({
          success: true,
          message: `Synced ${customers.length} customer(s) from Quote Tender portal.`,
          data: customers,
          syncedCount: customers.length,
        });
      } catch (error: any) {
        adminLogs.error("Customer sync failed", { error });

        return reply.status(502).send({
          success: false,
          message: "Failed to sync customers from Quote Tender portal.",
          error: error.message,
        });
      }
    }
  );
}

export default syncCustomerRoute;