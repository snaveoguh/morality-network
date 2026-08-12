# App Store Compliance Checklist — pooter.world mobile

> Compiled 2026-08-12. For submitting the React Native / Expo app (`mobile/`)
> — which carries a self-custody crypto wallet — to the Apple App Store and
> Google Play. Guideline numbers are Apple's App Review Guidelines as of the
> compile date; re-check both policy pages before each submission, they move.

---

## 1. Apple — the crypto-specific rules

### 3.1.5(b) Cryptocurrencies (the one that decides the submission)

- [ ] **Wallet must be offered by an organisation.** Apps may facilitate
      storage/transmission of cryptocurrency only if "offered by developers
      enrolled as an organization" — a personal Apple Developer account will
      be rejected. **Action: enrol (or migrate) as an organisation account
      with a D-U-N-S number before building the store listing.**
- [ ] **No mining on device.** The app must not mine (background or
      foreground). We don't — confirm no dependency does anything
      mining-shaped.
- [ ] **Exchange features only from licensed entities.** In-app crypto
      *exchange* transactions are allowed only if offered by the exchange
      itself in regions it is licensed for. The in-app bridge/swap (LiFi SDK)
      sits close to this line — be ready to argue it is self-custody wallet
      functionality (user's own funds, no custodial exchange), or gate it out
      of the store build if review pushes back.
- [ ] **No tasks-for-crypto.** The app must not offer coin/token rewards for
      downloads, posts, social follows, or similar tasks.

### 3.1.1 In-app purchase (points and tokens)

- [ ] **No in-app points → token conversion.** Anything that converts an
      in-app balance, points, or rewards into MO (or any token) inside the app
      is an IAP/3.1.5 problem. **Points must convert on the website only.**
      The app may *display* balances; the conversion action lives at
      pooter.world in a browser, not in the app, and the app should not
      deep-link users straight into a "convert" flow with a call to action
      (that's the Netflix-era "reader app" steering problem — keep the app
      passive about it).
- [ ] No selling tokens/NFT unlocks for fiat outside IAP inside the app.
- [ ] Tipping with the user's own crypto from their own wallet is wallet
      functionality, not IAP — but expect to explain it in review notes.

### Privacy requirements (all iOS apps)

- [ ] **Privacy manifest** (`PrivacyInfo.xcprivacy`) — required. Declare data
      collection (email for login, wallet addresses) and required-reason API
      usage (e.g. UserDefaults). Expo SDK 55 generates/merges these from
      config plugins — verify third-party SDKs (LiFi, RN libs) ship their own
      manifests; the build will be rejected if a listed SDK lacks one.
- [ ] **Privacy nutrition labels** in App Store Connect — must match the
      manifest and the website policy: email (account), wallet addresses
      (identifiers, linked to user), on-chain activity (public by design),
      server logs (diagnostics). No tracking, no third-party advertising —
      so "Data Not Used to Track You".
- [ ] **Privacy policy URL** — required field. Use `https://pooter.world/privacy`
      once the `/privacy` page (this workstream) is live on prod.
- [ ] Account deletion: if the app has account creation, Apple requires
      in-app account deletion. Magic-link accounts count. Either add the
      deletion action in-app or (minimum) a clearly-linked in-app path to the
      deletion contact (`accounts@pooter.world`) — Apple has tightened this;
      an in-app button that actually deletes is the safe reading.

---

## 2. Google Play — equivalents

- [ ] **Cryptocurrency policy:** no on-device mining (cloud mining apps that
      remotely manage mining are also restricted). Wallets are permitted;
      exchanges need appropriate licensing in targeted regions.
- [ ] **Financial features declaration** in Play Console — crypto wallet apps
      must complete the declaration form; self-custody wallets currently have
      a lighter path than custodial/exchange apps, but the form is mandatory.
      In some jurisdictions (e.g. UK FCA financial-promotions regime) Play
      applies country-specific requirements — check the targeted-country list
      and consider excluding jurisdictions we can't answer for at launch.
- [ ] **Data safety form** — Play's nutrition-label equivalent; must match
      the /privacy page. Declare email, wallet addresses, no ads, no
      third-party tracking; state that ledger votes/ratings are published
      publicly by design.
- [ ] **Account deletion requirement** — Play requires both an in-app
      deletion path AND a web deletion URL. Point the web URL at
      `https://pooter.world/privacy#deletion`.
- [ ] Target API level current (Play enforces a rolling minimum); Expo 55 /
      RN 0.83 should be fine — verify at submission time.
- [ ] Financial-services / real-money rules do NOT allow tokens-as-rewards
      steering either — same posture as Apple: points convert on the website
      only.

---

## 3. Assets needed for both stores

- [ ] **App icon 1024×1024** (no alpha for Apple) — the black-square
      blackletter "pw" mark, per the INSURGENT BROADSHEET brand.
- [ ] **Screenshots** — Apple: 6.9" and 6.5" iPhone sets (iPad set if iPad
      support is claimed); Play: phone + 7"/10" tablet if targeted. Shoot the
      feed, wallet, ZK recovery, and ledger screens; no device frames with
      fake UI, no token-price promises in captions.
- [ ] Feature graphic 1024×500 (Play only).
- [ ] **Privacy policy URL:** `https://pooter.world/privacy` (live on prod
      before submission).
- [ ] Support URL + support email (`accounts@pooter.world` or a dedicated
      support@).
- [ ] App description — plain language; avoid "earn", "rewards", "invest",
      "profit" phrasing anywhere near the token; both stores' reviewers and
      regulators read those words badly on crypto apps.
- [ ] Demo/review account for reviewers: a magic-link test email they can
      access, plus a funded **testnet** wallet path or clear reviewer notes
      explaining self-custody (reviewers must be able to see wallet flows
      without buying crypto).
- [ ] Export-compliance answer (uses standard encryption / exempt) for Apple.
- [ ] Apple **organisation** developer account (see 3.1.5(b)) and Google Play
      developer account with the financial-features declaration completed.

---

## 4. Pre-submission gates from other workstreams

- [ ] Mobile send-flow (drainer) fix merged and in the store build.
- [ ] `/privacy` live on production (this workstream, after review).
- [ ] Solicitor pass on the privacy page (flagged in the page source).
- [ ] Confirm no in-app UI anywhere converts points/balances to MO.
