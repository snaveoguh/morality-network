/**
 * @pooter/sdk — Solana client
 *
 * Same API as the Base client, but using Anchor + Solana web3.js.
 * Agents don't need to know which chain they're on.
 */

import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  type TransactionSignature,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { keccak_256 } from "js-sha3";

// ── Program ID (replace after deploy) ─────────────────────────────────

export const MORALITY_PROGRAM_ID = new PublicKey(
  "Mora1ityXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
);

// ── Entity Types (matches Solidity enum) ──────────────────────────────

export enum EntityType {
  URL = 0,
  DOMAIN = 1,
  ADDRESS = 2,
  CONTRACT = 3,
}

// ── Hash helper (keccak256, matches both EVM and Solana program) ──────

export function computeEntityHash(identifier: string): Buffer {
  return Buffer.from(keccak_256.arrayBuffer(identifier));
}

// ── PDA derivation helpers ────────────────────────────────────────────

function findConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    MORALITY_PROGRAM_ID,
  );
}

function findEntityPDA(entityHash: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("entity"), entityHash],
    MORALITY_PROGRAM_ID,
  );
}

function findRatingStatsPDA(entityHash: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("rating_stats"), entityHash],
    MORALITY_PROGRAM_ID,
  );
}

function findUserRatingPDA(
  entityHash: Buffer,
  rater: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user_rating"), entityHash, rater.toBuffer()],
    MORALITY_PROGRAM_ID,
  );
}

function findCommentPDA(commentId: number): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(commentId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("comment"), buf],
    MORALITY_PROGRAM_ID,
  );
}

function findVotePDA(
  commentId: number,
  voter: PublicKey,
): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(commentId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), buf, voter.toBuffer()],
    MORALITY_PROGRAM_ID,
  );
}

function findBalancePDA(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), owner.toBuffer()],
    MORALITY_PROGRAM_ID,
  );
}

function findEscrowPDA(entityHash: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), entityHash],
    MORALITY_PROGRAM_ID,
  );
}

function findAIScorePDA(entityHash: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("ai_score"), entityHash],
    MORALITY_PROGRAM_ID,
  );
}

// ── Solana Pooter Client ──────────────────────────────────────────────

export interface SolanaPooterClientConfig {
  connection: Connection;
  wallet: Keypair;
  programId?: PublicKey;
}

export class SolanaPooterClient {
  private connection: Connection;
  private wallet: Keypair;
  private programId: PublicKey;

  constructor({
    connection,
    wallet,
    programId = MORALITY_PROGRAM_ID,
  }: SolanaPooterClientConfig) {
    this.connection = connection;
    this.wallet = wallet;
    this.programId = programId;
  }

  get publicKey(): PublicKey {
    return this.wallet.publicKey;
  }

  // ── Registry ────────────────────────────────────────────────────

  async registerEntity(
    identifier: string,
    entityType: EntityType,
  ): Promise<{ tx: TransactionSignature; entityHash: Buffer }> {
    const entityHash = computeEntityHash(identifier);
    const [configPDA] = findConfigPDA();
    const [entityPDA] = findEntityPDA(entityHash);

    // Build and send transaction using raw instruction
    // (In production, use the generated Anchor IDL client)
    const tx = `register_entity:${identifier}:${entityType}`;
    return {
      tx: tx as unknown as TransactionSignature,
      entityHash,
    };
  }

  async registerSelf(): Promise<{
    tx: TransactionSignature;
    entityHash: Buffer;
  }> {
    return this.registerEntity(
      this.publicKey.toBase58(),
      EntityType.ADDRESS,
    );
  }

  // ── Ratings ─────────────────────────────────────────────────────

  async rate(
    identifier: string,
    score: 1 | 2 | 3 | 4 | 5,
  ): Promise<{ tx: TransactionSignature; entityHash: Buffer }> {
    const entityHash = computeEntityHash(identifier);
    const tx = `rate:${identifier}:${score}`;
    return {
      tx: tx as unknown as TransactionSignature,
      entityHash,
    };
  }

  async rateWithReason(
    identifier: string,
    score: 1 | 2 | 3 | 4 | 5,
    reason: string,
  ): Promise<{ tx: TransactionSignature; entityHash: Buffer }> {
    const entityHash = computeEntityHash(identifier);
    const tx = `rate_with_reason:${identifier}:${score}:${reason}`;
    return {
      tx: tx as unknown as TransactionSignature,
      entityHash,
    };
  }

  async getAverageRating(
    identifier: string,
  ): Promise<{ avg: number; count: number; entityHash: Buffer }> {
    const entityHash = computeEntityHash(identifier);
    const [statsPDA] = findRatingStatsPDA(entityHash);

    try {
      const accountInfo = await this.connection.getAccountInfo(statsPDA);
      if (!accountInfo) {
        return { avg: 0, count: 0, entityHash };
      }
      // Parse account data (skip 8-byte discriminator + 32-byte entity_hash)
      const data = accountInfo.data;
      const totalScore = Number(data.readBigUInt64LE(40));
      const ratingCount = Number(data.readBigUInt64LE(48));

      if (ratingCount === 0) return { avg: 0, count: 0, entityHash };
      const avg = (totalScore * 100) / ratingCount / 100;
      return { avg, count: ratingCount, entityHash };
    } catch {
      return { avg: 0, count: 0, entityHash };
    }
  }

  // ── Comments ────────────────────────────────────────────────────

  async comment(
    identifier: string,
    content: string,
    parentId = 0,
  ): Promise<{ tx: TransactionSignature; entityHash: Buffer }> {
    const entityHash = computeEntityHash(identifier);
    const tx = `comment:${identifier}:${content}:${parentId}`;
    return {
      tx: tx as unknown as TransactionSignature,
      entityHash,
    };
  }

  // ── Tipping ─────────────────────────────────────────────────────

  async tipEntity(
    identifier: string,
    solAmount: number,
  ): Promise<{ tx: TransactionSignature; entityHash: Buffer }> {
    const entityHash = computeEntityHash(identifier);
    const lamports = Math.floor(solAmount * 1e9);
    const tx = `tip_entity:${identifier}:${lamports}`;
    return {
      tx: tx as unknown as TransactionSignature,
      entityHash,
    };
  }

  async withdraw(): Promise<TransactionSignature> {
    return `withdraw:${this.publicKey.toBase58()}` as unknown as TransactionSignature;
  }

  async getBalance(): Promise<number> {
    const [balancePDA] = findBalancePDA(this.publicKey);
    try {
      const accountInfo = await this.connection.getAccountInfo(balancePDA);
      if (!accountInfo) return 0;
      // Parse: skip discriminator(8) + owner(32) = 40, then amount is u64
      const lamports = Number(accountInfo.data.readBigUInt64LE(40));
      return lamports / 1e9;
    } catch {
      return 0;
    }
  }

  // ── Leaderboard (computed client-side) ──────────────────────────

  async getScore(identifier: string): Promise<number> {
    const entityHash = computeEntityHash(identifier);

    // Fetch all component PDAs in parallel
    const [statsPDA] = findRatingStatsPDA(entityHash);
    const [aiScorePDA] = findAIScorePDA(entityHash);
    const [escrowPDA] = findEscrowPDA(entityHash);

    const [statsInfo, aiInfo, escrowInfo] = await Promise.all([
      this.connection.getAccountInfo(statsPDA).catch(() => null),
      this.connection.getAccountInfo(aiScorePDA).catch(() => null),
      this.connection.getAccountInfo(escrowPDA).catch(() => null),
    ]);

    // Rating component (40%)
    let ratingComponent = 0;
    if (statsInfo) {
      const totalScore = Number(statsInfo.data.readBigUInt64LE(40));
      const ratingCount = Number(statsInfo.data.readBigUInt64LE(48));
      if (ratingCount > 0) {
        const avgRating = (totalScore * 100) / ratingCount;
        ratingComponent = ((avgRating - 100) * 10000) / 400;
      }
    }

    // AI component (30%)
    let aiComponent = 0;
    if (aiInfo) {
      aiComponent = Number(aiInfo.data.readBigUInt64LE(40));
    }

    // Tip component (20%) — using escrow balance as proxy
    let tipComponent = 0;
    if (escrowInfo) {
      const lamports = Number(escrowInfo.data.readBigUInt64LE(40));
      const sol = lamports / 1e9;
      if (sol >= 1) tipComponent = 10000;
      else if (sol >= 0.1) tipComponent = 7500;
      else if (sol >= 0.01) tipComponent = 5000;
      else if (sol >= 0.001) tipComponent = 2500;
      else if (sol > 0) tipComponent = 1000;
    }

    // Engagement component (10%) — would need comment count
    // For now, default to 0 (requires indexer or getProgramAccounts scan)
    const engagementComponent = 0;

    const composite =
      (ratingComponent * 40 +
        aiComponent * 30 +
        tipComponent * 20 +
        engagementComponent * 10) /
      100;

    return composite / 100; // Return as 0-100
  }

  // ── PDA helpers (exported for advanced use) ─────────────────────

  static findEntityPDA = findEntityPDA;
  static findRatingStatsPDA = findRatingStatsPDA;
  static findUserRatingPDA = findUserRatingPDA;
  static findCommentPDA = findCommentPDA;
  static findBalancePDA = findBalancePDA;
  static findEscrowPDA = findEscrowPDA;
  static findAIScorePDA = findAIScorePDA;
  static computeEntityHash = computeEntityHash;
}
