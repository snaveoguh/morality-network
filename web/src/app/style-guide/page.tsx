import { BRAND_DOMAIN, BRAND_NAME, withBrand } from "@/lib/brand";

export const metadata = {
  title: withBrand("Style Guide"),
  description: `Design tokens, typography, grid system, and component reference for ${BRAND_NAME}.`,
};

export default function StyleGuidePage() {
  return (
    <div className="mx-auto max-w-5xl py-6 px-4">
      {/* ══════════════ MASTHEAD ══════════════ */}
      <div className="mb-8 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-masthead text-4xl text-[var(--ink)] sm:text-5xl">
          Style Guide
        </h1>
        <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-light)]">
          Design system reference for {BRAND_NAME} &mdash; the e-ink newspaper aesthetic.
          All tokens, typographic scales, grid rules, and component patterns.
        </p>
        <div className="mt-3 flex items-center gap-3 font-mono text-[8px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <span>Version 2.0</span>
          <span>&middot;</span>
          <span>Base L2</span>
          <span>&middot;</span>
          <span>Permissionless</span>
        </div>
      </div>

      {/* ══════════════ 1. COLOUR PALETTE ══════════════ */}
      <Section title="1. Colour Palette">
        <p className="mb-4 font-body-serif text-sm text-[var(--ink-light)]">
          Monochrome, cream-based palette inspired by aged newsprint. No bright colours &mdash;
          only ink, paper, and the occasional dark red accent for breaking news.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ColorSwatch name="--paper" hex="#F5F0E8" className="bg-[var(--paper)] border border-[var(--rule-light)]" />
          <ColorSwatch name="--paper-dark" hex="#EDE6D6" className="bg-[var(--paper-dark)] border border-[var(--rule-light)]" />
          <ColorSwatch name="--ink" hex="#1A1A1A" className="bg-[var(--ink)]" light />
          <ColorSwatch name="--ink-light" hex="#4A4A4A" className="bg-[var(--ink-light)]" light />
          <ColorSwatch name="--ink-faint" hex="#8A8A8A" className="bg-[var(--ink-faint)]" light />
          <ColorSwatch name="--rule" hex="#2A2A2A" className="bg-[var(--rule)]" light />
          <ColorSwatch name="--rule-light" hex="#C8C0B0" className="bg-[var(--rule-light)]" />
          <ColorSwatch name="--accent-red" hex="#8B0000" className="bg-[var(--accent-red)]" light />
        </div>
      </Section>

      {/* ══════════════ 2. TYPOGRAPHY ══════════════ */}
      <Section title="2. Typography">
        <p className="mb-4 font-body-serif text-sm text-[var(--ink-light)]">
          Four typeface families, each serving a specific editorial role.
          No system sans-serif for content; monospace for UI chrome, serif for everything else.
        </p>

        <div className="space-y-6">
          {/* Masthead / Fraktur */}
          <TypeSample
            name="Masthead &mdash; UnifrakturCook"
            className="font-masthead"
            sample={BRAND_NAME}
            usage="Site nameplate, section mastheads"
            cssClass=".font-masthead"
            sizes={["text-5xl", "text-3xl", "text-xl"]}
          />

          {/* Headline / Playfair */}
          <TypeSample
            name="Headline &mdash; Playfair Display"
            className="font-headline"
            sample="BAE, Lockheed to increase munitions production"
            usage="Article headlines, section titles, hero text"
            cssClass=".font-headline"
            sizes={["text-4xl", "text-2xl", "text-lg"]}
          />

          {/* Body / Baskerville */}
          <TypeSample
            name="Body &mdash; Libre Baskerville"
            className="font-body-serif"
            sample="Real-time current affairs from 70+ sources across the political spectrum. Rate, discuss, and tip content directly onchain."
            usage="Article body, descriptions, editorial copy"
            cssClass=".font-body-serif"
            sizes={["text-lg", "text-base", "text-sm"]}
          />

          {/* Mono / Geist Mono */}
          <TypeSample
            name="UI Chrome &mdash; Geist Mono"
            className="font-mono"
            sample="SOURCE: THE CANARY &middot; POLITICS &middot; 2H AGO"
            usage="Datelines, labels, stats, filters, navigation"
            cssClass="font-mono"
            sizes={["text-xs", "text-[10px]", "text-[8px]"]}
          />
        </div>

        {/* Drop cap */}
        <div className="mt-6 border-t border-[var(--rule-light)] pt-4">
          <Label>Drop Cap</Label>
          <p className="mt-2 max-w-xl font-body-serif text-base leading-[1.8] text-[var(--ink-light)] drop-cap">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam eget
            felis vitae nunc tincidunt vestibulum. Praesent euismod, metus at
            facilisis blandit, tortor nunc posuere neque, nec tincidunt eros
            lacus non odio. Vestibulum ante ipsum primis in faucibus orci luctus
            et ultrices posuere cubilia curae.
          </p>
          <p className="mt-2 font-mono text-[9px] text-[var(--ink-faint)]">
            CSS: <code className="bg-[var(--paper-dark)] px-1">.drop-cap::first-letter</code> &mdash;
            Libre Baskerville 400, 5.5em, float left
          </p>
        </div>
      </Section>

      {/* ══════════════ 3. GRID SYSTEM ══════════════ */}
      <Section title="3. Newspaper Grid">
        <p className="mb-4 font-body-serif text-sm text-[var(--ink-light)]">
          6-column dense grid with <code className="bg-[var(--paper-dark)] px-1 font-mono text-[10px]">grid-auto-flow: dense</code>.
          Items span columns based on editorial weight. Column rules separate cells.
        </p>

        {/* Visual grid demo */}
        <div className="newspaper-grid mb-4">
          <div className="newspaper-cell newspaper-hero bg-[var(--paper-dark)] p-4">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">HERO &mdash; span 6</span>
            <p className="font-body-serif text-xs text-[var(--ink-faint)]">Full-width banner. First item or breaking news.</p>
          </div>
          <div className="newspaper-cell newspaper-major bg-[var(--paper-dark)] p-4">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">MAJOR &mdash; span 3</span>
            <p className="font-body-serif text-xs text-[var(--ink-faint)]">Recent with image, hot casts</p>
          </div>
          <div className="newspaper-cell newspaper-major bg-[var(--paper-dark)] p-4">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">MAJOR &mdash; span 3</span>
            <p className="font-body-serif text-xs text-[var(--ink-faint)]">Active governance proposals</p>
          </div>
          <div className="newspaper-cell newspaper-standard bg-[var(--paper-dark)] p-4">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">STD &mdash; span 2</span>
          </div>
          <div className="newspaper-cell newspaper-standard bg-[var(--paper-dark)] p-4">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">STD &mdash; span 2</span>
          </div>
          <div className="newspaper-cell newspaper-minor bg-[var(--paper-dark)] p-4">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">MINOR &mdash; span 2</span>
          </div>
          <div className="newspaper-cell newspaper-filler bg-[var(--paper-dark)] p-4">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">FILL &mdash; 1</span>
          </div>
          <div className="newspaper-cell newspaper-filler bg-[var(--paper-dark)] p-4">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">FILL &mdash; 1</span>
          </div>
          <div className="newspaper-cell newspaper-filler bg-[var(--paper-dark)] p-4">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">FILL &mdash; 1</span>
          </div>
          <div className="newspaper-cell newspaper-filler bg-[var(--paper-dark)] p-4">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">FILL &mdash; 1</span>
          </div>
        </div>

        <div className="font-mono text-[9px] text-[var(--ink-faint)] space-y-1">
          <p><strong>Desktop (1025px+):</strong> 6 columns</p>
          <p><strong>Tablet (641-1024px):</strong> 4 columns &mdash; hero spans 4, major spans 2</p>
          <p><strong>Mobile (640px-):</strong> 1 column &mdash; all items full-width</p>
        </div>
      </Section>

      {/* ══════════════ 4. RULES & DIVIDERS ══════════════ */}
      <Section title="4. Rules &amp; Dividers">
        <div className="space-y-4">
          <div>
            <Label>Single Rule</Label>
            <hr className="border-t border-[var(--rule)] my-2" />
            <Code>border-top: 1px solid var(--rule)</Code>
          </div>
          <div>
            <Label>Double Rule</Label>
            <div className="my-2">
              <div className="h-px bg-[var(--rule)]" />
              <div className="mt-px h-[2px] bg-[var(--rule)]" />
            </div>
            <Code>1px + 2px solid var(--rule), 1px gap</Code>
          </div>
          <div>
            <Label>Light Rule</Label>
            <hr className="border-t border-[var(--rule-light)] my-2" />
            <Code>border-top: 1px solid var(--rule-light)</Code>
          </div>
          <div>
            <Label>Pull Quote Row</Label>
            <div className="pull-quote-row my-2">
              <p className="font-headline text-lg italic leading-relaxed text-[var(--ink-light)]">
                &ldquo;The truth, like a good compost heap, benefits from multiple contributions.&rdquo;
              </p>
              <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
                &mdash; {BRAND_NAME} editorial
              </p>
            </div>
            <Code>.pull-quote-row &mdash; full grid-column span, double-ruled borders</Code>
          </div>
        </div>
      </Section>

      {/* ══════════════ 5. IMAGE TREATMENT ══════════════ */}
      <Section title="5. Image Treatment">
        <p className="mb-4 font-body-serif text-sm text-[var(--ink-light)]">
          All images are desaturated to grayscale with increased contrast &mdash; mimicking
          e-ink or newspaper halftone printing. A subtle dot-matrix overlay is applied to hero images.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Standard Filter</Label>
            <div className="mt-2 h-32 overflow-hidden border border-[var(--rule-light)]">
              <div className="newspaper-img h-full w-full bg-[var(--paper-dark)]" style={{ background: "linear-gradient(135deg, var(--ink-faint) 0%, var(--rule-light) 50%, var(--ink-light) 100%)" }} />
            </div>
            <Code>.newspaper-img &mdash; grayscale(100%) contrast(1.2) brightness(1.05)</Code>
          </div>
          <div>
            <Label>Hero Overlay</Label>
            <div className="mt-2 h-32 overflow-hidden border border-[var(--rule-light)]">
              <div className="newspaper-img-hero h-full w-full" style={{ background: "linear-gradient(135deg, var(--ink-faint) 0%, var(--rule-light) 50%, var(--ink-light) 100%)" }} />
            </div>
            <Code>.newspaper-img-hero::after &mdash; radial-gradient halftone dot pattern</Code>
          </div>
        </div>
      </Section>

      {/* ══════════════ 6. COMPONENTS ══════════════ */}
      <Section title="6. Components">
        <div className="space-y-6">
          {/* Breaking stamp */}
          <div>
            <Label>Breaking Stamp</Label>
            <div className="relative mt-2 h-20 border border-[var(--rule-light)] bg-[var(--paper-dark)] p-4">
              <span className="breaking-stamp">Breaking</span>
            </div>
            <Code>.breaking-stamp &mdash; absolute, rotated -3deg, dark red border</Code>
          </div>

          {/* Inverted ink block */}
          <div>
            <Label>Ink Block (Inverted)</Label>
            <div className="ink-block mt-2 border border-[var(--rule)] p-4">
              <h3 className="font-headline text-lg">Inverted headline</h3>
              <p className="mt-1 font-body-serif text-sm">Body text on dark background. Used sparingly (&sim;6% of tiles) for visual variety.</p>
            </div>
            <Code>.ink-block &mdash; bg: var(--ink), color: var(--paper), child colors inherit</Code>
          </div>

          {/* Filters */}
          <div>
            <Label>Filter Bar</Label>
            <div className="mt-2 flex flex-wrap items-center gap-0 border-b border-[var(--rule-light)] pb-2 font-mono text-[10px] uppercase tracking-wider">
              <button className="font-bold text-[var(--ink)] underline underline-offset-4 decoration-[var(--rule)]">All</button>
              <span className="mx-1.5 text-[var(--rule-light)]">|</span>
              <button className="text-[var(--ink-faint)] hover:text-[var(--ink)]">World</button>
              <span className="mx-1.5 text-[var(--rule-light)]">|</span>
              <button className="text-[var(--ink-faint)] hover:text-[var(--ink)]">Tech</button>
              <span className="mx-1.5 text-[var(--rule-light)]">|</span>
              <button className="text-[var(--ink-faint)] hover:text-[var(--ink)]">Crypto</button>
              <span className="mx-1.5 text-[var(--rule-light)]">|</span>
              <button className="text-[var(--ink-faint)] hover:text-[var(--ink)]">Governance</button>
            </div>
            <Code>Monospace uppercase, pipe separators, underline on active</Code>
          </div>

          {/* Vote bar */}
          <div>
            <Label>Vote Tally Bar</Label>
            <div className="mt-2 max-w-xs">
              <div className="flex h-1 overflow-hidden bg-[var(--paper-dark)]">
                <div className="bg-[var(--ink)]" style={{ width: "64%" }} />
              </div>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-light)]">
                Ayes 64% &mdash; Noes 36%
              </p>
            </div>
            <Code>Monochrome bar &mdash; ink fill on paper-dark bg, no green/red</Code>
          </div>

          {/* Tip button */}
          <div>
            <Label>Tip Button</Label>
            <div className="mt-2 flex items-center gap-2">
              <button className="flex items-center gap-1 border border-[var(--rule-light)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:border-[var(--rule)] hover:text-[var(--ink)]">
                <span>$</span> Tip
              </button>
              <button className="flex items-center gap-1 border border-[var(--rule-light)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] opacity-50">
                <span className="h-2 w-2 animate-spin border border-[var(--ink)] border-t-transparent" />
                Sign&hellip;
              </button>
              <button className="flex items-center gap-1 border border-[var(--rule-light)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                <span>$</span> Tipped
              </button>
            </div>
            <Code>Monospace, bordered, portal popover with fixed position on click</Code>
          </div>

          {/* Comment form */}
          <div>
            <Label>Comment Form</Label>
            <div className="mt-2 max-w-lg border border-[var(--rule-light)] p-3">
              <textarea
                readOnly
                placeholder="Share your thoughts onchain..."
                className="w-full resize-none border border-[var(--rule-light)] bg-[var(--paper)] p-2.5 font-body-serif text-sm text-[var(--ink)] placeholder-[var(--ink-faint)] focus:border-[var(--rule)] focus:outline-none"
                rows={2}
              />
              <div className="mt-1.5 flex items-center justify-between">
                <span className="font-mono text-[8px] text-[var(--ink-faint)]">0/2000 &mdash; Stored permanently onchain</span>
                <button className="border border-[var(--rule)] bg-[var(--ink)] px-3 py-1 font-mono text-[9px] uppercase tracking-wider text-[var(--paper)]">
                  Post Onchain
                </button>
              </div>
            </div>
            <Code>Cream bg textarea, ink submit button, monospace chrome</Code>
          </div>
        </div>
      </Section>

      {/* ══════════════ 7. CHAOTIC LAYOUT ══════════════ */}
      <Section title="7. Chaotic Layout Tokens">
        <p className="mb-4 font-body-serif text-sm text-[var(--ink-light)]">
          Controlled chaos. Deterministic variation derived from title hashes &mdash;
          same content always gets the same visual treatment across page loads.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="tilt-cw-sm border border-[var(--rule-light)] p-3 text-center">
            <Code>.tilt-cw-sm</Code>
            <p className="mt-1 font-mono text-[9px] text-[var(--ink-faint)]">rotate(0.4deg)</p>
          </div>
          <div className="tilt-cw-md border border-[var(--rule-light)] p-3 text-center">
            <Code>.tilt-cw-md</Code>
            <p className="mt-1 font-mono text-[9px] text-[var(--ink-faint)]">rotate(0.9deg)</p>
          </div>
          <div className="tilt-ccw-sm border border-[var(--rule-light)] p-3 text-center">
            <Code>.tilt-ccw-sm</Code>
            <p className="mt-1 font-mono text-[9px] text-[var(--ink-faint)]">rotate(-0.35deg)</p>
          </div>
          <div className="tilt-ccw-md border border-[var(--rule-light)] p-3 text-center">
            <Code>.tilt-ccw-md</Code>
            <p className="mt-1 font-mono text-[9px] text-[var(--ink-faint)]">rotate(-0.8deg)</p>
          </div>
        </div>

        <div className="mt-4 space-y-2 font-mono text-[9px] text-[var(--ink-faint)]">
          <p><strong>Ink blocks:</strong> ~6% of tiles (seed % 19 === 0), never on hero</p>
          <p><strong>Triangle feature:</strong> Exactly one per page &mdash; a major RSS tile with image, floated polygon clip</p>
          <p><strong>Pull quotes:</strong> Injected every ~12 items from nearby article descriptions</p>
        </div>
      </Section>

      {/* ══════════════ 8. SPACING & SIZING ══════════════ */}
      <Section title="8. Spacing Reference">
        <div className="font-mono text-[10px] text-[var(--ink-light)] space-y-1.5">
          <p><strong>Header height:</strong> h-12 (48px)</p>
          <p><strong>Cell padding:</strong> 14px 16px</p>
          <p><strong>Max content width:</strong> max-w-7xl (1280px) for grid, max-w-3xl (768px) for articles</p>
          <p><strong>Hero image height:</strong> clamp(280px, 40vw, 480px)</p>
          <p><strong>Major image height:</strong> h-44 (176px)</p>
          <p><strong>Standard image height:</strong> h-28 (112px)</p>
          <p><strong>Sparkline:</strong> 48&times;16px SVG polyline</p>
          <p><strong>Scrollbar:</strong> 6px width, square thumb, cream track</p>
        </div>
      </Section>

      {/* ══════════════ COLOPHON ══════════════ */}
      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4 pb-8 text-center">
        <div className="h-px bg-[var(--rule)] mb-1" />
        <div className="h-[2px] bg-[var(--rule)] mb-3" />
        <p className="font-mono text-[7px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          {BRAND_DOMAIN} &bull; permissionless &bull; onchain &bull; base l2
        </p>
      </footer>
    </div>
  );
}

// ── Helper Components ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-4 border-b-2 border-[var(--rule)] pb-2">
        <h2 className="font-headline text-xl text-[var(--ink)]" dangerouslySetInnerHTML={{ __html: title }} />
      </div>
      {children}
    </section>
  );
}

function ColorSwatch({ name, hex, className, light = false }: { name: string; hex: string; className: string; light?: boolean }) {
  return (
    <div>
      <div className={`h-16 ${className}`} />
      <p className={`mt-1.5 font-mono text-[10px] font-bold ${light ? "text-[var(--ink)]" : "text-[var(--ink)]"}`}>{name}</p>
      <p className="font-mono text-[9px] text-[var(--ink-faint)]">{hex}</p>
    </div>
  );
}

function TypeSample({
  name,
  className,
  sample,
  usage,
  cssClass,
  sizes,
}: {
  name: string;
  className: string;
  sample: string;
  usage: string;
  cssClass: string;
  sizes: string[];
}) {
  return (
    <div className="border-b border-[var(--rule-light)] pb-4">
      <Label dangerousHtml={name} />
      <div className="mt-2 space-y-1">
        {sizes.map((size) => (
          <p key={size} className={`${className} ${size} text-[var(--ink)]`} dangerouslySetInnerHTML={{ __html: sample }} />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 font-mono text-[9px] text-[var(--ink-faint)]">
        <span>CSS: <code className="bg-[var(--paper-dark)] px-1">{cssClass}</code></span>
        <span>&middot;</span>
        <span>{usage}</span>
      </div>
    </div>
  );
}

function Label({ children, dangerousHtml }: { children?: React.ReactNode; dangerousHtml?: string }) {
  if (dangerousHtml) {
    return <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]" dangerouslySetInnerHTML={{ __html: dangerousHtml }} />;
  }
  return <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 font-mono text-[9px] text-[var(--ink-faint)]">{children}</p>;
}
