/** Contract architecture breakdown + security model */

const CONTRACTS = [
  {
    name: "BaseCapitalVault",
    chain: "Base",
    role: "Core vault — accepts deposits, issues ERC-20 shares, manages capital sleeves",
    sleeve: "All",
    color: "var(--accent-red)",
  },
  {
    name: "MorphoReserveAllocator",
    chain: "Base",
    role: "Deposits idle WETH into Morpho ERC-4626 vault for yield on reserves",
    sleeve: "Reserve",
    color: "#1d4ed8",
  },
  {
    name: "BridgeRouter",
    chain: "Base",
    role: "Coordinates outbound/inbound cross-chain routes with state machine lifecycle",
    sleeve: "Bridge",
    color: "#b45309",
  },
  {
    name: "ExecutorAssetConverter",
    chain: "Base",
    role: "Converts WETH to bridge-compatible asset (and back) at admin-set rates",
    sleeve: "Bridge",
    color: "#b45309",
  },
  {
    name: "ExecutorBridgeAdapter",
    chain: "Base",
    role: "Wraps the actual cross-chain bridge transfer via executor EOA",
    sleeve: "Bridge",
    color: "#b45309",
  },
  {
    name: "ArbTransitEscrow",
    chain: "Arbitrum",
    role: "Holds assets in transit on Arbitrum between bridge arrival and strategy deployment",
    sleeve: "Bridge/Strategy",
    color: "#b45309",
  },
  {
    name: "HLStrategyManager",
    chain: "Arbitrum",
    role: "Releases assets from escrow to hot wallet for HyperLiquid perps trading",
    sleeve: "Strategy",
    color: "#b91c1c",
  },
  {
    name: "NavReporter",
    chain: "Base",
    role: "Pushes daily NAV updates to vault — reconciles strategy equity with share price",
    sleeve: "Accounting",
    color: "var(--ink)",
  },
  {
    name: "WithdrawalQueue",
    chain: "Base",
    role: "Manages queued withdrawal requests when liquid assets are insufficient",
    sleeve: "Withdrawals",
    color: "var(--ink)",
  },
  {
    name: "MoralityAgentVault",
    chain: "Base",
    role: "Simpler ETH-native vault (legacy) — direct balance-based accounting",
    sleeve: "Legacy",
    color: "var(--ink-faint)",
  },
];

const ROLES = [
  {
    role: "Owner",
    trust: "Full admin",
    description: "Can change all role addresses, set parameters, pause/unpause. Should be behind a timelock + multisig.",
  },
  {
    role: "Allocator",
    trust: "High",
    description: "Can move capital between vault sleeves (liquid, reserve, bridge, strategy). Pure bookkeeping — no direct token transfers.",
  },
  {
    role: "NAV Reporter",
    trust: "High",
    description: "Updates share price via daily NAV settlement. Bounded by maxNavDeltaBps (10% default) per report.",
  },
  {
    role: "Bridge Executor",
    trust: "High",
    description: "Controls all bridge route state transitions. No cross-chain proof verification — fully trusted oracle.",
  },
  {
    role: "Operator",
    trust: "Medium",
    description: "Initiates bridge routes and strategy deployments. Cannot directly move funds without executor.",
  },
  {
    role: "Strategy Hot Wallet",
    trust: "Critical",
    description: "EOA that holds funds on HyperLiquid. No smart contract enforcement for return. Must maintain ERC-20 approval.",
  },
];

const AUDIT_SUMMARY = {
  total: 52,
  critical: 4,
  high: 12,
  medium: 18,
  low: 14,
  info: 4,
  topIssues: [
    "Single-operator custody model — no timelocks or multisig on privileged operations",
    "NAV reporter can drift share price by up to 10% per report interval",
    "Strategy hot wallet has no forced-return mechanism",
    "Cross-chain state is entirely off-chain — bridge executor is trusted oracle",
  ],
};

export function VaultArchitectureSection() {
  return (
    <div className="space-y-10">
      {/* Capital Sleeves */}
      <section>
        <h2 className="mb-4 border-b-2 border-[var(--rule)] pb-2 font-headline text-xl tracking-wide">
          Capital Allocation Sleeves
        </h2>
        <p className="mb-4 font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
          The vault divides its total managed assets into four sleeves, each serving a distinct purpose.
          The allocator role manages the balance between sleeves based on market conditions and strategy needs.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Liquid", color: "border-emerald-700 text-emerald-700", desc: "Immediately available for withdrawals. WETH held in vault contract." },
            { label: "Reserve", color: "border-blue-700 text-blue-700", desc: "Earning yield in Morpho ERC-4626 vault. Redeemable for withdrawals." },
            { label: "Bridge", color: "border-amber-700 text-amber-700", desc: "In transit between Base and Arbitrum. Tracked by BridgeRouter state machine." },
            { label: "Strategy", color: "border-red-700 text-red-700", desc: "Deployed to HyperLiquid via hot wallet. Illiquid until strategy returns." },
          ].map((s) => (
            <div key={s.label} className={`border-2 ${s.color} p-4`}>
              <div className={`mb-2 font-headline text-sm uppercase tracking-widest ${s.color}`}>
                {s.label}
              </div>
              <p className="font-body-serif text-xs leading-relaxed text-[var(--ink-light)]">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Smart Contracts Table */}
      <section>
        <h2 className="mb-4 border-b-2 border-[var(--rule)] pb-2 font-headline text-xl tracking-wide">
          Smart Contracts
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-[var(--ink)]">
                <th className="py-2 pr-4 font-mono text-[9px] uppercase tracking-widest text-[var(--ink-faint)]">Contract</th>
                <th className="py-2 pr-4 font-mono text-[9px] uppercase tracking-widest text-[var(--ink-faint)]">Chain</th>
                <th className="py-2 pr-4 font-mono text-[9px] uppercase tracking-widest text-[var(--ink-faint)]">Sleeve</th>
                <th className="py-2 font-mono text-[9px] uppercase tracking-widest text-[var(--ink-faint)]">Role</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACTS.map((c) => (
                <tr key={c.name} className="border-b border-[var(--rule-light)]">
                  <td className="py-2.5 pr-4">
                    <span className="font-mono text-xs font-bold" style={{ color: c.color }}>
                      {c.name}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[10px] text-[var(--ink-faint)]">
                    {c.chain}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[10px] text-[var(--ink-faint)]">
                    {c.sleeve}
                  </td>
                  <td className="py-2.5 font-body-serif text-xs text-[var(--ink-light)]">
                    {c.role}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trust Model */}
      <section>
        <h2 className="mb-4 border-b-2 border-[var(--rule)] pb-2 font-headline text-xl tracking-wide">
          Trust Model &amp; Privileged Roles
        </h2>
        <p className="mb-4 font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
          The vault system relies on a hierarchy of privileged roles. Each role has specific powers
          bounded by onchain constraints. The contracts are custodial infrastructure &mdash; actual fund
          safety depends on the integrity of these key holders.
        </p>
        <div className="space-y-3">
          {ROLES.map((r) => (
            <div key={r.role} className="flex items-start gap-4 border-b border-[var(--rule-light)] pb-3">
              <div className="flex w-32 shrink-0 items-center gap-2">
                <span className="font-mono text-xs font-bold text-[var(--ink)]">{r.role}</span>
              </div>
              <div className="shrink-0">
                <span
                  className={`inline-block rounded border px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider ${
                    r.trust === "Critical"
                      ? "border-red-700 text-red-700"
                      : r.trust === "Full admin"
                        ? "border-[var(--accent-red)] text-[var(--accent-red)]"
                        : r.trust === "High"
                          ? "border-amber-700 text-amber-700"
                          : "border-[var(--ink-faint)] text-[var(--ink-faint)]"
                  }`}
                >
                  {r.trust}
                </span>
              </div>
              <p className="font-body-serif text-xs leading-relaxed text-[var(--ink-light)]">
                {r.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Audit Summary */}
      <section>
        <h2 className="mb-4 border-b-2 border-[var(--rule)] pb-2 font-headline text-xl tracking-wide">
          Security Audit Summary
        </h2>
        <p className="mb-4 font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
          All 10 contracts underwent automated security analysis. {AUDIT_SUMMARY.total} findings
          were identified and addressed prior to deployment. The full audit report is available in
          the repository at <code className="font-mono text-[10px]">contracts/SECURITY_AUDIT.md</code>.
        </p>

        <div className="mb-6 grid grid-cols-5 gap-2 text-center">
          {[
            { label: "Critical", count: AUDIT_SUMMARY.critical, color: "bg-red-800 text-white" },
            { label: "High", count: AUDIT_SUMMARY.high, color: "bg-red-600 text-white" },
            { label: "Medium", count: AUDIT_SUMMARY.medium, color: "bg-amber-600 text-white" },
            { label: "Low", count: AUDIT_SUMMARY.low, color: "bg-[var(--ink-faint)] text-white" },
            { label: "Info", count: AUDIT_SUMMARY.info, color: "bg-[var(--rule)] text-[var(--ink)]" },
          ].map((s) => (
            <div key={s.label} className={`${s.color} py-3`}>
              <div className="font-headline text-lg">{s.count}</div>
              <div className="font-mono text-[8px] uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="border-2 border-[var(--rule)] p-4">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[var(--ink-faint)]">
            Key Architectural Risks
          </div>
          <ul className="space-y-2">
            {AUDIT_SUMMARY.topIssues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 font-body-serif text-xs leading-relaxed text-[var(--ink-light)]">
                <span className="mt-0.5 font-mono text-[10px] text-[var(--accent-red)]">&#9679;</span>
                {issue}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 border border-[var(--rule-light)] bg-[var(--paper)] p-4">
          <p className="font-body-serif text-xs italic leading-relaxed text-[var(--ink-faint)]">
            This was an automated static analysis, not a formal audit by a professional security firm.
            Before deploying contracts that manage real user funds, engage a reputable auditor
            (Trail of Bits, OpenZeppelin, Spearbit, etc.) for a manual review.
          </p>
        </div>
      </section>
    </div>
  );
}
