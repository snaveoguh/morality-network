// Deterministic parsing helpers for register data: exact money, dates, CSV,
// names. No floats touch money; no guessing on malformed input (null instead).

/**
 * Parse a stated money amount to integer pence, exactly.
 * Accepts "5950.00", "5950", "5950.5", "£23,858.89", "-12.30", 1840 (number).
 * Returns null for empty, malformed, or more than 2 decimal places.
 */
export function parseMoneyToPence(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    text = value.toFixed(2);
  } else if (typeof value === "string") {
    text = value.trim().replace(/^£/, "").replace(/,/g, "").trim();
  } else {
    return null;
  }
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const [, minus, whole, frac = ""] = match;
  const pence = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(pence)) return null;
  return minus ? -pence : pence;
}

/** Integer pence → exact decimal string "5950.00". */
export function penceToDecimal(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(pence);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Normalise any stated amount to the canonical decimal string, or null. */
export function moneyToDecimal(value: unknown): string | null {
  const pence = parseMoneyToPence(value);
  return pence === null ? null : penceToDecimal(pence);
}

/** Integer pence → "£5,950.00". */
export function formatGbp(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100).toLocaleString("en-GB");
  return `${sign}£${pounds}.${String(abs % 100).padStart(2, "0")}`;
}

function validIso(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Register date → "YYYY-MM-DD". Accepts "2024-07-04", "2024-07-04T00:00:00",
 * "29/01/2026" (UK day-first, as in the Electoral Commission export) and
 * .NET "/Date(1769644800000)/". Anything else → null.
 */
export function parseRegisterDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(text);
  if (m) return validIso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (m) return validIso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^\/Date\((-?\d+)\)\/$/.exec(text);
  if (m) return new Date(Number(m[1])).toISOString().slice(0, 10);
  return null;
}

/** "True"/"False" (EC export), booleans → boolean; anything else → null. */
export function parseBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  if (t === "true") return true;
  if (t === "false") return false;
  return null;
}

/** Empty / whitespace-only strings → null; other strings trimmed. */
export function nonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function parseIntOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * RFC 4180 CSV → array of header-keyed rows. Handles a UTF-8 BOM, quoted
 * fields with commas, doubled quotes and embedded newlines, CRLF or LF.
 * Throws on an unterminated quote (a truncated download must not parse).
 */
export function parseCsv(text: string): Record<string, string>[] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
    } else {
      field += ch;
    }
    i += 1;
  }
  if (inQuotes) throw new Error("parseCsv: unterminated quoted field (truncated input?)");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const nonBlank = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  if (nonBlank.length === 0) return [];
  const [header, ...body] = nonBlank;
  return body.map((r, idx) => {
    if (r.length !== header.length) {
      throw new Error(`parseCsv: row ${idx + 1} has ${r.length} fields, header has ${header.length}`);
    }
    const out: Record<string, string> = {};
    header.forEach((h, j) => {
      out[h] = r[j];
    });
    return out;
  });
}

const HONORIFICS = new Set([
  "rt", "hon", "right", "honourable", "sir", "dame", "dr", "mr", "mrs", "ms", "miss", "mx",
  "lord", "lady", "baroness", "baron", "professor", "prof", "rev", "reverend", "the",
]);
const POST_NOMINALS = new Set([
  "mp", "kc", "qc", "cbe", "obe", "mbe", "kbe", "dbe", "pc", "msp", "ms", "mla", "frs", "kcb",
]);

/**
 * Name normalised for deterministic matching only (never for display):
 * lowercased, accents and punctuation removed, honorifics and post-nominals
 * dropped. "Rt Hon Sir James Cleverly MP" → "james cleverly".
 */
export function normaliseName(name: string): string {
  const tokens = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 0 && HONORIFICS.has(tokens[0])) tokens.shift();
  while (tokens.length > 0 && POST_NOMINALS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}
