import { describe, expect, it } from "vitest";
import {
  computeVaultSettlementPlan,
  computeVaultTopUpPlan,
} from "../trading/vault-strategy";

describe("computeVaultTopUpPlan", () => {
  it("wraps native ETH before allocating fresh capital", () => {
    const plan = computeVaultTopUpPlan({
      requiredWethWei: BigInt(10),
      currentWethWei: BigInt(2),
      currentNativeEthWei: BigInt(9),
      reserveEthWei: BigInt(1),
      allocateBufferBps: 12_000,
    });

    expect(plan.wrapNativeWei).toBe(BigInt(8));
    expect(plan.allocateWei).toBe(BigInt(0));
  });

  it("allocates buffered capital when wrapped/native balance is insufficient", () => {
    const plan = computeVaultTopUpPlan({
      requiredWethWei: BigInt(10_000),
      currentWethWei: BigInt(1_000),
      currentNativeEthWei: BigInt(1_500),
      reserveEthWei: BigInt(500),
      allocateBufferBps: 12_000,
    });

    expect(plan.wrapNativeWei).toBe(BigInt(1_000));
    expect(plan.allocateWei).toBe(BigInt(9_600));
  });
});

describe("computeVaultSettlementPlan", () => {
  it("returns principal and profit when the strategy wallet is net positive", () => {
    const plan = computeVaultSettlementPlan({
      deployedCapitalWei: BigInt(10_000),
      currentWethWei: BigInt(2_000),
      currentNativeEthWei: BigInt(9_500),
      reserveEthWei: BigInt(500),
    });

    expect(plan.unwrapWethWei).toBe(BigInt(2_000));
    expect(plan.returnWei).toBe(BigInt(11_000));
    expect(plan.reportLossWei).toBe(BigInt(0));
  });

  it("realizes a loss when the strategy comes back flat below deployed capital", () => {
    const plan = computeVaultSettlementPlan({
      deployedCapitalWei: BigInt(10_000),
      currentWethWei: BigInt(0),
      currentNativeEthWei: BigInt(7_500),
      reserveEthWei: BigInt(500),
    });

    expect(plan.returnWei).toBe(BigInt(7_000));
    expect(plan.reportLossWei).toBe(BigInt(3_000));
  });
});
