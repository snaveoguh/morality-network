# Writing research: how serious newsrooms write, and what pooter should copy

These are the research notes behind [`STYLE_GUIDE.md`](STYLE_GUIDE.md), compiled on
28 October 2026. Part A applies the research to pooter's own front page. Part B
holds the research notes, grouped by topic, with links.

---

# Part A — Applying it to pooter

## The failing lead (pooter.world front page, 28 October 2026)

> **Kicker:** THE SCARS OF SUNDOWN
> **Headline:** A Spanish train wreck leaves a mother's lullaby on the tracks while world leaders duel over votes and knives.
> **Dek:** When a commuter's last goodbye becomes a meme, the same night in Belgrade a policeman's badge turns into a headline, and a billionaire's tweet reshapes a midterm narrative.

What the feed actually reported that day: two high-speed trains collided in
Spain. Reuters gave the toll as "at least 10" and later "at least 30"; other
sources in the feed said 68. Spanish Prime Minister Pedro Sánchez gave a
speech about the collision. Separately, a policeman killed a knife attacker
outside Israel's embassy in Belgrade.

### What is wrong with the headline

1. **It does not say what happened.** There is no death toll, no "collide",
   no place more specific than "Spanish". A reader learns less from it than
   from the Reuters wire headline directly below it on the same page. The
   BBC's test is that a headline must make sense on its own (Part B §1), and
   this one does not.
2. **It joins unrelated stories.** "X leaves Y while Z" welds a rail crash to
   "world leaders" and "votes and knives". The juxtaposition implies a link
   the sources do not show, and the BBC impartiality guidance names choices of
   prominence and framing as a source of bias (§6).
3. **The central image is invented.** No source mentions a "mother's lullaby".
   Writing an invented detail into a headline about a fatal crash breaks the
   accuracy rule (Editors' Code 1.1: headlines must be supported by the text)
   and treats the dead as material.
4. **The metaphors are purple.** "Lullaby on the tracks" and "duel over votes
   and knives" are figures of speech of the kind Orwell and The Economist say
   to cut. "Knives" is a pun on the Belgrade knife attack, set beside a death
   toll.
5. **It is too long.** At 19 words and 109 characters it is nearly double the
   BBC's roughly 55-character story headline. It truncates in search, push
   alerts and cards before it reaches any fact.
6. **The punctuation is wrong for a headline.** It ends with a full stop. It
   is in sentence form, and sets a scene instead of reporting an event.

### What is wrong with the dek

1. **It is three stories in one sentence.** It covers the crash, Belgrade and a
   "billionaire's tweet", with no fact about any of them. A standfirst should
   add the next fact about the same story (BBC summaries, GOV.UK summaries,
   §2).
2. **It uses metaphors in place of events.** "Becomes a meme", "badge turns
   into a headline" and "reshapes a midterm narrative" each describe the
   coverage, not the news. None of them can be checked.
3. **It is unsourced.** We could not find the "meme" in the feed. The
   billionaire is unnamed and so is the tweet. An MP could not quote any of it.
4. **It is scene-setting.** It opens with "When…" and joins events with "the
   same night", the two tells our lint now rejects.
5. **The tone is wrong.** Calling a commuter's "last goodbye" a meme is glib
   about a death.

### Three better versions

Figures are as reported in the feed on 28 October 2026. On the day, the
writer takes the latest toll from a named source and updates it.

1. **Wire (default)**
   **Two high-speed trains collide in Spain, killing at least 30**
   *Prime Minister Pedro Sánchez spoke about the collision as the reported death toll rose during the day.*
2. **Card and push alert**
   **Spain train collision: at least 30 dead**
   *Reported tolls differed through the day, from 10 to 68; we use the latest Reuters figure and will update it.*
3. **Edition lead with a second item kept separate**
   **Spain rail crash kills at least 30**
   *Also today: a Serbian police officer killed a knife attacker outside Israel's embassy in Belgrade, Reuters reported.*

   The kicker becomes **SPAIN RAIL CRASH**, not **THE SCARS OF SUNDOWN**.

All six lines pass `lintCopy`. The original pair fails it with eight errors
(see `web/src/lib/__tests__/house-style.test.ts`).

## The same faults across the feed

`/originals` on 28 October 2026 showed the pattern is systematic, not one bad
day:

- **Nearly every AI standfirst used a metaphor** ("lays bare", "pulls the rug",
  "litmus test", "turns X into a flashpoint", "gamble").
- **About ten standfirsts ended on crypto** ("revive Bitcoin's safe-haven
  narrative", "digital gold"). The per-story writer prompt said "EVERY story
  has crypto implications". That instruction was meant for the MARKET IMPACT
  section, but it leaked into the standfirst.
- **Headlines stacked stories** ("Kenya frees Ebola contacts, oil wavers, and
  AI's conscience stalls") or used "while" to contrast a death with
  "politicians squabble".
- **Prompts explicitly asked for it**: "slightly unhinged", "irony so sharp it
  draws blood", "make it cut", "a headline from the subconscious", and "ends
  editorials with a one-line observation that reframes the entire piece".

The fixes are in `daily-edition.ts`, `claude-editorial.ts`, pooter1's
`write-editorial.ts` and the new `house-style.ts` lint (see STYLE_GUIDE §4).

## How the research maps to our rules

| Our rule | Basis (Part B) |
|---|---|
| Headline 6–12 words, ≤75 characters, aim ≤60 | BBC ~55 characters for story pages; GOV.UK 65 (§1) |
| Standfirst: one sentence, same story, new fact, aim ≤160 characters | BBC summaries ≤100 characters; GOV.UK ≤160 (§2) |
| "said", never claimed / admitted / slammed | Reuters, Guardian, BBC (§1, §4) |
| Figures with unit, period, real/nominal, source link | Commons Library "How to spot spin", Analysis Function, OSR (§5, §10) |
| No "regime", no unattributed "terrorist", no "only" or "very few" | Reuters, BBC, Analysis Function (§6) |
| Verbatim Hansard, full sentence, OSCOLA citation, check for corrections | Reuters, AP, OSCOLA, the Commons corrections process (§8) |
| Visible, dated corrections | Editors' Code 1.2, BBC 3.4.34–36, AP, Full Fact (§7) |
| One-sentence citable finding with date and permalink | Analysis Function main points, OSR, Full Fact verdict box (§10) |
| Banned phrases and metaphors | Orwell / Economist; Reuters on clichés; Wikipedia "Signs of AI writing" (§11) |

On "AI tells": the research found no source that names "a stark reminder",
"amid" or "in a world where" specifically as AI markers. We ban them because
they are newsroom clichés that our writers overuse. The Wikipedia list also
notes that tell words change with each model generation, so the lint's phrase
list will need maintaining. Its structural rules (one story per headline, no
juxtaposition, length) should age better than its word list.

### Open gap

How often MPs cite Full Fact or the Commons Library in debate has not been
counted, because Hansard and TheyWorkForYou blocked automated search. A manual
search at hansard.parliament.uk for "Full Fact" and "House of Commons Library"
would give the baseline we want to beat.

---

# Part B — Research notes


Compiled 28 October 2026. Findings are paraphrased. Direct quotes are kept under about 15 words. I checked every link at the time of writing. Access notes:

- **Archived copies.** The full Reuters Handbook (old `handbook.reuters.com`) now redirects to a short standards page, so style entries are cited from Wayback Machine snapshots. AP's News Values page is also cited from an archive, because ap.org refuses automated requests.
- **Paywalled.** The AP Stylebook is subscription-only. The Economist's current online style guide is behind its subscriber wall, so its introduction is cited from a 2016 archived copy.
- **Blocks automated fetching.** commonslibrary.parliament.uk, hansard/parliament.uk, ipso.co.uk and ofcom.org.uk all refuse automated requests. Where possible I cite an archived or mirrored copy and say so.

---

## 1. Headlines

- **Length and SEO.** BBC index headlines are capped at 50 characters, features at 58 and story pages at about 55. Story headlines should carry the search terms people use. ([BBC News Style Guide, "headlines"](https://www.bbc.co.uk/newsstyleguide/h))
- **The headline must stand alone.** The BBC warns that a headline may appear without its summary, so a cryptic one can mean nothing. GOV.UK caps titles at 65 characters because Google truncates them there. Titles should be front-loaded and should not be questions. ([BBC, "headlines"](https://www.bbc.co.uk/newsstyleguide/h); [GOV.UK, clear titles](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-titles/))
- **Active verbs.** The Guardian prefers "Editor updates style guidelines" to "Style guidelines updated".
- **No journalese.** The Guardian bans tabloid clichés (bid, brand, dub, slam) and their broadsheet equivalents (insist, signal, target). It suggests testing a headline by imagining saying it in a pub.
- **Punctuation.** The Guardian rules out exclamation marks. Question marks and quotation marks are allowed only when essential. ([Guardian style guide, "headlines"](https://www.theguardian.com/guardian-observer-style-guide-h))
- **Puns.** The Guardian allows puns but warns against tired ones. Overall it is more permissive than the BBC or Reuters, which put literal clarity first. ([Guardian, "headlines"](https://www.theguardian.com/guardian-observer-style-guide-h))
- **"Slam".** The BBC says to avoid it in headlines and use criticise, condemn or dismiss instead. Reuters lists "slammed", "lashed out" and "poised to" as stock clichés. ([BBC, "slam"](https://www.bbc.co.uk/newsstyleguide/s); [Reuters Handbook, "clichés"](https://web.archive.org/web/20170406012656/http://handbook.reuters.com/index.php?title=C))
- **Attribution and numbers in headlines.** If the attribution is clear, the BBC drops quote marks ("Britain won't hold referendum, says PM"). It allows numerals under 10 in headlines but never at the start. ([BBC, grammar & punctuation](https://www.bbc.co.uk/newsstyleguide/grammar-spelling-punctuation); [BBC, numbers](https://www.bbc.co.uk/newsstyleguide/numbers))
- **Accuracy.** Clause 1.1 of the Editors' Code says headlines must be supported by the text. ([IPSO Editors' Code](https://www.ipso.co.uk/editors-code-of-practice/), wording checked via [FT Editorial Code, Annex 1](https://ip-about-us.cdn.prismic.io/ip-about-us/aYHTfd0YXLCxVTJe_FTEDITORIALCODEOFPRACTICE-26-2-3-.pdf))
- **AP gap.** AP's headline rules (present tense, numerals, single quotes) are in the paywalled Stylebook. I found no public AP page stating them. ([AP Stylebook](https://www.apstylebook.com/))

## 2. Standfirsts / deks / summaries

- **BBC summaries** must be 100 characters or fewer and a single sentence in the present tense. They must not repeat the headline, because the two appear together. They should tell the wider story rather than restate the first paragraph. ([BBC, "summaries"](https://www.bbc.co.uk/newsstyleguide/s))
- **GOV.UK summaries** are capped at 160 characters, Google's snippet length. They should use keywords that are not already in the title and must not be repeated in the first paragraph. ([GOV.UK, summaries](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/summaries/))
- **City, University of London's student newsroom** asks for a standfirst that adds context rather than repeating the title. Its title targets are 5–7 words for short titles and 10–12 for long ones. ([City News Style Guide, subeditor's checklist](https://sites.google.com/view/citynewsstyleguide/subeditors-checklist))
- **Government statisticians** are told to put the user's angle in the title and move the data source into a subtitle. Titles should not be overloaded. ([Analysis Function, writing about statistics](https://analysisfunction.civilservice.gov.uk/policy-store/writing-about-statistics/))

## 3. Ledes and the inverted pyramid

- **Most important point first.** The inverted pyramid puts the conclusion first, so readers get the point however little they read. NN/g applies the same rule to each paragraph's first sentence and each sentence's first words. ([Nielsen Norman Group](https://www.nngroup.com/articles/inverted-pyramid/))
- **Keep the intro short.** City's checklist wants a one-sentence intro, a slightly wordier version of the headline. Names of people or organisations most readers won't know should go further down. ([City News](https://sites.google.com/view/citynewsstyleguide/subeditors-checklist))
- **The "top four paragraphs".** The BBC treats these as a unit. It keeps relative day names out of them and uses only pounds sterling in them for UK stories. ([BBC, numbers](https://www.bbc.co.uk/newsstyleguide/numbers))
- **Reuters on place.** Reuters says the lead often doesn't need a location. It also says to avoid "here" as a locator. ([Reuters Handbook, H](https://web.archive.org/web/20170211113232/http://handbook.reuters.com/index.php?title=H))
- **Statisticians on openings.** The Analysis Function says not to open with long background or definitions. It also warns that the biggest change may not be the most important one. ([Analysis Function](https://analysisfunction.civilservice.gov.uk/policy-store/writing-about-statistics/))

## 4. Attribution: "said" versus loaded verbs

- **"Claimed".** Reuters says it implies the writer doesn't believe the statement, and to prefer "said". ([Reuters, "claimed"](https://web.archive.org/web/20170406012656/http://handbook.reuters.com/index.php?title=C))
- **"Admit".** Reuters says it implies prior concealment or guilt, so "said" is usually better. ([Reuters, "admit"](https://web.archive.org/web/20180112091052/http://handbook.reuters.com/index.php?title=A))
- **"Hint".** Reuters calls it inadequate because it risks a value judgement. ([Reuters, H](https://web.archive.org/web/20170211113232/http://handbook.reuters.com/index.php?title=H))
- **"Refute".** Reuters says it implies the rebuttal succeeded. Use deny, dispute or rebut instead. ([Reuters, R](https://web.archive.org/web/20170407100123/http://handbook.reuters.com/index.php?title=R))
- **The Guardian agrees.** "Said" is normally better than "added", "declared" or "pointed out". "Claims" signals doubt and is wrong for an uncontroversial statement. Its "admit" entry cites a reader's complaint about MPs who "admitted" being gay. ([Guardian, S](https://www.theguardian.com/guardian-observer-style-guide-s); [C](https://www.theguardian.com/guardian-observer-style-guide-c); [A](https://www.theguardian.com/guardian-observer-style-guide-a))
- **"Allege".** Reuters says always name who is alleging, and notes that "alleged" gives no protection against libel. ([Reuters, A](https://web.archive.org/web/20180112091052/http://handbook.reuters.com/index.php?title=A))
- **AP attributes anything that could reasonably be disputed.** It also says a source's description should show why the person is credible. A bare "a source" is not allowed. ([AP News Values, archived](https://web.archive.org/web/20250101093115/https://www.ap.org/about/news-values-and-principles/telling-the-story/))
- **Fact-checkers differ.** Full Fact uses "claimed" freely in body copy, for example "the Prime Minister… claimed that…". That works because its verdict sits next to the claim. A news report without a verdict should default to "said". ([Full Fact example](https://fullfact.org/immigration/burnham-jenrick-small-boat-crossings/))

## 5. Numbers and statistics

- **Percentages vs percentage points.**
  - Both Reuters and the Guardian warn that a rise from 3% to 5% is two percentage points, not 2%.
  - Reuters adds that a 400% rise is a fivefold increase, not fourfold.
  - Poll margins are expressed in points.

  ([Reuters, "percent"](https://web.archive.org/web/20180103120623/http://handbook.reuters.com/index.php?title=P); [Guardian, P](https://www.theguardian.com/guardian-observer-style-guide-p))
- **Rounding and consistency.** The Guardian rejects false precision: round 57.743% to 57.7% or 58%, and don't put 8.64% beside 6.3%. Keep formats consistent too (6% vs 10%, not 6% vs "one in 10"). ([Guardian, "numbers"](https://www.theguardian.com/guardian-observer-style-guide-n))
- **Per head and scale.**
  - The Guardian suggests dividing a big announcement by the population and by 52 weeks to test its size.
  - It also says not to add jail terms together, and not to use "football pitches" or "size of Wales" comparisons.

  ([Guardian, "numbers"](https://www.theguardian.com/guardian-observer-style-guide-n))
- **Averages.** The Guardian distinguishes mean from median. The Commons Library lists two spin warning signs:
  - an average given without saying whether it is the mean or the median
  - "average" used to mean "typical".

  ([Guardian, A](https://www.theguardian.com/guardian-observer-style-guide-a); [Commons Library, "How to spot spin"](https://commonslibrary.parliament.uk/research-briefings/sn04446/), [archived copy](https://web.archive.org/web/20251222222640/https://commonslibrary.parliament.uk/research-briefings/sn04446/))
- **Real vs nominal, and time periods.** The Commons Library flags two more warning signs:
  - money compared across years without real prices
  - money figures that don't state the time period.

  It also flags changes in relative risk given without absolute numbers, and the word "significant" used loosely. ([Commons Library, SN04446](https://web.archive.org/web/20251222222640/https://commonslibrary.parliament.uk/research-briefings/sn04446/))
- **BBC accuracy guideline 3.4.8.** Statistics should be explained, put in context, weighed, attributed and challenged where necessary, with caveats stated. Guideline 3.4.9 says the scale of a risk should be made clear so audiences aren't alarmed unduly. ([BBC Editorial Guidelines, accuracy](https://www.bbc.co.uk/editorialguidelines/guidelines/accuracy/guidelines))
- **Base years and comparisons.** Government statisticians are told:
  - not to start a time series at a point that could look partisan
  - not to rely on isolated point-to-point comparisons
  - to say whether a change is typical or unusual
  - to keep units consistent (not "0.3 million" in one place and "300 thousand" in another).

  ([Analysis Function](https://analysisfunction.civilservice.gov.uk/policy-store/writing-about-statistics/))
- **Sourcing.** Full Fact links every factual statement to its primary source, preferring data tables to press releases. Its checks handle seasonality with rolling 12-month totals. ([Full Fact FAQ](https://fullfact.org/about/frequently-asked-questions/); [example](https://fullfact.org/immigration/burnham-jenrick-small-boat-crossings/))

## 6. Neutrality and loaded words

- **"Terrorist".**
  - Reuters does not call specific events or people terrorist without attribution.
  - It keeps the word inside direct quotes but never puts it alone in scare quotes or after "so-called".
  - The BBC also uses it only with attribution. It prefers concrete words (bombers, gunmen, militants), but allows "terror attack" to describe an act.

  ([Reuters, T](https://web.archive.org/web/20170406100258/http://handbook.reuters.com/index.php?title=T); [BBC, T](https://www.bbc.co.uk/newsstyleguide/t))
- **Emotive words.** Reuters says extremist, militant, radical and insurgent mean different things in different contexts and need care. ([Reuters, "emotive words"](https://web.archive.org/web/20170406012711/http://handbook.reuters.com/index.php?title=E))
- **"Regime".** Reuters says it has negative overtones and to use "government". The Guardian allows it for governments widely seen as authoritarian. ([Reuters, R](https://web.archive.org/web/20170407100123/http://handbook.reuters.com/index.php?title=R); [Guardian, R](https://www.theguardian.com/guardian-observer-style-guide-r))
- **BBC 2.4.13.** Bias can come from loaded language and choices of prominence. Its example is "the burden of taxation". Guideline 2.4.26 says that even where there is consensus, the tone should not treat received wisdom as self-evident. ([BBC Editorial Guidelines, impartiality](https://www.bbc.co.uk/editorialguidelines/guidelines/impartiality/guidelines))
- **Superlatives and value judgements.**
  - Reuters says to source superlatives and avoid value judgements such as "giant".
  - Government statisticians are told to avoid sensational or judgemental words like "only" and "very few".

  ([Reuters, S](https://web.archive.org/web/20170406100243/http://handbook.reuters.com/index.php?title=S); [Analysis Function](https://analysisfunction.civilservice.gov.uk/policy-store/writing-about-statistics/))
- **Opinion stays out of news.** Reuters keeps unattributed opinion out of news copy, and quoted opinion must come from a named, authoritative source. Under Editors' Code 1.4, comment, conjecture and fact must be clearly distinguished. ([Reuters standards](https://reutersagency.com/about/standards-values/); [IPSO Code](https://www.ipso.co.uk/editors-code-of-practice/))

## 7. Corrections and clarifications

- **Editors' Code 1.2.** Significant inaccuracies must be corrected promptly and with due prominence, with an apology where appropriate. Clause 1.3 adds a fair opportunity to reply. ([IPSO Code](https://www.ipso.co.uk/editors-code-of-practice/), via [FT Code Annex 1](https://ip-about-us.cdn.prismic.io/ip-about-us/aYHTfd0YXLCxVTJe_FTEDITORIALCODEOFPRACTICE-26-2-3-.pdf))
- **BBC 3.4.34–3.4.36.** A correction should say what was wrong as well as fixing it. Any online error that changes the meaning must be corrected, and the article must show it has been amended. Corrections are also logged on a public page. ([BBC accuracy guidelines](https://www.bbc.co.uk/editorialguidelines/guidelines/accuracy/guidelines))
- **AP labels every fix of a factual error as a correction.** It bans euphemisms such as "recasts", "fixes" and "clarifies". It asks clients who used the error to run the correction too. ([AP News Values, archived](https://web.archive.org/web/20250101093115/https://www.ap.org/about/news-values-and-principles/telling-the-story/))
- **Reuters** corrects "promptly, clearly and comprehensively". That covers stories, captions, graphics and scripts. ([Reuters standards](https://reutersagency.com/about/standards-values/))
- **Guardian** corrections go through an independent readers' editor and appear in daily correction columns. ([Guardian editorial code PDF, March 2026](https://uploads.guim.co.uk/2026/03/03/Editorial_Code_of_Practice_Guidelines_March2026.pdf); [corrections column](https://www.theguardian.com/theguardian/series/correctionsandclarifications))
- **FT** journalists send errors to corrections@ft.com. Unresolved complaints go to an independent Complaints Commissioner, and the adjudications are published. ([FT editorial standards](https://aboutus.ft.com/company/our-standards/editorial-code))
- **Full Fact**
  - marks every change on the article
  - shares major changes on the same channels as the original
  - explains what went wrong when the error is serious
  - follows the European Code of Standards for Independent Fact-Checking Organisations.

  ([Full Fact feedback and corrections](https://fullfact.org/about/feedback/))
- **Push alerts are rarely corrected.** CJR's Tow Center found this, even when the alert itself was wrong; its example was "reopened" alerts about the Clinton emails. ([CJR](https://www.cjr.org/tow_center/mobile_notifications_changing_new_york_times.php))

## 8. Quoting MPs and politicians fairly

- **Reuters** says quotes are sacrosanct: only redundant words may be cut, and only if the sense is unchanged. Selective quoting can be unbalanced, and the context should always be given. ([Reuters standards](https://reutersagency.com/about/standards-values/))
- **AP** says quotes must not be taken out of context, and ellipses should be rare. A garbled quote should be paraphrased faithfully or dropped. ([AP News Values, archived](https://web.archive.org/web/20250101093115/https://www.ap.org/about/news-values-and-principles/telling-the-story/))
- **Selective quotation.** The BBC warns against it, noting that a single quoted word can imply scepticism. Guideline 2.4.22 says scrutiny should be proportionate to the contributor's power. Challenges should come from attributed evidence, not from the BBC's own view. ([BBC, T](https://www.bbc.co.uk/newsstyleguide/t); [BBC impartiality](https://www.bbc.co.uk/editorialguidelines/guidelines/impartiality/guidelines))
- **Right of reply.**
  - Full Fact contacts the claimant before publishing and asks for their source.
  - Its list of MPs who have not corrected the record includes only those given a reasonable chance to correct.
  - The list states the date of each claim.

  ([Full Fact FAQ](https://fullfact.org/about/frequently-asked-questions/); [MPs who have not corrected the record](https://fullfact.org/can-i-trust/))
- **Hansard citation.** The standard (OSCOLA) form is House + Deb + date + volume + column, for example *HC Deb 3 February 1977, vol 389, cols 973–76*. Written answers take a "W" suffix in the Commons. ([RGU OSCOLA guide](https://library.rgu.ac.uk/oscola/hansard))
- **Backbench MPs can now correct Hansard.** Until 2023–24 only ministers could. The Commons then backed the Procedure Committee's recommendation to extend the process to all MPs, after a Full Fact campaign. A fair write-up should check whether the record has since been corrected. ([Civil Service World](https://www.civilserviceworld.com/professions/article/parliamentary-corrections-process-opened-up-to-mps); [Full Fact 2023 briefing PDF](https://fullfact.org/media/uploads/web_-_parliamentary_briefing_-_correcting_the_record_-_full_fact_-_2023.pdf))

## 9. Writing for mobile

- **Sentence and paragraph length.** GOV.UK says to split sentences over 25 words and keep paragraphs to five sentences or fewer. Plain English is mandatory there. Its research found 80% of people prefer it, and specialists prefer it even more. ([GOV.UK, clear language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/); [clear structure](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-structure/))
- **The Economist** says one-sentence paragraphs should be used only occasionally, which is a check on mobile-first choppiness. ([Economist style guide intro, archived](https://web.archive.org/web/20160101034350/http://www.economist.com/styleguide/introduction))
- **How people scan.** Eye-tracking shows readers fixate on the top and left of a page and on the first words of each line. So front-load paragraphs and subheads. ([NN/g, F-pattern](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/))
- **Line length.** Readability research puts the best line length for body text at about 50–75 characters. ([Baymard Institute](https://baymard.com/blog/line-length-readability))
- **Push alerts as standalone stories.**
  - Many users read alerts without tapping through, so the alert may be all they ever learn about a story.
  - Packing in too much detail can bury the takeaway.
  - The NYT moved from "headline-ese" to more descriptive wording that gives information rather than teasing.

  ([CJR / Tow Center](https://www.cjr.org/tow_center/mobile_notifications_changing_new_york_times.php))
- **Alert reach and fatigue.** The Reuters Institute's 2025 Digital News Report found:
  - about 21% of people across markets got a news alert in the previous week
  - almost half of those who get none have turned them off, mostly because there were too many or they weren't relevant
  - some outlets send around 50 a day.

  ([Reuters Institute podcast/report](https://reutersinstitute.politics.ox.ac.uk/news/our-podcast-digital-news-report-2025-episode-5-mobile-news-alerts-audience-engagement))

## 10. What makes a figure citable by journalists and MPs

- **Main points get lifted verbatim.** The Analysis Function says to give up to six bullet points of one sentence each. Each should make sense on its own in a newspaper article, or it may be taken out of context. ([Analysis Function](https://analysisfunction.civilservice.gov.uk/policy-store/writing-about-statistics/))
- **Source plus direct link.** The statistics regulator's 2025 review recommends that any statistic in government communications cite its source and link directly to it. This is the core of "intelligent transparency". ([OSR, 2025 review recommendations](https://osr.statisticsauthority.gov.uk/publications/intelligent-transparency-2025-review/pages/5/); [OSR, intelligent transparency](https://osr.statisticsauthority.gov.uk/the-code-of-practice-for-statistics/intelligent-transparency/))
- **A pattern that works.** Full Fact's verdict box puts the claim next to a short verdict and a single explanatory sentence. Examples:
  - "Incorrect." followed by one dated, numeric sentence
  - "This is correct overall." followed by a caveat.

  Every statement links to the primary data. ([Full Fact example](https://fullfact.org/immigration/burnham-jenrick-small-boat-crossings/); [another](https://fullfact.org/crime/claims-vickrum-digwa-attacked-prison-again-false/))
- **The Commons Library** publishes briefings openly and lets anyone reuse them under the Open Parliament Licence. ([About the Library, archived](https://web.archive.org/web/20251230050417/https://commonslibrary.parliament.uk/about-us/))
- **How MPs use the Library.** A former Librarian said it answers about 25,000 confidential MP enquiries and publishes about 900 briefings a year. She said MPs often want "killer facts" to use in the chamber. ([PoliticsHome interview with Penny Young](https://www.politicshome.com/news/article/part-of-parliament-penny-young))
- **Fact checks lead to corrections in Hansard.** After Full Fact wrote to him, Justice Secretary Alex Chalk sent a correction to Hansard. Full Fact also reports ministers correcting on air and other MPs writing to correct claims. ([Full Fact impact blog, 2023](https://fullfact.org/blog/2023/sep/ministerial-corrections-and-battling-hoax-posts-how-our-fact-checking-had-an-impact-this-summer/))
- **Gap.** I could not run Hansard full-text searches: parliament.uk and TheyWorkForYou refused automated requests. So I have no count of MPs citing "Full Fact" or "Commons Library" in debate. A manual search at hansard.parliament.uk would fill this.

## 11. "AI tells" in prose

- **Wikipedia's "Signs of AI writing"** is the most detailed public list. ([Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)) It covers:
  - inflated significance: "stands as a testament", "pivotal", "indelible mark"
  - trailing "-ing" analyses: "highlighting its importance"
  - promotional words: vibrant, nestled, boasts
  - vague attributions: "experts argue"
  - "serves as" used in place of "is"
  - negative parallelisms: "not just X, but Y"
  - the rule of three
  - formulaic endings: "Despite these challenges…", "In summary", "Overall"
- **The tell words change by model generation**, according to the same page:
  - **2023–24:** delve, tapestry, intricate, underscore, meticulous
  - **later:** showcasing, enhance, fostering
  - **mid-2026 on:** words such as "quietly", "steady" and "multifaceted", plus clipped 8–20-word sentences

  Density is the signal. A single word proves nothing. ([Wikipedia](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing))
- **Em dashes.**
  - Wikipedia says LLMs used them heavily from 2022 to September 2026, often with spaces around them.
  - Newer models are tuned to avoid them, and that absence has itself become a sign.
  - AP's Stylebook team says an em dash is not proof of AI, but agrees many writers overuse dashes.

  ([Wikipedia](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing); [AP Stylebook blog](https://www.apstylebook.com/blog_posts/24))
- **"Delve" has been measured.** Juzek and Ward analysed the rise of "delve", "intricate" and "underscore" in scientific abstracts after ChatGPT. A press column cites their finding that "delves" rose more than 6,000% between 2020 and 2024. ([arXiv paper](https://arxiv.org/abs/2412.11385); [Laura Yuen column via The Star](https://www.thestar.com.my/tech/tech-news/2025/12/06/opinion-how-can-you-tell-if-somethings-been-written-by-chatgpt-lets-delve))
- **Further commentary.** Sam Kriss's NYT Magazine essay "Why Does A.I. Write Like … That?" (Dec 2025) is paywalled and blocks automated access. It is cited on the Wikipedia page. ([NYT](https://www.nytimes.com/2025/12/03/magazine/chatbot-writing-style.html))
- **Phrases I could not source.** None of the sources I checked lists "a stark reminder", "amid" or "in a world where" as AI tells. Wikipedia mentions "amid" only in passing, and the Guardian style guide accepts "amid" (not "amidst"). Treat these as newsroom clichés rather than documented AI markers. ([Guardian, A](https://www.theguardian.com/guardian-observer-style-guide-a))
- **The older rulebooks already ban these habits.**
  - Orwell's rules, which The Economist builds its guide on, say never use a figure of speech you are used to seeing in print, and cut every word you can.
  - Reuters says that if a phrase is the first one you think of, it is probably hackneyed.

  ([Orwell, "Politics and the English Language"](https://www.orwellfoundation.com/the-orwell-foundation/orwell/essays-and-other-works/politics-and-the-english-language/); [Economist intro, archived](https://web.archive.org/web/20160101034350/http://www.economist.com/styleguide/introduction); [Reuters, "clichés"](https://web.archive.org/web/20170406012656/http://handbook.reuters.com/index.php?title=C))

---

## Sources

**Reuters**
- Standards and Values: https://reutersagency.com/about/standards-values/
- Handbook of Journalism (archived), A: https://web.archive.org/web/20180112091052/http://handbook.reuters.com/index.php?title=A
- Handbook, C: https://web.archive.org/web/20170406012656/http://handbook.reuters.com/index.php?title=C
- Handbook, E: https://web.archive.org/web/20170406012711/http://handbook.reuters.com/index.php?title=E
- Handbook, H: https://web.archive.org/web/20170211113232/http://handbook.reuters.com/index.php?title=H
- Handbook, P: https://web.archive.org/web/20180103120623/http://handbook.reuters.com/index.php?title=P
- Handbook, R: https://web.archive.org/web/20170407100123/http://handbook.reuters.com/index.php?title=R
- Handbook, S: https://web.archive.org/web/20170406100243/http://handbook.reuters.com/index.php?title=S
- Handbook, T: https://web.archive.org/web/20170406100258/http://handbook.reuters.com/index.php?title=T

**AP**
- AP Stylebook (paywalled): https://www.apstylebook.com/
- AP Stylebook blog, em dash: https://www.apstylebook.com/blog_posts/24
- AP News Values and Principles (archived): https://web.archive.org/web/20250101093115/https://www.ap.org/about/news-values-and-principles/telling-the-story/

**BBC**
- News Style Guide: https://www.bbc.co.uk/newsstyleguide
- Style guide, H: https://www.bbc.co.uk/newsstyleguide/h
- Style guide, S: https://www.bbc.co.uk/newsstyleguide/s
- Style guide, T: https://www.bbc.co.uk/newsstyleguide/t
- Style guide, numbers: https://www.bbc.co.uk/newsstyleguide/numbers
- Style guide, grammar and punctuation: https://www.bbc.co.uk/newsstyleguide/grammar-spelling-punctuation
- Editorial Guidelines, accuracy (principles): https://www.bbc.co.uk/editorialguidelines/guidelines/accuracy
- Editorial Guidelines, accuracy (guidelines): https://www.bbc.co.uk/editorialguidelines/guidelines/accuracy/guidelines
- Editorial Guidelines, impartiality: https://www.bbc.co.uk/editorialguidelines/guidelines/impartiality/guidelines

**The Economist and Orwell**
- Economist style guide introduction (archived): https://web.archive.org/web/20160101034350/http://www.economist.com/styleguide/introduction
- Orwell, "Politics and the English Language": https://www.orwellfoundation.com/the-orwell-foundation/orwell/essays-and-other-works/politics-and-the-english-language/

**Guardian**
- Style guide, A: https://www.theguardian.com/guardian-observer-style-guide-a
- Style guide, C: https://www.theguardian.com/guardian-observer-style-guide-c
- Style guide, H: https://www.theguardian.com/guardian-observer-style-guide-h
- Style guide, N: https://www.theguardian.com/guardian-observer-style-guide-n
- Style guide, P: https://www.theguardian.com/guardian-observer-style-guide-p
- Style guide, R: https://www.theguardian.com/guardian-observer-style-guide-r
- Style guide, S: https://www.theguardian.com/guardian-observer-style-guide-s
- Editorial code (PDF, March 2026): https://uploads.guim.co.uk/2026/03/03/Editorial_Code_of_Practice_Guidelines_March2026.pdf
- Corrections and clarifications column: https://www.theguardian.com/theguardian/series/correctionsandclarifications

**FT**
- Editorial standards: https://aboutus.ft.com/company/our-standards/editorial-code
- FT Editorial Code (PDF, includes IPSO Code as Annex 1): https://ip-about-us.cdn.prismic.io/ip-about-us/aYHTfd0YXLCxVTJe_FTEDITORIALCODEOFPRACTICE-26-2-3-.pdf

**Regulators (both block automated fetching)**
- IPSO Editors' Code: https://www.ipso.co.uk/editors-code-of-practice/
- Ofcom Broadcasting Code, section 5: https://www.ofcom.org.uk/tv-radio-and-on-demand/broadcast-codes/broadcast-code/section-five-due-impartiality-accuracy

**Full Fact**
- FAQ: https://fullfact.org/about/frequently-asked-questions/
- Feedback and corrections: https://fullfact.org/about/feedback/
- MPs who have not corrected the record: https://fullfact.org/can-i-trust/
- Example fact check (small boat crossings): https://fullfact.org/immigration/burnham-jenrick-small-boat-crossings/
- Example fact check (prison attack claims): https://fullfact.org/crime/claims-vickrum-digwa-attacked-prison-again-false/
- Impact blog, 2023: https://fullfact.org/blog/2023/sep/ministerial-corrections-and-battling-hoax-posts-how-our-fact-checking-had-an-impact-this-summer/
- Correcting the record briefing, 2023 (PDF): https://fullfact.org/media/uploads/web_-_parliamentary_briefing_-_correcting_the_record_-_full_fact_-_2023.pdf

**House of Commons Library**
- "How to spot spin" (SN04446): https://commonslibrary.parliament.uk/research-briefings/sn04446/
- SN04446, archived copy: https://web.archive.org/web/20251222222640/https://commonslibrary.parliament.uk/research-briefings/sn04446/
- About the Library (archived): https://web.archive.org/web/20251230050417/https://commonslibrary.parliament.uk/about-us/
- PoliticsHome interview with Penny Young: https://www.politicshome.com/news/article/part-of-parliament-penny-young

**Parliament and Hansard**
- Civil Service World on MPs correcting the record: https://www.civilserviceworld.com/professions/article/parliamentary-corrections-process-opened-up-to-mps
- RGU OSCOLA guide to citing Hansard: https://library.rgu.ac.uk/oscola/hansard

**Statistics bodies**
- OSR, intelligent transparency 2025 review: https://osr.statisticsauthority.gov.uk/publications/intelligent-transparency-2025-review/pages/5/
- OSR, intelligent transparency: https://osr.statisticsauthority.gov.uk/the-code-of-practice-for-statistics/intelligent-transparency/
- Analysis Function, writing about statistics: https://analysisfunction.civilservice.gov.uk/policy-store/writing-about-statistics/

**GOV.UK content design**
- Clear language: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/
- Clear structure: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-structure/
- Clear titles: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-titles/
- Summaries: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/summaries/

**Readability and mobile**
- City News Style Guide, subeditor's checklist: https://sites.google.com/view/citynewsstyleguide/subeditors-checklist
- NN/g, inverted pyramid: https://www.nngroup.com/articles/inverted-pyramid/
- NN/g, F-shaped reading pattern: https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/
- Baymard Institute, line length: https://baymard.com/blog/line-length-readability
- CJR / Tow Center on mobile notifications: https://www.cjr.org/tow_center/mobile_notifications_changing_new_york_times.php
- Reuters Institute, mobile news alerts (DNR 2025): https://reutersinstitute.politics.ox.ac.uk/news/our-podcast-digital-news-report-2025-episode-5-mobile-news-alerts-audience-engagement

**AI tells**
- Wikipedia, Signs of AI writing: https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
- Juzek and Ward, "Why Does ChatGPT 'Delve' So Much?" (arXiv): https://arxiv.org/abs/2412.11385
- Laura Yuen column (The Star): https://www.thestar.com.my/tech/tech-news/2025/12/06/opinion-how-can-you-tell-if-somethings-been-written-by-chatgpt-lets-delve
- Sam Kriss, NYT Magazine (paywalled): https://www.nytimes.com/2025/12/03/magazine/chatbot-writing-style.html
