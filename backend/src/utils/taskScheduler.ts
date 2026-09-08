import { PrismaClient } from "@prisma/client";
import NotificationService from "../services/notification/notification.service";

function buildTaskReminderWaMessage(taskTitle: string, dueDate: Date, priority: string, status: string): string {
  const dueDateStr = new Date(dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return `📋 *Task Reminder*\n\nHi, you have a task that needs your attention:\n\n*Task:* ${taskTitle}\n*Due Date:* ${dueDateStr}\n*Priority:* ${priority.toUpperCase()}\n*Status:* ${status.replace("-", " ").toUpperCase()}\n\nPlease review and update the task status accordingly.\n\n- DVEPL ERP`;
}

export async function checkAndSendTaskReminders(prisma: PrismaClient) {
  try {
    const today = new Date();
    
    // Find all active, uncompleted tasks with notifications enabled and scheduled as automatic
    const tasks = await prisma.task.findMany({
      where: {
        deletedAt: null,
        status: { not: "completed" },
        notifEnabled: true,
        notifType: "automatic",
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

    for (const task of tasks) {
      // Calculate target trigger time
      // notifUnit is "hours" or "days" (default "days")
      const multiplier = task.notifUnit === "hours" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      const offsetMs = task.notifDays * multiplier;
      const triggerTime = new Date(task.dueDate.getTime() - offsetMs);

      // If today hasn't reached the trigger time, skip
      if (today < triggerTime) {
        continue;
      }

      for (const assignment of (task.assignments as any[])) {
        const user = assignment.employee?.user;
        const companyId = assignment.employee?.companyId;
        if (!user || !user.email) continue;

        // Query to check if we have already sent a reminder for this task to this recipient
        const existingLogs = await prisma.notificationLog.findMany({
          where: {
            recipient: user.email,
            eventCode: "TASK_REMINDER",
            relatedModule: "TASK",
            relatedRecordId: task.id,
            status: "SENT",
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        let shouldSend = false;

        if (existingLogs.length === 0) {
          // Never sent, send the first reminder
          shouldSend = true;
        } else {
          // Previous log exists, check if frequency allows sending another
          const lastLog = existingLogs[0];
          const lastSentTime = new Date(lastLog.createdAt).getTime();
          const msSinceLastSend = today.getTime() - lastSentTime;

          if (task.notifFrequency === "daily") {
            shouldSend = msSinceLastSend >= 24 * 60 * 60 * 1000;
          } else if (task.notifFrequency === "every-12h") {
            shouldSend = msSinceLastSend >= 12 * 60 * 60 * 1000;
          } else {
            // "once" or any other value means do not send again
            shouldSend = false;
          }
        }

        if (shouldSend) {
          // ── Email reminder ──────────────────────────────────────────────
          try {
            await NotificationService.sendCustomNotification({
              to: user.email,
              subject: `Automated Task Reminder: ${task.title}`,
              message: `Hello ${user.name || "User"},\n\nThis is an automated reminder that the task "${task.title}" is due soon.\n\nTask Details:\n- Title: ${task.title}\n- Description: ${task.description || "No description provided."}\n- Due Date: ${new Date(task.dueDate).toLocaleDateString()}\n- Priority: ${task.priority.toUpperCase()}\n- Status: ${task.status.toUpperCase()}\n\nPlease review and complete the task accordingly.`,
              eventCode: "TASK_REMINDER",
              relatedModule: "TASK",
              relatedRecordId: task.id,
            }, companyId);
            console.log(`[Scheduler] Sent task reminder email for "${task.title}" to ${user.email}`);
          } catch (sendError) {
            console.error(`[Scheduler] Failed to send task reminder email for "${task.title}" to ${user.email}:`, sendError);
          }

          // ── WhatsApp reminder (if phone available) ──────────────────────
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
              console.log(`[Scheduler] Sent task reminder WhatsApp for "${task.title}" to ${user.phone}`);
            } catch (waError) {
              console.error(`[Scheduler] Failed to send task reminder WhatsApp for "${task.title}" to ${user.phone}:`, waError);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("[Scheduler] Error running checkAndSendTaskReminders:", error);
  }
}
