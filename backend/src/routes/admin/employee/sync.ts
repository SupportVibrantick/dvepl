import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { adminLogs } from "../../../services/logger/contextLogger";
import { nextEmployeeCode } from "../../../utils/employeeCode";

const isAdminRole = (roleName?: string): boolean =>
  Boolean(
    roleName && String(roleName).toLowerCase().includes("admin")
  );

async function syncEmployeeRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
) {
  fastify.post(
    "/",
    {
      schema: {
        tags: ["Employee"],
        summary: "Sync Employees From Users",
        description:
          "Creates employee records for all company users. Users with an admin role and users already linked to an employee record are skipped.",
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["employee.create"]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const companyId = (request.admin as any)?.companyId;

        if (!companyId) {
          return reply.status(401).send({
            success: false,
            message: "Company information missing from token.",
          });
        }

        const users = await fastify.prisma.user.findMany({
          where: {
            companyId,
            deletedAt: null,
          },
          include: {
            userRoles: {
              include: {
                role: true,
              },
            },
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        });

        // Skip users whose role name contains "admin" (admin role is not added as employee)
        const nonAdminUsers = users.filter(
          (user) =>
            !user.userRoles.some((ur) =>
              isAdminRole(ur.role.name)
            )
        );

        // Skip users that are already linked to an employee record
        const usersToSync = nonAdminUsers.filter(
          (user) => !user.employee
        );

        const createdEmployees: any[] = [];
        const fixedEmployees: any[] = [];
        const reservedCodes = new Set<string>();

        // Fix already-linked employees that were auto-created with the old
        // "Member" fallback for single-word names (e.g. "aaditya Member").
        for (const user of nonAdminUsers) {
          const emp = user.employee as any;
          if (!emp) continue;
          if (emp.lastName !== "Member") continue;

          const nameParts = (user.name || "").trim().split(/\s+/);
          if (nameParts.length > 1) continue;

          const updated = await fastify.prisma.employee.update({
            where: { id: emp.id },
            data: {
              firstName: nameParts[0] || emp.firstName,
              lastName: "",
            },
          });
          fixedEmployees.push(updated);
        }

        for (const user of usersToSync) {
          const employeeCode = await nextEmployeeCode(
            fastify.prisma,
            reservedCodes
          );

          const nameParts = (user.name || "").trim().split(/\s+/);
          const firstName = nameParts[0] || "Employee";
          const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

          const employee = await fastify.prisma.$transaction(
            async (tx) => {
              const emp = await tx.employee.create({
                data: {
                  companyId,
                  userId: user.id,
                  employeeCode,
                  firstName,
                  lastName,
                  status: "ACTIVE",
                },
              });

              if (user.email) {
                await tx.employeeContact.create({
                  data: {
                    employeeId: emp.id,
                    type: "EMAIL",
                    value: user.email,
                    isPrimary: true,
                  },
                });
              }

              if (user.phone) {
                await tx.employeeContact.create({
                  data: {
                    employeeId: emp.id,
                    type: "PHONE",
                    value: user.phone,
                    isPrimary: true,
                  },
                });
              }

              return emp;
            }
          );

          createdEmployees.push(employee);
        }

        adminLogs.info("Employees synced from users", {
          syncedCount: createdEmployees.length,
          fixedNames: fixedEmployees.length,
          skippedAdmins: users.length - nonAdminUsers.length,
          alreadyLinked: nonAdminUsers.length - usersToSync.length,
        });

        return reply.status(200).send({
          success: true,
          message: `Synced ${createdEmployees.length} users to employees successfully.`,
          data: createdEmployees,
          syncedCount: createdEmployees.length,
          fixedNames: fixedEmployees.length,
          skippedAdmins: users.length - nonAdminUsers.length,
          alreadyLinked: nonAdminUsers.length - usersToSync.length,
        });
      } catch (error: any) {
        adminLogs.error("Sync Employees from Users failed", {
          error,
        });

        return reply.status(500).send({
          success: false,
          message: "Server error while syncing employees.",
          details:
            process.env.NODE_ENV === "development"
              ? error.message
              : undefined,
        });
      }
    }
  );
}

export default syncEmployeeRoutes;
