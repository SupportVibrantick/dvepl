import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { adminLogs } from "../../../services/logger/contextLogger";
import { enrichAuditLogs } from "./enrich";

interface WriteAuditLogBody {
  module: string;
  recordId: string;
  action: string;
  oldValue?: any;
  newValue?: any;
}

async function writeAuditLogRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  // Write an audit log entry for the current operator's own action.
  fastify.post(
    "/",
    {
      schema: {
        tags: ["Audit Log"],
        summary: "Write Audit Log",
        description: "Records an audit log entry for the current operator.",
        body: {
          type: "object",
          required: ["module", "recordId", "action"],
          properties: {
            module: { type: "string" },
            recordId: { type: "string" },
            action: { type: "string" },
            oldValue: { type: ["object", "null"] },
            newValue: { type: ["object", "null"] },
          },
        },
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["auditLog.view"]),
      ],
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      try {
        const { module, recordId, action, oldValue, newValue } =
          request.body as WriteAuditLogBody;
        const log = await fastify.prisma.auditLog.create({
          data: {
            userId: (request as any).admin?.id ?? null,
            module,
            recordId,
            action,
            oldValue: oldValue ?? undefined,
            newValue: newValue ?? undefined,
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"],
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        });
        const enriched = await enrichAuditLogs([log], fastify.prisma);
        return reply.status(201).send({
          success: true,
          message: "Audit log recorded.",
          data: enriched[0],
        });
      } catch (error: any) {
        adminLogs.error("Write audit log failed", { error });
        return reply
          .status(500)
          .send({ success: false, message: "Server Error." });
      }
    }
  );
}

export default writeAuditLogRoutes;