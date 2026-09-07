import {
    FastifyInstance,
    FastifyPluginOptions,
    FastifyReply,
    FastifyRequest,
} from "fastify";

import { adminLogs } from "../../../services/logger/contextLogger";
import { createRoleSchema } from "../../../schemas/admin/role/role.schema";

async function createRoleRoute(
    fastify: FastifyInstance,
    options: FastifyPluginOptions
) {
    fastify.post(
        "/",
        {
            schema: {
                tags: ["Role"],
                summary: "Create Role",
                description: "Create a role with permissions.",
            },
            preHandler: [
                fastify.verifyToken,
                fastify.authorizePermissions(["role.create"]),
            ],
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const validationResult =
                    createRoleSchema.safeParse(request.body);

                if (!validationResult.success) {
                    return reply.status(400).send({
                        success: false,
                        message: "Invalid request data.",
                        error: validationResult.error.issues,
                    });
                }

                const { name, description, permissionIds, pageAccess, actionPermissions } =
                    validationResult.data;

                const companyId = (request.admin as any)?.companyId;

                if (!companyId) {
                    return reply.status(401).send({
                        success: false,
                        message: "Company information missing.",
                    });
                }

                // Duplicate Role
                const existingRole =
                    await fastify.prisma.role.findFirst({
                        where: {
                            companyId,
                            name,
                            deletedAt: null,
                        },
                    });

                if (existingRole) {
                    return reply.status(409).send({
                        success: false,
                        message: "Role already exists.",
                    });
                }

                // Validate Permissions
                const permissions =
                    await fastify.prisma.permission.findMany({
                        where: {
                            id: {
                                in: permissionIds,
                            },
                        },
                    });

                if (
                    permissions.length !== permissionIds.length
                ) {
                    return reply.status(400).send({
                        success: false,
                        message:
                            "One or more permissions are invalid.",
                    });
                }

                const createdRole =
                    await fastify.prisma.$transaction(
                        async (tx) => {
                            const role =
                                await tx.role.create({
                                    data: {
                                        companyId,
                                        name,
                                        description,
                                        pageAccess: pageAccess || [],
                                        actionPermissions: actionPermissions || {},
                                    },
                                });

                            await tx.rolePermission.createMany({
                                data: permissionIds.map(
                                    (permissionId) => ({
                                        roleId: role.id,
                                        permissionId,
                                    })
                                ),
                            });

                            return role;
                        }
                    );

                adminLogs.info("Role created", {
                    createdBy: request.admin?.id,
                    roleId: createdRole.id,
                });

                return reply.status(201).send({
                    success: true,
                    message:
                        "Role created successfully.",
                    data: createdRole,
                });
            } catch (error: any) {
                adminLogs.error(
                    "Role creation failed",
                    error
                );

                return reply.status(500).send({
                    success: false,
                    message: "Server Error",
                    details:
                        process.env.NODE_ENV ===
                        "development"
                            ? error.message
                            : undefined,
                });
            }
        }
    );
}

export default createRoleRoute;