import { Prisma, PrismaClient } from "@prisma/client";

type EmployeeCodeClient =
  | Pick<PrismaClient, "employee">
  | Prisma.TransactionClient;

const CODE_PREFIX = "EMP-";
const CODE_PATTERN = new RegExp(`^${CODE_PREFIX}(\\d+)$`);

const formatEmployeeCode = (sequence: number): string =>
  `${CODE_PREFIX}${String(sequence).padStart(4, "0")}`;

/**
 * Returns an unused `EMP-####` code.
 *
 * `Employee.employeeCode` is globally unique, but the creators used to derive
 * the next code from `employee.count({ where: { companyId } }) + 1`. That count
 * only covers the current company, so the first employee created for any second
 * company collided with the `EMP-0001` of the first company, and any company
 * with a gap in its numbering (a hard-deleted employee, for example) collided
 * too. The collision aborts the whole request with a P2002 unique-constraint
 * error, which is why syncing employees from the portal failed in production
 * while working locally.
 *
 * The sequence therefore continues past every `EMP-<n>` already stored in any
 * company, skipping codes that are taken or reserved by the caller.
 */
export async function nextEmployeeCode(
  prisma: EmployeeCodeClient,
  reserved: Set<string> = new Set()
): Promise<string> {
  const rows = await prisma.employee.findMany({
    select: { employeeCode: true },
  });

  const used = new Set<string>(rows.map((row) => row.employeeCode));

  let sequence = 1;
  for (const row of rows) {
    const match = CODE_PATTERN.exec(row.employeeCode);
    if (match) {
      sequence = Math.max(sequence, Number(match[1]) + 1);
    }
  }

  let code = formatEmployeeCode(sequence);
  while (used.has(code) || reserved.has(code)) {
    sequence += 1;
    code = formatEmployeeCode(sequence);
  }

  reserved.add(code);
  return code;
}
