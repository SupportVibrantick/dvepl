import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { adminLogs } from "../../../../services/logger/contextLogger";

async function readProfileRoute(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
) {
  fastify.get(
    "/",
    {
      preHandler: [fastify.verifyToken],
      schema: {
        tags: ["Auth"],
        summary: "Get Logged-in User Profile",
        description: "Returns the profile of the currently logged-in user.",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request.admin as any).id;

        console.log("profile api ", userId); //undefined

        const user = await fastify.prisma.user.findUnique({
          where: {
            id: userId,
          },
          include: {
            company: true,
            employee: {
              include: {
                branch: true,
                designation: true,
                department: true,
              },
            },
            userRoles: {
              include: {
                role: true,
              },
            },
            accessProfile: true,
          },
        });

        if (!user || user.deletedAt) {
          return reply.status(404).send({
            success: false,
            message: "User not found.",
          });
        }

        const up = user.accessProfile;
        const mainRole = user.userRoles[0]?.role as any;
        const hasOverride = up?.hasOverride ?? false;

        const resolvedPageAccess = hasOverride
          ? (up?.pageAccess as string[]) || []
          : Array.isArray(mainRole?.pageAccess) && (mainRole.pageAccess as any[]).length > 0
            ? (mainRole.pageAccess as string[])
            : (up?.pageAccess as string[]) || [];

        const resolvedActionPermissions = hasOverride
          ? up?.actionPermissions || { create: true, edit: true, delete: false, export: true }
          : mainRole?.actionPermissions && Object.keys(mainRole.actionPermissions).length > 0
            ? mainRole.actionPermissions
            : up?.actionPermissions || { create: true, edit: true, delete: false, export: true };

        adminLogs.info("Profile fetched", {
          userId,
        });

        return reply.status(200).send({
          success: true,
          message: "Profile fetched successfully.",
          data: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            employeeCode: user.employee?.employeeCode || null,
            company: user.company,
            branch: user.employee?.branch || null,
            designation: up?.designation || user.employee?.designation?.title || "Team Member",
            department: user.employee?.department || null,
            roles: user.userRoles.map((r) => r.role.name),
            pageAccess: resolvedPageAccess,
            actionPermissions: resolvedActionPermissions,
          },
        });
      } catch (error: any) {
        adminLogs.error("Failed to fetch profile", {
          error,
        });

        return reply.status(500).send({
          success: false,
          message: "Server error while fetching profile.",
          details:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );
}

export default readProfileRoute;
