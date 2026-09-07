import {
    FastifyInstance,
    FastifyPluginOptions,
    FastifyReply,
    FastifyRequest,
} from "fastify";

import { adminLogs } from "../../../services/logger/contextLogger";

async function readUserByIdRoute(
    fastify: FastifyInstance,
    options: FastifyPluginOptions
) {
    fastify.get(
        "/:id",
        {
            schema: {
                tags: ["User"],
                summary: "Read User By Id",
                description: "Returns user details.",
            },
            preHandler: [
                fastify.verifyToken,
                fastify.authorizePermissions(["user.view"]),
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

                const { id } = request.params as { id: string };

                const user = await fastify.prisma.user.findFirst({
                    where: {
                        id,
                        companyId,
                        deletedAt: null,
                    },
                    include: {
                        accessProfile: true,
                        userRoles: {
                            include: {
                                role: true,
                            },
                        },
                    },
                });

                if (!user) {
                    return reply.status(404).send({
                        success: false,
                        message: "User not found.",
                    });
                }

                const up = user.accessProfile;
                const mainRole = user.userRoles[0]?.role;
                const hasOverride = up?.hasOverride ?? false;

                const pageAccess = hasOverride
                  ? (up?.pageAccess || [])
                  : (mainRole?.pageAccess && (mainRole.pageAccess as any[]).length > 0
                      ? mainRole.pageAccess
                      : (up?.pageAccess || []));
                const actionPermissions = hasOverride
                  ? (up?.actionPermissions || { create: true, edit: true, delete: false, export: true })
                  : (mainRole?.actionPermissions && Object.keys(mainRole.actionPermissions).length > 0
                      ? mainRole.actionPermissions
                      : (up?.actionPermissions || { create: true, edit: true, delete: false, export: true }));

                  return reply.send({
                    success: true,
                    data: {
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            phone: user.phone,
                            isActive: user.isActive,
                            designation: up?.designation || "Team Member",
                            hasOverride,
                            pageAccess,
                            actionPermissions,
                        },

                        roles: user.userRoles.map((userRole) => ({
                            id: userRole.role.id,
                            name: userRole.role.name,
                        })),

                        permissions: user.userRoles.flatMap((userRole: any) =>
                            (userRole.role.rolePermissions || []).map((rp: any) => rp.permission?.code).filter(Boolean)
                        ),
                    },
                });

            } catch (error: any) {

                adminLogs.error("Read User By Id Failed", {
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

export default readUserByIdRoute;