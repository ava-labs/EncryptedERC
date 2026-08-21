import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, zkit } from "hardhat";
import type { RegistrationCircuit } from "../generated-types/zkit";
import { processPoseidonEncryption } from "../src";
import type { EncryptedERCHarness } from "../typechain-types/contracts/mocks/EncryptedERCHarness";
import type { Registrar } from "../typechain-types/contracts/Registrar";
import type { SimpleERC20 } from "../typechain-types/contracts/tokens/SimpleERC20";
import { Registrar__factory } from "../typechain-types/factories/contracts";
import { EncryptedERCHarness__factory } from "../typechain-types/factories/contracts/mocks/EncryptedERCHarness__factory";
import { SimpleERC20__factory } from "../typechain-types/factories/contracts/tokens";
import { deployLibrary, deployVerifiers, withdraw } from "./helpers";
import { User } from "./user";

const EERC_DECIMALS = 10;
const MAX_PENDING_AMOUNT_PCTS = 300n;
const C_CHAIN_BLOCK_GAS_LIMIT = 15_000_000n;

describe("EncryptedERC withdrawal at the pending-history cap", () => {
  let owner: SignerWithAddress;
  let victimSigner: SignerWithAddress;
  let registrar: Registrar;
  let encryptedERC: EncryptedERCHarness;
  let token: SimpleERC20;
  let victim: User;
  let auditor: User;

  before(async () => {
    [owner, victimSigner] = await ethers.getSigners();
    victim = new User(victimSigner);
    auditor = new User(owner);

    const {
      registrationVerifier,
      mintVerifier,
      withdrawVerifier,
      transferVerifier,
      burnVerifier,
    } = await deployVerifiers(owner, false);
    const babyJubJub = await deployLibrary(owner);

    registrar = await new Registrar__factory(owner).deploy(
      registrationVerifier,
    );
    await registrar.waitForDeployment();

    encryptedERC = await new EncryptedERCHarness__factory(
      { "contracts/libraries/BabyJubJub.sol:BabyJubJub": babyJubJub },
      owner,
    ).deploy({
      registrar: registrar.target,
      isConverter: true,
      name: "",
      symbol: "",
      decimals: EERC_DECIMALS,
      mintVerifier,
      withdrawVerifier,
      transferVerifier,
      burnVerifier,
    });
    await encryptedERC.waitForDeployment();

    token = await new SimpleERC20__factory(owner).deploy(
      "Test",
      "TEST",
      EERC_DECIMALS,
    );
    await token.waitForDeployment();

    const registrationCircuit = (await zkit.getCircuit(
      "RegistrationCircuit",
    )) as unknown as RegistrationCircuit;
    const chainId = (await ethers.provider.getNetwork()).chainId;

    for (const user of [victim, auditor]) {
      const proof = await registrationCircuit.generateProof({
        SenderPrivateKey: user.formattedPrivateKey,
        SenderPublicKey: user.publicKey,
        SenderAddress: BigInt(user.signer.address),
        ChainID: chainId,
        RegistrationHash: user.genRegistrationHash(chainId),
      });
      const calldata = await registrationCircuit.generateCalldata(proof);
      await registrar.connect(user.signer).register(calldata);
    }

    await encryptedERC.connect(owner).setAuditorPublicKey(owner.address);
  });

  it("withdraws and clears 300 pending entries within the C-Chain block gas limit", async function () {
    this.timeout(12000_000);
    const depositAmount = 10_000n;
    const withdrawalAmount = 1n;
    const { ciphertext, nonce, authKey } = processPoseidonEncryption(
      [depositAmount],
      victim.publicKey,
    );

    await token.connect(owner).mint(victim.signer.address, depositAmount);
    await token
      .connect(victim.signer)
      .approve(encryptedERC.target, depositAmount);
    await encryptedERC
      .connect(victim.signer)
      [
        "deposit(uint256,address,uint256[7])"
      ](depositAmount, token.target, [...ciphertext, ...authKey, nonce]);

    const tokenId = await encryptedERC.tokenIds(token.target);
    const zeroValuePCT = processPoseidonEncryption([0n], victim.publicKey);
    for (let seeded = 1n; seeded < MAX_PENDING_AMOUNT_PCTS; seeded += 50n) {
      const count =
        MAX_PENDING_AMOUNT_PCTS - seeded < 50n
          ? MAX_PENDING_AMOUNT_PCTS - seeded
          : 50n;

        

      const tx = await encryptedERC.seedPendingHistory(
        victim.signer.address,
        tokenId,
        [
          ...zeroValuePCT.ciphertext,
          ...zeroValuePCT.authKey,
          zeroValuePCT.nonce,
        ],
        count,
        0,
      );
      await tx.wait();
    }

    const balance = await encryptedERC.balanceOf(
      victim.signer.address,
      tokenId,
    );
    expect(balance.amountPCTs).to.have.length(Number(MAX_PENDING_AMOUNT_PCTS));

    const { proof, userBalancePCT } = await withdraw(
      withdrawalAmount,
      victim,
      [...balance.eGCT.c1, ...balance.eGCT.c2],
      depositAmount,
      await encryptedERC.auditorPublicKey(),
    );
    const tokenBalanceBefore = await token.balanceOf(victim.signer.address);
    const tx = await encryptedERC
      .connect(victim.signer)
      [
        "withdraw(uint256,((uint256[2],uint256[2][2],uint256[2]),uint256[16]),uint256[7])"
      ](tokenId, proof, userBalancePCT);
    const receipt = await tx.wait();

    expect(receipt!.gasUsed).to.be.lessThan(C_CHAIN_BLOCK_GAS_LIMIT);
    expect(await token.balanceOf(victim.signer.address)).to.equal(
      tokenBalanceBefore + withdrawalAmount,
    );
    const balanceAfter = await encryptedERC.balanceOf(
      victim.signer.address,
      tokenId,
    );
    expect(balanceAfter.amountPCTs).to.be.empty;
  });
});
