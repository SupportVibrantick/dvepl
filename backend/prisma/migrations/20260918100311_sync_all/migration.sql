/*
  Warnings:

  - You are about to drop the column `governmentDepartmentId` on the `sections` table. All the data in the column will be lost.
  - You are about to drop the column `governmentDepartmentId` on the `tenders` table. All the data in the column will be lost.
  - You are about to drop the `government_departments` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "government_departments" DROP CONSTRAINT "government_departments_companyId_fkey";

-- DropForeignKey
ALTER TABLE "sections" DROP CONSTRAINT "sections_governmentDepartmentId_fkey";

-- DropForeignKey
ALTER TABLE "tenders" DROP CONSTRAINT "tenders_governmentDepartmentId_fkey";

-- AlterTable
ALTER TABLE "sections" DROP COLUMN "governmentDepartmentId";

-- AlterTable
ALTER TABLE "tenders" DROP COLUMN "governmentDepartmentId";

-- DropTable
DROP TABLE "government_departments";
