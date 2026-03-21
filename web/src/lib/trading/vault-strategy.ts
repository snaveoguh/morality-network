import { formatUnits } from "viem";

interface VaultTopUpPlanArgs {
  requiredWethWei: bigint;
  currentWethWei: bigint;
  currentNativeEthWei: bigint;
  reserveEthWei: bigint;
  allocateBufferBps: number;
}

interface VaultSettlementPlanArgs {
  deployedCapitalWei: bigint;
  currentWethWei: bigint;
  currentNativeEthWei: bigint;
  reserveEthWei: bigint;
}

export interface VaultTopUpPlan {
  wrapNativeWei: bigint;
  allocateWei: bigint;
}

export interface VaultSettlementPlan {
  unwrapWethWei: bigint;
  returnWei: bigint;
  reportLossWei: bigint;
}

function clampNonNegative(value: bigint): bigint {
  return value > BigInt(0) ? value : BigInt(0);
}

export function computeVaultTopUpPlan(args: VaultTopUpPlanArgs): VaultTopUpPlan {
  const reserveEthWei = clampNonNegative(args.reserveEthWei);
  const currentWethWei = clampNonNegative(args.currentWethWei);
  const currentNativeEthWei = clampNonNegative(args.currentNativeEthWei);
  const requiredWethWei = clampNonNegative(args.requiredWethWei);
  const allocateBufferBps = Math.max(10_000, Math.trunc(args.allocateBufferBps || 10_000));

  if (currentWethWei >= requiredWethWei) {
    return { wrapNativeWei: BigInt(0), allocateWei: BigInt(0) };
  }

  const nativeAvailableWei = currentNativeEthWei > reserveEthWei
    ? currentNativeEthWei - reserveEthWei
    : BigInt(0);
  const deficitWei = requiredWethWei - currentWethWei;
  const wrapNativeWei = nativeAvailableWei >= deficitWei ? deficitWei : nativeAvailableWei;
  const remainingDeficitWei = deficitWei > wrapNativeWei ? deficitWei - wrapNativeWei : BigInt(0);

  if (remainingDeficitWei === BigInt(0)) {
    return { wrapNativeWei, allocateWei: BigInt(0) };
  }

  const allocateWei = (remainingDeficitWei * BigInt(allocateBufferBps) + BigInt(9_999)) / BigInt(10_000);
  return { wrapNativeWei, allocateWei };
}

export function computeVaultSettlementPlan(args: VaultSettlementPlanArgs): VaultSettlementPlan {
  const reserveEthWei = clampNonNegative(args.reserveEthWei);
  const deployedCapitalWei = clampNonNegative(args.deployedCapitalWei);
  const unwrapWethWei = clampNonNegative(args.currentWethWei);
  const nativeAfterUnwrapWei = clampNonNegative(args.currentNativeEthWei) + unwrapWethWei;
  const returnWei = nativeAfterUnwrapWei > reserveEthWei
    ? nativeAfterUnwrapWei - reserveEthWei
    : BigInt(0);
  const reportLossWei = deployedCapitalWei > returnWei ? deployedCapitalWei - returnWei : BigInt(0);

  return {
    unwrapWethWei,
    returnWei,
    reportLossWei,
  };
}

export function formatVaultEth(value: bigint): string {
  return formatUnits(value, 18);
}
