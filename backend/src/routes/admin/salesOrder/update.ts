import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { Prisma } from "@prisma/client";

import { adminLogs } from "../../../services/logger/contextLogger";
import { salesOrderSchema } from "../../../schemas/admin/salesOrder/salesOrder.schema";

interface Params {
  id: string;
}

async function adminSalesOrderUpdateRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
) {
  fastify.patch(
    "/:id",
    {
      schema: {
        tags: ["Sales Order"],
        summary: "Update Sales Order",
        description: "Update existing sales order",
      },
    },

    async (
      request: FastifyRequest<{ Params: Params }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;

      try {
        // ==========================
        // Validate Request
        // ==========================

        const validationResult =
          salesOrderSchema.partial().safeParse(request.body);

        if (!validationResult.success) {
          adminLogs.error("Invalid Sales Order update data", {
            error: validationResult.error,
          });

          return reply.status(400).send({
            success: false,
            message: "Invalid Sales Order data.",
            error:
              process.env.NODE_ENV === "development"
                ? validationResult.error.issues
                : "Validation failed",
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
        // Check Existing Order
        // ==========================

        const existingOrder =
          await fastify.prisma.salesOrder.findFirst({
            where: {
              id,
              deletedAt: null,
            },
          });

        if (!existingOrder) {
          return reply.status(404).send({
            success: false,
            message: "Sales Order not found.",
          });
        }

        // ==========================
        // Company Validation
        // ==========================

        if (companyId) {
          const company =
            await fastify.prisma.company.findUnique({
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
        }

        // ==========================
        // Order Taken By Validation
        // ==========================

        if (orderTakenById) {
          const user =
            await fastify.prisma.user.findUnique({
              where: {
                id: orderTakenById,
              },
              select: {
                id: true,
                companyId: true,
                isActive: true,
                deletedAt: true,
              },
            });

          if (
            !user ||
            !user.isActive ||
            user.deletedAt
          ) {
            return reply.status(404).send({
              success: false,
              message:
                "Order Taken By user not found or inactive.",
            });
          }

          const targetCompanyId =
            companyId ?? existingOrder.companyId;

          if (user.companyId !== targetCompanyId) {
            return reply.status(400).send({
              success: false,
              message:
                "Order Taken By user does not belong to this company.",
            });
          }
        }

        // ==========================
        // Multiple Order Taken By Users Validation
        // ==========================

        const takenByUserIds =
          orderTakenByUserIds !== undefined
            ? Array.from(
                new Set(
                  [
                    ...(orderTakenById ? [orderTakenById] : []),
                    ...(Array.isArray(orderTakenByUserIds)
                      ? orderTakenByUserIds
                      : []),
                  ].filter(Boolean),
                ),
              )
            : null;

        if (takenByUserIds !== null && takenByUserIds.length > 0) {
          const targetCompanyId =
            companyId ?? existingOrder.companyId;

          const users =
            await fastify.prisma.user.findMany({
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

          const validIds = new Set(
            users.map((u) => u.id),
          );

          for (const uid of takenByUserIds) {
            const user = users.find(
              (u) => u.id === uid,
            );
            if (
              !user ||
              !validIds.has(uid) ||
              !user.isActive ||
              user.deletedAt
            ) {
              return reply.status(404).send({
                success: false,
                message:
                  "Order Taken By user not found or inactive.",
              });
            }
            if (user.companyId !== targetCompanyId) {
              return reply.status(400).send({
                success: false,
                message:
                  "Order Taken By user does not belong to this company.",
              });
            }
          }
        }

        // ==========================
        // Calculate Totals
        // ==========================

        let subtotal: number | undefined;
        let gstTotal: number | undefined;
        let grandTotal: number | undefined;

        if (items !== undefined) {
          subtotal = 0;
          gstTotal = 0;

          for (const item of items) {
            const itemAmount =
              Number(item.quantity) *
              Number(item.rate);

            const itemGST =
              (itemAmount *
                Number(item.gstPercentage)) /
              100;

            subtotal += itemAmount;
            gstTotal += itemGST;
          }

          grandTotal = subtotal + gstTotal;
        }

        // ==========================
        // Update Transaction
        // ==========================

        const updatedOrderId =
          await fastify.prisma.$transaction(
            async (tx) => {
              // ==========================
              // Build Update Data
              // ==========================

              const updateData: Prisma.SalesOrderUpdateInput =
                {};

              if (companyId !== undefined) {
                updateData.company = {
                  connect: {
                    id: companyId,
                  },
                };
              }

              if (customerId !== undefined) {
                updateData.customer = customerId
                  ? { connect: { id: customerId } }
                  : { disconnect: true };
              }

              if (dveplCode !== undefined) {
                updateData.dveplCode = dveplCode;
              }

              if (status !== undefined) {
                updateData.status = status;
              }

              if (orderTakenById !== undefined) {
                updateData.orderTakenBy = orderTakenById
                  ? {
                      connect: {
                        id: orderTakenById,
                      },
                    }
                  : {
                      disconnect: true,
                    };
              }

              if (partyName !== undefined) {
                updateData.partyName = partyName;
              }

              if (caNo !== undefined) {
                updateData.caNo = caNo;
              }

              if (contactDetails !== undefined) {
                updateData.contactDetails =
                  contactDetails;
              }

              if (orderConfirmDate !== undefined) {
                updateData.orderConfirmDate =
                  orderConfirmDate
                    ? new Date(orderConfirmDate)
                    : null;
              }

              if (
                deliveryMonthTarget !== undefined
              ) {
                updateData.deliveryMonthTarget =
                  deliveryMonthTarget;
              }

              if (poDate !== undefined) {
                updateData.poDate = poDate
                  ? new Date(poDate)
                  : null;
              }

              if (
                drawingConcernedPerson !== undefined
              ) {
                updateData.drawingConcernedPerson =
                  drawingConcernedPerson;
              }

              if (
                drawingApprovedDate !== undefined
              ) {
                updateData.drawingApprovedDate =
                  drawingApprovedDate
                    ? new Date(drawingApprovedDate)
                    : null;
              }

              if (drawingStatus !== undefined) {
                updateData.drawingStatus =
                  drawingStatus === "APPROVED"
                    ? "COMPLETED"
                    : drawingStatus === "REJECTED"
                      ? "ON_HOLD"
                      : drawingStatus;
              }

              if (drawingRemarks !== undefined) {
                updateData.drawingRemarks =
                  drawingRemarks;
              }

              if (subtotal !== undefined) {
                updateData.subtotal =
                  new Prisma.Decimal(subtotal);
              }

              if (gstTotal !== undefined) {
                updateData.gstTotal =
                  new Prisma.Decimal(gstTotal);
              }

              if (grandTotal !== undefined) {
                updateData.grandTotal =
                  new Prisma.Decimal(grandTotal);
              }

              if (inspectionField !== undefined) {
                updateData.inspectionField =
                  inspectionField;
              }

              if (
                sendNotification !== undefined
              ) {
                updateData.sendNotification =
                  sendNotification;
              }

              if (remarks !== undefined) {
                updateData.remarks = remarks;
              }

              // ==========================
              // Update Sales Order
              // ==========================

              const updatedOrder =
                await tx.salesOrder.update({
                  where: {
                    id,
                  },
                  data: updateData,
                });

              // ==========================
              // Replace Items
              // ==========================

              if (items !== undefined) {
                await tx.salesOrderItem.deleteMany({
                  where: {
                    salesOrderId: id,
                  },
                });

                if (items.length > 0) {
                  await tx.salesOrderItem.createMany({
                    data: items.map((item) => {
                      const itemAmount =
                        Number(item.quantity) *
                        Number(item.rate);

                      return {
                        salesOrderId:
                          updatedOrder.id,

                        itemCode:
                          item.itemCode,

                        description:
                          item.description,

                        unit:
                          item.unit,

                        quantity:
                          new Prisma.Decimal(
                            item.quantity,
                          ),

                        unitPrice:
                          new Prisma.Decimal(
                            item.rate,
                          ),

                        gstPercentage:
                          new Prisma.Decimal(
                            item.gstPercentage,
                          ),

                        totalPrice:
                          new Prisma.Decimal(
                            itemAmount,
                          ),

                        remarks:
                          item.remarks ?? null,
                      };
                    }),
                  });
                }
              }

              // ==========================
              // Replace Multiple Order Taken By Users
              // ==========================

              if (takenByUserIds !== null) {
                await tx.salesOrderTakenBy.deleteMany({
                  where: {
                    salesOrderId: id,
                  },
                });

                if (takenByUserIds.length > 0) {
                  await tx.salesOrderTakenBy.createMany({
                    data: takenByUserIds.map(
                      (userId) => ({
                        salesOrderId: id,
                        userId,
                      }),
                    ),
                  });
                }
              }

              // ==========================
              // Save EAV Custom Fields
              // ==========================

              if (
                (request.body as any)
                  ?.customFields
              ) {
                const {
                  CustomFieldService,
                } = await import(
                  "../../../services/customFieldService"
                );

                const cfService =
                  new CustomFieldService(tx as any);

                await cfService.saveValues(
                  "order",
                  id,
                  (request.body as any)
                    .customFields,
                );
              }

              return updatedOrder.id;
            },
          );

        // ==========================
        // Fetch Updated Order
        // ==========================

        const updatedOrder =
          await fastify.prisma.salesOrder.findUnique({
            where: {
              id: updatedOrderId,
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

              // Assignment data is READ ONLY here.
              // Assignment mutations happen through
              // the dedicated assignment endpoint.
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
          "Sales Order updated successfully",
          {
            salesOrderId: updatedOrderId,
            updatedBy: request.user.id,
          },
        );

        return reply.status(200).send({
          success: true,
          message:
            "Sales Order updated successfully.",
          data: updatedOrder,
        });
      } catch (error: any) {
        console.error(error);

        adminLogs.error(
          "Sales Order update failed",
          {
            salesOrderId: id,
            error,
          },
        );

        return reply.status(500).send({
          success: false,
          message:
            "Server error while updating Sales Order.",
          error:
            process.env.NODE_ENV === "development"
              ? error.message
              : undefined,
        });
      }
    },
  );
}

export default adminSalesOrderUpdateRoutes;