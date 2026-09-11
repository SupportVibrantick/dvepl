import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { Prisma } from "@prisma/client";

import { adminLogs } from "../../../services/logger/contextLogger";
import { salesOrderSchema } from "../../../schemas/admin/salesOrder/salesOrder.schema";

async function adminSalesOrderCreateRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
) {
  fastify.post(
    "/",
    {
      schema: {
        tags: ["Sales Order"],
        summary: "Create Sales Order",
        description: "Create new sales order",
      },
    },

    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // ==========================
        // Validate Request
        // ==========================

        const validationResult = salesOrderSchema.safeParse(request.body);

        if (!validationResult.success) {
          adminLogs.error("Invalid Sales Order data", {
            error: validationResult.error,
          });

          return reply.status(400).send({
            success: false,
            message: "Invalid Sales Order data.",
            error: validationResult.error.issues,
          });
        }

        const {
          companyId,
          customerId,
          dveplCode,
          status,
          orderTakenById,
          orderTakenByUserIds,
          partyName,
          caNo,
          contactDetails,
          orderConfirmDate,
          deliveryMonthTarget,
          poDate,
          drawingConcernedPerson,
          drawingApprovedDate,
          drawingStatus,
          drawingRemarks,
          inspectionField,
          sendNotification,
          remarks,
          items,
        } = validationResult.data;

        // ==========================
        // Duplicate DVEPL Code Check
        // ==========================

        const existingOrder = await fastify.prisma.salesOrder.findUnique({
          where: {
            dveplCode,
          },
        });

        if (existingOrder) {
          return reply.status(409).send({
            success: false,
            message: "DVEPL Code already exists.",
          });
        }

        // ==========================
        // Company Validation
        // ==========================

        const company = await fastify.prisma.company.findUnique({
          where: {
            id: companyId,
          },
        });

        if (!company) {
          return reply.status(404).send({
            success: false,
            message: "Company not found.",
          });
        }

        // ==========================
        // Order Taken By Validation
        // ==========================

        if (orderTakenById) {
          const user = await fastify.prisma.user.findUnique({
            where: {
              id: orderTakenById,
            },
            select: {
              id: true,
              name: true,
              email: true,
              companyId: true,
              isActive: true,
              deletedAt: true,
            },
          });

          if (!user || !user.isActive || user.deletedAt) {
            return reply.status(404).send({
              success: false,
              message: "Order Taken By user not found or inactive.",
            });
          }

          if (user.companyId !== companyId) {
            return reply.status(400).send({
              success: false,
              message: "Order Taken By user does not belong to this company.",
            });
          }
        }

        // ==========================
        // Multiple Order Taken By Users Validation
        // ==========================

        const takenByUserIds = Array.from(
          new Set(
            [
              ...(orderTakenById ? [orderTakenById] : []),
              ...(Array.isArray(orderTakenByUserIds)
                ? orderTakenByUserIds
                : []),
            ].filter(Boolean),
          ),
        );

        if (takenByUserIds.length > 0) {
          const users = await fastify.prisma.user.findMany({
            where: {
              id: { in: takenByUserIds },
            },
            select: {
              id: true,
              name: true,
              email: true,
              companyId: true,
              isActive: true,
              deletedAt: true,
            },
          });

          const validIds = new Set(users.map((u) => u.id));
          for (const uid of takenByUserIds) {
            const user = users.find((u) => u.id === uid);
            if (!user || !validIds.has(uid) || !user.isActive || user.deletedAt) {
              return reply.status(404).send({
                success: false,
                message: "Order Taken By user not found or inactive.",
              });
            }
            if (user.companyId !== companyId) {
              return reply.status(400).send({
                success: false,
                message: "Order Taken By user does not belong to this company.",
              });
            }
          }
        }

        // ==========================
        // Calculate Totals
        // ==========================

        let subtotal = 0;
        let gstTotal = 0;
        let grandTotal = 0;

        for (const item of items) {
          const itemAmount =
            Number(item.quantity) * Number(item.rate);

          const itemGST =
            (itemAmount * Number(item.gstPercentage)) / 100;

          subtotal += itemAmount;
          gstTotal += itemGST;
        }

        grandTotal = subtotal + gstTotal;

        // ==========================
        // Transaction
        // ==========================

        const result = await fastify.prisma.$transaction(async (tx) => {
          // ==========================
          // Create Sales Order
          // ==========================

          const salesOrder = await tx.salesOrder.create({
            data: {
              companyId,
              customerId: customerId ?? null,
              dveplCode,
              status,

              orderTakenById: orderTakenById ?? null,

              partyName,
              caNo: caNo ?? null,
              contactDetails: contactDetails ?? null,

              orderConfirmDate: orderConfirmDate
                ? new Date(orderConfirmDate)
                : null,

              deliveryMonthTarget:
                deliveryMonthTarget ?? null,

              poDate: poDate
                ? new Date(poDate)
                : null,

              drawingConcernedPerson:
                drawingConcernedPerson ?? null,

              drawingApprovedDate: drawingApprovedDate
                ? new Date(drawingApprovedDate)
                : null,

              drawingStatus:
                drawingStatus === "APPROVED"
                  ? "COMPLETED"
                  : drawingStatus === "REJECTED"
                    ? "ON_HOLD"
                    : (drawingStatus as any),

              drawingRemarks:
                drawingRemarks ?? null,

              subtotal: new Prisma.Decimal(subtotal),

              gstTotal: new Prisma.Decimal(gstTotal),

              grandTotal: new Prisma.Decimal(grandTotal),

              inspectionField:
                inspectionField ?? null,

              sendNotification,

              remarks:
                remarks ?? null,

              createdById: request.user.id,
            },
          });

          // ==========================
          // Create Line Items
          // ==========================

          if (items.length > 0) {
            await tx.salesOrderItem.createMany({
              data: items.map((item) => {
                const itemAmount =
                  Number(item.quantity) * Number(item.rate);

                return {
                  salesOrderId: salesOrder.id,

                  itemCode: item.itemCode,

                  description: item.description,

                  unit: item.unit,

                  quantity:
                    new Prisma.Decimal(item.quantity),

                  unitPrice:
                    new Prisma.Decimal(item.rate),

                  gstPercentage:
                    new Prisma.Decimal(item.gstPercentage),

                  totalPrice:
                    new Prisma.Decimal(itemAmount),

                  remarks:
                    item.remarks ?? null,
                };
              }),
            });
          }

          // ==========================
          // Create Multiple Order Taken By Users
          // ==========================

          if (takenByUserIds.length > 0) {
            await tx.salesOrderTakenBy.createMany({
              data: takenByUserIds.map((userId) => ({
                salesOrderId: salesOrder.id,
                userId,
              })),
            });
          }

          // ==========================
          // Save EAV Custom Fields
          // ==========================

          if ((request.body as any)?.customFields) {
            const { CustomFieldService } =
              await import(
                "../../../services/customFieldService"
              );

            const cfService =
              new CustomFieldService(tx as any);

            await cfService.saveValues(
              "order",
              salesOrder.id,
              (request.body as any).customFields,
            );
          }

          return salesOrder;
        });

        // ==========================
        // Fetch Created Order
        // ==========================

        const createdOrder =
          await fastify.prisma.salesOrder.findUnique({
            where: {
              id: result.id,
            },

            include: {
              company: true,

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

              items: true,

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
            },
          });

        adminLogs.info(
          "Sales Order created successfully",
          {
            salesOrderId: result.id,
            dveplCode: result.dveplCode,
            createdBy: request.user.id,
          },
        );

        // ==========================
        // Notification
        // ==========================

        if (sendNotification) {
          adminLogs.info(
            "Sales Order notification flag enabled.",
            {
              salesOrderId: result.id,
            },
          );

          // Assignment notifications will be
          // implemented in the assignment endpoint.
        }

        return reply.status(201).send({
          success: true,
          message: "Sales Order created successfully.",
          data: createdOrder,
        });
      } catch (error: any) {
        console.error(error);

        adminLogs.error(
          "Sales Order creation failed",
          {
            error,
          },
        );

        return reply.status(500).send({
          success: false,
          message:
            "Server error while creating Sales Order.",
          error:
            process.env.NODE_ENV === "development"
              ? error.message
              : undefined,
        });
      }
    },
  );
}

export default adminSalesOrderCreateRoutes;