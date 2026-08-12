/**
 * Solana client — Connection and balance/transfer helpers.
 *
 * NOTE: the Morality program has never been deployed to Solana. The old
 * MORALITY_PROGRAM_ID here was an invalid base58 placeholder and the PDA
 * helpers that depended on it have been removed until a real program id
 * exists. Only balance reads and plain SOL transfers remain.
 */
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  type Keypair,
} from '@solana/web3.js';
import { keccak_256 } from 'js-sha3';

// ── Config ──────────────────────────────────────────────────────────

const SOLANA_RPC_DEVNET = 'https://api.devnet.solana.com';

let rpcUrl = SOLANA_RPC_DEVNET;
let connection: Connection | null = null;

export function setSolanaRpcUrl(url: string) {
  rpcUrl = url;
  connection = null;
}

export function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(rpcUrl, 'confirmed');
  }
  return connection;
}

// ── Entity hash (matches EVM keccak256) ─────────────────────────────

export function computeEntityHash(identifier: string): Uint8Array {
  return new Uint8Array(keccak_256.arrayBuffer(identifier));
}

// ── Balance ─────────────────────────────────────────────────────────

export async function getSolBalance(publicKey: PublicKey): Promise<number> {
  const conn = getConnection();
  const lamports = await conn.getBalance(publicKey);
  return lamports / LAMPORTS_PER_SOL;
}

// ── Send SOL ────────────────────────────────────────────────────────

export async function sendSol(
  from: Keypair,
  to: string,
  lamports: number,
): Promise<string> {
  const conn = getConnection();
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: new PublicKey(to),
      lamports,
    }),
  );
  tx.feePayer = from.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(from);
  return conn.sendRawTransaction(tx.serialize());
}
