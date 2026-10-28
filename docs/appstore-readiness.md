# App Store / Play readiness review: `mobile/` v1

**Status:** read-only review. No app code was changed and nothing was submitted.
**Date:** 2026-10-28
**Scope:** the Expo app in `mobile/` as it stands on `origin/dev` (`f1ada92`), plus the server endpoints the app calls in `web/src/app/api/`.

> **Which branch is the "SDK-57 rebuild"?** No branch has `sdk` in its name apart from `feat/agent-sdk-eliza`, which is unrelated. The SDK-57 work is on **`origin/feat/mobile-v1`** (commit `4b64d5f` *"reconcile to Expo SDK 57"*, ending at `73fd21b` *"store artifacts — eas.json, build numbers, iOS privacy manifest"*). That branch is **already merged into `dev`** (`0aac3e2`). Since then `dev` has moved ahead in `mobile/`: the Witness card now requires a written basis, an `assignmentId` and an `evidenceIndex` for staked review. This review covers `dev`, because that is what would ship. Every finding below also applies to `feat/mobile-v1`.

Guideline text was checked live on 2026-10-28:
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), page dated **16 Oct 2026**
- [Apple: Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Google Play: Blockchain-based Content](https://support.google.com/googleplay/android-developer/answer/13607354)
- [Google Play: Real-Money Gambling, Games, and Contests](https://support.google.com/googleplay/android-developer/answer/9877032)
- [Google Play: Financial features declaration](https://support.google.com/googleplay/android-developer/answer/13849271)
- [FCA PS23/6: Financial promotion rules for cryptoassets](https://www.fca.org.uk/publications/policy-statements/ps23-6-financial-promotion-rules-cryptoassets) and [FG23/3](https://www.fca.org.uk/publications/fg23-3-finalised-non-handbook-guidance-cryptoasset-financial-promotions)
- [FCA statement: common issues with crypto marketing](https://www.fca.org.uk/news/statements/common-issues-crypto-marketing) (updated 6 Feb 2026)

Points marked **⚠ uncertain** are judgement calls on how a guideline will be read. Get a second opinion on these: App Review, or a UK financial-services lawyer for the FCA points.

---

## 1. Verdict in one paragraph

Hugo's v1 idea is store-safe, but **the app as it is today is not**: feed, Claim Ledger, MP pages, wallet for sign-in and identity only, and Bearometer as a signals watchlist. Today's build pays crypto (MO) for a task, gates a feature on holding at least 100 MO, and includes a general-purpose Web3 dApp browser that signs mainnet transactions for any website. It has no in-app account deletion, its privacy manifest declares no data collected, and its native content is thin: a link-out news list plus one claim card. Of the features in Hugo's v1 list, only the feed and the wallet exist in the app today. Claim Ledger and MP pages exist only on the web, and Bearometer is not in the app. The path is: **remove** the crypto-economic features, **build** native Ledger and MP screens, **add** account deletion and accurate privacy disclosures, then submit.

---

## 2. What is actually in the app today

| Area | Files | What it does |
|---|---|---|
| Onboarding | `app/onboarding.tsx` | Creating or importing a wallet is **mandatory**: there is no way into the app without one. BIP-39 12-word phrase, 6+ digit PIN, 3-word backup check. |
| Wallet | `lib/wallet.ts`, `app/(tabs)/wallet.tsx`, `app/reveal-seed.tsx` | Self-custodial EVM (Base mainnet) and Solana keys, AES-256-GCM encrypted with PBKDF2 in SecureStore. Shows ETH and SOL balances. The tab is headed **"WITNESS POINTS"**, with the copy *"Witness today's claim to earn points"*. |
| Today / feed | `app/(tabs)/feed.tsx` | A news list from `/api/feed`. **Every article opens in the external browser** (`Linking.openURL`). A "Today's Claim" card with Support, Dispute and Can't-verify buttons, then *"Witnessed. Thank you — points on their way."* |
| Witness backend | `lib/api.ts` → `/api/review/vote`, `web/src/lib/ledger/review-staking.ts` | A vote **auto-accepts an assignment and locks a 100 MO stake** (`DEFAULT_STAKE_MO`) and pays a **10 MO reward** (`DEFAULT_REWARD_MO`). It fails with *"Not enough MO to stake"* below 100 MO. The "points" in the app are the **MO ledger balance** (`/api/account/me`: `points: balanceMo`). That balance is **claimable on-chain** through the Merkle distributor (`/api/account/claim-proof`). |
| Browse tab | `app/(tabs)/browser.tsx`, `components/browser/*`, `lib/provider-bridge.ts` | A full multi-tab web browser with an address bar that falls back to Google search. It injects an EIP-1193 provider into **every site** (`originWhitelist={['*']}`) that claims to be MetaMask (`isMetaMask: true`). It signs `personal_sign` and `eth_signTypedData_v4` messages and **broadcasts `eth_sendTransaction` on Base mainnet** after a confirmation sheet. The home page is `pooter.world`. |
| Settings | `app/(tabs)/settings.tsx` | Lock and unlock, show the recovery phrase, and "Delete Wallet". Delete Wallet removes the local keys and the token but **not the server account**. |
| Dormant code (not wired to any UI) | `lib/bridge.ts` (LI.FI bridge quotes), `lib/fee-payer.ts` (Solana relay), `lib/solana-client.ts#sendSol`, `lib/username.ts`, `lib/zk-recovery.ts` (stub that throws) | Reviewers and static scanners can see this code in the binary. |
| Config | `app.json`, `eas.json` | Bundle id `world.pooter.app`. `NSPrivacyCollectedDataTypes: []`. No `extra.eas.projectId` yet (a TODO). `supportsTablet: true`. |

**Not in the app:** Claim Ledger pages, MP pages (`/ledger/member` on the web), Bearometer or signals, prediction markets, MO buy or sell, and Hyperliquid trading. That is helpful: most of the risky surface lives on the web only.

---

## 3. Feature-by-feature decisions

Legend: **SHIP**: fine for v1 as described. **GATE**: ship only after the listed changes. **REMOVE**: take it out of the v1 binary.

| # | Feature | Decision | Why (guideline) |
|---|---|---|---|
| F1 | News feed | **GATE** | 4.2 / 4.2.2: a list of links that open in Safari is a "content aggregator / collection of links". Needs native value around it: in-app reader (`SFSafariViewController` at minimum), Claim Ledger annotations on articles, saved items. |
| F2 | Claim Ledger (read-only, native) | **SHIP** (needs building) | This is the strongest answer to 4.2: unique, structured content that isn't a re-skinned website. Build it as native screens over `/api/ledger/*`, not as a WebView. |
| F3 | MP pages (read-only, native) | **SHIP** (needs building) | Same reasoning as F2. Watch 1.1 / 5.6 on defamation: show sources and the "corrections" path next to every negative verdict. |
| F4 | Daily Witness voting (Support / Dispute / Can't verify) **as it works today** | **REMOVE** | 3.1.5(v): *"Cryptocurrency apps may not offer currency for completing tasks"*. Each vote pays 10 MO, which is claimable on-chain. 3.1.1: holding at least 100 MO **unlocks** the feature (*"Apps may not use their own mechanisms to unlock content or functionality, such as … cryptocurrencies and cryptocurrency wallets"*). Play: earning tokenised assets must be declared, and the app *"may not promote or glamorize any potential earning"*. FCA: see §5. |
| F4b | Witness voting **re-plumbed** (no stake, no MO reward) | **GATE** | Allowed if the mobile vote is a non-staked opinion or "signal", and any points are non-transferable reputation with no cash or token value and no conversion to MO. This needs a server-side change: a separate unstaked vote path for app clients, or no voting in v1. ⚠ uncertain: Apple may still treat a points system as currency if it ever converts. Make sure it never does in the app. |
| F5 | "Witness points" display in the Wallet tab | **REMOVE** (or rename and decouple per F4b) | It currently shows the MO balance under another name, which is both 3.1.5(v) and an FCA problem. |
| F6 | Wallet: create or import, SIWE sign-in, show address | **GATE** | 3.1.5(i): *"Apps may facilitate virtual currency storage, provided they are offered by developers enrolled as an organization."* **Needs an Organization Apple Developer account** (see B1). Making the wallet mandatory at first launch conflicts with 5.1.1(v): *"If your app doesn't include significant account-based features, let people use it without a login"*. Feed, Ledger and MPs must be usable without a wallet. |
| F7 | Wallet: ETH / SOL balances | **GATE** | Allowed with F6, but fix the bug: Solana reads **devnet** (`lib/solana-client.ts`, `SOLANA_RPC_DEVNET`) under a mainnet-looking "Solana (SOL)" label. That is inaccurate data (2.1 / 2.3). Simplest fix: drop Solana from v1. |
| F8 | Browse tab: general Web3 browser with an injected signer | **REMOVE** | 3.1.5(iii): it can sign swaps on any DEX, so it *"facilitates transactions … of cryptocurrency"* with no licence or geo-limits. 4.7: *"You are responsible for all such software offered in your app"*. Every dApp a user can reach becomes the app's compliance problem. Impersonating MetaMask (`isMetaMask: true`) is a misrepresentation risk under 1.1.6 / 2.3. Its default page is the website, which fails 4.2 ("repackaged website"). Play: an unlicensed custodial-style exchange path. ⚠ uncertain: dApp browsers do appear in some approved iOS wallets, but always from organisation accounts and usually with curated or allow-listed dApps. For a v1 with "wallet for identity only" it adds only risk. |
| F9 | Send / bridge / relay code (dormant) | **REMOVE** from the binary | No UI today. Leaving LI.FI bridge and SOL-transfer code in the bundle invites a 2.3.1 ("hidden features") question. Delete it or put it behind a build-time flag that is stripped from store builds. |
| F10 | ZK recovery stub | **REMOVE** from the binary | Already honest, and it throws. Keep it out so no reviewer sees "recovery" claims. |
| F11 | Bearometer as a signals **watchlist** | **GATE** | See §5.2. Ship as information only: no "buy", "sell", "long" or "short" wording, no link to the Hyperliquid agent or its P&L, not personalised, a clear "not advice" line, and crypto-asset signals excluded or handled as FCA promotions. 3.2.1(viii) (*"Apps used for financial trading, investing, or money management should be submitted by the financial institution…"*) should not apply to a read-only watchlist. ⚠ uncertain: a reviewer could read "bullish/bearish trade signals" as investing functionality. |
| F12 | Prediction markets (ETH and Base proxies) | **REMOVE** (later, gated) | Apple 5.3.4: real-money gaming *"must have necessary licensing and permissions in the locations where the app is used, must be geo-restricted to those locations"*. Apple has no prediction-market-specific text, so 5.3.4 plus 3.1.5(iv) (*"crypto-securities or quasi-securities trading must come from established banks, securities firms…"*) is the likely reading. Google Play's [Real-Money Gambling policy page](https://support.google.com/googleplay/android-developer/answer/9877032) requires a licence per country and geo-blocking. Secondary reporting describes a separate **Play prediction-market pilot** with a 1 Jun 2026 enrolment deadline. ⚠ uncertain: I could not find that pilot on Google's own policy pages. Confirm in Play Console before any markets work. UK: a crypto-settled prediction market is likely gambling (Gambling Commission licence) or a regulated derivative, and both need licences. Keep markets web-only. |
| F13 | MO token: any mention, price, buy, claim or airdrop | **REMOVE** | FCA crypto financial-promotions regime (§5.1). Apple 3.1.5(v) and 3.1.1. Play blockchain-content declaration plus "no glamorising earnings". |
| F14 | Hyperliquid trading agent | **REMOVE** (keep off mobile) | 3.1.5(iv) and 3.2.1(viii): perpetual futures trading has to come from a licensed institution. Not in the app today; keep it that way. |
| F15 | Account deletion | **GATE: blocker** | 5.1.1(v): *"If your app supports account creation, you must also offer account deletion within the app."* SIWE through `/api/auth/token` creates a server account (MO ledger, reviewer profile, votes). Today deletion is email only (`/privacy` §VI: `accounts@pooter.world`). Apple: apps outside highly regulated industries *"should not require people to … send an email"*. In-app "Delete Wallet" only wipes local keys. |
| F16 | Privacy manifest / labels / Data safety | **GATE: blocker** | `NSPrivacyCollectedDataTypes` is `[]`, but the app sends the wallet address (an identifier, linked to the user), votes and written basis text (User Content), and probably IP and diagnostics through Railway and Cloudflare. The App Store Connect privacy label and Play Data safety must match. The privacy policy must also be linked in the app (Settings) and in store metadata. |

---

## 4. Blockers (must fix before any submission)

Ordered by severity. **B1–B5 are certain rejections.** B6–B9 are likely rejections.

1. **B1: Apple Developer account type.** A wallet needs an **Organization** enrolment (3.1.5(i)). Confirm whether Hugo's account is Individual. If it is, enrol the legal entity (D-U-N-S number needed, allow 1–3 weeks). Without this, F6 has to go and the app becomes a read-only news and ledger app. *(Hugo: I could not tell the account type from the repo.)*
2. **B2: Crypto paid for tasks.** Witness votes earn 10 MO through the MO ledger, which is claimable on-chain (3.1.5(v)). Remove F4, F5 and F13 from the app, or move to F4b with a server-side unstaked path.
3. **B3: Crypto-gated feature.** Witnessing requires at least 100 MO staked (3.1.1). The same fix as B2 covers it.
4. **B4: Unlicensed transaction facilitation.** The Browse tab signs and sends arbitrary mainnet transactions for any site (3.1.5(iii), 4.7, Play exchanges/wallets policy). Remove F8.
5. **B5: No in-app account deletion** (5.1.1(v)). Add a "Delete account" flow that calls an authenticated `DELETE /api/account` endpoint. It should remove the account record, linked-wallet associations, sessions and tokens, reviewer profile, and off-chain votes and basis text. Say in the app what cannot be erased (on-chain records, and anything held under a legal duty). Then clear local keys after a seed-phrase warning. Google Play also requires a **web** deletion URL in the Data safety form. The `/privacy` page can host it.
6. **B6: Inaccurate privacy disclosures.** Fill `NSPrivacyCollectedDataTypes`, the App Store privacy label and Play Data safety (F16). Add a privacy-policy link inside the app.
7. **B7: Forced wallet at launch** (5.1.1(v)). Let people read the feed, Ledger and MPs with no wallet. Offer "Sign in with wallet" only for account features.
8. **B8: Minimum functionality** (4.2 / 4.2.2). Today the app is a link-out news list, one claim card and a browser pointed at the website. Native Claim Ledger and MP screens (F2, F3) and an in-app reader are what lift it above "repackaged website". Without them, expect a 4.2 rejection even after B2–B7.
9. **B9: Misleading data and dead paths.** Remove the Solana devnet balance (F7) and the dormant send, bridge and relay code (F9, F10). Remove *"points on their way"* and *"Coming soon"* states that reviewers will hit: 2.1 asks for complete, final functionality, and reviewers reject placeholder flows.

Also needed before submission (not policy blockers, but submission will fail or stall without them):
- `eas init` to set `extra.eas.projectId` (still a TODO in `app.json`).
- A demo path for App Review notes. If any sign-in remains, give the reviewer a test wallet phrase (no funds needed) or steps to create one, and state plainly that there is no token reward, staking or trading in the app.
- Age rating questionnaire: answer "no" to gambling and contests only after F4 and F12 are out.
- Play Console: **Financial features declaration** (declare "Cryptocurrency wallet": non-custodial, and Google says non-custodial wallets are outside the exchanges-and-wallets licensing policy) and the **Blockchain-based content** declaration. Leave out MO earning if F4b means none.
- `supportsTablet: true` means Apple reviews on iPad too. Check the layouts or set it to `false`.

---

## 5. UK FCA: MO promotion and Bearometer signals

### 5.1 MO token and the crypto financial-promotions regime

- MO is a fungible, transferable token on Base, so it is very likely a **qualifying cryptoasset**. Since 8 Oct 2023, any communication made "in the course of business" that *invites or induces* a UK person to buy, sell, stake or otherwise deal in it is a **cryptoasset financial promotion**. Per the FCA, the regime applies *"regardless of whether the firm is based overseas or what technology is used"*. An app shown to UK users is in scope.
- Only these can lawfully communicate it: an FCA-authorised firm, an MLR-registered cryptoasset business, a promotion **approved** by an authorised firm with the s21 crypto-approver permission, or one made under an exemption. pooter.world is none of these, as far as the repo shows.
- PS23/6 also **bans incentives to invest** (for example "earn X MO") and requires prescribed risk warnings, a 24-hour cooling-off period and appropriateness checks for first-time investors. A "witness and earn MO" loop shown to UK users is very likely a non-compliant promotion **and** an incentive.
- **New UK regime:** the FCA authorisation gateway opened **30 Sep 2026**, applications for the transitional route close **28 Feb 2027**, and the regime goes live **25 Oct 2027** ([MoFo](https://www.mofo.com/resources/insights/261012-uk-crypto-regulation-underway), [Davis Polk](https://www.davispolk.com/insights/client-update/fca-s-cryptoasset-authorisation-gateway-now-open)). ⚠ uncertain: whether running **MO-staked review with slashing and rewards** is a new regulated activity under the 2026 Regulations, such as cryptoasset staking or operating a platform. Get legal advice **before 28 Feb 2027** if staked review will keep serving UK users on any surface, the web included.
- **v1 rule:** the mobile app contains **no** MO price, balance, claim, buy or earn copy, and no link to any of these. This is the cheapest way to keep the store build out of the regime. ⚠ uncertain: an app that merely *shows* a user's MO balance, with no call to action, may not be an "inducement". The FCA reads "inducement" broadly, and FG23/3 covers mobile apps, so the safe v1 answer is still to show nothing.

### 5.2 Bearometer signals and "investment advice"

What exists today (web only): `/signals`, renamed **Bearometer** on `feat/bearometer-supply-chain`. Its methodology box says *"Bullish signals open long, bearish signals open short."* The same signals drive the Hyperliquid trading agent.

- **Advising on investments** (RAO art. 53) needs a recommendation to someone *as an investor* about a *particular* investment. Generic signals published to everyone are usually not "advice" (PERG 8 "generic advice"), and there is a publishing exclusion for material whose principal purpose is not advice. ⚠ uncertain: personalised watchlists ("your signals") or push alerts like "SELL NVDA" move toward regulated advice.
- **Financial promotion:** a signal that says "open long" on a listed share or crypto pair can be an *inducement* to deal. For cryptoasset pairs, that pulls in the full §5.1 regime. **Exclude crypto pairs from the mobile watchlist in v1.**
- **UK MAR investment recommendations** (art. 20): anyone who publishes information *recommending or suggesting an investment strategy* on a financial instrument must present it objectively and **disclose conflicts**. Publishing "long/short" signals while an operator-run agent trades the same signals is exactly the conflict that disclosure exists for. ⚠ uncertain: Hyperliquid perps may not be MAR instruments, but signals on listed equities and commodities affected by supply-chain events would be.
- **Store side:** 3.2.1(viii) is aimed at trading and investing apps, and a read-only watchlist is not one. Play's financial-services policy is similar. Framing decides which side of the line the app lands on.

**Bearometer v1 conditions (F11 = GATE):**
1. The copy describes events and direction of *pressure* ("supply stress rising for X"), never actions. Remove "buy", "sell", "long", "short" and "open".
2. No crypto assets in the mobile watchlist.
3. Not personalised and no push "trade" alerts in v1.
4. A permanent visible line: *"Signals and data, not advice. pooter.world is not authorised by the FCA."* The design note on `feat/bearometer-supply-chain` already plans a "not advice" header.
5. No mention or link to the trading agent, its positions or P&L. If those are ever published, add a conflicts disclosure.
6. A methodology and sources page reachable from each signal.

---

## 6. Order of fixes

Each step unblocks the next. Nothing here was done in this review: it is a work plan.

1. **Decide the account question (B1).** Hugo checks the Apple Developer account type and, if needed, starts Organization enrolment now. It has the longest lead time.
2. **Cut v1 scope in the app (B2, B3, B4, B9).** Remove the Browse tab, the Witness card (or put it behind a server flag that stays off for app clients), the Witness Points card, the Solana balance, and the dormant `bridge`, `fee-payer`, `sendSol`, `username` and `zk-recovery` modules. Hide or remove the "Crypto" feed category only if Crypto stories carry MO promotion (⚠ uncertain: neutral crypto news is fine).
3. **Make the app usable without a wallet (B7).** Wallet onboarding moves to an optional "Sign in" in Settings.
4. **Build native content (B8, F1–F3).** Claim Ledger list and detail, MP list and detail (`/ledger/member`), and an in-app article reader. This is the largest piece of work and the main protection against a 4.2 rejection.
5. **Account deletion (B5).** Add a server `DELETE /api/account` endpoint, an in-app flow, and a web deletion page for Play.
6. **Privacy (B6).** Fill the privacy manifest, Apple labels and Play Data safety. Add an in-app privacy-policy link and confirm the `/privacy` text matches what the app sends.
7. **Bearometer watchlist (F11).** Only after steps 2–6, and only under the §5.2 conditions. It can be v1.1 if timing is tight.
8. **Store plumbing.** `eas init`, iPad check, age rating, Play financial-features and blockchain declarations, App Review notes, TestFlight and an internal Play track on `dev`. Then promote `dev → main` per `CLAUDE.md`.
9. **Later, not v1:** prediction markets (licence per country plus geo-restriction, Play pilot enrolment), any MO feature (FCA-compliant promotion route, and legal advice on the Oct 2027 regime), and staked review on mobile.

---

## 7. Open questions for Hugo

- Is the Apple Developer account Individual or Organization? Which legal entity would hold the Organization account?
- Should Witness voting survive in v1 as an **unstaked** opinion (F4b), or wait for v1.1?
- Distribution: UK only, or worldwide? A UK-first launch puts §5 front and centre. A US launch changes the NFT and external-link rules in 3.1.1 but not the crypto-for-tasks rule.
- Has anyone taken legal advice yet on MO, staked review, or the 25 Oct 2027 UK regime?
