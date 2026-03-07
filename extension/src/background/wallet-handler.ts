import { parseEther } from 'viem';
import { baseSepolia } from 'viem/chains';
import { getWalletClient, getAccount } from '../shared/wallet';
import { getPublicClient } from '../shared/rpc';
import { CONTRACTS, RATINGS_ABI, COMMENTS_ABI, TIPPING_ABI, REGISTRY_ABI } from '../shared/contracts';
import { computeEntityHash, detectEntityType } from '../shared/entity';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

function requireDeployed(): void {
  if (CONTRACTS.ratings === ZERO_ADDR) {
    throw new Error('Contracts not deployed yet');
  }
}

function requireUnlocked(): void {
  if (!getAccount()) throw new Error('Wallet is locked');
}

async function waitForConfirmation(hash: `0x${string}`): Promise<void> {
  const client = getPublicClient();
  await client.waitForTransactionReceipt({ hash });
}

export async function rateEntity(entityHash: string, score: number): Promise<string> {
  requireDeployed();
  requireUnlocked();
  if (score < 1 || score > 5) throw new Error('Score must be 1-5');

  const client = getWalletClient();
  const hash = await client.writeContract({
    chain: baseSepolia,
    account: getAccount()!,
    address: CONTRACTS.ratings,
    abi: RATINGS_ABI,
    functionName: 'rate',
    args: [entityHash as `0x${string}`, score],
  });
  return hash;
}

export async function rateEntityWithReason(entityHash: string, score: number, reason: string): Promise<string> {
  requireDeployed();
  requireUnlocked();
  if (score < 1 || score > 5) throw new Error('Score must be 1-5');

  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error('Reason is required');
  if (trimmedReason.length > 500) throw new Error('Reason too long (max 500 chars)');

  const client = getWalletClient();
  const hash = await client.writeContract({
    chain: baseSepolia,
    account: getAccount()!,
    address: CONTRACTS.ratings,
    abi: RATINGS_ABI,
    functionName: 'rateWithReason',
    args: [entityHash as `0x${string}`, score, trimmedReason],
  });
  return hash;
}

export async function submitComment(entityHash: string, content: string, parentId: number): Promise<string> {
  requireDeployed();
  requireUnlocked();
  if (content.length > 2000) throw new Error('Comment too long (max 2000 chars)');

  const client = getWalletClient();
  const hash = await client.writeContract({
    chain: baseSepolia,
    account: getAccount()!,
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: 'comment',
    args: [entityHash as `0x${string}`, content, BigInt(parentId)],
  });
  await waitForConfirmation(hash);
  return hash;
}

export async function tipEntity(entityHash: string, amountWei: string): Promise<string> {
  requireDeployed();
  requireUnlocked();

  const client = getWalletClient();
  const hash = await client.writeContract({
    chain: baseSepolia,
    account: getAccount()!,
    address: CONTRACTS.tipping,
    abi: TIPPING_ABI,
    functionName: 'tipEntity',
    args: [entityHash as `0x${string}`],
    value: BigInt(amountWei),
  });
  return hash;
}

export async function tipComment(commentId: number, amountWei: string): Promise<string> {
  requireDeployed();
  requireUnlocked();

  const client = getWalletClient();
  const hash = await client.writeContract({
    chain: baseSepolia,
    account: getAccount()!,
    address: CONTRACTS.tipping,
    abi: TIPPING_ABI,
    functionName: 'tipComment',
    args: [BigInt(commentId)],
    value: BigInt(amountWei),
  });
  return hash;
}

export async function voteComment(commentId: number, vote: number): Promise<string> {
  requireDeployed();
  requireUnlocked();
  if (vote !== 1 && vote !== -1) throw new Error('Vote must be +1 or -1');

  const client = getWalletClient();
  const hash = await client.writeContract({
    chain: baseSepolia,
    account: getAccount()!,
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: 'vote',
    args: [BigInt(commentId), vote],
  });
  return hash;
}

export async function sendEth(to: string, amountWei: string): Promise<string> {
  requireUnlocked();

  const client = getWalletClient();
  const hash = await client.sendTransaction({
    chain: baseSepolia,
    account: getAccount()!,
    to: to as `0x${string}`,
    value: BigInt(amountWei),
  });
  return hash;
}
