import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../utils/hashPassword";

function isStudioActive(status: unknown): boolean {
  if (status === null || status === undefined) return true;
  if (typeof status === "number") return status === 1;
  const s = String(status).trim().toLowerCase();
  return s === "1" || s === "true" || s === "active";
}

const DEFAULT_PASSWORD =
  process.env.QUOTE_TENDER_STAFF_DEFAULT_PASSWORD || "Change@123";

/**
 * Syncs portal `/staff.php` records into DVEPL `User` rows so they appear in
 * Settings → Manage Users (and on the HRMS Employees page via the auto-created
 * Employee record, mirroring the regular user-creation flow).
 *
 * - Business key: email (unique), falling back to phone (unique).
 * - Existing users are just updated (name / phone / active state).
 * - New users get the portal role matched by `role_name`, else a default role.
 */
export async function syncStaffToUsers(
  prisma: PrismaClient,
  companyId: string,
  staff: any[]
) {
  const syncedUsers: any[] = [];
  const createdUserCounts = { created: 0, updated: 0, skipped: 0 };

  const defaultRole = await pickDefaultRole(prisma, companyId);

  for (const record of staff) {
    const email = String(record.email || "").trim().toLowerCase();
    const phone = String(record.mobile || record.phone || "").trim();
    const portalName = String(record.username || record.name || "").trim();

    if (!email && !phone) {
      createdUserCounts.skipped++;
      continue;
    }

    const existing = await findUserByEmailOrPhone(prisma, email, phone);

    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          ...(portalName ? { name: portalName } : {}),
          ...(phone ? { phone } : {}),
          isActive: isStudioActive(record.status),
        },
      });

      const existingRoles = await prisma.userRole.findMany({
        where: { userId: existing.id },
      });
      if (existingRoles.length === 0) {
        const role =
          (await matchRole(
            prisma,
            companyId,
            record.role_name || record.role_id
          )) || defaultRole;
        if (role) {
          await prisma.userRole.create({
            data: { userId: existing.id, roleId: role.id },
          });
        }
      }

      createdUserCounts.updated++;
      syncedUsers.push(updated);
      continue;
    }

    const passwordHash = await hashPassword(
      record.password
        ? String(record.password)
        : DEFAULT_PASSWORD
    );

    const role = await matchRole(prisma, companyId, record.role_name || record.role_id);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          companyId,
          name: portalName || email || phone || "Portal Staff",
          email,
          phone: phone || null,
          passwordHash,
          isActive: isStudioActive(record.status),
          isEmailVerified: true,
          isPhoneVerified: Boolean(phone),
        },
      });

      const assignedRole = role || defaultRole;
      if (assignedRole) {
        await tx.userRole.create({
          data: {
            userId: created.id,
            roleId: assignedRole.id,
          },
        });
      }

      if (phone) {
        const existingContact = await tx.employeeContact.findFirst({
          where: { type: "PHONE", value: phone },
        });
        if (existingContact) {
          await tx.employee.update({
            where: { id: existingContact.employeeId },
            data: { userId: created.id },
          });
          return created;
        }
      }

      const nameParts = (portalName || email || "Portal Staff").trim().split(/\s+/);
      const firstName = nameParts[0] || "Staff";
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

      const employeeCount = await tx.employee.count({ where: { companyId } });
      const employeeCode = `EMP-${(employeeCount + 1).toString().padStart(4, "0")}`;

      const emp = await tx.employee.create({
        data: {
          companyId,
          userId: created.id,
          employeeCode,
          firstName,
          lastName,
          status: "ACTIVE",
        },
      });

      await tx.employeeContact.createMany({
        data: [
          {
            employeeId: emp.id,
            type: "EMAIL" as const,
            value: email,
            isPrimary: true,
          },
          ...(phone
            ? [{ employeeId: emp.id, type: "PHONE" as const, value: phone, isPrimary: true }]
            : []),
        ],
      });

      return created;
    });

    const mainRole = role || defaultRole as any;
    const rolePageAccess = Array.isArray(mainRole?.pageAccess)
      ? (mainRole.pageAccess as string[])
      : [];
    const roleActionPermissions =
      mainRole?.actionPermissions &&
      typeof mainRole.actionPermissions === "object" &&
      !Array.isArray(mainRole.actionPermissions) &&
      Object.keys(mainRole.actionPermissions).length > 0
        ? mainRole.actionPermissions
        : null;

    await prisma.userAccessProfile.create({
      data: {
        userId: user.id,
        designation:
          String(record.role_name || "").trim() || "Team Member",
        pageAccess:
          rolePageAccess.length > 0
            ? rolePageAccess
            : ["dashboard", "orders"],
        actionPermissions:
          roleActionPermissions || {
            dashboard: { create: false, edit: false, delete: false, export: false },
            orders: { create: true, edit: true, delete: false, export: true },
          },
      },
    });

    createdUserCounts.created++;
    syncedUsers.push(user);
  }

  return { syncedUsers, createdUserCounts };
}

async function findUserByEmailOrPhone(
  prisma: PrismaClient,
  email: string,
  phone: string
) {
  if (email) {
    const byEmail = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (byEmail) return byEmail;
  }
  if (phone) {
    return prisma.user.findFirst({
      where: { phone: { equals: phone, mode: "insensitive" } },
    });
  }
  return null;
}

async function pickDefaultRole(prisma: PrismaClient, companyId: string) {
  const named = await prisma.role.findFirst({
    where: {
      companyId,
      deletedAt: null,
      name: { in: ["Staff", "Employee", "Team Member"] },
    },
  });
  if (named) return named;

  const adminNames = ["admin", "administrator", "super admin", "superadmin"];
  const nonAdmin = await prisma.role.findFirst({
    where: {
      companyId,
      deletedAt: null,
      NOT: { name: { in: adminNames, mode: "insensitive" } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (nonAdmin) return nonAdmin;

  return prisma.role.findFirst({
    where: { companyId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

async function matchRole(
  prisma: PrismaClient,
  companyId: string,
  roleValue: unknown
) {
  if (!roleValue) return null;
  return prisma.role.findFirst({
    where: {
      companyId,
      deletedAt: null,
      OR: [
        { id: String(roleValue) },
        { name: { equals: String(roleValue), mode: "insensitive" } },
      ],
    },
  });
}