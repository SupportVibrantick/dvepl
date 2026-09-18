import { adminLogs } from "../../../services/logger/contextLogger";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LabelTarget {
  model: string;
  labelField: string;
}

// Module label (derived from the request URL) -> Prisma model + the column
// that holds the human-readable name for that record.
const MODULE_LABELS: Record<string, LabelTarget> = {
  Company: { model: "company", labelField: "name" },
  Branch: { model: "branch", labelField: "name" },
  Department: { model: "department", labelField: "name" },
  Team: { model: "team", labelField: "name" },
  Division: { model: "division", labelField: "name" },
  Section: { model: "section", labelField: "name" },
  SubDivision: { model: "subDivision", labelField: "name" },
  User: { model: "user", labelField: "name" },
  Role: { model: "role", labelField: "name" },
  Customer: { model: "customer", labelField: "name" },
  Tender: { model: "tender", labelField: "title" },
  TenderRequest: { model: "tenderRequest", labelField: "title" },
  Vendor: { model: "vendor", labelField: "name" },
  SalesOrder: { model: "salesOrder", labelField: "dveplCode" },
  Order: { model: "salesOrder", labelField: "dveplCode" },
  Material: { model: "material", labelField: "name" },
  PurchaseOrder: { model: "purchaseOrder", labelField: "poNo" },
  GoodsReceipt: { model: "goodsReceipt", labelField: "grnNo" },
  Payment: { model: "payment", labelField: "paymentNo" },
  ReferenceCode: { model: "referenceCode", labelField: "code" },
  GovernmentDepartment: { model: "governmentDepartment", labelField: "name" },
};

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_RE.test(value);

const collectUuids = (value: any, out: Set<string>) => {
  if (value == null) return;
  if (typeof value === "string") {
    if (isUuid(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectUuids(entry, out));
    return;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((entry) => collectUuids(entry, out));
  }
};

const scrubUuids = (value: any, idToLabel: Map<string, string>): any => {
  if (value == null) return value;
  if (typeof value === "string") {
    return idToLabel.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => scrubUuids(entry, idToLabel));
  }
  if (typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = scrubUuids(entry, idToLabel);
    }
    return out;
  }
  return value;
};

// Replaces every record/operator/fk UUID in the audit entries with the
// matching record's human-readable name (vendor name, PO number, user name,
// order code, …), so audit logs never surface raw UUIDs.
export async function enrichAuditLogs(
  logs: any[],
  prisma: any
): Promise<any[]> {
  try {
    const uuids = new Set<string>();
    for (const log of logs) {
      if (log.userId) uuids.add(log.userId);
      if (log.recordId) uuids.add(log.recordId);
      collectUuids(log.oldValue, uuids);
      collectUuids(log.newValue, uuids);
    }
    if (uuids.size === 0) return logs;

    const idToLabel = new Map<string, string>();
    const idList = [...uuids];

    const targets = new Map<string, LabelTarget>();
    for (const target of Object.values(MODULE_LABELS)) {
      targets.set(target.model, target);
    }
    try {
      for (const [model, target] of targets) {
        const rows = await (prisma as any)[model]
          .findMany({
            where: { id: { in: idList } },
            select: { id: true, [target.labelField]: true },
          })
          .catch(() => []);
        for (const row of rows) {
          const label =
            typeof row[target.labelField] === "string" &&
            row[target.labelField].trim()
              ? row[target.labelField]
              : null;
          if (label && row.id) idToLabel.set(row.id, label);
        }
      }
    } catch (err) {
      adminLogs.error("Audit label resolution failed", { error: err });
    }

    return logs.map((log) => {
      const resolvedRecordId =
        log.recordId && idToLabel.get(log.recordId);
      const resolved = {
        ...log,
        recordId: resolvedRecordId ?? log.entityName ?? (isUuid(log.recordId) ? "(record no longer exists)" : log.recordId),
        userId: log.userId && idToLabel.get(log.userId) ? idToLabel.get(log.userId) : log.userId,
        oldValue: log.oldValue ? scrubUuids(log.oldValue, idToLabel) : log.oldValue,
        newValue: log.newValue ? scrubUuids(log.newValue, idToLabel) : log.newValue,
      };
      if (resolved.user) {
        const { id: _drop, ...userView } = resolved.user;
        resolved.user = userView;
      }
      return resolved;
    });
  } catch (err) {
    adminLogs.error("Audit label enrichment failed", { error: err });
    return logs;
  }
}