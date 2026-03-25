/**
 * Solana client — Connection, PDA helpers, and program interaction.
 * PDA derivation ported from sdk/src/solana.ts
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

export const MORALITY_PROGRAM_ID = new PublicKey(
  'Mora1ityXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', // placeholder until real deploy
);

const SOLANA_RPC_DEVNET = 'https://api.devnet.solana.com';
const SOLANA_RPC_MAINNET = 'https://api.mainnet-beta.solana.com';

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

// ── PDA derivation (ported from sdk/src/solana.ts) ──────────────────

export function findEntityPDA(entityHash: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('entity'), Buffer.from(entityHash)],
    MORALITY_PROGRAM_ID,
  );
}

export function findRatingStatsPDA(entityHash: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('rating_stats'), Buffer.from(entityHash)],
    MORALITY_PROGRAM_ID,
  );
}

export function findUserRatingPDA(
  entityHash: Uint8Array,
  rater: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user_rating'), Buffer.from(entityHash), rater.toBuffer()],
    MORALITY_PROGRAM_ID,
  );
}

export function findCommentPDA(commentId: bigint): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(commentId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('comment'), buf],
    MORALITY_PROGRAM_ID,
  );
}

export function findVaultPDA(entityHash: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), Buffer.from(entityHash)],
    MORALITY_PROGRAM_ID,
  );
}

export function findConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    MORALITY_PROGRAM_ID,
  );
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
