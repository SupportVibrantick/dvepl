import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import * as XLSX from "xlsx";
import { adminLogs } from "../../../services/logger/contextLogger";
import { hashPassword } from "../../../utils/hashPassword";

async function adminUserBulkUploadRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.post(
    "/",
    {
      schema: {
        tags: ["User"],
        summary: "Bulk Upload Users via Excel",
        description: "Process bulk upload of users using a multipart spreadsheet file.",
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["user.create"]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const fileData = await request.file();
        if (!fileData) {
          return reply.status(400).send({
            success: false,
            message: "No file uploaded. Please upload a valid Excel file.",
          });
        }

        const filename = fileData.filename.toLowerCase();
        const isExcel = filename.endsWith(".xlsx") || filename.endsWith(".xls");
        if (!isExcel) {
          return reply.status(400).send({
            success: false,
            message: "Invalid file format. Only Excel files (.xlsx, .xls) are allowed.",
          });
        }

        const buffer = await fileData.toBuffer();
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json<any>(worksheet);

        if (rows.length === 0) {
          return reply.status(400).send({
            success: false,
            message: "Spreadsheet is empty or missing data rows.",
          });
        }

        const headerMap: Record<string, string> = {
          "name": "name",
          "email": "email",
          "phone": "phone",
          "password": "password",
          "role": "role",
          "designation": "designation",
          "team": "team",
        };

        const usersList: any[] = [];
        for (const rawRow of rows) {
          const row: any = {};
          for (const key of Object.keys(rawRow)) {
            const cleanKey = key.trim().toLowerCase();
            const mappedKey = headerMap[cleanKey] || key;
            row[mappedKey] = rawRow[key];
          }
          if (row.email) {
            usersList.push({
              name: String(row.name || "").trim(),
              email: String(row.email).trim().toLowerCase(),
              phone: row.phone ? String(row.phone).trim() : null,
              password: row.password ? String(row.password) : null,
              role: row.role ? String(row.role).trim() : "",
              designation: row.designation ? String(row.designation).trim() : "Team Member",
              teamName: row.team ? String(row.team).trim() : "",
            });
          }
        }

        const companyId = (request.admin as any)?.companyId;
        if (!companyId) {
          return reply.status(401).send({
            success: false,
            message: "Company information missing.",
          });
        }

        const results = {
          successCount: 0,
          failureCount: 0,
          errors: [] as Array<{ email: string; error: string }>,
          createdUsers: [] as string[],
        };

        for (const userData of usersList) {
          try {
            // Check existing email
            const existingEmail = await fastify.prisma.user.findFirst({
              where: { email: userData.email },
            });
            if (existingEmail) {
              throw new Error(`Email '${userData.email}' already exists.`);
            }

            // Resolve role (only when explicitly provided; never auto-assign)
            let activeRole: any = null;
            if (userData.role) {
              activeRole = await fastify.prisma.role.findFirst({
                where: {
                  OR: [
                    { id: userData.role },
                    { name: { equals: userData.role, mode: "insensitive" } }
                  ],
                  companyId,
                  deletedAt: null
                }
              });
              if (!activeRole) {
                throw new Error(`Role '${userData.role}' not found.`);
              }
            }

            // Resolve team
            let resolvedTeamId: string | null = null;
            if (userData.teamName) {
              const foundTeam = await fastify.prisma.team.findFirst({
                where: {
                  name: { equals: userData.teamName, mode: "insensitive" },
                  isActive: true,
                },
              });
              if (foundTeam) {
                resolvedTeamId = foundTeam.id;
              }
            }

            const passwordToHash = userData.password || "Dvepl@2026";
            const passwordHash = await hashPassword(passwordToHash);

            const createdUser = await fastify.prisma.$transaction(async (tx) => {
              const user = await tx.user.create({
                data: {
                  companyId,
                  name: userData.name,
                  email: userData.email,
                  phone: userData.phone,
                  passwordHash,
                  isActive: true,
                  isEmailVerified: false,
                  isPhoneVerified: false,
                },
              });

              if (activeRole) {
                await tx.userRole.create({
                  data: {
                    userId: user.id,
                    roleId: activeRole.id,
                  },
                });
              }

              // Create a brand new employee and contact record automatically
              const nameParts = (userData.name || "").trim().split(/\s+/);
              const firstName = nameParts[0] || "Employee";
              const lastName = nameParts.slice(1).join(" ") || "Member";

              let designationId: string | null = null;
              if (userData.designation) {
                const foundDes = await tx.designation.findFirst({
                  where: {
                    title: { equals: userData.designation, mode: "insensitive" },
                    deletedAt: null
                  }
                });
                if (foundDes) {
                  designationId = foundDes.id;
                }
              }

              const employeeCount = await tx.employee.count({
                where: { companyId }
              });
              const employeeCode = `EMP-${(employeeCount + 1).toString().padStart(4, "0")}`;

              const newEmp = await tx.employee.create({
                data: {
                  companyId,
                  userId: user.id,
                  employeeCode,
                  firstName,
                  lastName,
                  designationId,
                  teamId: resolvedTeamId,
                  status: "ACTIVE"
                }
              });

              await tx.employeeContact.create({
                data: {
                  employeeId: newEmp.id,
                  type: "EMAIL",
                  value: userData.email,
                  isPrimary: true
                }
              });

              if (userData.phone) {
                await tx.employeeContact.create({
                  data: {
                    employeeId: newEmp.id,
                    type: "PHONE",
                    value: userData.phone,
                    isPrimary: true
                  }
                });
              }

              return user;
            });

            const rolePageAccess = Array.isArray(activeRole?.pageAccess)
              ? (activeRole.pageAccess as string[])
              : [];
            const roleActionPermissions =
              activeRole?.actionPermissions &&
              typeof activeRole.actionPermissions === "object" &&
              !Array.isArray(activeRole.actionPermissions) &&
              Object.keys(activeRole.actionPermissions).length > 0
                ? activeRole.actionPermissions
                : null;

            await fastify.prisma.userAccessProfile.create({ data: {
              userId: createdUser.id,
              designation: userData.designation,
              pageAccess: rolePageAccess.length > 0
                ? rolePageAccess
                : ["dashboard", "vendors", "orders"],
              actionPermissions: roleActionPermissions || {
                dashboard: { create: false, edit: false, delete: false, export: false },
                vendors: { create: true, edit: true, delete: false, export: true },
                orders: { create: true, edit: true, delete: false, export: true },
              }
            }});

            results.createdUsers.push(createdUser.email);
            results.successCount++;
          } catch (err: any) {
            results.failureCount++;
            results.errors.push({
              email: userData.email,
              error: err.message || "Unknown error processing record.",
            });
          }
        }

        adminLogs.info("Bulk user upload processed", {
          successCount: results.successCount,
          failureCount: results.failureCount,
        });

        return reply.status(results.failureCount > 0 ? 207 : 200).send({
          success: true,
          message: `Bulk upload completed. Success: ${results.successCount}, Failures: ${results.failureCount}`,
          data: results,
        });
      } catch (error: any) {
        adminLogs.error("Bulk upload users route failed", { error });
        return reply.status(500).send({
          success: false,
          message: "Server error during bulk upload processing.",
        });
      }
    }
  );
}

export default adminUserBulkUploadRoutes;
