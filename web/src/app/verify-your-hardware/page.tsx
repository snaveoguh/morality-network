import type { Metadata } from "next";
import Link from "next/link";

import { BRAND_DOMAIN, withBrand } from "@/lib/brand";

// ============================================================================
// VERIFY YOUR HARDWARE — a static guide to buying and setting up a hardware
// wallet safely, and to the other "silicon" in your life (phone, TV, smart
// devices). Linked from /account, the MO claim panel, More and the wallet row.
//
// Rules for editing this page:
// - Plain, factual copy. No hype, no favourite brand, no affiliate links.
// - Link to makers' own sites, never to marketplace listings.
// - Never ask for, or show a field for, a recovery phrase.
// ============================================================================

const LAST_UPDATED = "5 November 2026";
const EF_POST = "https://x.com/ethereumfndn/status/2117564949950030117";

export const metadata: Metadata = {
  title: withBrand("Verify your hardware"),
  description:
    "How to buy a hardware wallet safely, check it is genuine, and keep your recovery phrase off every phone, computer and website. Plus what to switch off on phones and TVs.",
};

interface Section {
  id: string;
  title: string;
  body: React.ReactNode;
}

// Alphabetical. Not a ranking, not exhaustive, no affiliate links. Each link
// goes to the maker's own site; reseller pages only where we checked they exist.
const MAKERS: { name: string; site: string; resellers?: string }[] = [
  { name: "BitBox", site: "https://bitbox.swiss/" },
  { name: "Coldcard", site: "https://coldcard.com/" },
  { name: "Foundation (Passport)", site: "https://foundation.xyz/" },
  { name: "GridPlus (Lattice)", site: "https://gridplus.io/" },
  { name: "Keystone", site: "https://keyst.one/" },
  { name: "Ledger", site: "https://www.ledger.com/", resellers: "https://shop.ledger.com/pages/resellers" },
  { name: "OneKey", site: "https://onekey.so/" },
  { name: "Trezor", site: "https://trezor.io/", resellers: "https://trezor.io/resellers" },
];

const SECTIONS: Section[] = [
  {
    id: "where-to-buy",
    title: "1. Buy direct, or from a listed reseller",
    body: (
      <>
        <p>
          Buy from the manufacturer&apos;s own shop, or from a reseller the
          manufacturer lists on its own website. Type the maker&apos;s address
          yourself rather than following a search ad or a link in a message.
        </p>
        <ul>
          <li>
            <strong>Do not buy from marketplaces</strong> (Amazon third-party
            sellers, eBay, Facebook Marketplace, Telegram groups) or
            second-hand. A device that has passed through someone else&apos;s
            hands can be opened, altered and resealed.
          </li>
          <li>
            <strong>A low price is not a reason.</strong> Tampered devices are
            often sold just under the official price.
          </li>
          <li>
            If you are not sure a shop is authorised, check the maker&apos;s
            reseller list or ask the maker&apos;s support before you pay.
          </li>
        </ul>
        <p>Makers&apos; own sites, in alphabetical order:</p>
        <ul className="maker-list">
          {MAKERS.map((m) => (
            <li key={m.name}>
              <a href={m.site} target="_blank" rel="noopener noreferrer">
                {m.name}
              </a>
              {m.resellers && (
                <>
                  {" · "}
                  <a href={m.resellers} target="_blank" rel="noopener noreferrer">
                    authorised resellers
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="note">
          This list is not a recommendation or a ranking, and it is not
          complete. We earn nothing from any of these links.
        </p>
      </>
    ),
  },
  {
    id: "seed",
    title: "2. You make the recovery phrase. Nobody else.",
    body: (
      <>
        <p>
          The recovery phrase (12 or 24 words, also called a seed) is the
          wallet. Whoever has it has the funds. A genuine device creates a new
          one on the device itself, during setup, and shows it to you once.
        </p>
        <ul>
          <li>
            <strong>Stop if the box contains a recovery phrase</strong>, a
            scratch card with words or a PIN, or a card that says a phrase has
            been &ldquo;pre-generated for you&rdquo;. No legitimate maker does
            this. Do not use the device; contact the maker.
          </li>
          <li>
            <strong>Stop if the device is already set up</strong> when you turn
            it on, or asks you to <em>restore</em> rather than <em>create</em> a
            wallet on first use.
          </li>
          <li>
            Write the phrase on paper (or stamp it in metal) as the device shows
            it. Store it somewhere private. Never photograph it.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "tamper",
    title: "3. Check the packaging, then check the device",
    body: (
      <>
        <p>Before you use it:</p>
        <ul>
          <li>
            Compare the box, seals and device with the photos on the
            maker&apos;s own website. Look for reglued edges, broken or
            replaced seals, scratches on the case and loose parts.
          </li>
          <li>
            Install the maker&apos;s companion app from the maker&apos;s own
            site, not from a link in an email or an ad.
          </li>
          <li>
            <strong>Run the maker&apos;s genuine or attestation check on first
            boot.</strong> Most devices hold a key from the factory and prove
            to the official app that the hardware and firmware are the
            maker&apos;s own. If the check fails, or the app says the firmware
            is unofficial, stop.
          </li>
          <li>
            Only install firmware updates offered by the official app, and only
            when you started the update yourself.
          </li>
        </ul>
        <p>
          Packaging seals can be faked, so they are a first check, not proof.
          The attestation check matters more.
        </p>
      </>
    ),
  },
  {
    id: "open",
    title: "4. Prefer things you (or others) can verify",
    body: (
      <>
        <p>
          The Ethereum Foundation put it as{" "}
          <a href={EF_POST} target="_blank" rel="noopener noreferrer">
            &ldquo;Not your silicon, not your life&rdquo;
          </a>
          : a device you cannot inspect asks you to trust whoever made it, and
          everyone it passed through on the way to you. The same rule we apply
          to claims applies here: don&apos;t trust, verify.
        </p>
        <ul>
          <li>
            <strong>Open-source firmware</strong> means anyone can read the code
            that handles your keys, and researchers can publish what they
            find.
          </li>
          <li>
            <strong>Reproducible builds</strong> mean independent people can
            compile that source and get exactly the file the maker ships, so
            the published code is the code on your device. The site{" "}
            <a href="https://walletscrutiny.com/" target="_blank" rel="noopener noreferrer">
              WalletScrutiny
            </a>{" "}
            tracks which wallets have been checked this way. (Background:{" "}
            <a href="https://reproducible-builds.org/" target="_blank" rel="noopener noreferrer">
              reproducible-builds.org
            </a>
            .)
          </li>
          <li>
            <strong>Open hardware</strong> publishes the circuit design, so the
            board can be compared with what is documented.
          </li>
        </ul>
        <p>The trade-offs, honestly:</p>
        <ul>
          <li>
            Most devices use a <em>secure element</em>: a chip built to resist
            physical attacks. Its internals are usually under non-disclosure
            agreements and cannot be fully published. Fully open devices are
            easier to audit but can be easier to attack with physical access.
            Some makers combine an open main chip with a closed secure element.
          </li>
          <li>
            Open source helps only if someone checks it. A reproducible build
            nobody reproduces proves nothing.
          </li>
          <li>
            No device protects a phrase that has been typed into a computer,
            photographed or handed to a stranger. Steps 1 to 3 matter more than
            which brand you choose.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "never-type",
    title: "5. Never type your phrase into a phone, computer or website",
    body: (
      <>
        <p>
          The point of a hardware wallet is that the phrase never touches an
          internet-connected device. Once it has been typed into one, treat
          the wallet as exposed and move the funds to a new one.
        </p>
        <ul>
          <li>
            No real support desk, wallet app, airdrop, &ldquo;sync&rdquo; or
            &ldquo;validation&rdquo; page needs your phrase. Anyone who asks is
            trying to take your funds.
          </li>
          <li>
            Fake &ldquo;recovery&rdquo; tools, browser extensions and
            look-alike apps are the most common way phrases are stolen.
          </li>
          <li>
            <strong>Nobody from {BRAND_DOMAIN} will ever ask for your recovery
            phrase or private key</strong>, by email, direct message, phone or
            on any page.
          </li>
        </ul>
        <p className="note">
          One clarification: the &ldquo;Create my wallet&rdquo; option on your{" "}
          <Link href="/account">account page</Link> makes a new phrase in your
          browser and asks you to retype three of its words to check you wrote
          it down. None of it is sent to us. It is a software (&ldquo;hot&rdquo;)
          wallet, which is fine for claiming. For amounts you would not want to
          lose, move to a hardware wallet whose phrase never touches a screen.
        </p>
      </>
    ),
  },
  {
    id: "your-silicon",
    title: "6. Your other silicon: phones, TVs and smart devices",
    body: (
      <>
        <p>
          &ldquo;Your silicon&rdquo; is every chip that can see, hear or record
          you: the phone in your pocket, the TV in your living room, speakers,
          cameras, doorbells and cars. You cannot audit most of them, but you
          can cut down what they collect.
        </p>
        <h3>Phones</h3>
        <ul>
          <li>Install system updates promptly, and replace phones that no longer get them.</li>
          <li>Install apps only from the official store, and remove ones you no longer use.</li>
          <li>Review which apps have microphone, camera, location and contacts access, and turn off what they do not need.</li>
          <li>Use a strong passcode, not just a fingerprint or face, and turn on remote wipe.</li>
          <li>Set a SIM PIN, and ask your mobile network for a port-out or SIM-swap lock so nobody can move your number to their SIM.</li>
        </ul>
        <h3>Smart TVs</h3>
        <ul>
          <li>
            Turn off <strong>automatic content recognition</strong> (ACR): it
            reports what is on your screen, including from other inputs, to the
            TV maker. The setting is usually under Privacy, Terms or Viewing
            data; names include &ldquo;Viewing Information Services&rdquo;,
            &ldquo;Live Plus&rdquo;, &ldquo;Viewing Data&rdquo; and
            &ldquo;Use info from TV inputs&rdquo;.
          </li>
          <li>Opt out of personalised ads and reset the advertising ID.</li>
          <li>Turn off voice assistants and built-in microphones or cameras you do not use.</li>
          <li>If you only stream through a separate box, you can leave the TV itself offline.</li>
        </ul>
        <h3>Speakers, cameras and other devices</h3>
        <ul>
          <li>Change default passwords and turn on updates.</li>
          <li>Use the physical mute switch on speakers when you do not need them.</li>
          <li>Put smart-home devices on a guest network, apart from the computers and phones you use for money.</li>
          <li>Do not do wallet setup or signing on a shared or second-hand computer.</li>
        </ul>
      </>
    ),
  },
];

export default function VerifyYourHardwarePage() {
  return (
    <div className="mx-auto max-w-3xl pb-10 pt-4 sm:pt-8">
      <header className="border-b-4 border-double border-[var(--ink)] pb-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Guide
        </p>
        <h1 className="news-head mt-2 text-[32px] leading-[1.05] text-[var(--ink)] sm:text-5xl">
          Verify your hardware
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--ink-light)]">
          How to buy a hardware wallet safely, check it is genuine, and keep
          your recovery phrase where it belongs. Tampered devices are sold with
          pre-set phrases or altered parts that leak keys; these steps stop
          almost all of it.
        </p>
        <p className="mt-3 text-[12px] text-[var(--ink-faint)]">Last updated {LAST_UPDATED}</p>
      </header>

      {/* Short version */}
      <section aria-label="The short version" className="mt-6 bg-[var(--paper-tint)] p-5 sm:p-6">
        <h2 className="news-label text-xl text-[var(--ink)]">The short version</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-[var(--ink)]">
          <li>Buy from the maker or a reseller it lists. Never second-hand or from a marketplace.</li>
          <li>If the box contains a recovery phrase or scratch card, do not use it.</li>
          <li>Check the seals, then run the maker&apos;s genuine check on first boot.</li>
          <li>Prefer open-source, reproducibly built firmware.</li>
          <li>Never type your phrase into a phone, computer or website. We will never ask for it.</li>
        </ol>
      </section>

      {/* Contents */}
      <nav aria-label="Contents" className="mt-6">
        <ul className="flex flex-col border-t border-[var(--rule-light)] text-[15px]">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--rule-light)] py-2 text-[var(--ink)]"
              >
                <span>{s.title}</span>
                <span className="text-[var(--ink-faint)]" aria-hidden>
                  ›
                </span>
              </a>
            </li>
          ))}
          <li>
            <a
              href="#mo-claim"
              className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--rule-light)] py-2 text-[var(--ink)]"
            >
              <span>The MO claim: what we will never ask for</span>
              <span className="text-[var(--ink-faint)]" aria-hidden>
                ›
              </span>
            </a>
          </li>
        </ul>
      </nav>

      {SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="mt-10 scroll-mt-20">
          <h2 className="news-label border-b border-[var(--rule)] pb-2 text-[22px] leading-tight text-[var(--ink)]">
            {section.title}
          </h2>
          <div className="guide-body mt-4 text-[15px] leading-relaxed text-[var(--ink-light)] [&_.maker-list]:grid [&_.maker-list]:gap-1 sm:[&_.maker-list]:grid-cols-2 [&_.note]:text-[13px] [&_.note]:text-[var(--ink-faint)] [&_a]:text-[var(--ink)] [&_a]:underline [&_a]:underline-offset-2 [&_h3]:news-label [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:text-[var(--ink)] [&_li]:mb-2 [&_p]:mb-3 [&_strong]:text-[var(--ink)] [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
            {section.body}
          </div>
        </section>
      ))}

      {/* MO claim box — kept generic on purpose. */}
      <section
        id="mo-claim"
        aria-label="The MO claim"
        className="mt-12 scroll-mt-20 border-2 border-[var(--ink)] bg-[var(--paper-tint)] p-5 sm:p-7"
      >
        <h2 className="news-label text-[22px] leading-tight text-[var(--ink)]">
          The MO claim: how it works, and what we will never ask for
        </h2>
        <div className="mt-4 grid gap-6 text-[15px] leading-relaxed sm:grid-cols-2">
          <div>
            <h3 className="news-label text-lg text-[var(--ink)]">How it works</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-[var(--ink-light)]">
              <li>
                You claim from your own wallet, on{" "}
                <Link href="/account" className="text-[var(--ink)] underline underline-offset-2">
                  {BRAND_DOMAIN}/account
                </Link>{" "}
                and nowhere else.
              </li>
              <li>You link your wallet by signing a message. Signing a message moves no funds.</li>
              <li>
                The claim is checked against a published list of balances. It
                can only pay the wallet you linked; nobody, including us, can
                redirect it.
              </li>
              <li>Your wallet shows you the transaction before you approve it. Read it.</li>
            </ul>
          </div>
          <div>
            <h3 className="news-label text-lg text-[var(--ink)]">We will never</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-[var(--ink-light)]">
              <li>ask for your recovery phrase or private key, anywhere;</li>
              <li>ask you to send tokens or ETH to &ldquo;unlock&rdquo;, &ldquo;verify&rdquo; or speed up a claim;</li>
              <li>message you first about a claim, or send you a link to a different site;</li>
              <li>ask you to install software or a browser extension to claim.</li>
            </ul>
          </div>
        </div>
        <p className="mt-5 border-t border-[var(--rule-light)] pt-4 text-[13px] text-[var(--ink-faint)]">
          If someone asks for any of these in our name, it is not us. You do
          not need a new device to claim; if you are buying one anyway, follow
          the steps above.
        </p>
      </section>

      <footer className="mt-12 border-t-4 border-double border-[var(--ink)] pt-4 text-[13px] text-[var(--ink-faint)]">
        <p>
          This guide is general information, not security or financial advice.
          Follow your device maker&apos;s own instructions where they differ.
          Corrections welcome.
        </p>
        <p className="mt-2">
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>
          {" · "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms and risk
          </Link>
          {" · "}
          <Link href="/account" className="underline underline-offset-2">
            Your account
          </Link>
        </p>
      </footer>
    </div>
  );
}
