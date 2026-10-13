import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { adminLogs } from "../../../services/logger/contextLogger";
import { taskSchema } from "../../../schemas/admin/task/task.schema";
import { canManageTask, isAdminUser } from "./access";

import NotificationService from "../../../services/notification/notification.service";

async function adminTaskUpdateRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
) {
  fastify.patch(
    "/:id",
    {
      schema: {
        tags: ["Task"],
        summary: "Update Task",
        description: "Update a task by ID",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const validationResult = taskSchema.partial().safeParse(request.body);

        if (!validationResult.success) {
          adminLogs.error("Invalid task update data", {
            error: validationResult.error,
          });

          return reply.status(400).send({
            success: false,
            message: "Invalid task update data.",
            error:
              process.env.NODE_ENV === "development"
                ? validationResult.error.issues
                : "Validation failed",
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
            message: "Access denied: Only assigned team members or administrators can edit or complete this task.",
          });
        }

        const isManager = isAdminUser(request.admin);
        const {
          title,
          description,
          priority,
          dueDate,
          status,
          assignedUserIds,
        } = validationResult.data;

        if (!isManager && assignedUserIds !== undefined) {
          return reply.status(403).send({
            success: false,
            message: "Access denied: Only administrators can modify task assignments.",
          });
        }

        await fastify.prisma.$transaction(async (tx) => {
          await tx.task.update({
            where: { id },
            data: {
              title: title !== undefined ? title : undefined,
              description: description !== undefined ? description : undefined,
              priority: priority !== undefined ? priority : undefined,
              dueDate: dueDate !== undefined ? new Date(dueDate) : undefined,
              status: status !== undefined ? status : undefined,
            },
          });

          if (assignedUserIds !== undefined) {
            await tx.taskAssignment.deleteMany({
              where: { taskId: id },
            });

            if (assignedUserIds.length > 0) {
              const employees = await tx.employee.findMany({
                where: {
                  OR: [
                    { userId: { in: assignedUserIds } },
                    { id: { in: assignedUserIds } }
                  ]
                },
                select: { id: true }
              });

              if (employees.length > 0) {
                await tx.taskAssignment.createMany({
                  data: employees.map(emp => ({
                    taskId: id,
                    employeeId: emp.id
                  }))
                });
              }
            }
          }

          // Save EAV Custom Field Values if provided
          if ((request.body as any)?.customFields) {
            const { CustomFieldService } = await import("../../../services/customFieldService");
            const cfService = new CustomFieldService(tx as any);
            await cfService.saveValues("task", id, (request.body as any).customFields);
          }
        });

        // Trigger task update notifications
        try {
          const finalTitle = title !== undefined ? title : existingTask.title;
          const finalPriority = priority !== undefined ? priority : existingTask.priority;
          const finalDueDate = dueDate !== undefined ? new Date(dueDate) : existingTask.dueDate;
          const finalStatus = status !== undefined ? status : existingTask.status;

          // Fetch all assigned users after update (includes newly assigned)
          const assignments = await fastify.prisma.taskAssignment.findMany({
            where: { taskId: id },
            include: { employee: { include: { user: true } } }
          });

          const assignedUsers = assignments
            .map((a: any) => a.employee?.user)
            .filter((u: any) => u && u.email);

          const isNewAssignment = (assignedUserIds && assignedUserIds.length > 0);
          const companyId = (request.user as any)?.companyId || (request.admin as any)?.companyId;

          for (const user of assignedUsers) {
            const subject = isNewAssignment
              ? `New Task Assigned: ${finalTitle}`
              : `Task Updated: ${finalTitle}`;
            const message = isNewAssignment
              ? `Hello ${user.name || "User"},\n\nYou have been assigned to a new task: "${finalTitle}".\nPriority: ${finalPriority}.\nDue Date: ${new Date(finalDueDate).toLocaleDateString()}.\n\nYou can view and manage this task in the DVEPL ERP portal.`
              : `Hello ${user.name || "User"},\n\nThe task "${finalTitle}" assigned to you has been updated.\nPriority: ${finalPriority}.\nDue Date: ${new Date(finalDueDate).toLocaleDateString()}.\nStatus: ${finalStatus}.`;

            await NotificationService.sendCustomNotification({
              to: user.email,
              subject,
              message,
              eventCode: isNewAssignment ? "TASK_ASSIGNED" : "TASK_UPDATED",
              relatedModule: "TASK",
              relatedRecordId: id,
            }, companyId);
          }
        } catch (notifErr) {
          console.error("Failed to send task update notifications:", notifErr);
        }

        adminLogs.info("Task updated successfully", { taskId: id });

        return reply.status(200).send({
          success: true,
          message: "Task updated successfully.",
        });
      } catch (error: any) {
        console.error(error);
        adminLogs.error("Task update failed", { error });

        return reply.status(500).send({
          success: false,
          message: "Server error while updating task.",
          error: process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );
}

export default adminTaskUpdateRoutes;
