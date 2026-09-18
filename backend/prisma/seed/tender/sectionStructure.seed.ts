import { PrismaClient, Section, Division, SubDivision } from "@prisma/client";

const SECTIONS_STRUCTURE = [
  { secName: "Electrical & Mechanical", secCode: "SEC-EM", divName: "Power Transmission", divCode: "DIV-PT", subName: "Substation Grid Design", subCode: "SUB-SGD" },
  { secName: "Civil Infrastructure", secCode: "SEC-CI", divName: "Bridge Construction", divCode: "DIV-BC", subName: "Structural Design", subCode: "SUB-SD" },
  { secName: "Information Technology", secCode: "SEC-IT", divName: "Network Infrastructure", divCode: "DIV-NI", subName: "Fiber Optic Deployment", subCode: "SUB-FOD" },
  { secName: "Water Resource Management", secCode: "SEC-WR", divName: "Irrigation Systems", divCode: "DIV-IS", subName: "Canals Piping Layout", subCode: "SUB-CPL" },
  { secName: "Security Systems", secCode: "SEC-SS", divName: "Surveillance & CCTV", divCode: "DIV-SC", subName: "Central Control Rooms", subCode: "SUB-CCR" },
  { secName: "HVAC Projects", secCode: "SEC-HVAC", divName: "Air Conditioning Systems", divCode: "DIV-AC", subName: "Ducting Layouts", subCode: "SUB-DL" },
  { secName: "Fire Fighting Systems", secCode: "SEC-FF", divName: "Alarm Networks", divCode: "DIV-AN", subName: "Sprinkler Plumbing", subCode: "SUB-SP" },
  { secName: "Renewable Energy", secCode: "SEC-RE", divName: "Solar Plant Installation", divCode: "DIV-SPI", subName: "Inverter Station Grid", subCode: "SUB-ISG" },
  { secName: "Infrastructure Maintenance", secCode: "SEC-IM", divName: "Road Asphalt Laying", divCode: "DIV-RAL", subName: "Highway Drainage Layout", subCode: "SUB-HDL" },
  { secName: "Quality Assurance", secCode: "SEC-QA", divName: "Material Testing Labs", divCode: "DIV-MTL", subName: "Soil Compaction Audit", subCode: "SUB-SCA" }
];

export async function seedSectionStructure(
  prisma: PrismaClient,
  companyId: string,
  departmentId: string
): Promise<{
  sections: Section[];
  divisions: Division[];
  subDivisions: SubDivision[];
}> {
  console.log("🌱 Seeding 10 Sections, Divisions, and Subdivisions...");

  const sections: Section[] = [];
  const divisions: Division[] = [];
  const subDivisions: SubDivision[] = [];

  for (const item of SECTIONS_STRUCTURE) {
    // 1. Create Section
    let sec = await prisma.section.findFirst({
      where: { companyId, name: item.secName, departmentId },
    });

    if (!sec) {
      sec = await prisma.section.create({
        data: {
          companyId,
          departmentId,
          name: item.secName,
          code: item.secCode,
          isActive: true,
        },
      });
    }
    sections.push(sec);

    // 2. Create Division
    let div = await prisma.division.findFirst({
      where: { companyId, name: item.divName, sectionId: sec.id },
    });

    if (!div) {
      div = await prisma.division.create({
        data: {
          companyId,
          sectionId: sec.id,
          name: item.divName,
          code: item.divCode,
          isActive: true,
        },
      });
    }
    divisions.push(div);

    // 3. Create SubDivision
    let sub = await prisma.subDivision.findFirst({
      where: { companyId, name: item.subName, divisionId: div.id },
    });

    if (!sub) {
      sub = await prisma.subDivision.create({
        data: {
          companyId,
          divisionId: div.id,
          name: item.subName,
          code: item.subCode,
          isActive: true,
        },
      });
    }
    subDivisions.push(sub);
  }

  return {
    sections,
    divisions,
    subDivisions,
  };
}
