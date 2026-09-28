import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { z } from "zod";

import NotificationService  from "../../../services/notification/notification.service"
import { nextEmployeeCode } from "../../../utils/employeeCode"

const stageAssignmentSchema = z.object({
  stage: z.string().nullable().optional(),
  remarks: z.string().max(1000).nullable().optional(),
  userIds: z
    .array(z.string().uuid())
    .min(1, "At least one user must be assigned."),
});

// An empty `assignments` array is valid and clears every stage assignment for
// the order; a body carrying neither key is still rejected below.
const assignSalesOrderSchema = z.object({
  assignments: z.array(stageAssignmentSchema),
});

// Backward compatible: { userIds: [...] } treated as a whole-order (all stages) assignment.
const legacyAssignSalesOrderSchema = z.object({
  userIds: z
    .array(z.string().uuid())
    .min(1, "At least one user must be assigned.")
    .refine(
      (userIds) => new Set(userIds).size === userIds.length,
      "Duplicate user IDs are not allowed.",
    ),
});

interface Params {
  id: string;
}

export default async function assignSalesOrderRoute(
  fastify: FastifyInstance,
) {
  fastify.put(
    "/:id",
    {
      schema: {
        tags: ["Sales Order"],
        summary: "Assign Sales Order",
        description:
          "Assign a sales order to one or more users, optionally per workflow stage. " +
          "A null stage means the whole order (all stages).",
      },
    },
    async (
      request: FastifyRequest<{
        Params: Params;
        Body: {
          assignments?: Array<{
            stage?: string | null;
            remarks?: string | null;
            userIds: string[];
          }>;
          userIds?: string[];
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params;

        // ==========================================
        // Validate Request Body
        // ==========================================

        let assignments: Array<{
          stage?: string | null;
          remarks?: string | null;
          userIds: string[];
        }>;

        const modernResult = assignSalesOrderSchema.safeParse(request.body);
        const legacyResult = legacyAssignSalesOrderSchema.safeParse(request.body);

        if (modernResult.success) {
          assignments = modernResult.data.assignments;
        } else if (legacyResult.success) {
          assignments = [{ stage: null, userIds: legacyResult.data.userIds }];
        } else {
          return reply.status(400).send({
            success: false,
            message: "Invalid assignment data.",
            error: modernResult.error.issues,
          });
        }

        // Collapse repeated stage entries into one row per stage, unioning the
        // users. Two entries for the same stage would otherwise create two
        // assignment rows and two tasks for the same stage.
        const assignmentsByStage = new Map<
          string,
          { stage?: string | null; remarks?: string | null; userIds: string[] }
        >();
        for (const entry of assignments) {
          const key = entry.stage ?? "";
          const existing = assignmentsByStage.get(key);
          if (existing) {
            existing.userIds = Array.from(
              new Set([...existing.userIds, ...entry.userIds]),
            );
            if (!existing.remarks && entry.remarks) {
              existing.remarks = entry.remarks;
            }
          } else {
            assignmentsByStage.set(key, { ...entry });
          }
        }
        assignments = Array.from(assignmentsByStage.values());

        // ==========================================
        // Check Sales Order
        // ==========================================

        // ==========================
        // Fetch Order Details with Target Dates
        // ==========================

        const salesOrder = await fastify.prisma.salesOrder.findFirst({
          where: {
            id,
            deletedAt: null,
          },
          select: {
            id: true,
            dveplCode: true,
            companyId: true,
            partyName: true,
            workflowStage: true,
            deliveryMonthTarget: true,
            dueDate: true,
            poDate: true,
          },
        });

        if (!salesOrder) {
          return reply.status(404).send({
            success: false,
            message: "Sales Order not found.",
          });
        }

        // ==========================
        // Validate Stages Against Active Template & Standard Stages
        // ==========================

        const activeTemplate = await fastify.prisma.workflowTemplate.findFirst({
          where: { isActive: true },
          include: { steps: { where: { isActive: true } } },
        });

        const STANDARD_STAGE_KEYS = [
          "ORDER_CONFIRMED",
          "ACCOUNTS_COSTING",
          "PO_READY",
          "DRAWING_ASSIGNED",
          "DRAWING_SENT",
          "REVISION_REQUIRED",
          "DRAWING_APPROVED",
          "PO_PLACED",
          "INVENTORY_FOLLOW_UP",
          "PRODUCTION_FOLLOW_UP",
          "UPLOAD_CUSTOMER_ORDER_DETAILS",
          "UPLOAD_PO_VENDOR",
          "UPLOAD_DRAWINGS",
          "UPLOAD_APPROVED_DRAWINGS",
          "TEST_STAGE",
        ];

        const stepByKey = new Map<string, any>(
          (activeTemplate?.steps ?? []).map((step: any) => [step.key, step]),
        );

        const validStageKeys = new Set([
          ...STANDARD_STAGE_KEYS,
          ...(activeTemplate?.steps ?? []).map((step: any) => step.key),
        ]);

        // A null/empty stage is the whole-order assignment and stays valid.
        // Anything else must be a stage the active template (or the historical
        // standard set) actually defines, otherwise the assignment would be
        // invisible in the UI and would spawn a task for a stage nobody sees.
        const invalidStageKeys = Array.from(
          new Set(
            assignments
              .map((a) => a.stage)
              .filter((stage): stage is string => Boolean(stage))
              .filter((stage) => !validStageKeys.has(stage)),
          ),
        );

        if (invalidStageKeys.length > 0) {
          return reply.status(400).send({
            success: false,
            message:
              "One or more stages are not part of the active workflow template.",
            invalidStageKeys,
          });
        }

        // ==========================
        // Validate Users (deduped across all stages)
        // ==========================

        const uniqueUserIds = Array.from(
          new Set(assignments.flatMap((a) => a.userIds)),
        );

        // An empty assignments array clears every stage assignment and is a
        // legitimate request; a request that names stages but no users is not.
        const isClearingAll = assignments.length === 0;

        if (uniqueUserIds.length === 0 && !isClearingAll) {
          return reply.status(400).send({
            success: false,
            message: "At least one user must be assigned.",
          });
        }

        const users = await fastify.prisma.user.findMany({
          where: {
            id: {
              in: uniqueUserIds,
            },
            companyId: salesOrder.companyId,
            isActive: true,
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        });

        if (users.length !== uniqueUserIds.length) {
          const foundUserIds = new Set(users.map((user) => user.id));

          const invalidUserIds = uniqueUserIds.filter(
            (userId) => !foundUserIds.has(userId),
          );

          return reply.status(404).send({
            success: false,
            message:
              "One or more users were not found, inactive, deleted, or do not belong to this company.",
            invalidUserIds,
          });
        }

        // ==========================
        // Replace Existing Assignments & Create Tasks
        // ==========================

        const userById = new Map(users.map((u) => [u.id, u]));

        const { newAssignments, createdTasks } = await fastify.prisma.$transaction(
          async (tx) => {
            // 1. Delete previous sales order assignments
            await tx.salesOrderAssignment.deleteMany({
              where: {
                salesOrderId: salesOrder.id,
              },
            });

            // 2. Create new sales order assignments
            await tx.salesOrderAssignment.createMany({
              data: assignments.flatMap((a) =>
                a.userIds.map((userId) => ({
                  salesOrderId: salesOrder.id,
                  userId,
                  stage: a.stage ?? null,
                  remarks: a.remarks?.trim() ? a.remarks.trim() : null,
                })),
              ),
            });

            // 3. Ensure employee records exist for all assigned users
            const userEmployeeMap = new Map<string, string>();
            const reservedCodes = new Set<string>();
            for (const user of users) {
              let employee = await tx.employee.findFirst({
                where: {
                  userId: user.id,
                  deletedAt: null,
                },
                select: { id: true },
              });

              if (!employee) {
                const nameParts = (user.name || "Team Member").trim().split(" ");
                const firstName = nameParts[0] || "Team";
                const lastName = nameParts.slice(1).join(" ") || "";
                // Employee.employeeCode is globally unique, so it cannot be
                // derived from the user id or a timestamp.
                const finalCode = await nextEmployeeCode(tx, reservedCodes);

                employee = await tx.employee.create({
                  data: {
                    userId: user.id,
                    companyId: salesOrder.companyId,
                    employeeCode: finalCode,
                    firstName,
                    lastName,
                    status: "ACTIVE",
                  },
                  select: { id: true },
                });
              }

              if (employee) {
                userEmployeeMap.set(user.id, employee.id);
              }
            }

            // 4. Calculate task due date
            const rawDueDate = salesOrder.deliveryMonthTarget
              ? new Date(salesOrder.deliveryMonthTarget)
              : salesOrder.dueDate
                ? new Date(salesOrder.dueDate)
                : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            const taskDueDate = isNaN(rawDueDate.getTime())
              ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              : rawDueDate;

            // 5. Create Portal Tasks for each assigned stage
            const tasksCreated: any[] = [];
            for (const a of assignments) {
              const stepObj = a.stage ? stepByKey.get(a.stage) : null;
              const stageName =
                stepObj?.name ||
                (a.stage ? a.stage.replace(/_/g, " ") : "Overall Order Management");

              const taskTitle = `[Order ${salesOrder.dveplCode}] ${stageName}`;
              const taskDescription = [
                `You have been assigned responsibility for stage "${stageName}" on Order ${salesOrder.dveplCode} (${salesOrder.partyName || "Customer Order"}).`,
                salesOrder.deliveryMonthTarget
                  ? `Target Commitment: ${salesOrder.deliveryMonthTarget}`
                  : null,
                a.remarks?.trim()
                  ? `Instructions: ${a.remarks.trim()}`
                  : "Please log into the portal to review order details and take the necessary action.",
              ]
                .filter(Boolean)
                .join("\n\n");

              // Tasks are linked to an order by their title (the Task model has
              // no salesOrderId), so an open task for the same order + stage is
              // reused instead of piling up a fresh copy on every re-save. A
              // task someone already completed is left alone as history.
              const existingTask = await tx.task.findFirst({
                where: {
                  title: taskTitle,
                  status: "pending",
                  deletedAt: null,
                },
                orderBy: { createdAt: "desc" },
              });

              const task = existingTask
                ? await tx.task.update({
                    where: { id: existingTask.id },
                    data: {
                      description: taskDescription,
                      dueDate: taskDueDate,
                    },
                  })
                : await tx.task.create({
                    data: {
                      title: taskTitle,
                      description: taskDescription,
                      priority: "high",
                      dueDate: taskDueDate,
                      status: "pending",
                      notifEnabled: true,
                      notifType: "automatic",
                      notifDays: 1,
                      notifUnit: "days",
                      notifFrequency: "once",
                    },
                  });

              // Assign task to corresponding employees
              const employeeIds = a.userIds
                .map((uId) => userEmployeeMap.get(uId))
                .filter((eId): eId is string => Boolean(eId));

              if (employeeIds.length > 0) {
                await tx.taskAssignment.deleteMany({
                  where: { taskId: task.id },
                });
                await tx.taskAssignment.createMany({
                  data: employeeIds.map((employeeId) => ({
                    taskId: task.id,
                    employeeId,
                  })),
                });
              }

              tasksCreated.push({
                taskId: task.id,
                stage: a.stage,
                stageName,
                assignedUserIds: a.userIds,
                reusedTask: Boolean(existingTask),
              });
            }

            const freshAssignments = await tx.salesOrderAssignment.findMany({
              where: {
                salesOrderId: salesOrder.id,
              },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
              orderBy: {
                createdAt: "asc",
              },
            });

            return {
              newAssignments: freshAssignments,
              createdTasks: tasksCreated,
            };
          },
          { timeout: 25000 },
        );

        // ==========================
        // Send Assignment Emails
        // ==========================

        const formattedDueDate = salesOrder.deliveryMonthTarget
          ? new Date(salesOrder.deliveryMonthTarget).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : salesOrder.dueDate
            ? new Date(salesOrder.dueDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : null;

        const emailResults = await Promise.allSettled(
          users.map(async (user) => {
            const userTasks = createdTasks.filter((t) => t.assignedUserIds.includes(user.id));
            if (!user.email) {
              for (const ut of userTasks) {
                try {
                  await fastify.prisma.notificationLog.create({
                    data: {
                      eventCode: "TASK_ASSIGNED",
                      channel: "EMAIL",
                      recipient: user.name || user.id,
                      subject: `[${salesOrder.dveplCode}] ${ut.stageName}`,
                      message: `No email address registered for user.`,
                      status: "FAILED",
                      error: "Recipient email is missing.",
                      relatedModule: "TASK",
                      relatedRecordId: ut.taskId,
                    },
                  });
                } catch {}
              }
              throw new Error(
                `User ${user.name || user.id} does not have an email address.`,
              );
            }

            // Find all stages assigned to this user
            const userAssignments = assignments.filter((a) =>
              a.userIds.includes(user.id),
            );
            const userStageNames = userAssignments
              .map((a) => {
                const s = a.stage ? stepByKey.get(a.stage) : null;
                return (
                  s?.name ||
                  (a.stage ? a.stage.replace(/_/g, " ") : "Overall Order")
                );
              })
              .filter(Boolean);

            const userRemarks = userAssignments
              .map((a) => a.remarks?.trim())
              .filter(Boolean)
              .join("; ");

            const stageLabel =
              userStageNames.length > 0
                ? userStageNames.join(", ")
                : "Order Responsibility";

            try {
              await NotificationService.sendSalesOrderAssignmentNotification(
                {
                  to: user.email,
                  userName: user.name || "Team Member",
                  dveplCode: salesOrder.dveplCode,
                  partyName: salesOrder.partyName,
                  stageName: stageLabel,
                  remarks: userRemarks || undefined,
                  dueDate: formattedDueDate || undefined,
                  orderId: salesOrder.id,
                },
                salesOrder.companyId,
              );

              // Log success for each task
              for (const ut of userTasks) {
                try {
                  await fastify.prisma.notificationLog.create({
                    data: {
                      eventCode: "TASK_ASSIGNED",
                      channel: "EMAIL",
                      recipient: user.email,
                      subject: `Job Responsibility Assigned: [${salesOrder.dveplCode}] ${ut.stageName}`,
                      message: `Assignment email sent to ${user.email} for order ${salesOrder.dveplCode} (${ut.stageName}).`,
                      status: "SENT",
                      relatedModule: "TASK",
                      relatedRecordId: ut.taskId,
                      sentAt: new Date(),
                    },
                  });
                } catch {}
              }
            } catch (sendErr: any) {
              // Log failure for each task
              for (const ut of userTasks) {
                try {
                  await fastify.prisma.notificationLog.create({
                    data: {
                      eventCode: "TASK_ASSIGNED",
                      channel: "EMAIL",
                      recipient: user.email,
                      subject: `Job Responsibility Assigned: [${salesOrder.dveplCode}] ${ut.stageName}`,
                      message: `Failed to send email to ${user.email}.`,
                      status: "FAILED",
                      error: sendErr?.message || String(sendErr),
                      relatedModule: "TASK",
                      relatedRecordId: ut.taskId,
                    },
                  });
                } catch {}
              }
              throw sendErr;
            }
          }),
        );

        // ==========================
        // Log Email Results
        // ==========================

        const failedEmails = emailResults.filter(
          (result) => result.status === "rejected",
        );

        if (failedEmails.length > 0) {
          failedEmails.forEach((result) => {
            if (result.status === "rejected") {
              request.log.error(
                result.reason,
                "Failed to send Sales Order assignment email",
              );
            }
          });
        }

        // ==========================================
        // Response
        // ==========================================

        return reply.status(200).send({
          success: true,
          message: isClearingAll
            ? "All stage assignments cleared for this order."
            : failedEmails.length === 0
              ? "Sales Order assigned successfully and notification emails sent."
              : "Sales Order assigned successfully, but one or more notification emails failed.",
          data: {
            salesOrderId: salesOrder.id,
            dveplCode: salesOrder.dveplCode,
            assignments: newAssignments,
            tasks: createdTasks,
            notifications: {
              total: uniqueUserIds.length,
              sent: uniqueUserIds.length - failedEmails.length,
              failed: failedEmails.length,
            },
          },
        });
      } catch (error) {
        request.log.error(
          error,
          "Failed to assign Sales Order",
        );

        return reply.status(500).send({
          success: false,
          message: "Failed to assign Sales Order.",
        });
      }
    },
  );
}