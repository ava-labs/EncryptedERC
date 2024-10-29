import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import type { Registrar } from "../typechain-types/contracts/Registrar";
import {
	EncryptedERC__factory,
	Registrar__factory,
} from "../typechain-types/factories/contracts";

import { Base8, mulPointEscalar } from "@zk-kit/baby-jubjub";
import { formatPrivKeyForBabyJub } from "maci-crypto";
import { decryptPoint, processPoseidonDecryption } from "../src/jub/jub";
import type { EncryptedERC } from "../typechain-types/contracts/EncryptedERC";
import {
	deployLibrary,
	deployVerifiers,
	generateGnarkProof,
	privateMint,
} from "./helpers";
import { User } from "./user";

describe("EncryptedERC", () => {
	let registrar: Registrar;
	let users: User[];
	let signers: SignerWithAddress[];
	let owner: SignerWithAddress;
	let encryptedERC: EncryptedERC;

	const deployFixture = async () => {
		signers = await ethers.getSigners();
		owner = signers[0];

		const { registrationVerifier, mintVerifier } = await deployVerifiers(owner);
		const babyJubJub = await deployLibrary(owner);

		const registrarFactory = new Registrar__factory(owner);
		const registrar_ = await registrarFactory
			.connect(owner)
			.deploy(registrationVerifier);

		await registrar_.waitForDeployment();

		const encryptedERCFactory = new EncryptedERC__factory({
			"contracts/libraries/BabyJubJub.sol:BabyJubJub": babyJubJub,
		});
		const encryptedERC_ = await encryptedERCFactory.connect(owner).deploy({
			_registrar: registrar_.target,
			_isConverter: false,
			_name: "Test",
			_symbol: "TEST",
			_mintVerifier: mintVerifier,
		});

		await encryptedERC_.waitForDeployment();

		registrar = registrar_;
		encryptedERC = encryptedERC_;
		users = signers.map((signer) => new User(signer));
	};

	before(async () => await deployFixture());

	describe("Registrar", () => {
		it("should deploy registrar properly", async () => {
			expect(registrar.target).to.not.be.null;
			expect(registrar).to.not.be.null;
		});

		it("should initialize properly", async () => {
			const burnUserAddress = await registrar.BURN_USER();
			const burnUserPublicKey = await registrar.userPublicKeys(burnUserAddress);
			expect(burnUserPublicKey).to.deep.equal([0n, 1n]);
		});

		describe("Registration", () => {
			it("users should be able to register properly", async () => {
				// in register circuit we have 3 inputs
				// private inputs = [senderPrivKey]
				// public inputs = [senderPubKey[0], senderPubKey[1]]
				for (const user of users.slice(0, 5)) {
					const privateInputs = [
						formatPrivKeyForBabyJub(user.privateKey).toString(),
					];
					const publicInputs = user.publicKey.map(String);
					const input = {
						privateInputs,
						publicInputs,
					};

					const proof = await generateGnarkProof(
						"REGISTER",
						JSON.stringify(input),
					);

					const tx = await registrar
						.connect(user.signer)
						.register(
							proof.map(BigInt),
							publicInputs.map(BigInt) as [bigint, bigint],
						);
					await tx.wait();

					// check if the user is registered
					expect(await registrar.isUserRegistered(user.signer.address)).to.be
						.true;

					// and the public key is set
					const publicKey = await registrar.getUserPublicKey(
						user.signer.address,
					);

					expect(publicKey).to.deep.equal(user.publicKey);
				}
			});
		});
	});

	describe("EncryptedERC", () => {
		let auditorPublicKey: [bigint, bigint];

		it("should initialize properly", async () => {
			expect(encryptedERC.target).to.not.be.null;
			expect(encryptedERC).to.not.be.null;

			// since eerc is standalone name and symbol should be set
			expect(await encryptedERC.name()).to.equal("Test");
			expect(await encryptedERC.symbol()).to.equal("TEST");

			// auditor key should not be set
			expect(await encryptedERC.isAuditorKeySet()).to.be.false;
		});

		it("should revert if auditor key is not set", async () => {
			await expect(
				encryptedERC.connect(users[0].signer).privateMint(
					users[0].signer.address,
					Array.from({ length: 8 }, () => 1n),
					Array.from({ length: 22 }, () => 1n),
				),
			).to.be.reverted;
		});

		describe("Auditor Key Set", () => {
			it("only owner can set auditor key", async () => {
				await expect(
					encryptedERC
						.connect(users[4].signer)
						.setAuditorPublicKey(users[0].signer.address),
				).to.be.reverted;
			});

			it("owner can set auditor key", async () => {
				const tx = await encryptedERC
					.connect(owner)
					.setAuditorPublicKey(owner.address);
				await tx.wait();

				expect(await encryptedERC.isAuditorKeySet()).to.be.true;
			});

			it("auditor and auditor key should be set", async () => {
				const auditor = await encryptedERC.auditor();
				const auditorKey = await encryptedERC.auditorPublicKey();

				expect(auditor).to.equal(users[0].signer.address);
				expect(auditorKey).to.deep.equal([
					users[0].publicKey[0],
					users[0].publicKey[1],
				]);

				auditorPublicKey = [users[0].publicKey[0], users[0].publicKey[1]];
			});
		});

		describe("Private Mint", () => {
			const mintAmount = 1000n;

			it("after auditor key is set, only owner should be able to mint", async () => {
				const receiver = users[0];
				const receiverPublicKey = receiver.publicKey;

				const { proof, publicInputs } = await privateMint(
					mintAmount,
					receiverPublicKey,
					auditorPublicKey,
				);

				await encryptedERC
					.connect(owner)
					.privateMint(receiver.signer.address, proof, publicInputs);
			});

			it("after private mint, balance should be updated properly", async () => {
				const receiver = users[0];
				const balance = await encryptedERC.balanceOfForStandalone(
					receiver.signer.address,
				);

				const decryptedBalance = decryptPoint(
					receiver.privateKey,
					balance.eGCT.c1,
					balance.eGCT.c2,
				);
				const expectedPoint = mulPointEscalar(Base8, mintAmount);

				expect(decryptedBalance).to.deep.equal(expectedPoint);

				// check if the amount pct is set properly
				const amountPCT = balance.amountPCTs[0];
				const ciphertext = amountPCT.slice(0, 4);
				const authKey = amountPCT.slice(4, 6);
				const nonce = amountPCT[6];

				const decrypted = processPoseidonDecryption(
					ciphertext,
					authKey,
					nonce,
					receiver.privateKey,
					1,
				);

				expect(decrypted).to.deep.equal([mintAmount]);
			});
		});
	});
});
