// MP Record — shared types (docs/MP_RECORD_SPEC.md §4).
// Data shapes mirror the columns of migration 014 in camelCase. Money is an
// exact decimal STRING ("5950.00"), never a float, so content hashes and sums
// are stable.

export type MpSource =
  | "members"
  | "interests"
  | "electoral_commission"
  | "companies_house"
  | "appg";

export type MpFactTable =
  | "mp_members"
  | "mp_member_periods"
  | "mp_interests"
  | "mp_donations"
  | "mp_directorships"
  | "mp_appgs";

export type CounterpartyKind = "organisation" | "person" | "unknown";

export interface MemberData {
  memberId: number;
  nameDisplay: string | null;
  nameList: string | null;
  nameFullTitle: string | null;
  nameAddressAs: string | null;
  gender: string | null;
  house: "Commons" | "Lords" | null;
  latestPartyId: number | null;
  latestPartyName: string | null;
  constituencyId: number | null;
  constituencyName: string | null;
  membershipStartDate: string | null;
  membershipEndDate: string | null;
  membershipEndReason: string | null;
  statusIsActive: boolean | null;
  statusDescription: string | null;
  thumbnailUrl: string | null;
}

export type MemberPeriodKind =
  | "party"
  | "constituency"
  | "house"
  | "government_post"
  | "opposition_post"
  | "other_post"
  | "committee";

export interface MemberPeriodData {
  memberId: number;
  kind: MemberPeriodKind;
  name: string | null;
  orgId: number | null;
  house: "Commons" | "Lords" | null;
  startDate: string | null;
  endDate: string | null;
  additionalInfo: string | null;
  additionalInfoLink: string | null;
}

/** One field of a register entry, verbatim. */
export interface RegisterField {
  name: string;
  description: string;
  type: string;
  currencyCode: string | null;
  value: unknown;
}

export interface InterestData {
  memberId: number;
  interestId: number;
  parentInterestId: number | null;
  categoryId: number | null;
  categoryNumber: string | null;
  categoryName: string | null;
  summary: string | null;
  payerOrDonorName: string | null;
  payerFromParent: boolean;
  counterpartyKind: CounterpartyKind;
  /** Stated value when the register's currency is GBP. */
  valueGbp: string | null;
  valueAmount: string | null;
  valueCurrency: string | null;
  isRegularPayment: boolean;
  receivedDate: string | null;
  startDate: string | null;
  endDate: string | null;
  registrationDate: string | null;
  publishedDate: string | null;
  updatedDates: string[];
  rectified: boolean;
  rectifiedDetails: string | null;
  fields: RegisterField[];
}

export interface DonationData {
  ecRef: string;
  regulatedEntityId: number;
  regulatedEntityName: string | null;
  regulatedEntityType: string | null;
  regulatedDoneeType: string | null;
  donorId: number | null;
  donorName: string | null;
  donorStatus: string | null;
  counterpartyKind: CounterpartyKind;
  companyRegistrationNumber: string | null;
  valueGbp: string | null;
  donationType: string | null;
  natureOfDonation: string | null;
  purposeOfVisit: string | null;
  donationAction: string | null;
  acceptedDate: string | null;
  receivedDate: string | null;
  reportedDate: string | null;
  reportingPeriodName: string | null;
  isSponsorship: boolean | null;
  isAggregation: boolean | null;
  isBequest: boolean | null;
  registerName: string | null;
  /** The export row exactly as the Commission published it. */
  rawRow: Record<string, string>;
}

export interface DirectorshipData {
  chOfficerId: string;
  officerName: string | null;
  companyNumber: string;
  companyName: string | null;
  companyStatus: string | null;
  officerRole: string | null;
  appointedOn: string | null;
  resignedOn: string | null;
}

export interface AppgData {
  appgName: string;
  officerNameAsRegistered: string;
  officerRole: string | null;
  registerEdition: string;
}

export interface FactDataByTable {
  mp_members: MemberData;
  mp_member_periods: MemberPeriodData;
  mp_interests: InterestData;
  mp_donations: DonationData;
  mp_directorships: DirectorshipData;
  mp_appgs: AppgData;
}

/** A freshly parsed register record, ready for diffing. */
export interface FactRecord<T extends MpFactTable = MpFactTable> {
  table: T;
  scopeKey: string;
  sourceRecordId: string;
  data: FactDataByTable[T];
  contentHash: string;
  sourceUrl: string;
  sourceApiUrl: string;
  parserVersion: string;
  rawFetchId: number | null;
}

/** A stored version row (any table). */
export interface StoredVersion<T extends MpFactTable = MpFactTable>
  extends FactRecord<T> {
  rowId: number;
  version: number;
  isRemoved: boolean;
  retrievedAt: string; // ISO timestamp
}

/** The latest version of one entry within a scope — the differ's input. */
export interface CurrentVersion {
  sourceRecordId: string;
  version: number;
  contentHash: string;
  isRemoved: boolean;
  rowId: number;
}

export interface SourceCheck {
  runId: string;
  source: MpSource;
  scopeKey: string;
  memberId: number | null;
  checkedAt: string;
  nRecords: number;
  nInserted: number;
  nChanged: number;
  nRemoved: number;
  rawFetchIds: number[];
}

export interface SourceLinkProposal {
  memberId: number;
  source: "electoral_commission" | "companies_house" | "appg";
  externalId: string;
  externalName: string | null;
  matchMethod: string;
  matchEvidence: Record<string, unknown>;
  confidence: "high" | "medium" | "low";
  proposedBy: string;
}

export interface SourceLink extends SourceLinkProposal {
  id: number;
  status: "proposed" | "confirmed" | "rejected";
  reviewedBy: string | null;
  reviewedAt: string | null;
}
