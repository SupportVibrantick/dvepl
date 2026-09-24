import { PrismaClient } from "@prisma/client";

/**
 * Syncs portal `/roles.php` records into DVEPL `Role` rows.
 *
 * Roles are keyed by `name` (unique per company) and upserted:
 * - New roles are created from the portal's name / description.
 * - Existing roles are only backfilled with a description when they do not
 *   already have one, so local permission/page-access configuration is never
 *   overwritten by a re-sync.
 */
export async function syncRolesFromPortal(
  prisma: PrismaClient,
  companyId: string,
  portalRoles: any[]
) {
  const syncedRoles: any[] = [];
  const counts = { created: 0, updated: 0, skipped: 0 };

  for (const record of portalRoles) {
    const name = String(record.role_name || record.name || "").trim();
    if (!name) {
      counts.skipped++;
      continue;
    }

    const description =
      String(record.description || "").trim() || null;

    let role = await prisma.role.findFirst({
      where: { companyId, name, deletedAt: null },
    });

    if (role) {
      if (role.description == null && description) {
        role = await prisma.role.update({
          where: { id: role.id },
          data: { description },
        });
      }
      counts.updated++;
      syncedRoles.push(role);
      continue;
    }

    role = await prisma.role.create({
      data: {
        companyId,
        name,
        description,
        isSystem: false,
        pageAccess: [],
        actionPermissions: {},
      },
    });

    counts.created++;
    syncedRoles.push(role);
  }

  return { syncedRoles, createdCounts: counts };
}