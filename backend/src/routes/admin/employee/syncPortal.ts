import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { fetchAllPortalStaff } from "../../../services/quoteTender.service";
import { syncStaffToUsers } from "../../../services/quoteTenderStaffSync.service";
import { adminLogs } from "../../../services/logger/contextLogger";

async function syncPortalStaffRoute(
  fastify: FastifyInstance
) {
  fastify.post(
    "/",
    {
      schema: {
        tags: ["Employee"],
        summary: "Sync Portal Staff as Users",
        description:
          "Fetches staff records from the Quote Tender portal (/staff.php) and creates or updates DVEPL users so they show up in Settings → Manage Users and on the Employees page.",
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["employee.create"]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const companyId = (request.admin as any)?.companyId;

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
            : Number(process.env.QUOTE_TENDER_STAFF_FETCH_LIMIT) || 100;

        const portalStaff = await fetchAllPortalStaff(limit);

        fastify.log.info(
          `Staff sync found ${portalStaff.length} record(s) to process (limit ${limit}).`
        );

        const result = await syncStaffToUsers(
          fastify.prisma,
          companyId,
          portalStaff
        );

        adminLogs.info("Portal staff synced as users", {
          ...result.createdUserCounts,
          fetched: portalStaff.length,
        });

        return reply.status(200).send({
          success: true,
          message: `Synced ${result.createdUserCounts.created} staff member(s) from the portal (${result.createdUserCounts.updated} updated).`,
          data: result.syncedUsers,
          syncedCount: result.syncedUsers.length,
          created: result.createdUserCounts.created,
          updated: result.createdUserCounts.updated,
          skipped: result.createdUserCounts.skipped,
        });
      } catch (error: any) {
        adminLogs.error("Portal staff sync failed", { error });

        return reply.status(502).send({
          success: false,
          message: "Failed to sync portal staff.",
          error: error.message,
        });
      }
    }
  );
}

export default syncPortalStaffRoute;