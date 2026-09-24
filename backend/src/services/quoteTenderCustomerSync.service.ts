import { PrismaClient } from "@prisma/client";

/**
 * Syncs Customer records from Quote Tender portal data.
 *
 * Customers are grouped by `firm_name` and upserted (matched by
 * `name + companyId`). A primary ContactPerson is upserted with the order's
 * contact details (name / mobile / email). Sales orders whose `partyName`
 * matches the firm are linked to the customer via `customerId`.
 */
export async function syncCustomersFromQuoteTender(
  prisma: PrismaClient,
  companyId: string,
  tenders: any[]
) {
  const customersByFirm = new Map<string, any[]>();

  for (const order of tenders) {
    const firm = String(order.firm_name || "").trim();
    if (!firm) continue;
    if (!customersByFirm.has(firm)) customersByFirm.set(firm, []);
    customersByFirm.get(firm)!.push(order);
  }

  const syncedCustomers: any[] = [];

  for (const [firm, orders] of customersByFirm.entries()) {
    const first = orders[0];
    const location = [first.state_name, first.city_name]
      .filter(Boolean)
      .join(", ") || null;

    let customer = await prisma.customer.findFirst({
      where: { companyId, name: firm, deletedAt: null },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          companyId,
          name: firm,
          firmName: firm,
          billingAddress: location,
          shippingAddress: location,
          isActive: true,
        },
      });
    } else {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          firmName: firm,
          billingAddress: customer.billingAddress || location,
          shippingAddress: customer.shippingAddress || location,
        },
      });
    }

    const contactOrder =
      orders.find((o) => o.name || o.mobile || o.email_id) || first;
    const contactName = String(contactOrder.name || "").trim();
    const phone = String(contactOrder.mobile || "").trim();
    const email = String(contactOrder.email_id || "").trim();

    if (contactName || phone || email) {
      const existingContact = await prisma.contactPerson.findFirst({
        where: { customerId: customer.id, isPrimary: true, deletedAt: null },
      });

      if (existingContact) {
        await prisma.contactPerson.update({
          where: { id: existingContact.id },
          data: {
            name: contactName || existingContact.name,
            phone: phone || existingContact.phone,
            email: email || existingContact.email,
          },
        });
      } else {
        await prisma.contactPerson.create({
          data: {
            customerId: customer.id,
            name: contactName || "Primary Contact",
            phone: phone || null,
            email: email || null,
            isPrimary: true,
          },
        });
      }
    }

    syncedCustomers.push(customer);
  }

  for (const customer of syncedCustomers) {
    await prisma.salesOrder.updateMany({
      where: {
        companyId,
        partyName: customer.name,
        customerId: null,
        deletedAt: null,
      },
      data: { customerId: customer.id },
    });
  }

  return syncedCustomers;
}

function isPortalActive(status: unknown): boolean {
  if (status === null || status === undefined) return true;
  if (typeof status === "number") return status === 1;
  const s = String(status).trim().toLowerCase();
  return s === "1" || s === "true" || s === "active";
}

function portalLocation(customer: any): string | null {
  const parts = [
    customer.city_name,
    customer.city,
    customer.state_name,
    customer.state_code,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Syncs Customer records from the Quote Tender portal `/customers.php` API.
 *
 * Each portal customer record maps to a local Customer (business keyed on
 * `firm_name`, falling back to `name`) plus a primary ContactPerson holding
 * the contact's name / mobile / email.
 */
export async function syncCustomersFromPortal(
  prisma: PrismaClient,
  companyId: string,
  customers: any[]
) {
  const syncedCustomers: any[] = [];

  for (const record of customers) {
    const firm = String(record.firm_name || "").trim();
    const contactName = String(record.name || "").trim();
    const companyKey = firm || contactName;

    if (!companyKey) continue;

    const phone = String(record.mobile || record.phone || "").trim();
    const email = String(record.email_id || record.email || "").trim();
    const location = portalLocation(record);

    let customer = await prisma.customer.findFirst({
      where: { companyId, name: companyKey, deletedAt: null },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          companyId,
          name: companyKey,
          firmName: firm || null,
          billingAddress: location,
          shippingAddress: location,
          isActive: isPortalActive(record.status),
        },
      });
    } else {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          firmName: firm || customer.firmName,
          billingAddress: customer.billingAddress || location,
          shippingAddress: customer.shippingAddress || location,
          isActive: isPortalActive(record.status),
        },
      });
    }

    if (contactName || phone || email) {
      const existingContact = await prisma.contactPerson.findFirst({
        where: { customerId: customer.id, isPrimary: true, deletedAt: null },
      });

      if (existingContact) {
        await prisma.contactPerson.update({
          where: { id: existingContact.id },
          data: {
            name: contactName || existingContact.name,
            phone: phone || existingContact.phone,
            email: email || existingContact.email,
          },
        });
      } else {
        await prisma.contactPerson.create({
          data: {
            customerId: customer.id,
            name: contactName || "Primary Contact",
            phone: phone || null,
            email: email || null,
            isPrimary: true,
          },
        });
      }
    }

    syncedCustomers.push(customer);
  }

  return syncedCustomers;
}