/**
 * CSV parsing for client import (§6.15). Small, dependency-free RFC-4180-ish
 * parser: handles quoted fields, embedded commas/quotes/newlines, and CRLF.
 */

/** Parse CSV text into rows of string cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Trailing field/row (unless file ended on a newline with no extra content).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export interface ClientRecord {
  name: string;
  email: string;
  phone?: string;
  addressLine1?: string;
  postcode?: string;
  propertyType?: string;
  rooms: { kitchens: number; bathrooms: number; receptions: number; bedrooms: number };
  notes?: string;
}

export interface ClientParseResult {
  records: ClientRecord[];
  errors: { row: number; message: string }[];
}

const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  "full name": "name",
  customer: "name",
  email: "email",
  "email address": "email",
  phone: "phone",
  telephone: "phone",
  mobile: "phone",
  address: "addressLine1",
  "address line 1": "addressLine1",
  addressline1: "addressLine1",
  postcode: "postcode",
  "post code": "postcode",
  "property type": "propertyType",
  propertytype: "propertyType",
  kitchens: "kitchens",
  bathrooms: "bathrooms",
  receptions: "receptions",
  bedrooms: "bedrooms",
  notes: "notes",
};

function num(v: string | undefined): number {
  const n = Number((v ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse a client-list CSV into typed records, with per-row errors. */
export function parseClientCsv(text: string): ClientParseResult {
  const rows = parseCsv(text);
  const result: ClientParseResult = { records: [], errors: [] };
  if (rows.length === 0) return result;

  const header = rows[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim().toLowerCase());
  const idx = (key: string) => header.indexOf(key);

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const get = (key: string) => {
      const i = idx(key);
      return i >= 0 ? cells[i]?.trim() : undefined;
    };
    const name = get("name");
    const email = get("email");
    if (!name || !email) {
      result.errors.push({ row: r + 1, message: "Missing name or email" });
      continue;
    }
    if (!emailRe.test(email)) {
      result.errors.push({ row: r + 1, message: `Invalid email: ${email}` });
      continue;
    }
    result.records.push({
      name,
      email: email.toLowerCase(),
      phone: get("phone") || undefined,
      addressLine1: get("addressLine1") || undefined,
      postcode: get("postcode") || undefined,
      propertyType: get("propertyType") || undefined,
      rooms: {
        kitchens: num(get("kitchens")),
        bathrooms: num(get("bathrooms")),
        receptions: num(get("receptions")),
        bedrooms: num(get("bedrooms")),
      },
      notes: get("notes") || undefined,
    });
  }
  return result;
}
