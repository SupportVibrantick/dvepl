import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { adminLogs } from "../../../services/logger/contextLogger";
import { isAdminUser, getEmployeeForUser } from "./access";

async function adminTaskReadRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
) {
  fastify.get(
    "/",
    {
      schema: {
        tags: ["Task"],
        summary: "Read Tasks",
        description: "Get all tasks",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request.admin as any)?.id;
        const isManager = isAdminUser(request.admin);

        let whereClause: any = {
          deletedAt: null,
        };

        if (!isManager) {
          const employee = await getEmployeeForUser(fastify, userId);

          if (!employee) {
            return reply.status(200).send({
              success: true,
              message: "No tasks found (no employee record associated with user).",
              count: 0,
              data: [],
            });
          }

          whereClause.assignments = {
            some: {
              OR: [
                { employeeId: employee.id },
                { employee: { userId } }
              ]
            },
          };
        }

        const tasks = await fastify.prisma.task.findMany({
          where: whereClause,
          include: {
            assignments: {
              include: {
                employee: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
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
            },
          },
          orderBy: {
            dueDate: "asc",
          },
        });

        const entityIds = tasks.map(t => t.id);

        const { CustomFieldService } = await import("../../../services/customFieldService");
        const cfService = new CustomFieldService(fastify.prisma);

        const [cfValuesMap, notifLogs] = await Promise.all([
          cfService.getValuesForEntities("task", entityIds),
          entityIds.length > 0
            ? fastify.prisma.notificationLog.findMany({
                where: {
                  OR: [
                    { relatedRecordId: { in: entityIds } },
                    { relatedModule: "TASK", relatedRecordId: { in: entityIds } },
                  ],
                },
                orderBy: {
                  createdAt: "desc",
                },
                take: 1000,
              })
            : [],
        ]);

        const logsByTaskId: Record<string, any[]> = {};
        for (const log of notifLogs) {
          if (log.relatedRecordId) {
            if (!logsByTaskId[log.relatedRecordId]) {
              logsByTaskId[log.relatedRecordId] = [];
            }
            logsByTaskId[log.relatedRecordId].push(log);
          }
        }

        // Format assignments to match tasksPage UI interface: { id, name }
        const formattedTasks = tasks.map((t) => {
          const taskLogs = logsByTaskId[t.id] || [];
          const latestLog = taskLogs[0] || null;
          const hasSent = taskLogs.some((l) => l.status === "SENT");
          const hasFailed = taskLogs.some((l) => l.status === "FAILED");

          return {
            ...t,
            dueDate: t.dueDate.toISOString().split("T")[0],
            assignedUsers: t.assignments.map((a) => ({
              id: a.employee.user?.id || a.employee.id,
              name: a.employee.user?.name || `${a.employee.firstName} ${a.employee.lastName}`,
              email: a.employee.user?.email || null,
            })),
            mailDelivery: {
              status: hasSent ? "SENT" : hasFailed ? "FAILED" : "NOT_SENT",
              sentAt: latestLog ? (latestLog.sentAt || latestLog.createdAt) : null,
              recipient: latestLog?.recipient || null,
              error: latestLog?.error || null,
              logsCount: taskLogs.length,
            },
            customFields: cfValuesMap[t.id] || {}
          };
        });

        return reply.status(200).send({
          success: true,
          message: "Tasks fetched successfully.",
          count: formattedTasks.length,
          data: formattedTasks,
        });
      } catch (error: any) {
        console.error(error);
        adminLogs.error("Task fetch failed", { error });

        return reply.status(500).send({
          success: false,
          message: "Server error while fetching tasks.",
          error: process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );
}

export default adminTaskReadRoutes;
