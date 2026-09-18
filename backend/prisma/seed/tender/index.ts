import { PrismaClient } from "@prisma/client";
import { seedSectionStructure } from "./sectionStructure.seed";

interface SeedTenderParams {
  companyId: string;
}

/**
 * Coordinates and seeds the Section/Division/Subdivision structure.
 */
export async function seedTender(
  prisma: PrismaClient,
  { companyId }: SeedTenderParams
): Promise<void> {
  console.log("🌱 Starting Structure Seeds (Sections/Divisions)...");

  // 1. Resolve basic HRMS / Org / Auth relationships
  const departments = await prisma.department.findMany({
    where: { branch: { companyId } },
  });

  if (departments.length === 0) {
    console.log("⚠️ Organization seeds are missing. Skipping Structure Seeding.");
    return;
  }

  const targetDept = departments[0];

  // 2. Seed 10 Sections, Divisions, Subdivisions
  await seedSectionStructure(
    prisma,
    companyId,
    targetDept.id
  );

  console.log("✅ Structure Seeding Completed.");
}

