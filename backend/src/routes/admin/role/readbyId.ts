import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { adminLogs } from "../../../services/logger/contextLogger";

async function readRoleByIdRoute(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["Role"],
        summary: "Read Role By Id",
        description: "Returns role details along with assigned permissions.",
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["role.view"]),
      ],
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      try {
        //------------------------------------
        // Company From JWT
        //------------------------------------

        const companyId = (request.admin as any)?.companyId;

        if (!companyId) {
          return reply.status(401).send({
            success: false,
            message: "Company information missing from token.",
          });
        }

        const { id } = request.params as { id: string };

        //------------------------------------
        // Fetch Role
        //------------------------------------

        const role = await fastify.prisma.role.findFirst({
          where: {
            id,
            companyId,
            deletedAt: null,
          },
          include: {
            rolePermissions: {
              include: {
                permission: {
                  include: {
                    group: true,
                  },
                },
              },
            },
          },
        });

        if (!role) {
          return reply.status(404).send({
            success: false,
            message: "Role not found.",
          });
        }

        //------------------------------------
        // Response
        //------------------------------------

        return reply.status(200).send({
          success: true,
          data: {
            id: role.id,
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
            pageAccess: role.pageAccess || [],
            actionPermissions: role.actionPermissions || {},

            permissionIds: role.rolePermissions.map(
              (rp) => rp.permission.id
            ),

            permissions: role.rolePermissions.map((rp) => ({
              id: rp.permission.id,
              code: rp.permission.code,
              description: rp.permission.description,
              group: rp.permission.group?.name,
            })),
          },
        });
      } catch (error: any) {
        adminLogs.error("Read Role By Id Failed", {
          error,
        });

        return reply.status(500).send({
          success: false,
          message: "Server Error.",
          details:
            process.env.NODE_ENV === "development"
              ? error.message
              : undefined,
        });
      }
    }
  );
}

export default readRoleByIdRoute;