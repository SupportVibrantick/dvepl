import fs from "fs";
import path from "path";

for (const line of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!match) continue;
  const value = match[2].replace(/^["']|["']$/g, "").trim();
  if (process.env[match[1]] === undefined) process.env[match[1]] = value;
}

const { fetchAllPortalStaff, fetchPortalRoles, fetchAllPortalCustomers } =
  require("../src/services/quoteTender.service");

async function main() {
  console.log("serverUrl:", process.env.QUOTE_TENDER_SERVER_URL);
  console.log("token set:", Boolean(process.env.QUOTE_TENDER_TOKEN));
  console.log("secret set:", Boolean(process.env.QUOTE_TENDER_SECRET_KEY));

  for (const [label, run] of [
    ["staff", () => fetchAllPortalStaff(5)],
    ["roles", () => fetchPortalRoles(5)],
    ["customers", () => fetchAllPortalCustomers(5)],
  ] as const) {
    try {
      const items: any = await run();
      console.log(`OK   ${label}: ${Array.isArray(items) ? items.length : "?"} record(s)`);
      if (Array.isArray(items) && items[0]) {
        console.log(`     sample keys: ${Object.keys(items[0]).join(", ")}`);
      }
    } catch (error) {
      console.log(`FAIL ${label}: ${(error as Error).message}`);
    }
  }
}

main();
