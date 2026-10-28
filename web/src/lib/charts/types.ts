// Newspaper chart system — shared types.
// A chart is data plus the sentence it proves. Queries in ./queries.ts build
// ChartSpecs from data we already hold; components/charts/NewsChart renders
// them as a cream panel with black marks (pooter-brand Charts rules).

/** bar = horizontal bars (ranked categories), column = vertical bars (a short
 *  time series), line = a longer time series. */
export type ChartKind = "bar" | "column" | "line";

export interface ChartPoint {
  /** Category name or period label, already formatted for display. */
  label: string;
  value: number;
}

export interface ChartSource {
  name: string;
  href?: string;
}

export interface ChartSpec {
  /** Stable id — used as the home-slot selector and the anchor on /data. */
  id: string;
  kind: ChartKind;
  /** Plain sentence stating the finding, not a label ("Left-leaning outlets
   *  supply 41% of today's rated stories", not "Feed by bias"). */
  title: string;
  /** One line saying what is counted. */
  dek?: string;
  data: ChartPoint[];
  /** Noun for the value axis, plural ("stories", "claims"). */
  unit: string;
  source: ChartSource;
  /** ISO timestamp the underlying data was read. */
  asOf: string;
  /** Optional caveat printed under the chart. */
  note?: string;
}
