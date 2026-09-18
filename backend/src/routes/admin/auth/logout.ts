import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";

async function adminLogoutRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.post(
    "/",
    {
      preHandler: [fastify.verifyToken],
      schema: {
        tags: ["Auth"],
        summary: "Admin Logout",
        description: "Logout authenticated user",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.admin?.id;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            message: "Unauthorized",
          });
        }

        await fastify.prisma.auditLog.create({
          data: {
            userId,
            module: "Auth",
            recordId: (request.admin as any)?.email || userId,
            action: "LOGOUT",
            newValue: { email: (request.admin as any)?.email || null },
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"],
          },
        }).catch(() => {});

        return reply.send({
          success: true,
          message: "Logged out successfully.",
        });
      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    }
  );
}

export default adminLogoutRoutes;