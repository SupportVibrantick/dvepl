import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { adminLogs } from "../../../services/logger/contextLogger";
import { taskNotificationSchema } from "../../../schemas/admin/task/task.schema";
import NotificationService from "../../../services/notification/notification.service";
import { canManageTask, isAdminUser, getEmployeeForUser } from "./access";

async function adminTaskNotificationRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
) {
  // Update task notification settings
  fastify.patch(
    "/settings/:id",
    {
      schema: {
        tags: ["Task"],
        summary: "Update Notification Settings",
        description: "Configure alerts rules for a specific task",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const validationResult = taskNotificationSchema.partial().safeParse(request.body);

        if (!validationResult.success) {
          return reply.status(400).send({
            success: false,
            message: "Invalid notification configuration payload.",
            error: validationResult.error.issues,
          });
        }

        const existingTask = await fastify.prisma.task.findFirst({
          where: { id, deletedAt: null },
        });

        if (!existingTask) {
          return reply.status(404).send({
            success: false,
            message: "Task not found or deleted.",
          });
        }

        const hasAccess = await canManageTask(fastify, id, request);
        if (!hasAccess) {
          return reply.status(403).send({
            success: false,
            message: "Access denied: you are not assigned to this task.",
          });
        }

        const {
          notifEnabled,
          notifType,
          notifDays,
          notifUnit,
          notifFrequency,
        } = validationResult.data;

        await fastify.prisma.task.update({
          where: { id },
          data: {
            notifEnabled: notifEnabled !== undefined ? notifEnabled : undefined,
            notifType: notifType !== undefined ? notifType : undefined,
            notifDays: notifDays !== undefined ? notifDays : undefined,
            notifUnit: notifUnit !== undefined ? notifUnit : undefined,
            notifFrequency: notifFrequency !== undefined ? notifFrequency : undefined,
          },
        });

        adminLogs.info("Task notification settings updated", { taskId: id });

        return reply.status(200).send({
          success: true,
          message: "Notification settings saved successfully.",
        });
      } catch (error: any) {
        console.error(error);
        adminLogs.error("Failed to save task notification settings", { error });

        return reply.status(500).send({
          success: false,
          message: "Server error while saving notification settings.",
          error: process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );

  // Send manual triggers
  fastify.post(
    "/send-reminders",
    {
      schema: {
        tags: ["Task"],
        summary: "Dispatch Reminders",
        description: "Manually trigger pending alerts notifications run",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const today = new Date();
        const isManager = isAdminUser(request.admin);

        let assignmentFilter: any = {};
        if (!isManager) {
          const employee = await getEmployeeForUser(fastify, (request.admin as any)?.id);
          if (!employee) {
            return reply.status(200).send({
              success: true,
              message: "Reminders run completed. Dispatched 0 alert(s) for 0 task(s).",
            });
          }
          assignmentFilter = {
            assignments: {
              some: {
                employeeId: employee.id,
              },
            },
          };
        }

        const overdueTasks = await fastify.prisma.task.findMany({
          where: {
            deletedAt: null,
            status: { not: "completed" },
            dueDate: { lt: today },
            notifEnabled: true,
            ...assignmentFilter,
          },
          include: {
            assignments: {
              include: {
                employee: {
                  include: {
                    user: true
                  }
                }
              }
            }
          }
        });

        const companyId = (request.user as any)?.companyId || (request.admin as any)?.companyId;
        let sentCount = 0;
        let failCount = 0;
        let lastErrorMsg: string | null = null;

        for (const task of overdueTasks) {
          const assignedUsers = task.assignments
            .map((a: any) => a.employee?.user)
            .filter((u: any) => u && u.email);

          for (const user of assignedUsers) {
            try {
              await NotificationService.sendCustomNotification({
                to: user.email,
                subject: `Overdue Task Reminder: ${task.title}`,
                message: `Hello ${user.name || "User"},\n\nThis is a reminder that the task "${task.title}" is overdue.\nDue Date was: ${new Date(task.dueDate).toLocaleDateString()}.\nPriority: ${task.priority}.\nStatus: ${task.status}.`,
                eventCode: "TASK_REMINDER",
                relatedModule: "TASK",
                relatedRecordId: task.id,
              }, companyId);
              sentCount++;
            } catch (err: any) {
              failCount++;
              lastErrorMsg = err?.message || String(err);
              console.warn(`[SendReminders] Could not send reminder to ${user.email}:`, err?.message || err);
            }
          }
        }

        adminLogs.info("Overdue reminders run triggered manually", {
          overdueCount: overdueTasks.length,
          notificationsSent: sentCount,
          notificationsFailed: failCount,
        });

        if (failCount > 0 && sentCount === 0) {
          return reply.status(200).send({
            success: false,
            message: `Could not send reminders (${lastErrorMsg || "Check notification & email settings"}).`,
            data: { sentCount, failCount, overdueCount: overdueTasks.length },
          });
        }

        const message = overdueTasks.length === 0
          ? "No overdue tasks found."
          : `Reminders run completed. Dispatched ${sentCount} alert(s) for ${overdueTasks.length} task(s)${failCount > 0 ? ` (${failCount} failed)` : ""}.`;

        return reply.status(200).send({
          success: true,
          message,
          data: { sentCount, failCount, overdueCount: overdueTasks.length },
        });
      } catch (error: any) {
        console.error(error);
        adminLogs.error("Overdue reminders trigger failed", { error });

        return reply.status(500).send({
          success: false,
          message: "Server error during reminder dispatch run.",
          error: process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );
}

export default adminTaskNotificationRoutes;
