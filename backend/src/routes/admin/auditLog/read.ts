import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { adminLogs } from "../../../services/logger/contextLogger";
import { enrichAuditLogs } from "./enrich";

async function readAuditLogRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  // Read all audit logs
  fastify.get(
    "/",
    {
      schema: {
        tags: ["Audit Log"],
        summary: "Read Audit Logs",
        description: "Returns history of audit logs.",
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["auditLog.view"]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const logs = await fastify.prisma.auditLog.findMany({
          orderBy: {
            createdAt: "desc",
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        const enriched = await enrichAuditLogs(logs, fastify.prisma);

        return reply.status(200).send({
          success: true,
          message: "Audit logs fetched successfully.",
          data: enriched,
        });
      } catch (error: any) {
        adminLogs.error("Read audit logs failed", { error });
        return reply.status(500).send({
          success: false,
          message: "Server Error.",
          details:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    }
  );
}

export default readAuditLogRoutes;
