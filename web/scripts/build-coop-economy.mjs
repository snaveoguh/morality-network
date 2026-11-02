#!/usr/bin/env node
/**
 * build-coop-economy.mjs — snapshot an area's co-operative economy.
 *
 * Downloads the FCA Mutuals Public Register society list (CSV of basic
 * society details, published by the FCA), keeps co-operatives, community
 * benefit societies and credit unions, resolves each registered-office
 * postcode to a local authority district via postcodes.io, and writes the
 * societies inside the area's districts to src/data/coops/<area>.json.
 *
 * The register lists the registered office, not where a society trades, so a
 * society run in Sussex with an office elsewhere is missed (and vice versa).
 * The page's method note says so.
 *
 * Usage:
 *   node scripts/build-coop-economy.mjs --area sussex [--csv path/to/SocietyList.csv]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTER_CSV =
  "https://fcastoragemprprod.blob.core.windows.net/societylist/SocietyList.csv";
const POSTCODES_API = "https://api.postcodes.io";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "src", "data", "coops");

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const AREA = argValue("--area");
const CSV_PATH = argValue("--csv");

const areas = JSON.parse(readFileSync(join(dataDir, "areas.json"), "utf8"));
const area = areas[AREA];
if (!area) {
  console.error(`--area must be one of: ${Object.keys(areas).join(", ")}`);
  process.exit(1);
}

// Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i].trim()])));
}

async function loadRegister() {
  if (CSV_PATH) return readFileSync(CSV_PATH);
  const res = await fetch(REGISTER_CSV);
  if (!res.ok) throw new Error(`register download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// The FCA file is Windows-1252, not UTF-8 (curly apostrophes are 0x92).
const text = new TextDecoder("windows-1252").decode(await loadRegister());
const register = parseCsv(text);
console.log(`register: ${register.length} societies`);

const IN_SCOPE_FORMS = new Set([
  "Co-operative Society",
  "Community Benefit Society",
  "Credit Union",
]);
const inScope = (r) =>
  r["Statistics Condition"] === "Co-operative" ||
  r["Statistics Condition"] === "Community Benefit" ||
  IN_SCOPE_FORMS.has(r["Registered As"]);

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/g;
function lastPostcode(address) {
  const matches = [...address.toUpperCase().matchAll(POSTCODE)];
  const m = matches.at(-1);
  return m ? `${m[1]} ${m[2]}` : null;
}

const areaPrefix = new RegExp(`^(${area.postcodeAreas.join("|")})\\d`);
const candidates = register
  .filter(inScope)
  .map((r) => ({ r, postcode: lastPostcode(r["Society Address"]) }))
  .filter((c) => c.postcode && areaPrefix.test(c.postcode));
console.log(`in scope with ${area.postcodeAreas.join("/")} postcodes: ${candidates.length}`);

async function bulkLookup(postcodes) {
  const out = new Map();
  for (let i = 0; i < postcodes.length; i += 100) {
    const batch = postcodes.slice(i, i + 100);
    const res = await fetch(`${POSTCODES_API}/postcodes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postcodes: batch }),
    });
    if (!res.ok) throw new Error(`postcodes.io bulk failed: ${res.status}`);
    const { result } = await res.json();
    for (const { query, result: hit } of result) {
      if (hit) {
        out.set(query, {
          district: hit.admin_district,
          lat: hit.latitude,
          lng: hit.longitude,
        });
      }
    }
  }
  return out;
}

// Postcodes retired since registration resolve via the terminated endpoint
// (location only), then a reverse lookup for the district.
async function terminatedLookup(postcode) {
  const res = await fetch(
    `${POSTCODES_API}/terminated_postcodes/${encodeURIComponent(postcode)}`,
  );
  if (!res.ok) return null;
  const { result } = await res.json();
  if (!result?.latitude) return null;
  const near = await fetch(
    `${POSTCODES_API}/postcodes?lon=${result.longitude}&lat=${result.latitude}&limit=1&radius=2000`,
  );
  if (!near.ok) return null;
  const nearest = (await near.json()).result?.[0];
  if (!nearest) return null;
  return { district: nearest.admin_district, lat: result.latitude, lng: result.longitude };
}

const unique = [...new Set(candidates.map((c) => c.postcode))];
const located = await bulkLookup(unique);
const missing = unique.filter((p) => !located.has(p));
for (const postcode of missing) {
  const hit = await terminatedLookup(postcode);
  if (hit) located.set(postcode, hit);
}
console.log(
  `postcodes: ${unique.length} unique, ${located.size} located, ${unique.length - located.size} unresolved`,
);

const districtNames = new Set(area.districts.map((d) => d.name));

function typeOf(r) {
  if (r["Registered As"] === "Credit Union") return "Credit union";
  if (r["Statistics Condition"] === "Community Benefit") return "Community benefit";
  const coopType = r["Statistics Co-operative Type"];
  if (coopType && coopType !== "N/A") {
    return { "Consumer or User": "Consumer", "Multi-stakeholder": "Multi-stakeholder" }[coopType] ?? coopType;
  }
  return r["Registered As"] === "Community Benefit Society" ? "Community benefit" : "Co-operative";
}

const societies = candidates
  .map(({ r, postcode }) => ({ r, postcode, loc: located.get(postcode) }))
  .filter(({ loc }) => loc && districtNames.has(loc.district))
  .map(({ r, postcode, loc }) => ({
    regNo: r["Full Registation Number"],
    name: r["Society Name"],
    form: r["Registered As"],
    type: typeOf(r),
    sector: r["Reporting Classification"] || "Other",
    sic: r["Standard Industrial Classification Code (SIC)"] || null,
    postcode,
    district: loc.district,
    lat: Math.round(loc.lat * 1e4) / 1e4,
    lng: Math.round(loc.lng * 1e4) / 1e4,
    registered: r["Registration Date"] || null,
    deregistered: r["Deregistration Date"] || null,
    status: r["Society Status"],
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const snapshot = {
  area: area.slug,
  source: {
    name: "FCA Mutuals Public Register",
    url: "https://mutuals.fca.org.uk/",
    file: REGISTER_CSV,
  },
  fetchedAt: new Date().toISOString(),
  count: societies.length,
  societies,
};

const outPath = join(dataDir, `${area.slug}.json`);
writeFileSync(outPath, `${JSON.stringify(snapshot, null, 1)}\n`);
const live = societies.filter((s) => s.status.startsWith("Registered")).length;
console.log(`wrote ${outPath}: ${societies.length} societies (${live} still registered)`);
