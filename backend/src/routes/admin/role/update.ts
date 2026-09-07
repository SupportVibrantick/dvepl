import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { adminLogs } from "../../../services/logger/contextLogger";
import { updateRoleSchema } from "../../../schemas/admin/role/role.schema";

async function updateRoleRoute(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.put(
    "/:id",
    {
      schema: {
        tags: ["Role"],
        summary: "Update Role",
        description: "Update role details and permissions.",
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["role.update"]),
      ],
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      try {
        //--------------------------------
        // Validation
        //--------------------------------

        const validation = updateRoleSchema.safeParse(request.body);

        if (!validation.success) {
          return reply.status(400).send({
            success: false,
            message: "Invalid request data.",
            error:
              process.env.NODE_ENV === "development"
                ? validation.error.issues
                : undefined,
          });
        }

        const { id } = request.params as { id: string };

        const { name, description, permissionIds, pageAccess, actionPermissions } = validation.data;

        const companyId = (request.admin as any)?.companyId;

        //--------------------------------
        // Check Role
        //--------------------------------

        const role = await fastify.prisma.role.findFirst({
          where: {
            id,
            companyId,
            deletedAt: null,
          },
        });

        if (!role) {
          return reply.status(404).send({
            success: false,
            message: "Role not found.",
          });
        }

        if (role.isSystem) {
          return reply.status(403).send({
            success: false,
            message: "System roles cannot be modified.",
          });
        }

        //--------------------------------
        // Duplicate Name
        //--------------------------------

        if (name) {
          const existingRole = await fastify.prisma.role.findFirst({
            where: {
              companyId,
              name,
              NOT: {
                id,
              },
              deletedAt: null,
            },
          });

          if (existingRole) {
            return reply.status(409).send({
              success: false,
              message: "Role name already exists.",
            });
          }
        }

        //--------------------------------
        // Validate Permissions
        //--------------------------------

        if (permissionIds) {
          const permissions = await fastify.prisma.permission.findMany({
            where: {
              id: {
                in: permissionIds,
              },
            },
          });

          if (permissions.length !== permissionIds.length) {
            return reply.status(400).send({
              success: false,
              message: "One or more permissions are invalid.",
            });
          }
        }

        //--------------------------------
        // Ceiling Enforcement (Bug #13)
        // Users cannot grant permissions they don't possess.
        //--------------------------------

        const requesterId = (request.admin as any)?.id;
        if (requesterId && (pageAccess !== undefined || actionPermissions !== undefined)) {
          const requester = await fastify.prisma.user.findUnique({
            where: { id: requesterId },
            include: {
              userRoles: {
                include: { role: true },
              },
              accessProfile: true,
            },
          });

          const rUp = requester?.accessProfile;
          const rHasOverride = rUp?.hasOverride ?? false;
          const rAllRoles = requester?.userRoles.map((ur) => ur.role) || [];

          const mergedRolePageAccess = [
            ...new Set(rAllRoles.flatMap((r) => (r.pageAccess as string[] || []))),
          ];

          const requesterPageAccess = rHasOverride
            ? (rUp?.pageAccess as string[] || [])
            : (mergedRolePageAccess.length > 0
                ? mergedRolePageAccess
                : (rUp?.pageAccess as string[] || []));

          const requesterPageAccessSet = new Set(requesterPageAccess);

          if (pageAccess !== undefined) {
            const newPageAccess = (pageAccess as string[]) || [];
            const deniedPages = newPageAccess.filter((p) => !requesterPageAccessSet.has(p));
            if (deniedPages.length > 0) {
              return reply.status(403).send({
                success: false,
                message: `You cannot grant page access you do not have: ${deniedPages.join(", ")}`,
              });
            }
          }

          if (actionPermissions !== undefined) {
            const newActionPermissions = actionPermissions as Record<string, any>;
            const allowedActionPermissions =
              rHasOverride
                ? (rUp?.actionPermissions || {})
                : (Object.keys(
                    rAllRoles.reduce<Record<string, any>>((acc, r) => {
                      const ap = (r.actionPermissions as Record<string, any>) || {};
                      for (const [m, acts] of Object.entries(ap)) {
                        if (!acc[m]) acc[m] = { ...acts };
                        else for (const a of ["create", "edit", "delete", "export"]) {
                          if ((acts as any)[a] === true) acc[m][a] = true;
                        }
                      }
                      return acc;
                    }, {})
                  ).length > 0
                    ? rAllRoles.reduce<Record<string, any>>((acc, r) => {
                        const ap = (r.actionPermissions as Record<string, any>) || {};
                        for (const [m, acts] of Object.entries(ap)) {
                          if (!acc[m]) acc[m] = { ...acts };
                          else for (const a of ["create", "edit", "delete", "export"]) {
                            if ((acts as any)[a] === true) acc[m][a] = true;
                          }
                        }
                        return acc;
                      }, {})
                    : (rUp?.actionPermissions || {}));

            for (const [module, actions] of Object.entries(newActionPermissions || {})) {
              const granted = (actions as any) || {};
              const own = (allowedActionPermissions as any)[module] || {};
              for (const action of ["create", "edit", "delete", "export"]) {
                if (granted[action] === true && own[action] !== true) {
                  return reply.status(403).send({
                    success: false,
                    message: `You cannot grant "${action}" on "${module}" because you do not have it.`,
                  });
                }
              }
            }
          }
        }

        //--------------------------------
        // Transaction
        //--------------------------------

        await fastify.prisma.$transaction(async (tx) => {
          await tx.role.update({
            where: {
              id,
            },
            data: {
              ...(name !== undefined ? { name } : {}),
              ...(description !== undefined ? { description } : {}),
              ...(pageAccess !== undefined ? { pageAccess } : {}),
              ...(actionPermissions !== undefined ? { actionPermissions } : {}),
            },
          });

          if (permissionIds) {
            await tx.rolePermission.deleteMany({
              where: {
                roleId: id,
              },
            });

            await tx.rolePermission.createMany({
              data: permissionIds.map((permissionId) => ({
                roleId: id,
                permissionId,
              })),
            });
          }

          //--------------------------------
          // Access Profile Propagation (Bug #11)
          // When a role's permissions change, existing users who do NOT have a
          // custom override (hasOverride=false) should inherit the updated role
          // permissions (snapshot drift fix).
          //--------------------------------

          const roleNeedsPropagation =
            pageAccess !== undefined ||
            actionPermissions !== undefined;

          if (roleNeedsPropagation) {
            const affectedUsers = await tx.user.findMany({
              where: {
                deletedAt: null,
                userRoles: {
                  some: { roleId: id },
                },
                accessProfile: {
                  isNot: null,
                },
              },
              include: {
                accessProfile: true,
                userRoles: {
                  include: { role: true },
                },
              },
            });

            for (const u of affectedUsers) {
              if (u.accessProfile?.hasOverride) {
                continue;
              }

              // Merge this role's (updated) permissions across all of the user's roles
              const latestRoles = u.userRoles.map((ur) => ur.role);

              const mergedPageAccess = [
                ...new Set(
                  latestRoles.flatMap((r) => (r.pageAccess as string[] || [])),
                ),
              ];

              const mergedActionPermissions: Record<string, any> = {};
              for (const r of latestRoles) {
                const ap = (r.actionPermissions as Record<string, any>) || {};
                for (const [m, acts] of Object.entries(ap)) {
                  if (!mergedActionPermissions[m]) {
                    mergedActionPermissions[m] = { ...acts };
                  } else {
                    for (const a of ["create", "edit", "delete", "export"]) {
                      if ((acts as any)[a] === true) mergedActionPermissions[m][a] = true;
                    }
                  }
                }
              }

              await tx.userAccessProfile.update({
                where: { userId: u.id },
                data: {
                  pageAccess: mergedPageAccess.length > 0 ? mergedPageAccess : [],
                  actionPermissions: Object.keys(mergedActionPermissions).length > 0
                    ? mergedActionPermissions
                    : {},
                },
              });
            }
          }
        });

        return reply.status(200).send({
          success: true,
          message: "Role updated successfully.",
        });
      } catch (error: any) {
        adminLogs.error("Update Role Failed", { error });

        return reply.status(500).send({
          success: false,
          message: "Server Error.",
          details:
            process.env.NODE_ENV === "development"
              ? error.message
              : undefined,
        });
      }
    }
  );
}

export default updateRoleRoute;