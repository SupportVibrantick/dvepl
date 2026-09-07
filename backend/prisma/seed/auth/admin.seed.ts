
import {hashPassword , comparePassword} from "../../../src/utils/hashPassword";

// The Admin account must always be able to open the permission-management UI.
// Keep this in sync with the module keys exposed by the dashboard.
const ADMIN_PAGE_ACCESS = [
    "dashboard", "companies", "branches", "departments", "teams", "designations", "cost_centers",
    "employees", "attendance", "leaves", "holidays", "shift_management", "payroll", "documents", "tasks",
    "customers", "contacts", "communication", "orders", "delivery", "vendors", "inventory", "export_orders",
    "finance", "tender_requests", "tenders", "technical_clarifications", "government_departments", "sections",
    "divisions", "sub_divisions", "reference_codes", "users", "roles", "approval_requests", "reports",
    "audit_logs", "custom_fields", "recycle_bin", "settings",
];

const ADMIN_ACTION_PERMISSIONS = { create: true, edit: true, delete: true, export: true };

export async function seedAdmin(prisma: any, companyId: string) {
    const passwordHash = await hashPassword("Admin@123");

    const adminUser = await prisma.user.upsert({
        where: {
            email: "admin@dvepl.com",
        },
        update: {
            isActive: true,
            isEmailVerified: true,
        },
        create: {
            companyId,
            name:"Admin",
            email: "admin@dvepl.com",
            passwordHash,
            isEmailVerified: true,
        },
    });

    const adminRole = await prisma.role.findFirst({
        where: {
            name: "Admin",
        },
    });

    if (!adminRole) {
        throw new Error("Admin role not found");
    }

    await prisma.userRole.upsert({
        where: {
            userId_roleId: {
                userId: adminUser.id,
                roleId: adminRole.id,
            },
        },
        update: {},
        create: {
            userId: adminUser.id,
            roleId: adminRole.id,
        },
    });

    // Backwards-compatible for databases created before user_access_profiles
    // existed, and for fresh seed runs.
    await prisma.userAccessProfile.upsert({
        where: { userId: adminUser.id },
        update: {},
        create: {
            userId: adminUser.id,
            designation: "Administrator",
            pageAccess: ADMIN_PAGE_ACCESS,
            actionPermissions: ADMIN_ACTION_PERMISSIONS,
        },
    });

    return adminUser;
}
