import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { adminLogs } from "../../../services/logger/contextLogger";

interface Query {
  page?: string;
  limit?: string;
  search?: string;
  status?: string;
}

async function adminSalesOrderReadRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.get(
    "/",
    {
      schema: {
        tags: ["Sales Order"],
        summary: "Get Sales Orders",
        description: "Fetch all sales orders",
      },
    },

    async (
      request: FastifyRequest<{ Querystring: Query }>,
      reply: FastifyReply
    ) => {
      try {
        const {
          page = "1",
          limit = "10",
          search,
          status,
        } = request.query;

        const pageNumber = Number(page);
        const pageSize = Number(limit);

        const where: any = {
          deletedAt: null,
        };

        // Search
        if (search) {
          where.OR = [
            {
              dveplCode: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              partyName: {
                contains: search,
                mode: "insensitive",
              },
            },
          ];
        }

        // Status Filter
        if (status) {
          where.status = status;
        }

        const total = await fastify.prisma.salesOrder.count({
          where,
        });

        const salesOrders =
          await fastify.prisma.salesOrder.findMany({
            where,

            skip: (pageNumber - 1) * pageSize,

            take: pageSize,

            orderBy: {
              createdAt: "desc",
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
              engineeringProjects: {
                include: {
                  drawings: {
                    select: {
                      id: true,
                      drawingNo: true,
                      title: true,
                      fileName: true,
                      fileUrl: true,
                    },
                  },
                },
              },
              salesOrderAttachments: {
                orderBy: {
                  createdAt: "desc",
                },
              },
            },
          });

        // ==========================
        // Attach Custom Field Values
        // ==========================
        const { CustomFieldService } = await import("../../../services/customFieldService");
        const cfService = new CustomFieldService(fastify.prisma);
        const entityIds = salesOrders.map(o => o.id);
        const cfValuesMap = await cfService.getValuesForEntities("order", entityIds);

        const salesOrdersWithCF = salesOrders.map(o => ({
          ...o,
          customFields: cfValuesMap[o.id] || {}
        }));

        adminLogs.info("Sales Orders fetched successfully");

        return reply.send({
          success: true,
          message: "Sales Orders fetched successfully.",
          data: salesOrdersWithCF,
          pagination: {
            page: pageNumber,
            limit: pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        });
      } catch (error: any) {
        adminLogs.error("Failed to fetch Sales Orders", {
          error,
        });

        return reply.status(500).send({
          success: false,
          message: "Server error while fetching Sales Orders.",
          error:
            process.env.NODE_ENV === "development"
              ? error.message
              : undefined,
        });
      }
    }
  );
}

export default adminSalesOrderReadRoutes;