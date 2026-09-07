import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";

async function readUserAccessRoute(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
) {
  fastify.get(
    "/:id",
    {
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["user.view"]),
      ],
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      try {
        const companyId = request.admin?.companyId;

        if (!companyId) {
          return reply.status(401).send({
            success: false,
            message: "Company information missing.",
          });
        }

        const { id } = request.params as { id: string };

        const user = await fastify.prisma.user.findFirst({
          where: {
            id,
            companyId,
            deletedAt: null,
          },
          include: {
            userRoles: {
              include: { role: true },
            },
            accessProfile: true,
          },
        });

        if (!user) {
          return reply.status(404).send({
            success: false,
            message: "User not found.",
          });
        }

        const up = user.accessProfile;
        const mainRole = user.userRoles[0]?.role;
        const hasOverride = up?.hasOverride ?? false;

        const pageAccess = hasOverride
          ? (up?.pageAccess || [])
          : (mainRole?.pageAccess && (mainRole.pageAccess as any[]).length > 0
              ? mainRole.pageAccess
              : (up?.pageAccess || []));

        const actionPermissions = hasOverride
          ? (up?.actionPermissions || { create: true, edit: true, delete: false, export: true })
          : (mainRole?.actionPermissions && Object.keys(mainRole.actionPermissions).length > 0
              ? mainRole.actionPermissions
              : (up?.actionPermissions || { create: true, edit: true, delete: false, export: true }));

        return reply.send({
          success: true,
          data: {
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              phone: user.phone,
              isActive: user.isActive,
              roles: user.userRoles.map((ur) => ({
                id: ur.role.id,
                name: ur.role.name,
              })),
            },
            pageAccess,
            actionPermissions,
            hasOverride,
          },
        });
      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );
}

export default readUserAccessRoute;
