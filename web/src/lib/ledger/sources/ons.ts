// Resolution source: ONS time series (statistics claims).
// www.ons.gov.uk/{topic-path}/timeseries/{series}/{dataset}/data — free JSON.
//
// The registry is deliberately small and hand-verified: a statistics claim
// only resolves against a series we know how to read. Claims outside the
// registry stay unresolved rather than resolving against guessed data.

import { fetchWithRetry } from "../../fetch-utils";

export interface OnsSeriesDef {
  key: string;
  seriesId: string;
  dataset: string;
  path: string;
  title: string;
  unit: string;
}

export interface OnsObservation {
  period: string; // e.g. "2026 MAY"
  value: string;
}

export interface OnsSeriesData extends OnsSeriesDef {
  url: string;
  latest: OnsObservation | null;
  /** Last ~14 observations at the series' native frequency (months/quarters). */
  recent: OnsObservation[];
  /** Full annual history from 2009 — resolves claims about past horizons. */
  annual: OnsObservation[];
}

export const ONS_SERIES: OnsSeriesDef[] = [
  {
    key: "cpi-annual-rate",
    seriesId: "d7g7",
    dataset: "mm23",
    path: "economy/inflationandpriceindices",
    title: "CPI annual inflation rate (all items)",
    unit: "%",
  },
  {
    key: "cpih-annual-rate",
    seriesId: "l55o",
    dataset: "mm23",
    path: "economy/inflationandpriceindices",
    title: "CPIH annual inflation rate (all items)",
    unit: "%",
  },
  {
    key: "unemployment-rate",
    seriesId: "mgsx",
    dataset: "lms",
    path: "employmentandlabourmarket/peoplenotinwork/unemployment",
    title: "Unemployment rate (16+, seasonally adjusted)",
    unit: "%",
  },
  {
    key: "employment-rate",
    seriesId: "lf24",
    dataset: "lms",
    path: "employmentandlabourmarket/peopleinwork/employmentandemployeetypes",
    title: "Employment rate (16-64, seasonally adjusted)",
    unit: "%",
  },
  {
    key: "gdp-quarterly-growth",
    seriesId: "ihyq",
    dataset: "qna",
    path: "economy/grossdomesticproductgdp",
    title: "GDP quarter-on-quarter growth (CVM SA)",
    unit: "%",
  },
  // Fiscal series — the Budget-vs-outturn backbone (Tier 2 backfill).
  // NOTE J5II sign convention: NEGATIVE values denote net borrowing.
  {
    key: "public-sector-net-borrowing",
    seriesId: "j5ii",
    dataset: "pusf",
    path: "economy/governmentpublicsectorandtaxes/publicsectorfinance",
    title: "Public sector net borrowing ex banks, £m (negative = borrowing)",
    unit: "£m",
  },
  {
    key: "public-sector-net-debt-gdp",
    seriesId: "hf6x",
    dataset: "pusf",
    path: "economy/governmentpublicsectorandtaxes/publicsectorfinance",
    title: "Public sector net debt ex banks, % of GDP",
    unit: "%",
  },
];

export function onsSeriesUrl(def: OnsSeriesDef): string {
  return `https://www.ons.gov.uk/${def.path}/timeseries/${def.seriesId}/${def.dataset}`;
}

export async function fetchOnsSeries(
  def: OnsSeriesDef,
): Promise<OnsSeriesData | null> {
  try {
    const res = await fetchWithRetry(`${onsSeriesUrl(def)}/data`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 21_600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const toObs = (arr: unknown): OnsObservation[] =>
      (Array.isArray(arr) ? arr : []).map((m: any) => ({
        period: String(m.date || ""),
        value: String(m.value ?? ""),
      }));

    // Native frequency: months where published, else quarters (e.g. GDP).
    const native = toObs(data?.months).length > 0 ? toObs(data?.months) : toObs(data?.quarters);
    const recent = native.slice(-14);
    const annual = toObs(data?.years).filter(
      (o) => Number.parseInt(o.period, 10) >= 2009,
    );
    return {
      ...def,
      url: onsSeriesUrl(def),
      latest: recent.length > 0 ? recent[recent.length - 1] : null,
      recent,
      annual,
    };
  } catch (error) {
    console.error(`[ledger/ons] fetch failed for ${def.key}:`, error);
    return null;
  }
}

/** Fetch every registry series; failures drop out rather than blocking. */
export async function fetchAllOnsSeries(): Promise<OnsSeriesData[]> {
  const results = await Promise.allSettled(ONS_SERIES.map(fetchOnsSeries));
  return results
    .filter(
      (r): r is PromiseFulfilledResult<OnsSeriesData> =>
        r.status === "fulfilled" && r.value != null,
    )
    .map((r) => r.value);
}
