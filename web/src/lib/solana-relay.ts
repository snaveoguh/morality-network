/**
 * Solana fee payer relay — validates and co-signs transactions.
 * The fee payer keypair is loaded from SOLANA_FEE_PAYER_KEY env var.
 */
import {
  Connection,
  Keypair,
  Transaction,
  PublicKey,
} from '@solana/web3.js';
import bs58 from 'bs58';

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Whitelist: only these program IDs are allowed
const ALLOWED_PROGRAMS = new Set([
  process.env.MORALITY_PROGRAM_ID || 'Mora1ityXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  '11111111111111111111111111111111', // System program (for SOL transfers)
]);

let feePayerKeypair: Keypair | null = null;

function getFeePayer(): Keypair {
  if (feePayerKeypair) return feePayerKeypair;
  const key = process.env.SOLANA_FEE_PAYER_KEY;
  if (!key) throw new Error('SOLANA_FEE_PAYER_KEY not configured');
  feePayerKeypair = Keypair.fromSecretKey(bs58.decode(key));
  return feePayerKeypair;
}

function getConnection(): Connection {
  return new Connection(SOLANA_RPC, 'confirmed');
}

/**
 * Validate that a transaction only interacts with allowed programs.
 */
function validateTransaction(tx: Transaction): void {
  for (const ix of tx.instructions) {
    if (!ALLOWED_PROGRAMS.has(ix.programId.toBase58())) {
      throw new Error(
        `Blocked: transaction targets disallowed program ${ix.programId.toBase58()}`,
      );
    }
  }
}

/**
 * Co-sign a partially-signed transaction as fee payer and submit.
 */
export async function relayTransaction(transactionBase64: string): Promise<string> {
  const conn = getConnection();
  const feePayer = getFeePayer();

  // Deserialize the partially-signed transaction
  const txBuffer = Buffer.from(transactionBase64, 'base64');
  const tx = Transaction.from(txBuffer);

  // Validate program whitelist
  validateTransaction(tx);

  // Set fee payer if not already set
  if (!tx.feePayer) {
    tx.feePayer = feePayer.publicKey;
  } else if (!tx.feePayer.equals(feePayer.publicKey)) {
    // If fee payer is set to someone else, that's fine — we just need to co-sign
    // But for our relay, we want to BE the fee payer
    tx.feePayer = feePayer.publicKey;
  }

  // Ensure recent blockhash
  if (!tx.recentBlockhash) {
    const { blockhash } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
  }

  // Add fee payer signature
  tx.partialSign(feePayer);

  // Submit
  const signature = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  // Wait for confirmation
  await conn.confirmTransaction(signature, 'confirmed');

  return signature;
}

/**
 * Get fee payer's SOL balance (for monitoring).
 */
export async function getFeePayerBalance(): Promise<number> {
  const conn = getConnection();
  const feePayer = getFeePayer();
  const lamports = await conn.getBalance(feePayer.publicKey);
  return lamports / 1e9;
}
