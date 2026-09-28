import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { adminLogs } from "../../../services/logger/contextLogger";

import { createEmployeeSchema } from "../../../schemas/admin/employee/employee.schema";

async function createEmployeeRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
) {
  fastify.post(
    "/",

    {
      schema: {
        tags: ["Employee"],
        summary: "Create Employee",
        description: "Create a new employee",
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["employee.create"]),
      ],
    },

    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validationResult = createEmployeeSchema.safeParse(request.body);

        if (!validationResult.success) {
          adminLogs.error("Invalid employee data", {
            error: validationResult.error,
          });

          return reply.status(400).send({
            success: false,
            message: "Invalid employee data.",
            error: validationResult.error.issues,
          });
        }

        const data = validationResult.data;
        const companyId = request.user?.companyId;

        if (!companyId) {
          return reply.status(401).send({
            success: false,
            message: "Company not found in authenticated user.",
          });
        }

        // Company Validation
        const company = await fastify.prisma.company.findUnique({
          where: {
            id: companyId,
          },
        });

        if (!company || company.deletedAt) {
          return reply.status(404).send({
            success: false,
            message: "Company not found.",
          });
        }

        // Branch Validation
        if (data.branchId) {
          const branch = await fastify.prisma.branch.findUnique({
            where: {
              id: data.branchId,
            },
          });

          if (!branch || branch.deletedAt) {
            return reply.status(404).send({
              success: false,
              message: "Branch not found.",
            });
          }
        }

        // Department Validation
        if (data.departmentId) {
          const department = await fastify.prisma.department.findUnique({
            where: {
              id: data.departmentId,
            },
          });

          if (!department || department.deletedAt) {
            return reply.status(404).send({
              success: false,
              message: "Department not found.",
            });
          }
        }

        // Team Validation
        if (data.teamId) {
          const team = await fastify.prisma.team.findUnique({
            where: {
              id: data.teamId,
            },
          });

          if (!team || team.deletedAt) {
            return reply.status(404).send({
              success: false,
              message: "Team not found.",
            });
          }
        }

        // Designation Validation
        if (data.designationId) {
          const designation = await fastify.prisma.designation.findUnique({
            where: {
              id: data.designationId,
            },
          });

          if (!designation || designation.deletedAt) {
            return reply.status(404).send({
              success: false,
              message: "Designation not found.",
            });
          }
        }

        // Reporting Manager Validation
        if (data.reportsToId) {
          const manager = await fastify.prisma.employee.findUnique({
            where: {
              id: data.reportsToId,
            },
          });

          if (!manager || manager.deletedAt) {
            return reply.status(404).send({
              success: false,
              message: "Reporting manager not found.",
            });
          }
        }

        // Employee Code Validation
        const existingEmployee = await fastify.prisma.employee.findUnique({
          where: {
            employeeCode: data.employeeCode,
          },
        });

        if (existingEmployee) {
          return reply.status(409).send({
            success: false,
            message: "Employee code already exists.",
          });
        }

        const { email, ...employeeData } = data as any;
        // `Employee.lastName` is a non-nullable column, so an omitted last name
        // is stored as an empty string rather than rejected.
        if (employeeData.lastName === undefined) {
          employeeData.lastName = "";
        }

        const employee = await fastify.prisma.$transaction(async (tx) => {
          const emp = await tx.employee.create({
            data: {
              ...employeeData,
              companyId,
            },
          });

          if (email) {
            await tx.employeeContact.create({
              data: {
                employeeId: emp.id,
                type: "EMAIL",
                value: email,
                isPrimary: true,
              },
            });

            // Check if user exists with this email and link
            const existingUser = await tx.user.findFirst({
              where: {
                email: {
                  equals: email,
                  mode: "insensitive",
                },
                deletedAt: null,
              },
            });

            if (existingUser) {
              await tx.employee.update({
                where: {
                  id: emp.id,
                },
                data: {
                  userId: existingUser.id,
                },
              });
            }
          }

          return emp;
        });

        adminLogs.info("Employee created successfully", {
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
        });

        return reply.status(201).send({
          success: true,
          message: "Employee created successfully.",
          data: employee,
        });
      } catch (error: any) {
        adminLogs.error("Employee creation failed", {
          error,
        });

        return reply.status(500).send({
          success: false,
          message: "Server error while creating employee.",
          details:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );
}

export default createEmployeeRoutes;
