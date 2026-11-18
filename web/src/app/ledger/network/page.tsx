import Link from "next/link";
import { GovernmentNetwork } from "@/components/ledger/GovernmentNetwork";
import { days, formatDate } from "@/components/ledger/CorrectionRow";
import { getCorrectionsRegister } from "@/lib/ledger/corrections-service";
import { buildGovernmentNetwork, layoutNetwork } from "@/lib/ledger/government-network";
import { BRAND_NAME, withBrand } from "@/lib/brand";

export const revalidate = 3600;

export const metadata = {
  title: withBrand("The Government Network"),
  description:
    "Departments and the ministers who corrected the official record for them, drawn as one network. Every circle opens a record.",
};

// Built from the Corrections Register only. A line means "this minister placed
// corrections on the record for this department" and nothing more — no
// inferred ties, no characterisation.

export default async function NetworkPage() {
  const register = await getCorrectionsRegister();
  const network = buildGovernmentNetwork(register.corrections);
  const memberByKey = new Map(network.members.map((m) => [m.key, m]));
  const top = network.departments[0];
  const multi = network.members.filter((m) => m.departments.length > 1).length;

  const title = top
    ? `${top.name} ministers corrected the record most often: ${top.count} of ${network.total} corrections`
    : "No corrections on record";
  const source = [
    "Source: questions-statements.parliament.uk and Hansard",
    register.window ? `${formatDate(register.window.from)} – ${formatDate(register.window.to)}` : null,
    register.source === "database" ? "updates as corrections are laid" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="mx-auto max-w-4xl py-8">
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link href="/ledger" className="transition-colors hover:text-[var(--ink)]">
            &larr; The Claim Ledger
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>Government Network</span>
          <span className="border border-[var(--ink)] px-1.5 py-0.5 font-bold text-[var(--ink)]">Prototype</span>
        </div>
        <h1 className="font-headline text-4xl text-[var(--ink)] md:text-6xl">The Government Network</h1>
        <p className="mt-3 max-w-2xl font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          Government is a set of departments and the ministers who answer for them. This page draws that
          structure from the{" "}
          <Link href="/ledger/corrections" className="underline decoration-1 underline-offset-2">
            Corrections Register
          </Link>
          : {network.departments.length} departments, {network.members.length} ministers
          {multi > 0 ? `, ${multi} of whom corrected the record for more than one department` : ""}. Every
          person opens a record of what they said, what they corrected and what they have registered.
        </p>
        <p className="mt-2 max-w-2xl font-body-serif text-sm italic text-[var(--ink-faint)]">
          A line records that a minister placed corrections on the official record for a department. It
          says nothing else about either. Correcting the record is what the Ministerial Code asks for.
        </p>
      </header>

      {network.total > 0 && (
        <GovernmentNetwork
          network={network}
          phone={layoutNetwork(network, 2)}
          wide={layoutNetwork(network, 4)}
          title={title}
          source={source}
        />
      )}

      {/* The same data as a table: readable without the picture or without JS. */}
      <section className="mt-10">
        <div className="mb-3 border-b-2 border-[var(--rule)] pb-2">
          <h2 className="font-headline-serif text-2xl font-bold text-[var(--ink)]">Department by department</h2>
          <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
            Everyone in the picture, by name. Numbers are corrections in the window.
          </p>
        </div>
        <ul className="divide-y divide-[var(--rule-light)]">
          {network.departments.map((d) => (
            <li key={d.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-headline-serif text-lg font-bold text-[var(--ink)]">{d.name}</h3>
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-faint)]">
                  {d.count} {d.count === 1 ? "correction" : "corrections"} &middot; median {days(d.medianDays)}
                </span>
              </div>
              <p className="mt-1 font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
                {d.memberKeys.map((key, i) => {
                  const m = memberByKey.get(key)!;
                  const n = m.departments.find((x) => x.id === d.id)?.count;
                  return (
                    <span key={key}>
                      {i > 0 && " · "}
                      {m.memberId ? (
                        <Link
                          href={`/ledger/member/${m.memberId}`}
                          className="text-[var(--ink)] underline decoration-[var(--rule-light)] decoration-1 underline-offset-2 hover:decoration-[var(--ink)]"
                        >
                          {m.name}
                        </Link>
                      ) : (
                        m.name
                      )}{" "}
                      ({n})
                    </span>
                  );
                })}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4 pb-8">
        <p className="text-center font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          {BRAND_NAME} &bull; government network (prototype) &bull; built from the corrections register
          &bull; no inferred links &bull; no AI is used to collect or draw it
        </p>
      </footer>
    </section>
  );
}
