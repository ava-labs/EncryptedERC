import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import type { EncryptedUserBalancesHarness } from "../typechain-types/contracts/mocks/EncryptedUserBalancesHarness";
import { EncryptedUserBalancesHarness__factory } from "../typechain-types/factories/contracts/mocks/EncryptedUserBalancesHarness__factory";

describe("EncryptedUserBalances pending history", () => {
  let harness: EncryptedUserBalancesHarness;
  let owner: SignerWithAddress;
  let victim: SignerWithAddress;

  const seedHistory = async (tokenId: bigint, count: bigint) => {
    const batchSize = 50n;
    for (let seeded = 0n; seeded < count; seeded += batchSize) {
      const batch = count - seeded < batchSize ? count - seeded : batchSize;
      await harness.seedHistory(victim.address, tokenId, batch);
    }
  };

  before(async () => {
    [owner, victim] = await ethers.getSigners();
    const factory = new EncryptedUserBalancesHarness__factory(owner);
    harness = await factory.deploy();
    await harness.waitForDeployment();
  });

  it("rejects a credit once the pending-history cap is reached", async () => {
    const maxPendingAmountPCTs = await harness.MAX_PENDING_AMOUNT_PCTS();
    await seedHistory(0n, maxPendingAmountPCTs - 1n);
    await expect(harness.appendHistory(victim.address, 0)).to.not.be.reverted;
    await expect(
      harness.appendHistory(victim.address, 0),
    ).to.be.revertedWithCustomError(harness, "PendingHistoryLimitReached");
  });

  it("prunes a worst-case full history within the configured gas budget", async () => {
    const tokenId = 1;
    const maxPendingAmountPCTs = await harness.MAX_PENDING_AMOUNT_PCTS();
    await seedHistory(BigInt(tokenId), maxPendingAmountPCTs);

    const tx = await harness.pruneHistory(
      victim.address,
      tokenId,
      maxPendingAmountPCTs - 1n,
    );
    const receipt = await tx.wait();

    // Avalanche C-Chain's documented block gas limit reference is 15M. This is
    // intentionally only a benchmark guard: a full transfer/withdrawal must be
    // measured separately because it also includes proof verification and payout work.
    expect(receipt?.gasUsed).to.be.lessThan(12_000_000n);
    expect(
      await harness.pendingHistoryLength(victim.address, tokenId),
    ).to.equal(0n);
  });
});
