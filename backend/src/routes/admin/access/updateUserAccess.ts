import {
    FastifyInstance,
    FastifyPluginOptions,
    FastifyReply,
    FastifyRequest,
} from "fastify";

interface Body {
    permissionIds: string[];
}

// Mirrors getModuleForPermission in authPlugin.ts so flat permission codes
// translate to the authoritative pageAccess/actionPermissions modules.
const PREFIX_TO_MODULE: Record<string, string> = {
    dashboard: "dashboard",
    company: "companies",
    branch: "branches",
    department: "departments",
    team: "teams",
    designation: "designations",
    costCenter: "cost_centers",
    employee: "employees",
    attendance: "attendance",
    leave: "leaves",
    holiday: "holidays",
    shift: "shift_management",
    salary: "payroll",
    employeeDocument: "documents",
    task: "tasks",
    customer: "customers",
    contact: "contacts",
    communication: "communication",
    salesOrder: "orders",
    order: "orders",
    vendor: "vendors",
    inventory: "inventory",
    exportOrder: "export_orders",
    payment: "finance",
    tenderRequest: "tender_requests",
    tender: "tenders",
    technicalClarification: "technical_clarifications",
    governmentDepartment: "government_departments",
    section: "sections",
    division: "divisions",
    subDivision: "sub_divisions",
    referenceCode: "reference_codes",
    user: "users",
    role: "roles",
    approvalRequest: "approval_requests",
    report: "reports",
    auditLog: "audit_logs",
    customField: "custom_fields",
    recycleBin: "recycle_bin",
    settings: "settings",
};

const ALL_ACTIONS = ["create", "edit", "delete", "export"] as const;
type Action = (typeof ALL_ACTIONS)[number];

const actionFromCode = (code: string): Action | "view" | null => {
    if (code.includes(".create")) return "create";
    if (code.includes(".update") || code.includes(".edit")) return "edit";
    if (code.includes(".delete") || code.includes(".remove")) return "delete";
    if (code.includes(".view") || code.includes(".read")) return "view";
    return null;
};

async function updateUserAccessRoute(
    fastify: FastifyInstance,
    options: FastifyPluginOptions
) {
    fastify.put(
        "/:id",
        {
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
                const companyId = request.admin?.companyId;

                if (!companyId) {
                    return reply.status(401).send({
                        success: false,
                        message: "Company missing.",
                    });
                }

                const { id } = request.params as { id: string };
                const { permissionIds } = request.body as Body;

                const user = await fastify.prisma.user.findFirst({
                    where: {
                        id,
                        companyId,
                        deletedAt: null,
                    },
                });

                if (!user) {
                    return reply.status(404).send({
                        success: false,
                        message: "User not found.",
                    });
                }

                await fastify.prisma.$transaction(async (tx) => {
                    // 1. Validate the requested permission ids exist.
                    const allPermissions = await tx.permission.findMany({
                        where: {
                            id: { in: permissionIds || [] },
                        },
                        select: { id: true, code: true },
                    });
                    if (allPermissions.length !== (permissionIds || []).length) {
                        const err: any = new Error("One or more permissions are invalid.");
                        err.status = 400;
                        throw err;
                    }

                    // 2. Build the authoritative JSON policy from the requested set:
                    //    - pageAccess: unique modules referenced by any permission
                    //    - actionPermissions: module -> { create, edit, delete, export }
                    const pageAccess = [
                        ...new Set(
                            allPermissions
                                .map((p) => PREFIX_TO_MODULE[p.code.split(".")[0]])
                                .filter((m): m is string => Boolean(m)),
                        ),
                    ];

                    const actionPermissions: Record<string, Record<Action, boolean>> = {};
                    for (const perm of allPermissions) {
                        const module = PREFIX_TO_MODULE[perm.code.split(".")[0]];
                        if (!module) continue;
                        if (!actionPermissions[module]) {
                            actionPermissions[module] = {
                                create: false,
                                edit: false,
                                delete: false,
                                export: false,
                            };
                        }
                        const action = actionFromCode(perm.code);
                        if (action && action !== "view") {
                            actionPermissions[module][action] = true;
                        }
                    }

                    // 3. Persist as a custom override (hasOverride: true) so the new
                    //    policy takes effect through the authoritative resolution path.
                    await tx.userAccessProfile.upsert({
                        where: { userId: id },
                        create: {
                            userId: id,
                            designation: "Team Member",
                            hasOverride: true,
                            pageAccess,
                            actionPermissions,
                        },
                        update: {
                            hasOverride: true,
                            pageAccess,
                            actionPermissions,
                        },
                    });
                });

                return reply.send({
                    success: true,
                    message: "Permissions updated successfully.",
                });
            } catch (error: any) {
                if (error?.status === 400) {
                    return reply.status(400).send({
                        success: false,
                        message: error.message,
                    });
                }
                return reply.status(500).send({
                    success: false,
                    message: error.message,
                });
            }
        }
    );
}

export default updateUserAccessRoute;
