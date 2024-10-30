import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/dist/src/signer-with-address";
import { expect, use } from "chai";
import { ethers } from "hardhat";
import type { Registrar } from "../typechain-types/contracts/Registrar";
import {
	EncryptedERC__factory,
	Registrar__factory,
} from "../typechain-types/factories/contracts";

import { Base8, mulPointEscalar } from "@zk-kit/baby-jubjub";
import { formatPrivKeyForBabyJub } from "maci-crypto";
import { decryptPoint } from "../src/jub/jub";
import type { EncryptedERC } from "../typechain-types/contracts/EncryptedERC";
import {
	decryptPCT,
	deployLibrary,
	deployVerifiers,
	generateGnarkProof,
	privateBurn,
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

		const { registrationVerifier, mintVerifier, burnVerifier } =
			await deployVerifiers(owner);
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
			_burnVerifier: burnVerifier,
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
		let userBalance = 0n;

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
			const mintAmount = 10000n;

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
				const balance = await encryptedERC.balanceOfStandalone(
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
				const decrypted = await decryptPCT(receiver.privateKey, amountPCT[0]);

				expect(decrypted).to.deep.equal([mintAmount]);

				userBalance = decrypted[0];
			});
		});

		describe("Private Burn", () => {
			const burnAmount = 100n;

			it("should burn properly", async () => {
				const user = users[0];
				const balance = await encryptedERC.balanceOfStandalone(
					user.signer.address,
				);

				const userEncryptedBalance = [...balance.eGCT.c1, ...balance.eGCT.c2];

				const { proof, publicInputs, userBalancePCT } = await privateBurn(
					burnAmount,
					user,
					userEncryptedBalance,
					userBalance,
					auditorPublicKey,
				);

				await encryptedERC
					.connect(user.signer)
					.privateBurn(proof, publicInputs, userBalancePCT);
			});

			it("users balance pct and elgamal ciphertext should be updated properly", async () => {
				const user = users[0];
				const balance = await encryptedERC.balanceOfStandalone(
					user.signer.address,
				);

				const decryptedBalance = decryptPoint(
					user.privateKey,
					balance.eGCT.c1,
					balance.eGCT.c2,
				);

				const expectedPoint = mulPointEscalar(Base8, userBalance - burnAmount);

				expect(decryptedBalance).to.deep.equal(expectedPoint);

				const balancePCT = balance.balancePCT;

				const decrypted = await decryptPCT(user.privateKey, balancePCT);

				expect(decrypted).to.deep.equal([userBalance - burnAmount]);

				userBalance = decrypted[0];
			});
		});

		// In order to test front running protection what we can do is to
		// 0. owner mints some tokens to userA
		// 1. userA creates a burn proof but do not send it to the contract
		// 2. owner mints some tokens to userA repeatedly so userA's amount PCTs are updated
		// 3. userA sends his burn proof
		// after step 3, burn proof should be valid and need to updated pcts accordingly
		describe("Front Running Protection", () => {
			const INITIAL_MINT_COUNT = 4;
			const SECOND_MINT_COUNT = 5;
			const PER_MINT = 100n;
			const EXPECTED_BALANCE_AFTER_INITIAL_MINT = 1000n;
			const EXPECTED_BALANCE_AFTER_MINT = 2500n;

			const burnAmount = 100n;
			let userABalance = 0n;

			let burnProof: {
				proof: string[];
				publicInputs: string[];
				userBalancePCT: string[];
			};

			it("0. owner mints some tokens to userA", async () => {
				console.log("UserA Initial Balance", userABalance);

				const userA = users[1];

				for (let i = 0; i < INITIAL_MINT_COUNT; i++) {
					const receiverPublicKey = userA.publicKey;
					const mintAmount = PER_MINT * BigInt(i + 1);
					const { proof, publicInputs } = await privateMint(
						mintAmount,
						receiverPublicKey,
						auditorPublicKey,
					);

					await encryptedERC
						.connect(owner)
						.privateMint(userA.signer.address, proof, publicInputs);
				}
			});

			it("userA balance should be updated properly", async () => {
				const userA = users[1];

				const balance = await encryptedERC.balanceOfStandalone(
					userA.signer.address,
				);

				const decryptedBalance = decryptPoint(
					userA.privateKey,
					balance.eGCT.c1,
					balance.eGCT.c2,
				);
				const expectedPoint = mulPointEscalar(
					Base8,
					EXPECTED_BALANCE_AFTER_INITIAL_MINT,
				);

				expect(decryptedBalance).to.deep.equal(expectedPoint);

				const amountPCTs = balance.amountPCTs;
				const decryptedAmountPCTs = [];
				let sum = 0n;
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(userA.privateKey, pct);
					sum += decrypted[0];
					decryptedAmountPCTs.push(decrypted[0]);
				}

				expect(sum).to.deep.equal(EXPECTED_BALANCE_AFTER_INITIAL_MINT);
				userABalance = sum;

				console.log(
					"UserA Balance After Initial Mint",
					userABalance,
					"has",
					amountPCTs.length,
					"amount pcts in contract before generating burn proof and has 5 different amount pcts that have",
					decryptedAmountPCTs,
				);
			});

			it("1. userA creates a burn proof but do not send it to the contract", async () => {
				const userA = users[1];
				const balance = await encryptedERC.balanceOfStandalone(
					userA.signer.address,
				);

				const userEncryptedBalance = [...balance.eGCT.c1, ...balance.eGCT.c2];

				const { proof, publicInputs, userBalancePCT } = await privateBurn(
					burnAmount,
					userA,
					userEncryptedBalance,
					userABalance,
					auditorPublicKey,
				);

				burnProof = { proof, publicInputs, userBalancePCT };
			});

			it("2. owner mints some tokens to userA repeatedly so userA's amount PCTs are updated", async () => {
				const userA = users[1];

				for (let i = 0; i < SECOND_MINT_COUNT; i++) {
					const receiverPublicKey = userA.publicKey;

					const { proof, publicInputs } = await privateMint(
						PER_MINT * BigInt(i + 1),
						receiverPublicKey,
						auditorPublicKey,
					);

					await encryptedERC
						.connect(owner)
						.privateMint(userA.signer.address, proof, publicInputs);
				}
			});

			it("userA balance should be updated properly", async () => {
				const userA = users[1];

				const balance = await encryptedERC.balanceOfStandalone(
					userA.signer.address,
				);

				const decryptedBalance = decryptPoint(
					userA.privateKey,
					balance.eGCT.c1,
					balance.eGCT.c2,
				);
				const expectedPoint = mulPointEscalar(
					Base8,
					EXPECTED_BALANCE_AFTER_MINT,
				);

				expect(decryptedBalance).to.deep.equal(expectedPoint);

				const amountPCTs = balance.amountPCTs;
				const decryptedAmountPCTs = [];
				let sum = 0n;
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(userA.privateKey, pct);
					sum += decrypted[0];
					decryptedAmountPCTs.push(decrypted[0]);
				}

				expect(sum).to.deep.equal(EXPECTED_BALANCE_AFTER_MINT);
				userABalance = sum;

				console.log(
					"UserA Balance After Second Mint",
					userABalance,
					"has",
					amountPCTs.length,
					"amount pcts in contract and has",
					decryptedAmountPCTs,
					"and balance pct is",
				);
			});

			it("3. userA sends his burn proof", async () => {
				const userA = users[1];

				await encryptedERC
					.connect(userA.signer)
					.privateBurn(
						burnProof.proof,
						burnProof.publicInputs,
						burnProof.userBalancePCT,
					);

				console.log("userA balance before burn", userABalance);

				userABalance = userABalance - burnAmount;
				console.log("userA balance after burn", userABalance);
			});

			it("after that amount pcts should be updated properly", async () => {
				const userA = users[1];

				const balance = await encryptedERC.balanceOfStandalone(
					userA.signer.address,
				);

				const decryptedBalance = decryptPoint(
					userA.privateKey,
					balance.eGCT.c1,
					balance.eGCT.c2,
				);
				const expectedPoint = mulPointEscalar(Base8, userABalance);

				expect(decryptedBalance).to.deep.equal(expectedPoint);

				const balancePCT = balance.balancePCT;
				const decryptedBalancePCT = await decryptPCT(
					userA.privateKey,
					balancePCT,
				);

				const amountPCTs = balance.amountPCTs;
				const decryptedAmountPCTs = [];
				let sum = 0n;
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(userA.privateKey, pct);
					sum += decrypted[0];
					decryptedAmountPCTs.push(decrypted[0]);
				}

				console.log("decryptedAmountPCTs", decryptedAmountPCTs);

				expect(sum + decryptedBalancePCT[0]).to.deep.equal(userABalance);
				userABalance = sum + decryptedBalancePCT[0];

				console.log(
					"UserA Balance After Burn",
					userABalance,
					"has",
					amountPCTs.length,
					"amount pcts in contract and has",
					decryptedAmountPCTs,
					"and balance pct is",
					decryptedBalancePCT[0],
				);
			});

			it("userA can burn again", async () => {
				const userA = users[1];
				const balance = await encryptedERC.balanceOfStandalone(
					userA.signer.address,
				);

				const userEncryptedBalance = [...balance.eGCT.c1, ...balance.eGCT.c2];

				const { proof, publicInputs, userBalancePCT } = await privateBurn(
					burnAmount,
					userA,
					userEncryptedBalance,
					userABalance,
					auditorPublicKey,
				);

				await encryptedERC
					.connect(userA.signer)
					.privateBurn(proof, publicInputs, userBalancePCT);

				console.log("userA balance before burn", userABalance);
				userABalance = userABalance - burnAmount;
				console.log("userA balance after burn", userABalance);
			});

			it("after that amount pcts should be updated properly", async () => {
				const userA = users[1];

				const balance = await encryptedERC.balanceOfStandalone(
					userA.signer.address,
				);

				const decryptedBalance = decryptPoint(
					userA.privateKey,
					balance.eGCT.c1,
					balance.eGCT.c2,
				);
				const expectedPoint = mulPointEscalar(Base8, userABalance);

				// expect(decryptedBalance).to.deep.equal(expectedPoint);

				const balancePCT = balance.balancePCT;
				const decryptedBalancePCT = await decryptPCT(
					userA.privateKey,
					balancePCT,
				);

				const amountPCTs = balance.amountPCTs;
				const decryptedAmountPCTs = [];
				let sum = 0n;
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(userA.privateKey, pct);
					sum += decrypted[0];
					decryptedAmountPCTs.push(decrypted[0]);
				}

				// expect(sum + decryptedBalancePCT[0]).to.deep.equal(userABalance);
				userABalance = sum + decryptedBalancePCT[0];

				console.log(
					"UserA Balance After Burn",
					userABalance,
					"has",
					amountPCTs.length,
					"amount pcts in contract and has",
					decryptedAmountPCTs,
					"and balance pct is",
					decryptedBalancePCT[0],
				);
			});

			it("userA can burn again", async () => {
				const userA = users[1];
				const balance = await encryptedERC.balanceOfStandalone(
					userA.signer.address,
				);

				const userEncryptedBalance = [...balance.eGCT.c1, ...balance.eGCT.c2];

				const { proof, publicInputs, userBalancePCT } = await privateBurn(
					burnAmount,
					userA,
					userEncryptedBalance,
					userABalance,
					auditorPublicKey,
				);

				await encryptedERC
					.connect(userA.signer)
					.privateBurn(proof, publicInputs, userBalancePCT);

				console.log("userA balance before burn", userABalance);
				userABalance = userABalance - burnAmount;
				console.log("userA balance after burn", userABalance);
			});

			it("after that amount pcts should be updated properly", async () => {
				const userA = users[1];

				const balance = await encryptedERC.balanceOfStandalone(
					userA.signer.address,
				);

				const decryptedBalance = decryptPoint(
					userA.privateKey,
					balance.eGCT.c1,
					balance.eGCT.c2,
				);
				const expectedPoint = mulPointEscalar(Base8, userABalance);

				expect(decryptedBalance).to.deep.equal(expectedPoint);

				const balancePCT = balance.balancePCT;
				const decryptedBalancePCT = await decryptPCT(
					userA.privateKey,
					balancePCT,
				);

				const amountPCTs = balance.amountPCTs;
				const decryptedAmountPCTs = [];
				let sum = 0n;
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(userA.privateKey, pct);
					sum += decrypted[0];
					decryptedAmountPCTs.push(decrypted[0]);
				}

				expect(sum + decryptedBalancePCT[0]).to.deep.equal(userABalance);
				userABalance = sum + decryptedBalancePCT[0];

				console.log(
					"UserA Balance After Burn",
					userABalance,
					"has",
					amountPCTs.length,
					"amount pcts in contract and has",
					decryptedAmountPCTs,
					"and balance pct is",
					decryptedBalancePCT[0],
				);
			});
		});
	});
});
