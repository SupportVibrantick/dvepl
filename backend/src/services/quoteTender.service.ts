import crypto from "node:crypto";

let cachedServerClockOffset: number | null = null;
let serverClockOffsetCachedAt = 0;
const SERVER_CLOCK_CACHE_MS = 5 * 60 * 1000;

/**
 * The QuoteTender portal signs requests against its own clock, which may drift
 * from the caller's wall clock (in production it was ~5.5h behind, so every
 * request was rejected as "Expired request"). We measure the offset from the
 * portal's `Date` response header once per cache window and apply it to the
 * `ts` value. A manual override can be set via QUOTE_TENDER_TS_OFFSET (seconds,
 * added to the local timestamp).
 */
async function getServerClockOffset(): Promise<number> {
    if (
        cachedServerClockOffset !== null &&
        Date.now() - serverClockOffsetCachedAt < SERVER_CLOCK_CACHE_MS
    ) {
        return cachedServerClockOffset;
    }

    const configured = Number(process.env.QUOTE_TENDER_TS_OFFSET);
    if (Number.isFinite(configured)) {
        cachedServerClockOffset = configured;
        serverClockOffsetCachedAt = Date.now();
        return configured;
    }

    let offset = 0;
    try {
        const serverUrl = process.env.QUOTE_TENDER_SERVER_URL;
        const baseUrl = serverUrl?.endsWith("/")
            ? serverUrl
            : `${serverUrl}/`;

        for (const method of ["HEAD", "GET"] as const) {
            try {
                const res = await fetch(baseUrl, { method });
                const dateHeader = res.headers.get("date");
                res.body?.cancel();
                if (dateHeader) {
                    const serverEpoch = Date.parse(dateHeader);
                    if (!Number.isNaN(serverEpoch)) {
                        offset = Math.round((serverEpoch - Date.now()) / 1000);
                        break;
                    }
                }
            } catch {
                // try next method
            }
        }
    } catch {
        offset = 0;
    }

    cachedServerClockOffset = offset;
    serverClockOffsetCachedAt = Date.now();
    return offset;
}

async function requestQuoteTenderApi(
    path: string,
    label: string,
    query?: Record<string, string | number>
) {
    const serverUrl = process.env.QUOTE_TENDER_SERVER_URL;
    const token = process.env.QUOTE_TENDER_TOKEN;
    const secretKey = process.env.QUOTE_TENDER_SECRET_KEY;

    if (!serverUrl) {
        throw new Error("QUOTE_TENDER_SERVER_URL is not configured");
    }

    if (!token) {
        throw new Error("QUOTE_TENDER_TOKEN is not configured");
    }

    if (!secretKey) {
        throw new Error("QUOTE_TENDER_SECRET_KEY is not configured");
    }

    // PHP: time() (compensated for the portal's clock drift)
    const clockOffset = await getServerClockOffset();
    const timestamp = Math.floor(Date.now() / 1000) + clockOffset;

    // PHP:
    // hash_hmac('sha256', $token . $timestamp, $secretKey)
    const signature = crypto
        .createHmac("sha256", secretKey)
        .update(token + timestamp)
        .digest("hex");

    const apiUrl = new URL(
        path,
        serverUrl.endsWith("/")
            ? serverUrl
            : `${serverUrl}/`,
    );

    apiUrl.searchParams.set("token", token);
    apiUrl.searchParams.set("ts", timestamp.toString());
    apiUrl.searchParams.set("sig", signature);

    if (query) {
        for (const [key, value] of Object.entries(query)) {
            apiUrl.searchParams.set(key, String(value));
        }
    }

    const response = await fetch(apiUrl.toString(), {
        method: "GET",
        headers: {
            Accept: "application/json",
        },
    });

    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(
            `${label} API failed: ${response.status} ${responseText}`
        );
    }

    try {
        return JSON.parse(responseText);
    } catch {
        throw new Error(
            `${label} API returned invalid JSON: ${responseText}`
        );
    }
}

export async function fetchAwardTenders() {
    return requestQuoteTenderApi(
        "login/api/awardTenders.php",
        "Award Tenders"
    );
}

export async function fetchPortalCustomers() {
    return requestQuoteTenderApi(
        "login/api/customers.php",
        "Customers"
    );
}

export async function fetchAllPortalStaff(maxCount?: number) {
    const cap = Number(maxCount && maxCount > 0 ? maxCount : 0) || 0;
    const pageSize = 100;
    const all: any[] = [];

    for (let page = 1; ; page++) {
        const payload = await requestQuoteTenderApi(
            "login/api/staff.php",
            "Staff",
            { page, limit: pageSize }
        );

        const items = extractItems(payload);
        if (items.length === 0) break;

        all.push(...items);
        if (items.length < pageSize) break;
        if (cap > 0 && all.length >= cap) break;
    }

    return cap > 0 ? all.slice(0, cap) : all;
}

function extractItems(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && payload.data && Array.isArray(payload.data.items)) {
        return payload.data.items;
    }
    if (payload && payload.data && Array.isArray(payload.data.data)) {
        return payload.data.data;
    }
    return [];
}

/**
 * Fetches portal roles. The `/roles.php` API returns all roles in a single
 * response (no pagination), so this is one request. Pass a positive
 * `maxCount` to cap the number of returned records.
 */
export async function fetchPortalRoles(maxCount?: number) {
    const payload = await requestQuoteTenderApi(
        "login/api/roles.php",
        "Roles"
    );

    const items = extractItems(payload);

    const cap = Number(maxCount && maxCount > 0 ? maxCount : 0) || 0;
    return cap > 0 ? items.slice(0, cap) : items;
}

/**
 * Fetches portal customers with pagination. Pass a positive `maxCount` to
 * stop after that many records; pass `0`/`undefined` to fetch every page
 * until the portal returns an empty page.
 */
export async function fetchAllPortalCustomers(maxCount?: number) {
    const cap = Number(maxCount && maxCount > 0 ? maxCount : 0) || 0;
    const pageSize = 100;
    const all: any[] = [];

    for (let page = 1; ; page++) {
        const payload = await requestQuoteTenderApi(
            "login/api/customers.php",
            "Customers",
            { page, limit: pageSize }
        );

        const items = extractItems(payload);
        if (items.length === 0) break;

        all.push(...items);
        if (items.length < pageSize) break;
        if (cap > 0 && all.length >= cap) break;
    }

    return cap > 0 ? all.slice(0, cap) : all;
}