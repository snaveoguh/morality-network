---
name: pooter-brand
description: Brand and UI rules for pooter.world (pooter world): type, colour, the wordmark, tagline, layout, ledger cards, charts and what to avoid. Load before designing, mocking up or building ANY pooter.world screen, component, page, chart, OG image or social graphic, and whenever Hugo gives design feedback on the site, so the rule gets recorded here. Living document: append each new decision with its date.
---

# pooter world: brand rules

These rules come from Hugo's review rounds. When he gives new design feedback, add it here in the same session (rule + date + one-line why), and remove any rule it replaces.

Reference mockups: the Design canvas "Pooter Mobile-First Redesign" (claude.ai/artifact/XFyFMSTQHMEEd1H4494czY).

## Direction (2026-10-28)
- **Mobile first.** Design at 390 px first, then tablet (820 portrait / 1024), then desktop.
- **A record with news, not news with a record** (Hugo, 2026-10-30; replaces "a feed first"). pooter world is a global public information source that helps people understand politics, vote and get involved. The home page opens with an **Accountability record** band (live Corrections Register figures, this week's claims, pledges) above the fold, and the news feed sits underneath. Why: funders and new readers judge the site by its first screen, and the record is what makes it different.
- **No crypto or market headlines at the top of the site** (Hugo, 2026-10-30): not in the header ticker, the trending row or the lead slot. They live in Signals/Bearometer and their own sections.
- Every other feature (Pipe, Agents, Index, Originals, Archive, Governance, Co-op, Markets, wallet, chain, theme, translate) sits one tap away in **More**, not on the front page.
- **Direction C, the serif broadsheet, is CHOSEN** (2026-10-28). Use canvas artboards `HomeC` (phone) and `TabletC` (tablet, ledger as a right-hand rail) as the reference. A and B are retired.
- Bottom tab bar on phone: **Feed / Search / Ledger / Signals / More**.

## Wordmark and blackletter
- Blackletter (UnifrakturCook) is used **only** for the "pooter world" wordmark and the "pw" mark. Nothing else: no section titles, no "The Claim Ledger", no headings. (2026-10-28)

## Tagline
- One line under the wordmark that states the problem in moral terms. It replaces "A public ledger of world events and their interpretation."
- REJECTED: "Everyone claims the moral high ground. We check the record." Hugo wants something better. (2026-10-28)
- **Wordplay motif (marketing):** "Accountability record" ↔ "Record accountability". The same spelling flips meaning: REC-ord is the noun (what we keep), re-CORD is the verb (what we do). Motion and marketing pieces can animate the two words swapping places. The site masthead stays static on "Accountability record". If the swap ever appears on-site, it runs once and respects `prefers-reduced-motion`. (Hugo, 2026-10-28)
- **Final line: "Accountability record"** (Hugo, 2026-10-28). Set in the serif, upright, slightly letter-spaced, secondary ink, centred under the wordmark. Taglines stay short and calm and never accuse anyone by name or by group (the ledger is under solicitor review).

## Type
- Headlines: **Newsreader** (500 for headlines, 600 for section labels). Archivo Black is retired from the front page with direction C.
- Body and UI: **Inter**.
- Meta (dates, counts, prices): JetBrains Mono, used sparingly. Prefer plain Inter for bylines and source lines.

## Colour
- Dark ground #0d0d0d, surface #161616, ink #f2ede2, secondary #c9c3b4, faint #8a8579, rules #262622 / #4a4a46.
- **No red text and no red rules on black.** Red is hard to read on black and looks like a warning or error. Use cream ink for emphasis and 4px **double** cream rules for section breaks. (2026-10-28)
- Never navy or teal.
- Cream panels (#f2ede2 with black ink) work for charts and for featured callouts.

## Components
- **Lead image goes above the main headline**, at the top of the page. Don't bury it inside the article.
- **Search is prominent.** It has suggested and trending topics instead of a wall of tags. Filters (Section, Region, Bias, Source) are collapsed rows inside Search, not on the front page.
- **Trending** is a single plain-text row of topics under the masthead.
- **Claim Ledger** appears as cards that scroll sideways on phone, and as a right-hand rail on tablet/desktop. Show the speaker name, then the quote in serif, then a quiet status line ("PMQs 21 Oct · awaiting review").
- **No stamps, badges or "VERIFIED/UNVERIFIED" seals.** Hugo says they look AI-generated and unprofessional. Status is plain small text. (2026-10-28)
- **Bearometer** (the buy/hold/sell signals app, formerly "barometer") has its own tab and a card in the feed.
- Source lines show the outlet and its rated bias in plain words (Left, Lean left, Centre, Right). Don't colour-code bias red/blue.

## Charts
- Make our own charts from data we crawl or collect live (feed bias mix, ledger claims, signals). Use a cream panel with black bars and a plain-language title that states the finding, then a source line with the date and "updates live". (2026-10-28)
- Use one ink colour. Never encode meaning with red vs. green or red vs. blue.

## Content
- Use only real data in mockups (pull from prod APIs: `/api/feed`, `/api/ledger/claims`). Missing facts become `[PLACEHOLDER]`. Never invent stats or verdicts.
- Keep copy plain and factual, with no hype.
