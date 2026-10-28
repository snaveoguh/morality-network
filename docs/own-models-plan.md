# Own models plan: open-weight analysts for pooter.world

Status: plan, 2026-10-28. Branch `feat/own-models-plan`. Nothing here is
provisioned or paid for. The code stub (commit `b86c6d6`) is off by default.

## TL;DR

- We spend about **$1.75/day (~$55/month)** on inference, capped at $2–3/day
  per service (GRAPEVINE nodes 68–70). The cheapest always-on GPU costs about
  **$600/month**, roughly 10× our whole AI bill, and it would sit mostly idle.
- **Default holds, and the numbers make the case more strongly.** Phase 1 is
  data and retrieval, with open-weight base models called through cheap
  serverless APIs via the `analyst` provider that already exists. Own
  weights come next as **LoRA adapters served serverless**, so we own the
  weights without owning GPUs. A dedicated GPU comes last, and only once
  token volume is roughly 50× today's.
- For **technical analysis** the best "own model" is not an LLM. It is a
  small tabular classifier trained on our own Hyperliquid fills, which runs on
  CPU for about $0.
- For **person (MP) analysis**, never fine-tune facts about named people into
  weights. Use retrieval with citations only. This is a legal rule, not a
  cost rule.

---

## 1. How LLM calls work today

### 1.1 The web router (`web/src/lib`)

Every server-side LLM call goes through `generateTextForTask()` in
`ai-provider.ts`, keyed by an `AIModelTask` id (`ai-models.ts`).

1. **Agent Hub first.** `tryAgentHub()` POSTs to `AGENT_HUB_URL/v1/generate`
   (Railway `heartfelt-flow`, which routes to Groq/Together free or cheap
   tiers). If it answers, that is the result. The hub is skipped only when an
   enabled analyst owns the task (see 1.4).
2. **Provider chain.** Otherwise it tries
   `getConfiguredProvidersForTask(task)` in order. `AI_FAST_PROVIDER_ORDER` /
   `AI_PREMIUM_PROVIDER_ORDER` default to `venice, ollama, openai, anthropic`.
   A provider counts as configured when its key or URL is set **and** it is
   not listed in `AI_DISABLED_PROVIDERS` (the kill switch from node 70).
3. **Per-provider guards**, checked before each call:
   - **Cooldown.** After 3 consecutive thrown errors a provider is skipped
     for 10 min (`AI_PROVIDER_COOLDOWN_AFTER/_MS`).
   - **Budget** (`ai-budget.ts`). These are rolling-window caps:
     `AI_BUDGET_TOTAL_USD` and `AI_BUDGET_<PROVIDER>_USD` over
     `AI_BUDGET_WINDOW_HOURS` (24h by default). Paid providers fail
     **closed** when a cap is set but the meter cannot be reached
     (`AI_BUDGET_FAIL_OPEN=true` overrides this).
   - **Prices.** `AI_PRICE_<PROVIDER>[_<MODEL>]_{INPUT,OUTPUT}_USD_PER_1M`,
     falling back to `BUILTIN_PRICES`, so no service meters at $0 by
     accident. That accident is how the Anthropic key was drained.
4. **Meter.** `recordAIUsageSafely` writes every call (provider, model, task,
   tokens, cost) to the indexer. It falls back to an immediate write outside
   a request scope, which is the node 69 fix for the worker.

`ai-router.ts` is a second, older router: a free-first registry of Gemini,
Cerebras, Groq, OpenRouter, Venice and so on, with health marking. Only
`entity-scorer.ts` still calls it, and it **bypasses the budget and the
meter**. `terminal-llm.ts` (Bankr, Venice, hub `/v1/chat`) also runs outside
`generateTextForTask`.

### 1.2 The Agent Hub (`heartfelt-flow`)

A separate Railway service. Its code is not in this repo. It exposes
`/v1/generate`, `/v1/chat` and `/v1/newsdesk/signals`, and routes to
Groq/Together. Callers:

- the web router (above);
- `agents/pooter1/src/llm.ts`: the editorial and Farcaster bot, hub-only,
  `task: "premium"`;
- `agents/polypooter`: defaults to the prod hub URL;
- `web/src/lib/trading/signals.ts`: `/v1/newsdesk/signals`, an LLM synthesis
  that feeds `getAggregatedMarketSignals()` and so the trading engine.

**Known metering gap.** `tryAgentHub` stamps the result with the provider the
hub reports. `groq`, `together` and anything else outside our id union get
recorded as `ollama`, which is priced at **$0**. Hub spend on paid Together
models is therefore invisible to the meter and the budget. The fix is in
Phase 0.

### 1.3 The trader worker

`web/src/worker/index.ts` is the same codebase run as a worker. Prod is
`pooter-agent-worker` in `pooter-indexer`; the tasks are set by
`WORKER_TASKS`. Its LLM legs are:

- `tradingPatternDetection` (`trading/pattern-detector.ts`): one verdict per
  symbol+direction, cached for `TRADER_PATTERN_CACHE_MS` (15 min) with
  single-flight. Before the cache it ran about 670 calls/day at ~1.6k in /
  360 out tokens.
- `councilDeliberation` (`trading/deliberation.ts`): about $0.40/day at
  Haiku rates before node 70.
- `webIntelligence`, `selfLearn` (`trading/self-learning.ts`) and
  `moralCompass` (`trading/moral-gate.ts`).

The trader has been **off since the Railway breach (node 73)**, so its
inference is about zero right now.

### 1.4 The analyst stub (commit `b86c6d6`, this branch)

- `analyst` is a fifth `AIProviderId`. Four named models (`pooter-ta`,
  `pooter-supply`, `pooter-pm`, `pooter-person`) sit on any
  **OpenAI-compatible** endpoint.
- It is off unless `ANALYST_ENABLED` lists the analyst (for example
  `ta,pm`) **and** `ANALYST_BASE_URL` or `ANALYST_<ID>_BASE_URL` is set.
- When it is on, the analyst goes first for its tasks, ahead of the hub, and
  the normal providers stay behind it as fallback.
- Task mapping: `ta` ← `technicalAnalysis`, `tradingPatternDetection`;
  `supply` ← `supplyChainAnalysis`; `pm` ← `pmAnalysis`,
  `claimLedgerExtraction`, `claimLedgerResolution`; `person` ←
  `personAnalysis`, `entityScoring`. The four new task ids have no call
  sites yet.
- Controls: the `AI_DISABLED_PROVIDERS=analyst` kill switch,
  `AI_BUDGET_ANALYST_USD`, a built-in price of $0.90/$0.90 per 1M tokens
  (override with `AI_PRICE_ANALYST_*`), cooldown, the meter, and
  `<think>` stripping.
- **Phase 1 needs no new code for routing.** `ANALYST_BASE_URL` can point
  straight at Together, Fireworks or Groq serverless, with
  `ANALYST_<ID>_MODEL` set to an open-weight base model id.
- **Limitation.** There is one `ANALYST_API_KEY` for all analysts. If
  analysts sit on different hosts we need `ANALYST_<ID>_API_KEY` (a small
  follow-up).

---

## 2. The four jobs

| Job | What it produces | Our data | Volume (est.) | Latency need |
|---|---|---|---|---|
| **Technical analysis (TA)** | pattern / regime verdict per symbol for the trader | candles (`trading/technical.ts`), **HL fills and closed positions** (`position-store.ts`, `trade-journal.ts`) | ~1k calls/day × ~2k tokens (15-min cache × ~10 symbols) ≈ 60M tokens/mo | seconds (60s tick, cached) |
| **Supply-chain analysis** | classify news into material→component chains and say tightening or easing (Bearometer, `docs/BEAROMETER_SUPPLY_CHAIN.md` on `feat/bearometer-supply-chain`) | **feed archive** (`archive.ts`), MOFCOM/GACC/Xinhua/SCMP feeds, later Chinese-language notices | ~200 items/day × ~1.5k ≈ 10M/mo | minutes (batch) |
| **PM analysis** | Claim Ledger: extract claims from PMQs, budgets and manifestos, then resolve them against evidence | **Hansard** (`ledger/hansard.ts`), **Claim Ledger** verdicts and disputes, corrections register, ONS/OBR sources | ~50 claims/week extract; resolution ~20k-token retrieval contexts ≈ 5M/mo | hours (batch) |
| **Person (MP) analysis** | per-MP profile: votes, interests, statements, ledger record | **MP record database** (upcoming), divisions (`parliament.ts`), Hansard, Electoral Commission (`funding/`) | 650 MPs × monthly refresh × ~30k ≈ 20M/mo | hours (batch) |

**Total: about 100M tokens/month** if all four ran today. That is about
3M/day.

---

## 3. Retrieval vs fine-tuning, per job

Rule of thumb: **retrieval supplies facts, fine-tuning supplies format and
judgment.** Fine-tune only when retrieval plus a good prompt is measurably
short on a fixed eval set, and we hold enough *reviewed* labels.

| Job | Winner | Why |
|---|---|---|
| **TA** | **Neither, at first: a numeric model.** | The LLM receives numbers we already computed in `technical.ts` and returns a label. A gradient-boosted classifier (LightGBM/XGBoost) trained on our own **HL fills → realised outcome** learns exactly what we care about (did this setup pay?), runs on the worker's CPU, costs ~$0 and gives calibrated probabilities. Keep the LLM only for the human-readable note on `/pipe`, which an 8B model handles. Fine-tuning an LLM on candles is the worst of both worlds. |
| **Supply chain** | **Retrieval + a small classifier, then LoRA.** | Facts change daily (export-control notices), so they must come from retrieval over the feed archive. The *classification* (which chain, which direction, government notice or press echo) is stable and repetitive. Once ~1–2k items are labelled, that is a good LoRA target on a 7–14B model, and Chinese-language sources favour Qwen. |
| **PM analysis** | **Retrieval, firmly.** LoRA for extraction only. | Resolution means "what did they say, and what does the evidence show?" It must cite Hansard and the source, and it must be correctable, which weights are not. Extraction (span → structured claim) has a fixed schema and gets labels for free from human-reviewed ledger entries. That makes it the **best first fine-tune candidate** in the whole plan. Keep a frontier model behind budget for contested resolutions. |
| **Person (MP)** | **Retrieval only. No fine-tuning on person facts, ever.** | Mostly structured data, so SQL over the MP record DB, with the LLM only summarising rows it was handed, with citations. Training facts about living people into weights invites defamation (hallucinated "facts" with our name on them) and can't be undone when a record is corrected. A LoRA for *tone and format* trained on non-factual targets is acceptable later, but there is little reason for it. |

### What retrieval needs (shared, Phase 1)

- **Vector store.** `pgvector` on the existing indexer Postgres
  (`pooter-indexer`). There is no new service and no embeddings exist yet.
- **Embeddings.** An open-weight embedding model is our first and cheapest
  owned model. `bge-m3` is multilingual, which matters for Chinese sources;
  `bge-small` or `e5-small` work for English-only. Either runs on **CPU** in
  an existing Railway worker for batch ingest. The alternative is a hosted
  embedding API at ~$0.02/1M tokens, which is pennies at our volume.
- **Reranker** (optional): `bge-reranker-v2-m3`, also CPU-viable at batch
  volumes.
- **Corpora** to index first: Hansard contributions already fetched for the
  ledger; Claim Ledger verdicts and evidence; the feed archive; the MP record
  DB once it exists; HL fills as structured rows (queried, not embedded).

---

## 4. Recommended base models and sizes

Open-weight releases move monthly. **Re-check the current best-in-class at
the start of each phase.** The families below are the ones with permissive
licences and broad serverless availability. Qwen3 and gpt-oss are
Apache-2.0; Llama 3.3 uses Meta's community licence.

| Job | Phase 1 (serverless base) | Fine-tune target (Phase 2) | Notes |
|---|---|---|---|
| TA narrative | Qwen3-8B or gpt-oss-20b | none, use the tabular model | The label comes from the tabular classifier; the LLM only words it |
| Supply chain | Qwen3-30B-A3B (MoE, cheap) or Qwen3-32B | LoRA on Qwen3-8B/14B | Qwen for Chinese-language text |
| PM extraction | Qwen3-32B or Llama-3.3-70B | LoRA on Qwen3-14B/32B | JSON-schema output; best first fine-tune |
| PM resolution | gpt-oss-120b / DeepSeek-V3-class, with frontier (Sonnet) fallback behind budget | none | Long context and reasoning; correctness over cost |
| Person summary | Llama-3.3-70B or Qwen3-32B | none (format-only LoRA at most) | Summarises SQL rows with citations |
| Embeddings | bge-m3 | none | CPU |

Sizing note: a 7–14B LoRA is cheap to train (roughly $5–50 per run on hosted
fine-tuning for a few thousand examples) and cheap to serve. 70B-class is for
reasoning-heavy resolution, where we should rent, not own.

---

## 5. Hosting options and realistic monthly cost

Prices are **approximate public list rates as of mid-2026**. Re-quote before
spending anything. "24/7" means 730 GPU-hours per month.

| Option | Model | ~Rate | ~Monthly for our ~100M tok/mo | Fit |
|---|---|---|---|---|
| **Serverless API** (Together, Fireworks, Groq, DeepInfra) | per token | 8B: ~$0.10–0.20 / 1M; 30B MoE: ~$0.15–0.60; 70B: ~$0.60–0.90; 120B: ~$0.15–0.60 in / $0.60–2 out | **~$20–90** | ✅ Phase 1. Already wired through the analyst stub |
| **Serverless LoRA** (Fireworks multi-LoRA; Together on supported bases) | per token at roughly the base model's rate; training billed per token | training ~$0.5–3 / 1M training tokens | **~$20–90** + ~$5–50 per training run | ✅ Phase 2. We own the adapter, they own the GPU |
| **Modal** (scale-to-zero, vLLM) | per GPU-second | L4 ~$0.80/h, L40S ~$1.95/h, A100-80G ~$2.50/h, H100 ~$3.95/h | batch-only jobs (PM, person, supply) ~1h/day L40S ≈ **$60**; keeping TA warm all day ≈ **$1,400** | ⚠️ Good for nightly batch; cold starts (30–120s) rule out the trader path |
| **RunPod** (pods or serverless) | per GPU-hour | L40S ~$0.85/h, A100-80G ~$1.65/h, H100 ~$2.40–2.99/h | 24/7 L40S ≈ **$620**; 24/7 H100 ≈ **$1,750–2,200** | ⚠️ Cheapest raw GPUs; we run vLLM, patching and uptime ourselves |
| **Together / Fireworks dedicated endpoints** | per GPU-hour, managed | H100 ~$3–6/h | 1× H100 24/7 ≈ **$2,200–4,400** | ❌ Only at high, steady volume or with privacy needs |
| **vLLM on rented GPUs** (Lambda, Vast, Hetzner GPU) | per hour or month | similar to RunPod; Vast lower but less reliable | ≈ **$500–2,000** | ❌ Same ops burden as RunPod, more vendors |
| **Railway** | CPU only (no GPUs) | existing plan | ~$0 extra | ✅ Embeddings, reranker, tabular TA model. ❌ No LLM serving at useful speed |

### Break-even

- **Today:** about $55/month total spend. The trader is off, so that is mostly
  web digests and the ledger.
- **One always-on L40S (~$620/mo)** serving an 8B model beats serverless at
  ~$0.20/1M only above **~3B tokens/month (~100M/day)**. That is about
  **30× our all-four-jobs estimate**.
- **One H100 (~$2,000/mo)** serving a 70B model beats ~$0.90/1M above
  **~2.2B tokens/month (~75M/day)**. That is about 25× our estimate, and near
  the GPU's practical throughput, so it only pays when it runs flat out.
- **Conclusion:** self-hosting costs **10–40× more** than our current bill.
  Under the North Star (inference funded by agent profit) that would
  *lengthen* the path to self-funding. The trader's last balance was
  $354.56 (node 73).

### When own GPUs would make sense anyway

1. **Volume:** sustained >50M tokens/day across jobs.
2. **Privacy:** we need to process data that must not go to a third-party
   API, such as unpublished ledger drafts or personal data in the MP DB
   beyond what is public. Today everything we process is public.
3. **Latency or availability:** a serverless provider proves unreliable for
   the trader. The current fallback chain already covers this.
4. **Model availability:** our chosen base model plus LoRA is not offered
   serverless anywhere.

---

## 6. Phased path

### Phase 0: instrument and label (now, $0)

- [ ] **Fix the hub metering gap.** Map hub-reported `groq` and `together`
      to priced ids (or add them as provider ids), so hub spend shows on the
      meter.
- [ ] **Route `entity-scorer.ts` through `generateTextForTask`**
      (`entityScoring`), so it is budgeted and metered. Retire `ai-router.ts`
      once nothing calls it.
- [ ] **Add call sites** for `technicalAnalysis`, `supplyChainAnalysis`,
      `pmAnalysis` and `personAnalysis`. They route to the existing providers
      until an analyst is enabled.
- [ ] **Log a dataset.** For the four analyst tasks, store prompt, output,
      model and a `reviewed` / `corrected` field in the indexer. Labels come
      from work we already do: ledger reviewer verdicts and disputes (PM),
      Bearometer chain tags (supply), and realised PnL per HL fill (TA).
- [ ] **Build eval sets.** Fix 100–200 cases per job with expected outputs.
      Every later change is judged against these, not against vibes.

### Phase 1: retrieval on cheap serverless open-weight models (~$20–90/mo)

- [ ] `pgvector` on indexer Postgres; batch-embed Hansard, ledger and feed
      archive with `bge-m3` on CPU.
- [ ] Retrieval helpers per job: Hansard + ledger (PM); feed archive
      (supply); SQL over the MP DB plus Hansard (person).
- [ ] Turn analysts on one at a time on **dev**, for example
      `ANALYST_ENABLED=supply`, `ANALYST_BASE_URL=<serverless host>/v1`,
      `ANALYST_SUPPLY_MODEL=<open-weight id>`, `AI_BUDGET_ANALYST_USD=1` and
      `AI_PRICE_ANALYST_*` set to the host's real rate. Compare each against
      the current provider on the eval set before promoting.
- [ ] TA: train the tabular classifier on HL fills once the trader restarts
      and has ≥ ~300 closed trades. Until then the LLM pattern detector
      stays, on an 8B serverless model.
- **Exit gate to Phase 2:** an eval gap that better prompting and retrieval
  haven't closed, **and** ≥ 1,000 reviewed examples for that job.

### Phase 2: own weights as LoRA, served serverless (+ ~$5–50 per training run)

- [ ] First target: **PM claim extraction** (fixed schema, clean labels).
      Second: **supply-chain classification**.
- [ ] Train a LoRA on a 7–14B base with the host's fine-tuning API (or on
      Modal for full control). Keep adapters and training data in our own
      storage, so the weights are ours and portable.
- [ ] Ship only if it beats the Phase 1 setup on the eval set at equal or
      lower cost per correct answer.
- **Exit gate to Phase 3:** one of the four "when own GPUs make sense"
  triggers above, sustained for a month on the meter.

### Phase 3: dedicated GPU (≥ ~$600/mo)

- [ ] vLLM with multi-LoRA (all four adapters on one base) on RunPod, or
      Modal if the load is bursty. Point `ANALYST_BASE_URL` at it; set
      `AI_PRICE_ANALYST_*` to 0 and track the GPU bill against agent profit
      on the scoreboard instead.
- [ ] Keep serverless as the fallback chain behind it. The kill switch
      (`AI_DISABLED_PROVIDERS=analyst`) restores today's behaviour
      instantly.

### Never

- Fine-tune facts about named people.
- Let an analyst publish a ledger verdict or MP profile without the
  citations it was given.
- Run any analyst without a budget cap and a non-zero price.

---

## 7. Security note (post-breach)

Railway env vars were exposed (node 73). Any new key (`ANALYST_API_KEY`, a
serverless provider key) should be created **after** the secret rotation is
complete. Scope it to inference only, with a spend limit set at the
provider, as well as our own cap.
