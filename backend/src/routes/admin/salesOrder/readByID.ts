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

async function adminSalesOrderReadByIdRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["Sales Order"],
        summary: "Read Sales Order By ID",
        description: "Fetch a Sales Order by ID",
      },
    },

    async (
      request: FastifyRequest<{ Params: Params }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;

        const salesOrder = await fastify.prisma.salesOrder.findFirst({
          where: {
            id,
            deletedAt: null,
          },

          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },

            orderTakenBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },

            takenByUsers: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },

            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },

            assignments: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },

            items: true,
            salesOrderAttachments: {
              orderBy: {
                createdAt: "desc",
              },
            },
          },
        });

        if (!salesOrder) {
          return reply.status(404).send({
            success: false,
            message: "Sales Order not found.",
          });
        }

        adminLogs.info("Sales Order fetched successfully", {
          salesOrderId: salesOrder.id,
        });

        return reply.status(200).send({
          success: true,
          message: "Sales Order fetched successfully.",
          data: salesOrder,
        });
      } catch (error: any) {
        adminLogs.error("Failed to fetch Sales Order", {
          error,
        });

        return reply.status(500).send({
          success: false,
          message: "Server error while fetching Sales Order.",
          error:
            process.env.NODE_ENV === "development"
              ? error.message
              : undefined,
        });
      }
    }
  );
}

export default adminSalesOrderReadByIdRoutes;