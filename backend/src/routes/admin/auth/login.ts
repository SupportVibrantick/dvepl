import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { adminLogs } from "../../../services/logger/contextLogger";
import { loginSchema } from "../../../schemas/admin/auth/auth.schema";
import { getExpiryTime } from "../../../utils/getExpirytime";

const jwtSecret = process.env.JWT_SECRET;
const jwtExpiration = process.env.JWT_EXPIRATION || "30d";

if (!jwtSecret) {
  throw new Error("JWT_SECRET environment variable is not set");
}

async function adminLoginRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
) {
  fastify.post(
    "/",
    {
      schema: {
        tags: ["Auth"],
        summary: "Admin Login",
        description: "Login using email and password",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validationResult = loginSchema.safeParse(request.body);

        if (!validationResult.success) {
          adminLogs.error("Invalid data for login", {
            error: validationResult.error,
          });

          return reply.status(400).send({
            success: false,
            message: "Invalid data for auth.",
            error:
              process.env.NODE_ENV === "development"
                ? validationResult.error.issues
                : "Invalid credentials",
          });
        }

        const { email, password } = validationResult.data;

        const existingUser = await fastify.prisma.user.findFirst({
          where: {
            email,
            isActive: true,
          },
          include: {
            company: true,
            userRoles: {
              include: {
                role: true,
              },
            },
            accessProfile: true,
          },
        });

        if (!existingUser) {
          return reply.status(404).send({
            success: false,
            message: "Invalid email address for authentication",
          });
        }

        const isPasswordValid = await bcrypt.compare(
          password,
          existingUser.passwordHash,
        );

        if (!isPasswordValid) {
          return reply.status(403).send({
            success: false,
            message: "Invalid password",
          });
        }
        const roles = existingUser.userRoles.map((ur) => ur.role.name);

        const token = jwt.sign(
          {
            userId: existingUser.id,
            companyId: existingUser.companyId,
            roles,
            tokenVersion: (existingUser as any).tokenVersion,
          },
          jwtSecret,
          {
            expiresIn: jwtExpiration,
          },
        );
        const expiresAt = getExpiryTime(jwtExpiration);

        adminLogs.info("Admin login attempt", {
          adminId: existingUser.id,
          email: existingUser.email,
        });

        const up = existingUser.accessProfile;
        const mainRole = existingUser.userRoles[0]?.role as any;
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

        return reply.status(200).send({
          success: true,
          message: "Login successfully",
          token,
          expiresAt,

          user: {
            id: existingUser.id,
            name: existingUser.name,
            email: existingUser.email,
            company: existingUser.company?.name ?? null,
            roles,
            designation: up?.designation || "Team Member",
            pageAccess: resolvedPageAccess,
            actionPermissions: resolvedActionPermissions,
          },
        });
      } catch (error: any) {
        adminLogs.error("Admin login failed", {
          error,
        });

        return reply.status(500).send({
          success: false,
          message: "Server error during login. Please try again later.",
          details:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );
}

export default adminLoginRoutes;
