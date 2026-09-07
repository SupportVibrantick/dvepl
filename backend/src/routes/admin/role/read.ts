import {
    FastifyInstance,
    FastifyPluginOptions,
    FastifyReply,
    FastifyRequest,
} from "fastify";

async function getAllRolesRoute(
    fastify: FastifyInstance,
    options: FastifyPluginOptions
) {
    fastify.get(
        "/",
        {
            schema: {
                tags: ["Role"],
                summary: "Get All Roles",
            },
            preHandler: [
                fastify.verifyToken,
                fastify.authorizePermissions(["role.view"]),
            ],
        },
        async (
            request: FastifyRequest,
            reply: FastifyReply
        ) => {
            try {
                const companyId =
                    (request.admin as any)?.companyId;

                const roles =
                    await fastify.prisma.role.findMany({
                        where: {
                            companyId,
                            deletedAt: null,
                        },
                        include: {
                            rolePermissions: {
                                include: {
                                    permission: true,
                                },
                            },
                        },
                        orderBy: {
                            createdAt: "desc",
                        },
                    });

                return reply.send({
                    success: true,
                    data: roles.map((role) => ({
                        id: role.id,
                        name: role.name,
                        description:
                            role.description,
                        isSystem: role.isSystem,
                        pageAccess: role.pageAccess || [],
                        actionPermissions: role.actionPermissions || {},
                        permissions:
                            role.rolePermissions.map(
                                (rp) => ({
                                    id: rp.permission.id,
                                    code: rp.permission.code,
                                })
                            ),
                    })),
                });
            } catch (error: any) {
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

export default getAllRolesRoute;