/**
 * Solana fee payer relay client.
 * User signs the tx, backend co-signs as fee payer and submits.
 */
import { Transaction, type Keypair } from '@solana/web3.js';
import { getConnection } from './solana-client';

const RELAY_API = 'https://pooter.world/api/solana/relay';

export async function submitWithRelay(
  transaction: Transaction,
  userKeypair: Keypair,
): Promise<string> {
  const conn = getConnection();

  // Set recent blockhash (fee payer will be set by the relay)
  const { blockhash } = await conn.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;

  // User partial-signs (instruction authority)
  transaction.partialSign(userKeypair);

  // Serialize without requiring all signatures (fee payer hasn't signed yet)
  const serialized = transaction.serialize({ requireAllSignatures: false });
  const base64 = Buffer.from(serialized).toString('base64');

  const response = await fetch(RELAY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: base64 }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Relay error: ${err}`);
  }

  const { signature } = await response.json();
  return signature;
}
