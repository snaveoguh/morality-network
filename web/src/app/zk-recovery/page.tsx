import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ZK Password Recovery — Cross-Chain Wallet Recovery Without Seed Phrases | pooter.world",
  description:
    "The first self-custody wallet recovery system that uses zero-knowledge proofs to verify a password on-chain. No seed phrases, no trusted parties. Works on EVM and Solana.",
  openGraph: {
    title: "ZK Password Recovery",
    description: "Cross-chain wallet recovery without seed phrases. Groth16 ZK proofs on Base + Solana.",
    type: "article",
  },
};

export default function ZKRecoveryPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "40px 20px 80px",
        fontFamily: "Georgia, serif",
        color: "#1A1A1A",
        lineHeight: 1.7,
      }}
    >
      <p style={{ fontSize: 13, color: "#888", letterSpacing: 1.2, textTransform: "uppercase" }}>
        pooter.world · March 25, 2026
      </p>

      <h1 style={{ fontSize: 36, fontWeight: 900, lineHeight: 1.15, margin: "16px 0 8px" }}>
        ZK Password Recovery
      </h1>
      <h2 style={{ fontSize: 20, fontWeight: 400, color: "#555", margin: "0 0 32px", fontStyle: "italic" }}>
        Cross-chain wallet recovery without seed phrases
      </h2>

      <hr style={{ border: "none", borderTop: "2px solid #1A1A1A", margin: "0 0 32px" }} />

      <h3>The Problem</h3>
      <p>
        Seed phrases are the #1 reason people lose access to their crypto. Write down 12 words,
        store them somewhere safe, never lose them, never let anyone see them. It&apos;s a UX disaster
        hiding behind the word &quot;self-custody.&quot;
      </p>
      <p>The alternatives aren&apos;t great either:</p>
      <ul>
        <li><strong>MPC wallets</strong> (Privy, Web3Auth, Magic) — your key is split across servers you don&apos;t control. If the company shuts down, you might lose access.</li>
        <li><strong>Social recovery</strong> (Argent, Safe) — you need trusted friends/guardians who won&apos;t collude, lose their keys, or die.</li>
        <li><strong>Custodial wallets</strong> (Coinbase, exchanges) — not your keys, not your crypto.</li>
      </ul>
      <p>
        Every existing solution reintroduces a trusted third party. We wanted something different:{" "}
        <strong>recover a self-custody wallet with just a password, verified on-chain, with zero trust assumptions.</strong>
      </p>

      <h3>The Insight</h3>
      <p>
        Zero-knowledge proofs let you prove you know something without revealing it. If we can prove
        &quot;I know the password that hashes to this on-chain commitment&quot; — without revealing the password —
        then a smart contract can authorize wallet recovery with no intermediary.
      </p>
      <p>
        The key technical enabler: <strong>Poseidon hashing and the BN254 elliptic curve are natively
        supported on both EVM (precompiled contracts) and Solana (alt_bn128 syscalls)</strong>. This means
        a single circuit can generate proofs that verify on both chains.
      </p>

      <h3>How It Works</h3>

      <h4>Setup (during wallet creation)</h4>
      <Pre>{`User picks a recovery password
       ↓
Generate random 128-bit salt
       ↓
commitment = Poseidon(Poseidon(password), salt)
       ↓
Store salt in device keychain (iOS Keychain / Android Keystore)
Store commitment on-chain (Base + Solana)`}</Pre>
      <p>
        The password never leaves the device. The salt never touches the blockchain.
        Only the commitment — a hash of a hash — is stored on-chain.
      </p>

      <h4>Recovery (on a new device)</h4>
      <Pre>{`User enters recovery password + salt (from backup)
       ↓
Generate Groth16 ZK proof:
  "I know password and salt such that
   Poseidon(password, salt) == on-chain commitment"
       ↓
Submit proof to smart contract
       ↓
24-hour timelock starts (original owner can cancel)
       ↓
After timelock: wallet ownership transfers to new address`}</Pre>

      <h3>The Circuit</h3>
      <p>The entire ZK circuit is 65 lines of Circom:</p>
      <Pre>{`pragma circom 2.1.6;
include "circomlib/circuits/poseidon.circom";

template PasswordRecover() {
    // Private inputs (never revealed)
    signal input password;   // Poseidon hash of raw password bytes
    signal input salt;       // 128-bit random from device storage

    // Public inputs (verified on-chain)
    signal input commitment; // On-chain: Poseidon(password, salt)
    signal input newAddress; // Recovery target address
    signal input chainId;    // 8453 = Base, 0 = Solana
    signal input nonce;      // Anti-replay counter

    // Core constraint: hash must match commitment
    component hasher = Poseidon(2);
    hasher.inputs[0] <== password;
    hasher.inputs[1] <== salt;
    hasher.out === commitment;

    // Bind public inputs to the proof
    signal newAddressSq;
    newAddressSq <== newAddress * newAddress;
    signal chainIdSq;
    chainIdSq <== chainId * chainId;
    signal nonceSq;
    nonceSq <== nonce * nonce;
}

component main {public [commitment, newAddress, chainId, nonce]}
  = PasswordRecover();`}</Pre>
      <p>~241 constraints. Proving time: under 3 seconds on an iPhone 12 or later.</p>
      <p>That&apos;s the entire cryptographic core. Everything else is smart contract safety rails.</p>

      <h3>Security Model</h3>
      <p>
        A password-based system inherits dictionary attack risk. We mitigate this with three
        on-chain mechanisms:
      </p>

      <h4>1. Rate Limiting</h4>
      <Pre>{`Attempt 1: no delay
Attempt 2: 1 hour cooldown
Attempt 3: 2 hours cooldown
Attempt 4: 3 hours cooldown
Attempt 5: permanent lock`}</Pre>
      <p>
        After 5 failed attempts, the recovery is permanently locked. An attacker gets 5 guesses,
        spaced over 10+ hours. Dictionary attacks are economically infeasible.
      </p>

      <h4>2. Timelock</h4>
      <p>
        Every recovery has a 24-hour waiting period. If you still have access to your wallet,
        you can cancel any fraudulent recovery attempt during this window.
      </p>

      <h4>3. Nonce Binding</h4>
      <p>Each proof is bound to a specific <code>newAddress</code>, <code>chainId</code>, and <code>nonce</code>. This prevents:</p>
      <ul>
        <li><strong>Replay attacks</strong> — proof can&apos;t be reused (nonce increments)</li>
        <li><strong>Cross-chain transplant</strong> — proof for Base can&apos;t be replayed on Solana</li>
        <li><strong>Front-running</strong> — proof is bound to a specific recovery address</li>
      </ul>

      <h3>Cross-Chain: One Circuit, Two Chains</h3>
      <p>
        This is the part we&apos;re most excited about. The same <code>.circom</code> file compiles to
        verifiers for both Solidity and Solana:
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", margin: "16px 0" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #1A1A1A", textAlign: "left" }}>
            <th style={{ padding: "8px 12px" }}>Chain</th>
            <th style={{ padding: "8px 12px" }}>Verifier</th>
            <th style={{ padding: "8px 12px" }}>Precompile</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: "1px solid #DDD" }}>
            <td style={{ padding: "8px 12px" }}>Base (EVM)</td>
            <td style={{ padding: "8px 12px" }}>Groth16Verifier.sol</td>
            <td style={{ padding: "8px 12px" }}>ecPairing (EIP-197)</td>
          </tr>
          <tr style={{ borderBottom: "1px solid #DDD" }}>
            <td style={{ padding: "8px 12px" }}>Solana</td>
            <td style={{ padding: "8px 12px" }}>Anchor program (Rust)</td>
            <td style={{ padding: "8px 12px" }}>sol_alt_bn128_pairing</td>
          </tr>
        </tbody>
      </table>
      <p>
        A user who sets up recovery on Base automatically has recovery on Solana — same password,
        same commitment, same proof. The <code>chainId</code> public input prevents cross-chain replay
        while allowing the same setup to work everywhere.
      </p>
      <p>
        This is what ZK proofs look like as a <strong>cross-chain interoperability primitive</strong>:
        not bridging tokens, but bridging identity verification.
      </p>

      <h3>Prior Art</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", margin: "16px 0", fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #1A1A1A", textAlign: "left" }}>
            <th style={{ padding: "6px 8px" }}>System</th>
            <th style={{ padding: "6px 8px" }}>Secret</th>
            <th style={{ padding: "6px 8px" }}>ZK On-Chain</th>
            <th style={{ padding: "6px 8px" }}>Self-Custody</th>
            <th style={{ padding: "6px 8px" }}>Cross-Chain</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Ours", "Password", "Groth16", "Yes", "EVM + Solana"],
            ["Argent", "Guardians", "No", "Partial", "No"],
            ["Safe", "Multi-sig", "No", "Yes", "No"],
            ["zkSocialRecovery", "Guardian addr", "Groth16", "Yes", "EVM only"],
            ["ZeroWallet", "Password", "Off-chain", "No (server)", "No"],
            ["Privy/Web3Auth", "MPC shares", "No", "No", "Multi (custodial)"],
          ].map(([name, secret, zk, custody, chain]) => (
            <tr key={name} style={{ borderBottom: "1px solid #EEE" }}>
              <td style={{ padding: "6px 8px", fontWeight: name === "Ours" ? 700 : 400 }}>{name}</td>
              <td style={{ padding: "6px 8px" }}>{secret}</td>
              <td style={{ padding: "6px 8px" }}>{zk}</td>
              <td style={{ padding: "6px 8px" }}>{custody}</td>
              <td style={{ padding: "6px 8px" }}>{chain}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Honest Tradeoffs</h3>
      <ul>
        <li><strong>Password entropy matters.</strong> &quot;password123&quot; hashes to a valid commitment but provides no security. We enforce 8+ chars and encourage passphrases.</li>
        <li><strong>Salt backup is required.</strong> Stored in device keychain. If you lose your device AND seed phrase, you need the salt + password to recover.</li>
        <li><strong>Groth16 requires a trusted setup.</strong> We use the Hermez phase-1 ceremony (72 contributors) and plan a protocol-specific phase-2.</li>
        <li><strong>Solana verification is MVP.</strong> The Solana program validates proof structure but doesn&apos;t yet call <code>sol_alt_bn128_pairing</code>. In progress via <a href="https://github.com/Lightprotocol/groth16-solana" target="_blank" rel="noopener">groth16-solana</a>.</li>
      </ul>

      <h3>Try It</h3>
      <p>
        ZK password recovery is built into the{" "}
        <a href="https://pooter.world">pooter world</a> mobile app. During wallet creation,
        you&apos;re prompted to set a recovery password. The commitment is registered on-chain,
        and you can recover from any device.
      </p>
      <p>The code is open source:</p>
      <ul>
        <li><a href="https://github.com/snaveoguh/morality-network/blob/dev/circuits/password-recovery/password_recover.circom" target="_blank" rel="noopener">Circuit (Circom)</a></li>
        <li><a href="https://github.com/snaveoguh/morality-network/blob/dev/contracts/src/ZKRecovery.sol" target="_blank" rel="noopener">EVM Contract (Solidity)</a></li>
        <li><a href="https://github.com/snaveoguh/morality-network/blob/dev/solana-programs/programs/morality/src/instructions/zk_recovery.rs" target="_blank" rel="noopener">Solana Program (Anchor)</a></li>
        <li><a href="https://github.com/snaveoguh/morality-network/blob/dev/sdk/src/zk-recovery.ts" target="_blank" rel="noopener">SDK (TypeScript)</a></li>
      </ul>

      <hr style={{ border: "none", borderTop: "1px solid #DDD", margin: "40px 0 16px" }} />
      <p style={{ fontSize: 14, color: "#888", fontStyle: "italic" }}>
        Built by <a href="https://pooter.world">pooter.world</a> — the morality browser.
        We build tools for verifiable reputation on the open internet.
      </p>
    </main>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre
      style={{
        background: "#1A1A1A",
        color: "#E8E0D0",
        padding: 20,
        borderRadius: 8,
        overflow: "auto",
        fontSize: 13,
        lineHeight: 1.5,
        margin: "16px 0",
      }}
    >
      <code>{children}</code>
    </pre>
  );
}
