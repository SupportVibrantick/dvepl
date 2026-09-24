import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { fetchPortalRoles } from "../../../services/quoteTender.service";
import { syncRolesFromPortal } from "../../../services/quoteTenderRoleSync.service";
import { adminLogs } from "../../../services/logger/contextLogger";

async function syncPortalRolesRoute(
  fastify: FastifyInstance
) {
  fastify.post(
    "/",
    {
      schema: {
        tags: ["Role"],
        summary: "Sync Portal Roles",
        description:
          "Fetches role records from the Quote Tender portal (/roles.php) and creates or updates DVEPL roles so they show up in Security → Roles.",
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["role.create"]),
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
        const cap = body.all ? 0 : requested > 0 ? requested : 0;

        const portalRoles = await fetchPortalRoles(cap);

        fastify.log.info(
          `Role sync found ${portalRoles.length} record(s) to process.`
        );

        const result = await syncRolesFromPortal(
          fastify.prisma,
          companyId,
          portalRoles
        );

        adminLogs.info("Portal roles synced", {
          ...result.createdCounts,
          fetched: portalRoles.length,
        });

        return reply.status(200).send({
          success: true,
          message: `Synced ${result.createdCounts.created} role(s) from the portal (${result.createdCounts.updated} updated).`,
          data: result.syncedRoles,
          syncedCount: result.syncedRoles.length,
          created: result.createdCounts.created,
          updated: result.createdCounts.updated,
          skipped: result.createdCounts.skipped,
        });
      } catch (error: any) {
        adminLogs.error("Portal role sync failed", { error });

        return reply.status(502).send({
          success: false,
          message: "Failed to sync portal roles.",
          error: error.message,
        });
      }
    }
  );
}

export default syncPortalRolesRoute;