/** CSS/SVG flow diagram showing vault fund path: Base → Arbitrum → HyperLiquid */

const BOX =
  "border-2 border-[var(--ink)] bg-[var(--paper)] px-4 py-3 text-center transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)]";
const BOX_ACCENT =
  "border-2 border-[var(--accent-red)] bg-[var(--paper)] px-4 py-3 text-center transition-colors hover:bg-[var(--accent-red)] hover:text-[var(--paper)]";
const LABEL = "font-headline text-sm tracking-wide";
const SUB = "font-mono text-[9px] uppercase tracking-widest text-[var(--ink-faint)] mt-1";
const ARROW = "mx-auto flex h-8 w-px border-l-2 border-dashed border-[var(--ink-faint)]";
const ARROW_H = "flex h-px w-8 border-t-2 border-dashed border-[var(--ink-faint)]";

function ArrowDown() {
  return (
    <div className="flex flex-col items-center">
      <div className={ARROW} />
      <span className="font-mono text-[10px] text-[var(--ink-faint)]">&#9660;</span>
    </div>
  );
}

function ArrowRight() {
  return (
    <div className="flex items-center">
      <div className={ARROW_H} />
      <span className="font-mono text-[10px] text-[var(--ink-faint)]">&#9654;</span>
    </div>
  );
}

export function VaultFlowDiagram() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* Step 1: User */}
      <div className="flex justify-center">
        <div className={BOX} style={{ minWidth: 220 }}>
          <div className={LABEL}>User Deposits ETH</div>
          <div className={SUB}>Base L2</div>
        </div>
      </div>

      <ArrowDown />

      {/* Step 2: BaseCapitalVault with branches */}
      <div className="flex flex-col items-center gap-4 md:flex-row md:justify-center md:gap-6">
        {/* Morpho Reserve (left) */}
        <div className="order-2 flex flex-col items-center md:order-1">
          <div className={BOX} style={{ minWidth: 180 }}>
            <div className={LABEL}>Morpho Reserve</div>
            <div className={SUB}>Idle yield (ERC-4626)</div>
          </div>
          <div className="mt-2 rounded border border-[var(--rule-light)] px-3 py-1.5">
            <span className="font-mono text-[9px] uppercase tracking-wider text-blue-700">
              Reserve sleeve
            </span>
          </div>
        </div>

        {/* Central vault */}
        <div className="order-1 flex flex-col items-center md:order-2">
          <div className={BOX_ACCENT} style={{ minWidth: 240 }}>
            <div className="font-headline text-base tracking-wide">BaseCapitalVault</div>
            <div className={SUB}>ERC-20 shares &middot; WETH denominated</div>
          </div>

          {/* Sleeve indicators */}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <span className="rounded border border-emerald-700 px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-emerald-700">
              Liquid
            </span>
            <span className="rounded border border-blue-700 px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-blue-700">
              Reserve
            </span>
            <span className="rounded border border-amber-700 px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber-700">
              Bridge
            </span>
            <span className="rounded border border-red-700 px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-red-700">
              Strategy
            </span>
          </div>
        </div>

        {/* NAV Reporter (right) */}
        <div className="order-3 flex flex-col items-center">
          <div className={BOX} style={{ minWidth: 180 }}>
            <div className={LABEL}>NAV Reporter</div>
            <div className={SUB}>Daily share price oracle</div>
          </div>
          <div className="mt-2 rounded border border-[var(--rule-light)] px-3 py-1.5">
            <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
              Reconciliation
            </span>
          </div>
        </div>
      </div>

      <ArrowDown />

      {/* Step 3: Bridge layer */}
      <div className="flex flex-col items-center gap-4 md:flex-row md:justify-center md:gap-6">
        <div className={BOX} style={{ minWidth: 200 }}>
          <div className={LABEL}>BridgeRouter</div>
          <div className={SUB}>Base &rarr; Arbitrum</div>
        </div>
        <ArrowRight />
        <div className={BOX} style={{ minWidth: 200 }}>
          <div className={LABEL}>Asset Converter</div>
          <div className={SUB}>WETH &harr; Bridge asset</div>
        </div>
        <ArrowRight />
        <div className={BOX} style={{ minWidth: 200 }}>
          <div className={LABEL}>Bridge Adapter</div>
          <div className={SUB}>Cross-chain transfer</div>
        </div>
      </div>

      <ArrowDown />

      {/* Step 4: Arbitrum layer */}
      <div className="flex justify-center">
        <div className={BOX} style={{ minWidth: 240 }}>
          <div className={LABEL}>ArbTransitEscrow</div>
          <div className={SUB}>Arbitrum &middot; Holds assets in transit</div>
        </div>
      </div>

      <ArrowDown />

      {/* Step 5: Strategy */}
      <div className="flex flex-col items-center gap-4 md:flex-row md:justify-center md:gap-6">
        <div className={BOX} style={{ minWidth: 200 }}>
          <div className={LABEL}>HLStrategyManager</div>
          <div className={SUB}>Releases to hot wallet</div>
        </div>
        <ArrowRight />
        <div className={BOX_ACCENT} style={{ minWidth: 240 }}>
          <div className="font-headline text-base tracking-wide">HyperLiquid</div>
          <div className={SUB}>Perps trading &middot; 40x leverage</div>
        </div>
      </div>

      {/* Return path annotation */}
      <div className="mt-6 border-t-2 border-dashed border-[var(--rule-light)] pt-4 text-center">
        <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--ink-faint)]">
          &#8593; Returns flow back: HL &rarr; Escrow &rarr; Bridge &rarr; Vault &rarr; NAV settlement &rarr; Share price update
        </span>
      </div>
    </div>
  );
}
