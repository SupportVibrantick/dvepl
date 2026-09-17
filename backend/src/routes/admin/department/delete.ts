import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { adminLogs } from "../../../services/logger/contextLogger";

interface Params {
  id: string;
}

async function deleteDepartmentRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.delete<{ Params: Params }>(
    "/:id",
    {
      schema: {
        tags: ["Department"],
        summary: "Delete Department",
        description: "Soft delete department",
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["department.delete"]),
      ],
    },

    async (
      request: FastifyRequest<{ Params: Params }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;

        const department = await fastify.prisma.department.findUnique({
          where: {
            id,
          },
          include: {
            employees: {
              where: {
                deletedAt: null,
              },
            },
            teams: {
              where: {
                deletedAt: null,
              },
            },
            costCenters: {
              where: {
                deletedAt: null,
              },
            },
          },
        });

        if (!department || department.deletedAt) {
          return reply.status(404).send({
            success: false,
            message: "Department not found.",
          });
        }

        // Prevent deletion if department is being used
        if (
          department.employees.length > 0 ||
          department.teams.length > 0 ||
          department.costCenters.length > 0
        ) {
          return reply.status(409).send({
            success: false,
            message:
              "Department cannot be deleted because it is linked with employees, teams or cost centers.",
          });
        }

        await fastify.prisma.department.update({
          where: {
            id,
          },
          data: {
            deletedAt: new Date(),
          },
        });

        adminLogs.info("Department deleted", {
          departmentId: id,
        });

        return reply.status(200).send({
          success: true,
          message: "Department deleted successfully.",
        });
      } catch (error: any) {
        adminLogs.error("Department deletion failed", {
          error,
        });

        return reply.status(500).send({
          success: false,
          message: "Server error while deleting department.",
          details:
            process.env.NODE_ENV === "development"
              ? error.message
              : undefined,
        });
      }
    }
  );
}

export default deleteDepartmentRoutes;