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

/** Build a task reminder WhatsApp message text for dvepl_reply_1 campaign */
function buildTaskReminderWaMessage(taskTitle: string, dueDate: Date, priority: string, status: string): string {
  const dueDateStr = new Date(dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return `📋 *Task Reminder*\n\nHi, you have a task that needs your attention:\n\n*Task:* ${taskTitle}\n*Due Date:* ${dueDateStr}\n*Priority:* ${priority.toUpperCase()}\n*Status:* ${status.replace("-", " ").toUpperCase()}\n\nPlease review and update the task status accordingly.\n\n- DVEPL ERP`;
}

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
            // ── Email reminder ───────────────────────────────────────────────
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
              console.warn(`[SendReminders] Could not send email to ${user.email}:`, err?.message || err);
            }

            // ── WhatsApp reminder (if phone available) ───────────────────────
            if (user.phone) {
              try {
                await NotificationService.sendWhatsAppNotification({
                  to: user.phone,
                  userName: user.name || "User",
                  campaignName: "dvepl_reply_1",
                  templateParams: [
                    user.name || "User",
                    buildTaskReminderWaMessage(task.title, task.dueDate, task.priority, task.status),
                  ],
                  eventCode: "TASK_REMINDER_WA",
                  relatedModule: "TASK",
                  relatedRecordId: task.id,
                }, companyId);
              } catch (waErr: any) {
                console.warn(`[SendReminders] WhatsApp failed for ${user.phone}:`, waErr?.message || waErr);
              }
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

  // ── Per-task WhatsApp Reminder ────────────────────────────────────────────
  fastify.post(
    "/send-whatsapp/:id",
    {
      schema: {
        tags: ["Task"],
        summary: "Send WhatsApp Reminder for Task",
        description: "Sends a WhatsApp reminder message to all assigned users (who have a phone number) for a specific task.",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const companyId = (request.user as any)?.companyId || (request.admin as any)?.companyId;

        const task = await fastify.prisma.task.findFirst({
          where: { id, deletedAt: null },
          include: {
            assignments: {
              include: {
                employee: {
                  include: { user: true },
                },
              },
            },
          },
        });

        if (!task) {
          return reply.status(404).send({ success: false, message: "Task not found." });
        }

        const hasAccess = await canManageTask(fastify, id, request);
        if (!hasAccess) {
          return reply.status(403).send({ success: false, message: "Access denied: you are not assigned to this task." });
        }

        const usersWithPhone = task.assignments
          .map((a: any) => a.employee?.user)
          .filter((u: any) => u && u.phone);

        if (usersWithPhone.length === 0) {
          return reply.status(200).send({
            success: false,
            message: "No assigned users have a phone number configured. Please add phone numbers to their user profiles.",
          });
        }

        let sentCount = 0;
        let failCount = 0;

        for (const user of usersWithPhone) {
          try {
            await NotificationService.sendWhatsAppNotification({
              to: user.phone,
              userName: user.name || "User",
              campaignName: "dvepl_reply_1",
              templateParams: [
                user.name || "User",
                buildTaskReminderWaMessage(task.title, task.dueDate, task.priority, task.status),
              ],
              eventCode: "TASK_REMINDER_WA",
              relatedModule: "TASK",
              relatedRecordId: task.id,
            }, companyId);
            sentCount++;
          } catch (err: any) {
            failCount++;
            console.warn(`[TaskWA] Failed to send WhatsApp to ${user.phone}:`, err?.message || err);
          }
        }

        adminLogs.info("Per-task WhatsApp reminder dispatched", { taskId: id, sentCount, failCount });

        if (sentCount === 0) {
          return reply.status(200).send({
            success: false,
            message: `WhatsApp reminder failed for all ${failCount} recipient(s). Check gateway settings.`,
          });
        }

        return reply.status(200).send({
          success: true,
          message: `WhatsApp reminder sent to ${sentCount} recipient(s)${failCount > 0 ? ` (${failCount} failed)` : ""}.`,
          data: { sentCount, failCount },
        });
      } catch (error: any) {
        console.error(error);
        adminLogs.error("Per-task WhatsApp reminder failed", { error });
        return reply.status(200).send({
          success: false,
          message: error.message || "Failed to send WhatsApp reminder.",
        });
      }
    },
  );
}

export default adminTaskNotificationRoutes;
