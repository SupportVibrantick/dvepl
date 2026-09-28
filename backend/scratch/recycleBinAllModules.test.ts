import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { hardDelete } from "../src/utils/fkSafeHardDelete";
import { recycleBinModelMap } from "../src/routes/admin/recycleBin";

const ROLLBACK = "__ROLLBACK__";
const qi = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Model -> table name, straight from the schema Prisma generated the client from. */
function loadTableMap(): Map<string, string> {
  const schemaPath = path.join(
    path.dirname(require.resolve("@prisma/client")),
    "..",
    "..",
    ".prisma",
    "client",
    "schema.prisma"
  );
  const schema = fs.readFileSync(schemaPath, "utf8");
  const map = new Map<string, string>();
  const blocks = schema.split(/^model\s+/m).slice(1);

  for (const block of blocks) {
    const name = block.slice(0, block.indexOf("{")).trim();
    const mapped = block.match(/@@map\("([^"]+)"\)/);
    map.set(name, mapped ? mapped[1] : name);
  }

  // Prisma's delegate name is the model name with a lower-cased first letter
  const byDelegate = new Map<string, string>();
  for (const [model, table] of map) {
    byDelegate.set(model[0].toLowerCase() + model.slice(1), table);
  }

  return byDelegate;
}

type ModuleReport = { module: string; status: "PASS" | "FAIL" | "SKIP"; note: string };

async function cloneAsDeleted(
  table: string,
  primaryKey: string,
  sourceId: string
): Promise<string> {
  const columnRows = (await prisma.$queryRawUnsafe(
    `SELECT column_name::text AS "name", data_type::text AS "type"
     FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    table
  )) as { name: string; type: string }[];

  const uniqueColumns = new Map<string, "suffix" | "null" | "keep">(
    (
      (await prisma.$queryRawUnsafe(
        `SELECT att.attname::text AS "name",
                att.attnotnull AS "notNull",
                EXISTS (
                  SELECT 1 FROM pg_constraint con
                  WHERE con.contype = 'f' AND con.conrelid = cls.oid
                    AND att.attnum = ANY (con.conkey)
                ) AS "isForeignKey"
         FROM pg_index idx
         JOIN pg_class cls ON cls.oid = idx.indrelid
         JOIN pg_namespace ns ON ns.oid = cls.relnamespace
         JOIN LATERAL unnest(idx.indkey) AS keys(attnum) ON TRUE
         JOIN pg_attribute att ON att.attrelid = cls.oid AND att.attnum = keys.attnum
         JOIN information_schema.columns cols
           ON cols.table_schema = ns.nspname
          AND cols.table_name = cls.relname
          AND cols.column_name = att.attname
         WHERE idx.indisunique AND ns.nspname = 'public' AND cls.relname = $1
           AND cols.data_type IN ('text', 'character varying', 'timestamp without time zone', 'date')`,
        table
      )) as { name: string; notNull: boolean; isForeignKey: boolean }[]
    )
      .filter((row) => row.name !== primaryKey)
      .map((row) => [
        row.name,
        row.isForeignKey
          ? row.notNull
            ? "keep"
            : "null"
          : row.name === "date"
            ? "shiftDate"
            : "suffix",
      ])
  );

  const usesSuffix = [...uniqueColumns.values()].includes("suffix");
  const usesShiftedDate = uniqueColumns.get("date") === "shiftDate";
  const copies = columnRows.filter((column) => column.name !== primaryKey);
  const expression = (column: string) => {
    if (column === "deletedAt") return "now()";
    const strategy = uniqueColumns.get(column);
    if (strategy === "suffix") return `${qi(column)}::text || $2`;
    if (strategy === "shiftDate") {
      return `${qi(column)} + (interval '1 minute' * $${usesSuffix ? 3 : 2})`;
    }
    if (strategy === "null") return "NULL";
    return `source.${qi(column)}`;
  };

  const params: unknown[] = [sourceId];
  if (usesSuffix) params.push(`-${Math.random().toString(36).slice(2, 8)}`);
  if (usesShiftedDate) params.push(1 + Math.floor(Math.random() * 100000));

  const rows = await prisma.$queryRawUnsafe(
    `INSERT INTO ${qi(table)} (${qi(primaryKey)}, ${copies.map((c) => qi(c.name)).join(", ")})
     SELECT gen_random_uuid()::text, ${copies.map((c) => expression(c.name)).join(", ")}
     FROM ${qi(table)} AS source
     WHERE source.${qi(primaryKey)} = $1
     RETURNING ${qi(primaryKey)} AS "id"`,
    ...params
  );

  if (!rows.length) throw new Error(`no source row in ${table}`);
  return String((rows[0] as { id: string }).id);
}

/** Fills the tables that are empty locally so every recycle bin module gets exercised. */
async function seedEmptyTables(): Promise<void> {
  const company = await prisma.company.findFirst();
  const user = await prisma.user.findFirst();
  if (!company || !user) return;

  if ((await prisma.employee.count()) === 0) {
    await prisma.employee.create({
      data: {
        companyId: company.id,
        employeeCode: `SEED-${Math.random().toString(36).slice(2, 8)}`,
        firstName: "Seed",
        lastName: "Employee",
        status: "ACTIVE",
      },
    });
  }
  const employee = await prisma.employee.findFirst();
  if (!employee) return;

  if ((await prisma.employeeEmergencyContact.count()) === 0) {
    await prisma.employeeEmergencyContact.create({
      data: { employeeId: employee.id, name: "Seed", relationship: "Sibling", phone: "999" },
    });
  }
  if ((await prisma.employeeEducation.count()) === 0) {
    await prisma.employeeEducation.create({
      data: { employeeId: employee.id, degree: "B.Tech", institution: "Seed University" },
    });
  }
  if ((await prisma.employeeExperience.count()) === 0) {
    await prisma.employeeExperience.create({
      data: { employeeId: employee.id, companyName: "Seed Ltd", designation: "Engineer" },
    });
  }
  if ((await prisma.employeeDocument.count()) === 0) {
    await prisma.employeeDocument.create({
      data: {
        employeeId: employee.id,
        documentType: "AADHAR",
        fileName: "aadhaar.pdf",
        fileUrl: "/uploads/aadhaar.pdf",
      },
    });
  }
  if ((await prisma.employeeShift.count()) === 0) {
    const shift =
      (await prisma.shift.findFirst()) ??
      (await prisma.shift.create({
        data: { name: `Seed Shift ${Date.now()}`, startTime: "09:00", endTime: "18:00" },
      }));
    await prisma.employeeShift.create({
      data: { employeeId: employee.id, shiftId: shift.id, effectiveFrom: new Date() },
    });
  }
  if ((await prisma.attendance.count()) === 0) {
    await prisma.attendance.create({ data: { employeeId: employee.id, date: new Date() } });
  }
  if ((await prisma.leave.count()) === 0) {
    await prisma.leave.create({
      data: {
        employeeId: employee.id,
        leaveType: "CASUAL",
        fromDate: new Date(),
        toDate: new Date(),
      },
    });
  }
  if ((await prisma.salary.count()) === 0) {
    await prisma.salary.create({
      data: { employeeId: employee.id, effectiveFrom: new Date(), basic: 1000, ctc: 1000 },
    });
  }
  if ((await prisma.communicationHistory.count()) === 0) {
    const customer = await prisma.customer.findFirst();
    if (customer) {
      await prisma.communicationHistory.create({
        data: { customerId: customer.id, type: "EMAIL", subject: "Seed" },
      });
    }
  }
  if ((await prisma.payment.count()) === 0) {
    await prisma.payment.create({
      data: {
        companyId: company.id,
        paymentNo: `SEED-${Math.random().toString(36).slice(2, 8)}`,
        amount: 100,
        receivedById: user.id,
      },
    });
  }
}

async function main() {
  await seedEmptyTables();

  const tableMap = loadTableMap();
  const admin = await prisma.user.findFirst();
  if (!admin) throw new Error("no admin user");

  const reports: ModuleReport[] = [];

  for (const [module, config] of recycleBinModelMap) {
    const delegate = (prisma as any)[config.delegate];
    const table = tableMap.get(config.delegate);
    if (!delegate || !table) {
      reports.push({ module, status: "SKIP", note: "no delegate/table" });
      continue;
    }

    const pkRows = await prisma.$queryRawUnsafe(
      `SELECT att.attname::text AS "name"
       FROM pg_index idx
       JOIN pg_class cls ON cls.oid = idx.indrelid
       JOIN pg_namespace ns ON ns.oid = cls.relnamespace
       JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS keys(attnum, ord) ON TRUE
       JOIN pg_attribute att ON att.attrelid = cls.oid AND att.attnum = keys.attnum
       WHERE idx.indisprimary AND ns.nspname='public' AND cls.relname=$1 AND keys.ord=1`,
      table
    );
    const primaryKey = String((pkRows[0] as { name: string }).name);

    const source = await delegate.findFirst({ select: { [primaryKey]: true } });
    if (!source) {
      reports.push({ module, status: "SKIP", note: `${table} is empty` });
      continue;
    }

    let clonedId: string;
    try {
      clonedId = await cloneAsDeleted(table, primaryKey, (source as any)[primaryKey]);
    } catch (error) {
      reports.push({
        module,
        status: "SKIP",
        note: `clone failed: ${String((error as Error).message).split("\n").filter(Boolean).slice(0, 3).join(" ")}`,
      });
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (config.permanentDelete) {
          await config.permanentDelete({ prisma: tx } as any, clonedId, admin.id);
        }
        await hardDelete({
          prisma: tx,
          delegate: config.delegate,
          id: clonedId,
          adminId: admin.id,
          reassignTables: config.reassignTables,
        });
        const still = await tx[config.delegate].findMany({
          where: { id: clonedId },
          select: { id: true },
        });
        if (still.length) throw new Error("record survived the delete");
        throw new Error(ROLLBACK);
      });
      reports.push({ module, status: "PASS", note: table });
    } catch (error: any) {
      const passed = error.message === ROLLBACK;
      reports.push({
        module,
        status: passed ? "PASS" : "FAIL",
        note: passed ? table : error.message.split("\n").filter(Boolean).slice(0, 2).join(" "),
      });
      if (!passed) {
        await prisma
          .$executeRawUnsafe(
            `DELETE FROM ${qi(table)} WHERE ${qi(primaryKey)} = $1`,
            clonedId
          )
          .catch(() => undefined);
      }
    }
  }

  for (const report of reports) {
    console.log(`${report.status.padEnd(5)} ${report.module.padEnd(24)} ${report.note}`);
  }
  console.log(
    `\n${reports.filter((r) => r.status === "PASS").length} passed, ` +
      `${reports.filter((r) => r.status === "FAIL").length} failed, ` +
      `${reports.filter((r) => r.status === "SKIP").length} skipped`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
