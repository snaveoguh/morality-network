"use client";

import { useEffect, useRef, useState } from "react";
import {
  BRIEF_TOPICS,
  type BriefSource,
  type BriefTopic,
  type ChatAnswer,
  type ChatTurn,
  type DayBrief as DayBriefData,
} from "@/lib/day-brief-types";

// "Your day": the AI rundown of the last 24 hours at the top of the home
// page, with topic chips to customise it and a box to ask about the news.
// Plain type, no badges (pooter-brand). The chosen topic is remembered on
// this device only.

const TOPIC_KEY = "pooter:brief-topic";
const FALLBACK_PROMPTS = [
  "What happened in UK politics today?",
  "What's the biggest world story right now?",
  "Explain today's news like I'm new to it",
];

const LINK =
  "underline decoration-[var(--ink-faint)] decoration-1 underline-offset-4 hover:decoration-[var(--ink)]";

interface Message extends ChatTurn {
  sources?: BriefSource[];
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

function Sources({ sources }: { sources: BriefSource[] }) {
  if (sources.length === 0) return null;
  return (
    <span className="mt-1 block text-[12px] leading-snug text-[var(--ink-faint)]">
      {sources.map((s, i) => (
        <span key={s.link}>
          {i > 0 && " · "}
          <a
            href={s.link}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
            title={s.title}
          >
            {s.source}
          </a>
        </span>
      ))}
    </span>
  );
}

export function DayBrief({ initial }: { initial: DayBriefData }) {
  const [topic, setTopic] = useState<BriefTopic>(initial.topic);
  const [brief, setBrief] = useState<DayBriefData>(initial);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promptIndex, setPromptIndex] = useState(0);
  const thread = useRef<HTMLDivElement>(null);

  const prompts =
    brief.suggestions.length > 0 ? brief.suggestions : FALLBACK_PROMPTS;

  // Restore the reader's topic.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TOPIC_KEY);
      if (
        saved &&
        saved !== initial.topic &&
        BRIEF_TOPICS.some((t) => t.id === saved)
      ) {
        void chooseTopic(saved as BriefTopic, false);
      }
    } catch {
      // Storage blocked: stay on the default topic.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rotate the placeholder through suggested questions, unless motion is reduced.
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setPromptIndex((i) => i + 1), 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    thread.current?.scrollTo({
      top: thread.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, asking]);

  async function chooseTopic(next: BriefTopic, remember = true) {
    setTopic(next);
    if (remember) {
      try {
        localStorage.setItem(TOPIC_KEY, next);
      } catch {
        // ignore
      }
    }
    setLoadingBrief(true);
    try {
      const res = await fetch(`/api/brief?topic=${next}`);
      if (res.ok) setBrief((await res.json()) as DayBriefData);
    } finally {
      setLoadingBrief(false);
    }
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || asking) return;
    setError(null);
    setQuestion("");
    const history: ChatTurn[] = messages.map(({ role, text: t }) => ({
      role,
      text: t,
    }));
    setMessages((m) => [...m, { role: "user", text: q }]);
    setAsking(true);
    try {
      const res = await fetch("/api/brief/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, topic, history }),
      });
      const data = (await res
        .json()
        .catch(() => ({}))) as Partial<ChatAnswer> & { error?: string };
      if (!res.ok || !data.answer) {
        setError(
          res.status === 429
            ? "That's a lot of questions. Give it a minute."
            : (data.error ?? "Couldn't answer just now."),
        );
        return;
      }
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.answer!, sources: data.sources ?? [] },
      ]);
    } catch {
      setError("Couldn't reach the assistant. Check your connection.");
    } finally {
      setAsking(false);
    }
  }

  const today = new Date(brief.generatedAt).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <section
      aria-labelledby="day-brief-title"
      className="border-b-4 border-double border-[var(--ink)] pb-4 pt-4 lg:pb-6 lg:pt-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="day-brief-title"
          className="news-label text-[22px] leading-tight text-[var(--ink)] lg:text-[28px]"
        >
          Your day
        </h2>
        <p className="text-[12px] text-[var(--ink-faint)] lg:text-[13px]">
          {today} · last 24 hours · updated {timeAgo(brief.generatedAt)}
        </p>
      </div>

      {/* Topic chips: customise the rundown */}
      <div
        className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
        role="tablist"
        aria-label="Topic"
      >
        {BRIEF_TOPICS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={topic === t.id}
            onClick={() => chooseTopic(t.id)}
            className={`min-h-9 shrink-0 border px-3 text-[13px] transition-colors ${
              topic === t.id
                ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                : "border-[var(--rule-light)] text-[var(--ink-light)] hover:border-[var(--rule)] hover:text-[var(--ink)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* The rundown */}
      <div
        className={`mt-3 transition-opacity ${loadingBrief ? "opacity-50" : ""}`}
        aria-busy={loadingBrief}
      >
        {brief.summary && (
          <p className="news-head text-[19px] leading-snug text-[var(--ink)] lg:text-[22px]">
            {brief.summary}
          </p>
        )}
        {brief.points.length === 0 ? (
          <p className="text-[14px] text-[var(--ink-light)]">
            No stories on this topic in the last 24 hours yet.
          </p>
        ) : (
          <ol className="mt-2 flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-x-8">
            {brief.points.map((p, i) => (
              <li
                key={i}
                className="border-t border-[var(--rule-light)] pt-2 text-[15px] leading-snug text-[var(--ink)]"
              >
                {p.text}
                <Sources sources={p.sources} />
              </li>
            ))}
          </ol>
        )}
        <p className="mt-2 text-[12px] text-[var(--ink-faint)]">
          {brief.mode === "ai"
            ? `Written by AI from ${brief.storyCount} stories in our feed; every point links its sources. Check them before you share.`
            : `The most-covered stories from ${brief.storyCount} in our feed over the last 24 hours.`}
        </p>
      </div>

      {/* Ask — only when an AI provider can answer */}
      {brief.chatAvailable && (
        <div className="mt-4">
          {messages.length > 0 && (
            <div
              ref={thread}
              className="mb-3 flex max-h-80 flex-col gap-3 overflow-y-auto"
              aria-live="polite"
            >
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <p
                    key={i}
                    className="self-end bg-[var(--paper-dark)] px-3 py-2 text-[14px] text-[var(--ink)]"
                  >
                    {m.text}
                  </p>
                ) : (
                  <div
                    key={i}
                    className="text-[15px] leading-snug text-[var(--ink)]"
                  >
                    {m.text}
                    <Sources sources={m.sources ?? []} />
                  </div>
                ),
              )}
              {asking && (
                <p className="text-[14px] text-[var(--ink-faint)]">
                  Reading today&rsquo;s news…
                </p>
              )}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
            className="flex gap-2"
          >
            <label htmlFor="day-brief-ask" className="sr-only">
              Ask about today&rsquo;s news
            </label>
            <input
              id="day-brief-ask"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={400}
              autoComplete="off"
              placeholder={`Ask: ${prompts[promptIndex % prompts.length]}`}
              className="min-h-11 min-w-0 flex-1 border border-[var(--rule)] bg-[var(--paper)] px-3 text-[16px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--ink)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={asking || !question.trim()}
              className="min-h-11 shrink-0 bg-[var(--ink)] px-4 text-[14px] font-semibold text-[var(--paper)] disabled:opacity-40"
            >
              Ask
            </button>
          </form>
          {error && (
            <p className="mt-2 text-[13px] text-[var(--ink-light)]">{error}</p>
          )}

          {messages.length === 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {prompts.slice(0, 3).map((p) => (
                <button
                  key={p}
                  onClick={() => ask(p)}
                  className="min-h-9 border border-[var(--rule-light)] px-3 text-left text-[13px] text-[var(--ink-light)] hover:border-[var(--rule)] hover:text-[var(--ink)]"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-[var(--ink-faint)]">
            Answers come only from the last 24 hours of reporting in our feed.
            Not advice.
          </p>
        </div>
      )}
    </section>
  );
}

export function DayBriefSkeleton() {
  const bar = (w: string) => (
    <span className={`block h-3.5 ${w} animate-pulse bg-[var(--rule-light)]`} />
  );
  return (
    <section
      className="border-b-4 border-double border-[var(--ink)] pb-4 pt-4 lg:pb-6 lg:pt-5"
      aria-hidden
    >
      <h2 className="news-label text-[22px] leading-tight text-[var(--ink)] lg:text-[28px]">
        Your day
      </h2>
      <div className="mt-3 flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-9 w-24 shrink-0 animate-pulse border border-[var(--rule-light)]"
          />
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {bar("w-11/12")}
        {bar("w-10/12")}
        {bar("w-9/12")}
        {bar("w-10/12")}
      </div>
      <div className="mt-4 h-11 border border-[var(--rule)]" />
    </section>
  );
}
