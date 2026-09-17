import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { adminLogs } from "../../../services/logger/contextLogger";
import { updateBranchSchema } from "../../../schemas/admin/branch/branch.schema";

interface Params {
  id: string;
}

async function updateBranchRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.patch<{ Params: Params }>(
    "/",
    {
      schema: {
        tags: ["Branch"],
        summary: "Update Branch",
        description: "Update an existing branch",
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["branch.update"]),
      ],
    },

    async (
      request: FastifyRequest<{
        Params: Params;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;

        const validationResult = updateBranchSchema.safeParse(request.body);

        if (!validationResult.success) {
          adminLogs.error("Invalid branch update data", {
            error: validationResult.error,
          });

          return reply.status(400).send({
            success: false,
            message: "Invalid branch data.",
            error: validationResult.error.issues,
          });
        }

        const {
          companyId,
          name,
          code,
          address,
          city,
          state,
          pincode,
          isActive,
        } = validationResult.data;

        const existingBranch = await fastify.prisma.branch.findFirst({
          where: {
            id,
            deletedAt: null,
          },
        });

        if (!existingBranch) {
          return reply.status(404).send({
            success: false,
            message: "Branch not found.",
          });
        }

        if (companyId) {
          const company = await fastify.prisma.company.findFirst({
            where: {
              id: companyId,
              deletedAt: null,
            },
          });

          if (!company) {
            return reply.status(404).send({
              success: false,
              message: "Company not found.",
            });
          }
        }

        if (companyId && code) {
          const duplicateBranch = await fastify.prisma.branch.findFirst({
            where: {
              companyId,
              code,
              deletedAt: null,
              NOT: {
                id,
              },
            },
          });

          if (duplicateBranch) {
            return reply.status(409).send({
              success: false,
              message: "Branch code already exists for this company.",
            });
          }
        }

        const updatedBranch = await fastify.prisma.branch.update({
          where: {
            id,
          },
          data: {
            companyId,
            name,
            code,
            address,
            city,
            state,
            pincode,
            isActive,
          },
        });

        adminLogs.info("Branch updated successfully", {
          branchId: updatedBranch.id,
        });

        return reply.status(200).send({
          success: true,
          message: "Branch updated successfully.",
          data: updatedBranch,
        });
      } catch (error: any) {
        adminLogs.error("Branch update failed", {
          error,
        });

        return reply.status(500).send({
          success: false,
          message: "Server error while updating branch.",
          details:
            process.env.NODE_ENV === "development"
              ? error.message
              : undefined,
        });
      }
    }
  );
}

export default updateBranchRoutes;