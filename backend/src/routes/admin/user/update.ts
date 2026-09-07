import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { adminLogs } from "../../../services/logger/contextLogger";
import { hashPassword } from "../../../utils/hashPassword";

const actionKeys = ["create", "edit", "delete", "export"] as const;

function isValidActionPermissions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const isLegacy = actionKeys.some((action) => typeof record[action] === "boolean");
  if (isLegacy) return actionKeys.every((action) => typeof record[action] === "boolean");

  return Object.keys(record).length > 0 && Object.values(record).every((moduleActions) => {
    if (!moduleActions || typeof moduleActions !== "object" || Array.isArray(moduleActions)) return false;
    const actions = moduleActions as Record<string, unknown>;
    return actionKeys.every((action) => typeof actions[action] === "boolean");
  });
}

async function updateUserRoute(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.put(
    "/:id",
    {
      schema: {
        tags: ["User"],
        summary: "Update User",
        description: "Update user details and assigned roles.",
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["user.update"]),
      ],
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      try {
        const companyId = (request.admin as any)?.companyId;
        const loggedInUserId = (request.admin as any)?.id;

        if (!companyId) {
          return reply.status(401).send({
            success: false,
            message: "Company information missing from token.",
          });
        }

        const { id } = request.params as { id: string };
        const { name, email, phone, isActive, role, designation, pageAccess, actionPermissions, password, teamId, hasOverride } = request.body as any;

        // Prevent self-role-escalation
        if (id === loggedInUserId && ((request.body as any).roleIds || role)) {
          return reply.status(403).send({
            success: false,
            message: "You cannot modify your own roles.",
          });
        }

        if (actionPermissions !== undefined && !isValidActionPermissions(actionPermissions)) {
          return reply.status(400).send({
            success: false,
            message: "actionPermissions must be a legacy action object or a page-keyed action object.",
          });
        }

        // Check User Exists
        const existingUser = await fastify.prisma.user.findFirst({
          where: {
            id,
            companyId,
            deletedAt: null,
          },
        });

        if (!existingUser) {
          return reply.status(404).send({
            success: false,
            message: "User not found.",
          });
        }

        // Duplicate Email Check
        if (email) {
          const duplicateEmail = await fastify.prisma.user.findFirst({
            where: {
              email,
              NOT: {
                id,
              },
              deletedAt: null,
            },
          });

          if (duplicateEmail) {
            return reply.status(409).send({
              success: false,
              message: "Email already exists.",
            });
          }
        }

        // Resolve role ID if passed as string name or ID
        let roleIds = (request.body as any).roleIds;
        if (role && !roleIds) {
          const foundRole = await fastify.prisma.role.findFirst({
            where: {
              OR: [
                { id: role },
                { name: { equals: role, mode: "insensitive" } }
              ],
              companyId,
              deletedAt: null
            }
          });
          if (foundRole) {
            roleIds = [foundRole.id];
          }
        }

        // Hash password if provided
        let passwordHash: string | undefined = undefined;
        if (password) {
          passwordHash = await hashPassword(password);
        }

        // Transaction for User Table
        await fastify.prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: {
              id,
            },
            data: {
              name: name || undefined,
              email: email || undefined,
              phone: phone || undefined,
              isActive: isActive !== undefined ? !!isActive : undefined,
              passwordHash,
            },
          });

          if (roleIds && roleIds.length > 0) {
            // Validate all roleIds belong to the same company
            const validRoles = await fastify.prisma.role.findMany({
              where: {
                id: { in: roleIds },
                companyId,
                deletedAt: null,
              },
            });
            if (validRoles.length !== roleIds.length) {
              return reply.status(400).send({
                success: false,
                message: "One or more selected roles are invalid.",
              });
            }

            await tx.userRole.deleteMany({
              where: {
                userId: id,
              },
            });

            await tx.userRole.createMany({
              data: roleIds.map((roleId: string) => ({
                userId: id,
                roleId,
              })),
            });
          }

          // Find employee record associated with this user
          const employee = await tx.employee.findFirst({
            where: { userId: id }
          });

          if (employee) {
            const updateData: any = {};
            if (name) {
              const nameParts = name.trim().split(/\s+/);
              updateData.firstName = nameParts[0] || "Employee";
              updateData.lastName = nameParts.slice(1).join(" ") || "Member";
            }
            if (designation !== undefined) {
              let designationId: string | null = null;
              if (designation) {
                const foundDes = await tx.designation.findFirst({
                  where: {
                    title: { equals: designation, mode: "insensitive" },
                    deletedAt: null
                  }
                });
                if (foundDes) {
                  designationId = foundDes.id;
                }
              }
              updateData.designationId = designationId;
            }
            if (teamId !== undefined) {
              updateData.teamId = teamId || null;
            }

            await tx.employee.update({
              where: { id: employee.id },
              data: updateData
            });

            if (email) {
              await tx.employeeContact.updateMany({
                where: {
                  employeeId: employee.id,
                  type: "EMAIL",
                  isPrimary: true
                },
                data: {
                  value: email
                }
              });
            }

            if (phone) {
              await tx.employeeContact.updateMany({
                where: {
                  employeeId: employee.id,
                  type: "PHONE",
                  isPrimary: true
                },
                data: {
                  value: phone
                }
              });
            }
          }
        });

        // Save custom access metadata in the database.
        if (pageAccess || actionPermissions || designation !== undefined || hasOverride !== undefined) {
          const profileOverride = hasOverride !== undefined ? !!hasOverride : (pageAccess !== undefined || actionPermissions !== undefined);
          await fastify.prisma.userAccessProfile.upsert({
            where: { userId: id },
            create: {
              userId: id,
              designation: designation || "Team Member",
              hasOverride: profileOverride,
              pageAccess: pageAccess || [],
              actionPermissions: actionPermissions || { create: true, edit: true, delete: false, export: true },
            },
            update: {
              ...(pageAccess !== undefined ? { pageAccess } : {}),
              ...(actionPermissions !== undefined ? { actionPermissions } : {}),
              ...(designation !== undefined ? { designation } : {}),
              ...(hasOverride !== undefined ? { hasOverride } : (pageAccess !== undefined || actionPermissions !== undefined ? { hasOverride: true } : {})),
            },
          });
        }

        return reply.status(200).send({
          success: true,
          message: "User updated successfully.",
        });
      } catch (error: any) {
        adminLogs.error("Update User Failed", {
          error,
        });

        return reply.status(500).send({
          success: false,
          message: "Server error.",
          details:
            process.env.NODE_ENV === "development"
              ? error.message
              : undefined,
        });
      }
    }
  );
}

export default updateUserRoute;
