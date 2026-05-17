import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, zkit } from "hardhat";
import type { CalldataRegistrationCircuitGroth16, RegistrationCircuit } from "../generated-types/zkit";
import type { AvaDB } from "../typechain-types/contracts/avadb/AvaDB";
import type { RegisterProofStruct, Registrar } from "../typechain-types/contracts/Registrar";
import { AvaDB__factory } from "../typechain-types/factories/contracts/avadb";
import { Registrar__factory } from "../typechain-types/factories/contracts";
import { deployVerifiers } from "./helpers";
import { User } from "./user";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a registration proof for a user and call Registrar.register().
 */
async function registerUser(
  user: User,
  registrar: Registrar,
  circuit: RegistrationCircuit,
): Promise<void> {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const registrationHash = user.genRegistrationHash(chainId);

  const input = {
    SenderPrivateKey: user.formattedPrivateKey,
    SenderPublicKey: user.publicKey,
    SenderAddress: BigInt(user.signer.address),
    ChainID: chainId,
    RegistrationHash: registrationHash,
  };

  const proof = await circuit.generateProof(input);
  const calldata = (await circuit.generateCalldata(proof)) as CalldataRegistrationCircuitGroth16;

  const registerProof: RegisterProofStruct = {
    proofPoints: calldata.proofPoints,
    publicSignals: calldata.publicSignals,
  };
  await registrar.connect(user.signer).register(registerProof);
}

/**
 * Simulate off-chain encryption: in tests we just use deterministic mock bytes
 * so we can check the contract stores/returns them correctly.
 */
function mockEncrypt(data: string): Uint8Array {
  return ethers.toUtf8Bytes(`ENCRYPTED[${data}]`);
}

function mockReEncrypt(data: string, viewer: string): Uint8Array {
  return ethers.toUtf8Bytes(`REENC[${data}][${viewer}]`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AvaDB", () => {
  let registrar: Registrar;
  let avaDB: AvaDB;
  let signers: SignerWithAddress[];
  let owner: SignerWithAddress;
  let alice: User;
  let bob: User;
  let carol: User;

  const deployFixture = async () => {
    signers = await ethers.getSigners();
    owner = signers[0];

    alice = new User(signers[0]);
    bob = new User(signers[1]);
    carol = new User(signers[2]);

    // Deploy verifiers + Registrar
    const { registrationVerifier } = await deployVerifiers(owner);
    const registrarFactory = await ethers.getContractFactory("Registrar");
    const registrarDeployed = await registrarFactory.connect(owner).deploy(registrationVerifier);
    await registrarDeployed.waitForDeployment();
    registrar = Registrar__factory.connect(registrarDeployed.target.toString(), owner);

    // Deploy AvaDB pointing at the Registrar
    const avaDBFactory = await ethers.getContractFactory("AvaDB");
    const avaDBDeployed = await avaDBFactory.connect(owner).deploy(registrar.target);
    await avaDBDeployed.waitForDeployment();
    avaDB = AvaDB__factory.connect(avaDBDeployed.target.toString(), owner);

    // Register all three users
    const circuit = await zkit.getCircuit("RegistrationCircuit");
    await registerUser(alice, registrar, circuit);
    await registerUser(bob, registrar, circuit);
    await registerUser(carol, registrar, circuit);
  };

  beforeEach(deployFixture);

  // ── createRecord ──────────────────────────────────────────────────────────

  describe("createRecord", () => {
    it("should create a record and emit RecordCreated", async () => {
      const content = mockEncrypt("hello AvaDB");
      const schema = "json";

      const tx = await avaDB
        .connect(alice.signer)
        .createRecord({ encryptedContent: content, schema });

      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;

      const events = receipt!.logs
        .map((log) => {
          try {
            return avaDB.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const created = events.find((e) => e?.name === "RecordCreated");
      expect(created).to.not.be.undefined;
      expect(created!.args.owner).to.equal(alice.signer.address);
      expect(created!.args.schema).to.equal(schema);
    });

    it("should generate deterministic record IDs per owner", async () => {
      const content = mockEncrypt("record0");
      const nonceBefore = await avaDB.nonces(alice.signer.address);

      const tx = await avaDB
        .connect(alice.signer)
        .createRecord({ encryptedContent: content, schema: "" });
      const receipt = await tx.wait();

      const event = receipt!.logs
        .map((l) => {
          try { return avaDB.interface.parseLog(l); } catch { return null; }
        })
        .find((e) => e?.name === "RecordCreated");

      const expectedId = ethers.keccak256(
        ethers.solidityPacked(
          ["address", "uint256", "uint256"],
          [alice.signer.address, nonceBefore, (await ethers.provider.getNetwork()).chainId],
        ),
      );
      expect(event!.args.recordId).to.equal(expectedId);
      expect(await avaDB.nonces(alice.signer.address)).to.equal(nonceBefore + 1n);
    });

    it("should revert for unregistered caller", async () => {
      const unregistered = signers[9];
      await expect(
        avaDB
          .connect(unregistered)
          .createRecord({ encryptedContent: mockEncrypt("x"), schema: "" }),
      ).to.be.revertedWithCustomError(avaDB, "UserNotRegistered");
    });

    it("should revert for empty content", async () => {
      await expect(
        avaDB
          .connect(alice.signer)
          .createRecord({ encryptedContent: "0x", schema: "" }),
      ).to.be.revertedWith("AvaDB: empty content");
    });
  });

  // ── updateRecord ──────────────────────────────────────────────────────────

  describe("updateRecord", () => {
    let recordId: string;

    beforeEach(async () => {
      const tx = await avaDB
        .connect(alice.signer)
        .createRecord({ encryptedContent: mockEncrypt("v1"), schema: "" });
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((l) => { try { return avaDB.interface.parseLog(l); } catch { return null; } })
        .find((e) => e?.name === "RecordCreated");
      recordId = event!.args.recordId;
    });

    it("should update content and emit RecordUpdated", async () => {
      const newContent = mockEncrypt("v2");
      await expect(avaDB.connect(alice.signer).updateRecord(recordId, newContent))
        .to.emit(avaDB, "RecordUpdated")
        .withArgs(recordId, alice.signer.address);
    });

    it("should revert if called by non-owner", async () => {
      await expect(
        avaDB.connect(bob.signer).updateRecord(recordId, mockEncrypt("hack")),
      ).to.be.revertedWithCustomError(avaDB, "UnauthorizedAccess");
    });
  });

  // ── deleteRecord ──────────────────────────────────────────────────────────

  describe("deleteRecord", () => {
    let recordId: string;

    beforeEach(async () => {
      const tx = await avaDB
        .connect(alice.signer)
        .createRecord({ encryptedContent: mockEncrypt("data"), schema: "" });
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((l) => { try { return avaDB.interface.parseLog(l); } catch { return null; } })
        .find((e) => e?.name === "RecordCreated");
      recordId = event!.args.recordId;
    });

    it("should delete and emit RecordDeleted", async () => {
      await expect(avaDB.connect(alice.signer).deleteRecord(recordId))
        .to.emit(avaDB, "RecordDeleted")
        .withArgs(recordId, alice.signer.address);
    });

    it("subsequent ops on deleted record should revert", async () => {
      await avaDB.connect(alice.signer).deleteRecord(recordId);
      await expect(
        avaDB.connect(alice.signer).updateRecord(recordId, mockEncrypt("x")),
      ).to.be.revertedWith("AvaDB: record does not exist");
    });

    it("should revert if called by non-owner", async () => {
      await expect(
        avaDB.connect(bob.signer).deleteRecord(recordId),
      ).to.be.revertedWithCustomError(avaDB, "UnauthorizedAccess");
    });
  });

  // ── grantAccess / revokeAccess ────────────────────────────────────────────

  describe("access control", () => {
    let recordId: string;

    beforeEach(async () => {
      const tx = await avaDB
        .connect(alice.signer)
        .createRecord({ encryptedContent: mockEncrypt("secret"), schema: "" });
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((l) => { try { return avaDB.interface.parseLog(l); } catch { return null; } })
        .find((e) => e?.name === "RecordCreated");
      recordId = event!.args.recordId;
    });

    it("grantAccess should emit AccessGranted", async () => {
      const reEnc = mockReEncrypt("secret", bob.signer.address);
      await expect(
        avaDB.connect(alice.signer).grantAccess(recordId, bob.signer.address, reEnc),
      )
        .to.emit(avaDB, "AccessGranted")
        .withArgs(recordId, alice.signer.address, bob.signer.address);
    });

    it("viewer hasAccess should return true after grant", async () => {
      expect(await avaDB.hasAccess(recordId, bob.signer.address)).to.be.false;
      await avaDB
        .connect(alice.signer)
        .grantAccess(recordId, bob.signer.address, mockReEncrypt("s", bob.signer.address));
      expect(await avaDB.hasAccess(recordId, bob.signer.address)).to.be.true;
    });

    it("revokeAccess should remove viewer", async () => {
      await avaDB
        .connect(alice.signer)
        .grantAccess(recordId, bob.signer.address, mockReEncrypt("s", bob.signer.address));

      await expect(
        avaDB.connect(alice.signer).revokeAccess(recordId, bob.signer.address),
      )
        .to.emit(avaDB, "AccessRevoked")
        .withArgs(recordId, alice.signer.address, bob.signer.address);

      expect(await avaDB.hasAccess(recordId, bob.signer.address)).to.be.false;
    });

    it("grantAccess reverts for unregistered viewer", async () => {
      const unregistered = signers[9];
      await expect(
        avaDB
          .connect(alice.signer)
          .grantAccess(recordId, unregistered.address, mockReEncrypt("s", unregistered.address)),
      ).to.be.revertedWithCustomError(avaDB, "UserNotRegistered");
    });

    it("grantAccess reverts when owner tries to grant to self", async () => {
      await expect(
        avaDB
          .connect(alice.signer)
          .grantAccess(recordId, alice.signer.address, mockReEncrypt("s", alice.signer.address)),
      ).to.be.revertedWith("AvaDB: owner cannot grant access to self");
    });

    it("non-owner cannot grant access", async () => {
      await expect(
        avaDB
          .connect(bob.signer)
          .grantAccess(recordId, carol.signer.address, mockReEncrypt("s", carol.signer.address)),
      ).to.be.revertedWithCustomError(avaDB, "UnauthorizedAccess");
    });

    it("getViewers returns correct list", async () => {
      await avaDB
        .connect(alice.signer)
        .grantAccess(recordId, bob.signer.address, mockReEncrypt("s", bob.signer.address));
      await avaDB
        .connect(alice.signer)
        .grantAccess(recordId, carol.signer.address, mockReEncrypt("s", carol.signer.address));

      const viewers = await avaDB.connect(alice.signer).getViewers(recordId);
      expect(viewers).to.have.lengthOf(2);
      expect(viewers).to.include(bob.signer.address);
      expect(viewers).to.include(carol.signer.address);
    });

    it("getViewers reverts for non-owner", async () => {
      await expect(
        avaDB.connect(bob.signer).getViewers(recordId),
      ).to.be.revertedWithCustomError(avaDB, "UnauthorizedAccess");
    });

    it("deleting a record clears viewer access", async () => {
      await avaDB
        .connect(alice.signer)
        .grantAccess(recordId, bob.signer.address, mockReEncrypt("s", bob.signer.address));

      await avaDB.connect(alice.signer).deleteRecord(recordId);

      // hasAccess should now be false since record is gone
      expect(await avaDB.hasAccess(recordId, bob.signer.address)).to.be.false;
    });
  });

  // ── getRecord ─────────────────────────────────────────────────────────────

  describe("getRecord", () => {
    let recordId: string;
    const ownerContent = mockEncrypt("owner-secret");
    const bobContent = () => mockReEncrypt("owner-secret", "bob");

    beforeEach(async () => {
      const tx = await avaDB
        .connect(alice.signer)
        .createRecord({ encryptedContent: ownerContent, schema: "json" });
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((l) => { try { return avaDB.interface.parseLog(l); } catch { return null; } })
        .find((e) => e?.name === "RecordCreated");
      recordId = event!.args.recordId;
    });

    it("owner can read their encrypted content", async () => {
      const [, content] = await avaDB.connect(alice.signer).getRecord(recordId);
      expect(ethers.hexlify(content)).to.equal(ethers.hexlify(ownerContent));
    });

    it("authorized viewer gets their re-encrypted copy", async () => {
      const reEnc = bobContent();
      await avaDB
        .connect(alice.signer)
        .grantAccess(recordId, bob.signer.address, reEnc);

      const [, content] = await avaDB.connect(bob.signer).getRecord(recordId);
      expect(ethers.hexlify(content)).to.equal(ethers.hexlify(reEnc));
    });

    it("unauthorized caller reverts with UnauthorizedAccess", async () => {
      await expect(
        avaDB.connect(carol.signer).getRecord(recordId),
      ).to.be.revertedWithCustomError(avaDB, "UnauthorizedAccess");
    });
  });
});
