/**
 * Generic, foreign-key aware hard delete for records in the recycle bin.
 *
 * Prisma's `onDelete: Restrict` (the default for required relations) turns a
 * permanent delete into a foreign key violation as soon as any dependent row
 * still points at the record. Instead of hand-maintaining a child list per
 * model, this helper:
 *
 *   1. attempts the delete through the Prisma delegate;
 *   2. reads the blocking constraint out of the error;
 *   3. resolves the blocking rows - null them out when the FK column is
 *      nullable, re-point them at the acting admin when configured, and
 *      otherwise recursively delete them (children first, one level at a
 *      time, always using concrete row ids).
 *
 * `CASCADE` / `SET NULL` relations are left to the database.
 */

type PrismaLike = any;

type DeleteRule =
  | "CASCADE"
  | "RESTRICT"
  | "NO ACTION"
  | "SET NULL"
  | "SET DEFAULT";

interface ForeignKeyInfo {
  constraintName: string;
  childTable: string;
  childColumn: string;
  childNullable: boolean;
  parentTable: string;
  parentColumn: string;
  deleteRule: DeleteRule;
}

interface ForeignKeyCatalog {
  byConstraint: Map<string, ForeignKeyInfo>;
  referencing: Map<string, ForeignKeyInfo[]>;
  primaryKeys: Map<string, string>;
}

export interface HardDeleteOptions {
  prisma: PrismaLike;
  /** Prisma model delegate, e.g. `salesOrder`. */
  delegate: string;
  id: string;
  /** Acting admin, used when a required FK has to be re-pointed. */
  adminId?: string;
  /**
   * Tables whose required inbound FKs should be re-pointed at `adminId`
   * instead of cascading a delete. Used for `user`, where dropping the user
   * must not wipe business records that merely reference them.
   */
  reassignTables?: string[];
}

const SCHEMA = "public";
const MAX_STEPS = 200;
const MAX_DEPTH = 25;
const ID_CHUNK_SIZE = 200;
const SAVEPOINT_NAME = "fk_safe_hard_delete";

const DELETE_RULES: Record<string, DeleteRule> = {
  a: "NO ACTION",
  r: "RESTRICT",
  c: "CASCADE",
  n: "SET NULL",
  d: "SET DEFAULT",
};

// Relations the database resolves on its own when the parent row goes away.
const DB_HANDLED_RULES: DeleteRule[] = ["CASCADE", "SET NULL", "SET DEFAULT"];

const FK_QUERY = `
  SELECT
    con.conname::text                        AS "constraintName",
    child.relname::text                      AS "childTable",
    child_attr.attname::text                 AS "childColumn",
    child_attr.attnotnull                    AS "childNotNull",
    parent.relname::text                     AS "parentTable",
    parent_attr.attname::text                AS "parentColumn",
    con.confdeltype::text                    AS "ruleCode"
  FROM pg_constraint con
  JOIN pg_class child ON child.oid = con.conrelid
  JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
  JOIN pg_class parent ON parent.oid = con.confrelid
  JOIN LATERAL unnest(con.conkey, con.confkey) AS keys(child_attnum, parent_attnum) ON TRUE
  JOIN pg_attribute child_attr
    ON child_attr.attrelid = con.conrelid AND child_attr.attnum = keys.child_attnum
  JOIN pg_attribute parent_attr
    ON parent_attr.attrelid = con.confrelid AND parent_attr.attnum = keys.parent_attnum
  WHERE con.contype = 'f' AND child_ns.nspname = '${SCHEMA}'
`;

const PK_QUERY = `
  SELECT cls.relname::text AS "tableName", attr.attname::text AS "columnName"
  FROM pg_index idx
  JOIN pg_class cls ON cls.oid = idx.indrelid
  JOIN pg_namespace ns ON ns.oid = cls.relnamespace
  JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS keys(attnum, ord) ON TRUE
  JOIN pg_attribute attr ON attr.attrelid = cls.oid AND attr.attnum = keys.attnum
  WHERE idx.indisprimary AND ns.nspname = '${SCHEMA}' AND keys.ord = 1
`;

let catalogPromise: Promise<ForeignKeyCatalog> | null = null;

export function resetForeignKeyCatalogCache(): void {
  catalogPromise = null;
}

async function loadCatalog(prisma: PrismaLike): Promise<ForeignKeyCatalog> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const [fkRows, pkRows] = await Promise.all([
        prisma.$queryRawUnsafe(FK_QUERY),
        prisma.$queryRawUnsafe(PK_QUERY),
      ]);

      const byConstraint = new Map<string, ForeignKeyInfo>();
      const referencing = new Map<string, ForeignKeyInfo[]>();

      for (const row of fkRows as Record<string, any>[]) {
        const info: ForeignKeyInfo = {
          constraintName: row.constraintName,
          childTable: row.childTable,
          childColumn: row.childColumn,
          childNullable: !row.childNotNull,
          parentTable: row.parentTable,
          parentColumn: row.parentColumn,
          deleteRule: DELETE_RULES[row.ruleCode] ?? "RESTRICT",
        };
        byConstraint.set(info.constraintName, info);

        const key = referencingKey(info.parentTable, info.parentColumn);
        const bucket = referencing.get(key) ?? [];
        bucket.push(info);
        referencing.set(key, bucket);
      }

      const primaryKeys = new Map<string, string>();
      for (const row of pkRows as Record<string, any>[]) {
        primaryKeys.set(row.tableName, row.columnName);
      }

      return { byConstraint, referencing, primaryKeys };
    })().catch((error) => {
      catalogPromise = null;
      throw error;
    });
  }

  return catalogPromise;
}

const referencingKey = (table: string, column: string) => `${table}.${column}`;

const quoteIdentifier = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

const inClause = (values: string[], startAt = 1) =>
  `(${values.map((_, index) => `$${index + startAt}`).join(", ")})`;

const CONSTRAINT_PATTERNS = [
  /constraint:\s*`([^`]+)`/i,
  /foreign key constraint\s+"([^"]+)"/i,
  /violates foreign key constraint\s+"([^"]+)"/i,
];

function extractConstraintName(error: unknown): string | null {
  const message = (error as Error)?.message;
  if (!message) return null;

  // Driver errors are surfaced as the debug representation of the underlying
  // Postgres error, which escapes the quotes around the constraint name.
  const normalized = message.replace(/\\+"/g, '"');

  for (const pattern of CONSTRAINT_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) return match[1];
  }

  return null;
}

const isRecordNotFound = (error: unknown) =>
  (error as { code?: string })?.code === "P2025";

async function selectIds(
  prisma: PrismaLike,
  table: string,
  primaryKey: string,
  column: string,
  ids: string[]
): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT ${quoteIdentifier(primaryKey)} AS "id" FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} IN ${inClause(ids)}`,
    ...ids
  );
  return (rows as Record<string, any>[]).map((row) => String(row.id));
}

async function updateColumn(
  prisma: PrismaLike,
  table: string,
  column: string,
  newValue: string | null,
  ids: string[]
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE ${quoteIdentifier(table)} SET ${quoteIdentifier(column)} = $1 WHERE ${quoteIdentifier(column)} IN ${inClause(ids, 2)}`,
    newValue,
    ...ids
  );
}

async function deleteIds(
  prisma: PrismaLike,
  table: string,
  primaryKey: string,
  ids: string[]
): Promise<void> {
  for (let start = 0; start < ids.length; start += ID_CHUNK_SIZE) {
    const chunk = ids.slice(start, start + ID_CHUNK_SIZE);
    await prisma.$executeRawUnsafe(
      `DELETE FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(primaryKey)} IN ${inClause(chunk)}`,
      ...chunk
    );
  }
}

/**
 * Deletes every row in `table` identified by `ids`, removing the rows that
 * block the delete first. Blocking rows are nulled out when the FK column
 * allows it, re-pointed at the acting admin for `reassignTables`, and deleted
 * (recursively) otherwise.
 */
async function purgeRows(
  prisma: PrismaLike,
  catalog: ForeignKeyCatalog,
  table: string,
  primaryKey: string,
  ids: string[],
  options: HardDeleteOptions,
  visited: Set<string>,
  depth: number
): Promise<void> {
  if (ids.length === 0) return;

  if (depth > MAX_DEPTH) {
    throw new Error(
      `Refusing to permanently delete ${table}: dependent records nest deeper than ${MAX_DEPTH} levels.`
    );
  }

  const signature = `${table}:${[...ids].sort().join(",")}`;
  if (visited.has(signature)) {
    throw new Error(
      `Refusing to permanently delete ${table}: circular reference detected while resolving dependent records.`
    );
  }
  visited.add(signature);

  const blocking = catalog.referencing.get(referencingKey(table, primaryKey)) ?? [];

  for (const fk of blocking) {
    if (DB_HANDLED_RULES.includes(fk.deleteRule)) continue;

    const childPrimaryKey = catalog.primaryKeys.get(fk.childTable);
    if (!childPrimaryKey) {
      throw new Error(
        `Refusing to permanently delete ${table}: no primary key known for "${fk.childTable}" while resolving constraint ${fk.constraintName}.`
      );
    }

    const childIds = await selectIds(
      prisma,
      fk.childTable,
      childPrimaryKey,
      fk.childColumn,
      ids
    );
    if (childIds.length === 0) continue;

    const reassignTo =
      options.adminId && options.reassignTables?.includes(fk.parentTable)
        ? options.adminId
        : null;

    if (fk.childNullable) {
      await updateColumn(prisma, fk.childTable, fk.childColumn, null, ids);
      continue;
    }

    if (reassignTo) {
      await updateColumn(prisma, fk.childTable, fk.childColumn, reassignTo, ids);
      continue;
    }

    await purgeRows(
      prisma,
      catalog,
      fk.childTable,
      childPrimaryKey,
      childIds,
      options,
      visited,
      depth + 1
    );
  }

  await deleteIds(prisma, table, primaryKey, ids);
}

async function rowExists(
  prisma: PrismaLike,
  table: string,
  column: string,
  value: string
): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 AS "found" FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} = $1 LIMIT 1`,
    value
  );
  return (rows as unknown[]).length > 0;
}

/**
 * A blocked DELETE aborts the surrounding transaction, so the whole resolve
 * loop is wrapped in a savepoint when the caller happens to be inside one.
 * Outside a transaction block Postgres rejects SAVEPOINT, which is how we
 * detect that the savepoint is not needed.
 */
async function openSavepoint(prisma: PrismaLike): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe(`SAVEPOINT ${SAVEPOINT_NAME}`);
    return true;
  } catch {
    return false;
  }
}

async function rollbackToSavepoint(prisma: PrismaLike): Promise<void> {
  await prisma.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${SAVEPOINT_NAME}`);
}

async function releaseSavepoint(prisma: PrismaLike): Promise<void> {
  await prisma
    .$executeRawUnsafe(`RELEASE SAVEPOINT ${SAVEPOINT_NAME}`)
    .catch(() => undefined);
}

/**
 * Permanently deletes a record through its Prisma delegate, transparently
 * clearing the foreign keys that would otherwise block the delete.
 *
 * Use the recycle bin's `permanentDelete` hook for model specific cleanup that
 * is not a plain dependent row (e.g. re-pointing audit ownership); this
 * function only guarantees the row itself is gone.
 */
export async function hardDelete(options: HardDeleteOptions): Promise<void> {
  const { prisma, delegate, id } = options;
  const model = prisma[delegate];

  if (!model?.delete) {
    throw new Error(`Prisma delegate not found: ${delegate}`);
  }

  const catalog = await loadCatalog(prisma);
  const hasSavepoint = await openSavepoint(prisma);

  try {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      try {
        await model.delete({ where: { id } });
        return;
      } catch (error) {
        if (isRecordNotFound(error)) return;

        if (hasSavepoint) await rollbackToSavepoint(prisma);

        const constraintName = extractConstraintName(error);
        const foreignKey = constraintName
          ? catalog.byConstraint.get(constraintName)
          : undefined;

        if (!foreignKey) throw error;

        const primaryKey = catalog.primaryKeys.get(foreignKey.parentTable);
        if (!primaryKey || foreignKey.parentColumn !== primaryKey) throw error;

        // The blocking row has to be the record we are deleting (or a row we
        // are already deleting); bail out instead of guessing at anything else.
        const exists = await rowExists(
          prisma,
          foreignKey.parentTable,
          foreignKey.parentColumn,
          id
        );
        if (!exists) throw error;

        await purgeRows(
          prisma,
          catalog,
          foreignKey.parentTable,
          primaryKey,
          [id],
          options,
          new Set<string>(),
          0
        );
        return;
      }
    }

    throw new Error(
      `Refusing to permanently delete ${delegate} record ${id}: too many dependent relations.`
    );
  } finally {
    if (hasSavepoint) await releaseSavepoint(prisma);
  }
}

