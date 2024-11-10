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
	getDecryptedBalance,
	privateBurn,
	privateMint,
	privateTransfer,
} from "./helpers";
import { User } from "./user";

const DECIMALS = 2;

describe("EncryptedERC - Standalone", () => {
	let registrar: Registrar;
	let users: User[];
	let signers: SignerWithAddress[];
	let owner: SignerWithAddress;
	let encryptedERC: EncryptedERC;

	const deployFixture = async () => {
		signers = await ethers.getSigners();
		owner = signers[0];

		const {
			registrationVerifier,
			mintVerifier,
			withdrawVerifier,
			transferVerifier,
		} = await deployVerifiers(owner);
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
			_withdrawVerifier: withdrawVerifier,
			_transferVerifier: transferVerifier,
			_decimals: DECIMALS,
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
			let validParams: {
				proof: string[];
				publicInputs: string[];
			};

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
					const contractPublicKey = await registrar.getUserPublicKey(
						user.signer.address,
					);
					expect(contractPublicKey).to.deep.equal(user.publicKey);

					validParams = { proof, publicInputs };
				}
			});

			it("already registered user can not register again", async () => {
				const alreadyRegisteredUser = users[0];

				await expect(
					registrar
						.connect(alreadyRegisteredUser.signer)
						.register(
							validParams.proof.map(BigInt),
							validParams.publicInputs.map(BigInt) as [bigint, bigint],
						),
				).to.be.revertedWith("UserAlreadyRegistered");
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
			it("should revert is user try to send transfer without an auditor key", async () => {
				await expect(
					encryptedERC.connect(users[0].signer).transfer(
						users[0].signer.address,
						users[1].signer.address,
						Array.from({ length: 8 }, () => 1n),
						Array.from({ length: 32 }, () => 1n),
						Array.from({ length: 7 }, () => 1n),
					),
				).to.be.reverted;
			});

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

			it("should revert if new auditor is not registered", async () => {
				const nonRegisteredAuditor = users[5];

				await expect(
					encryptedERC
						.connect(owner)
						.setAuditorPublicKey(nonRegisteredAuditor.signer.address),
				).to.be.reverted;
			});

			// must write here for pass the AuditorKeyNotSet error
			it("should revert if user try to deposit", async () => {
				await expect(
					encryptedERC.connect(users[0].signer).deposit(
						1n,
						users[0].signer.address,
						Array.from({ length: 7 }, () => 1n),
					),
				).to.be.revertedWithCustomError(encryptedERC, "InvalidOperation");
			});

			it("should revert if user try to withdraw", async () => {
				await expect(
					encryptedERC.connect(users[0].signer).withdraw(
						1000n,
						1n,
						Array.from({ length: 8 }, () => 1n),
						Array.from({ length: 20 }, () => 1n),
						Array.from({ length: 7 }, () => 1n),
					),
				).to.be.revertedWithCustomError(encryptedERC, "InvalidOperation");
			});
		});

		describe("Private Mint", () => {
			const mintAmount = 10000n;
			let validParamsForUser0: {
				proof: string[];
				publicInputs: string[];
			};

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

				validParamsForUser0 = { proof, publicInputs };
			});

			it("after private mint, balance should be updated properly", async () => {
				const receiver = users[0];

				const balance = await encryptedERC.balanceOfStandalone(
					receiver.signer.address,
				);

				const totalBalance = await getDecryptedBalance(
					receiver.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				expect(totalBalance).to.equal(mintAmount);
				userBalance = totalBalance;
			});

			it("only owner can mint", async () => {
				const nonOwner = users[5];

				await expect(
					encryptedERC.connect(nonOwner.signer).privateMint(
						nonOwner.signer.address,
						Array.from({ length: 8 }, () => 1n),
						Array.from({ length: 22 }, () => 1n),
					),
				).to.be.reverted;
			});

			it("if destination user is not registered, mint should revert", async () => {
				const nonRegisteredUser = users[5];

				await expect(
					encryptedERC.connect(owner).privateMint(
						nonRegisteredUser.signer.address,
						Array.from({ length: 8 }, () => 1n),
						Array.from({ length: 22 }, () => 1n),
					),
				).to.be.reverted;
			});

			it("user public key and public key from proof should match, if not revert", async () => {
				const notUser0 = users[4];

				await expect(
					encryptedERC
						.connect(owner)
						.privateMint(
							notUser0.signer.address,
							validParamsForUser0.proof,
							validParamsForUser0.publicInputs,
						),
				).to.be.reverted;
			});

			it("auditor public key and auditor from proof should match, if not revert", async () => {
				const receiver = users[0];

				const _proof = validParamsForUser0.proof;
				const _publicInputs = [...validParamsForUser0.publicInputs];

				// auditor public key indexes are 13 and 14
				// only change [13]
				_publicInputs[13] = "100";
				_publicInputs[14] = validParamsForUser0.publicInputs[14];

				await expect(
					encryptedERC
						.connect(owner)
						.privateMint(receiver.signer.address, _proof, _publicInputs),
				).to.be.reverted;

				// only change [14]
				_publicInputs[13] = validParamsForUser0.publicInputs[13];
				_publicInputs[14] = "100";

				await expect(
					encryptedERC
						.connect(owner)
						.privateMint(receiver.signer.address, _proof, _publicInputs),
				).to.be.reverted;
			});
		});

		describe("Private Burn", () => {
			const burnAmount = 100n;
			let validParams: {
				proof: string[];
				publicInputs: string[];
				userBalancePCT: string[];
			};

			it("should burn properly", async () => {
				const user = users[0];
				const balance = await encryptedERC.balanceOfStandalone(
					user.signer.address,
				);

				const userEncryptedBalance = [...balance.eGCT.c1, ...balance.eGCT.c2];
				const userDecryptedBalance = await getDecryptedBalance(
					user.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				const {
					proof,
					publicInputs,
					senderBalancePCT: userBalancePCT,
				} = await privateBurn(
					user,
					userDecryptedBalance,
					burnAmount,
					userEncryptedBalance,
					auditorPublicKey,
				);

				await encryptedERC
					.connect(user.signer)
					.privateBurn(proof, publicInputs, userBalancePCT);

				validParams = { proof, publicInputs, userBalancePCT };
			});

			it("should revert if proved balance is not valid", async () => {
				const user = users[0];

				await expect(
					encryptedERC
						.connect(user.signer)
						.privateBurn(
							validParams.proof,
							validParams.publicInputs,
							validParams.userBalancePCT,
						),
				).to.be.reverted;
			});

			it("users balance pct and elgamal ciphertext should be updated properly", async () => {
				const user = users[0];
				const balance = await encryptedERC.balanceOfStandalone(
					user.signer.address,
				);

				const totalBalance = await getDecryptedBalance(
					user.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				userBalance = totalBalance;
			});

			it("should revert if user is not registered", async () => {
				const nonRegisteredUser = users[5];

				await expect(
					encryptedERC
						.connect(nonRegisteredUser.signer)
						.privateBurn(
							validParams.proof,
							validParams.publicInputs,
							validParams.userBalancePCT,
						),
				).to.be.reverted;
			});

			it("user public key and public key from proof should match, if not revert", async () => {
				const notUser0 = users[4];

				await expect(
					encryptedERC
						.connect(notUser0.signer)
						.privateBurn(
							validParams.proof,
							validParams.publicInputs,
							validParams.userBalancePCT,
						),
				).to.be.reverted;
			});

			it("auditor public key and auditor from proof should match, if not revert", async () => {
				const user = users[0];

				const _proof = validParams.proof;
				const _publicInputs = [...validParams.publicInputs];

				// auditor public key indexes are 23 and 24
				// only change [23]
				_publicInputs[23] = "100";
				_publicInputs[24] = validParams.publicInputs[24];

				await expect(
					encryptedERC
						.connect(user.signer)
						.privateBurn(_proof, _publicInputs, validParams.userBalancePCT),
				).to.be.reverted;

				// only change [24]
				_publicInputs[23] = validParams.publicInputs[23];
				_publicInputs[24] = "100";

				await expect(
					encryptedERC
						.connect(user.signer)
						.privateBurn(_proof, _publicInputs, validParams.userBalancePCT),
				).to.be.reverted;
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
				senderBalancePCT: string[];
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

				const totalBalance = await getDecryptedBalance(
					userA.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				const amountPCTs = balance.amountPCTs;

				const decryptedAmountPCTs = [];
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(userA.privateKey, pct);
					decryptedAmountPCTs.push(decrypted[0]);
				}

				expect(totalBalance).to.deep.equal(EXPECTED_BALANCE_AFTER_INITIAL_MINT);
				userABalance = totalBalance;

				console.log(
					"UserA Balance After Initial Mint",
					userABalance,
					"has",
					amountPCTs.length,
					`amount pcts in contract before generating burn proof and has ${decryptedAmountPCTs.length} different amount pcts that have`,
					decryptedAmountPCTs,
				);
			});

			it("1. userA creates a burn proof but do not send it to the contract", async () => {
				const userA = users[1];
				const balance = await encryptedERC.balanceOfStandalone(
					userA.signer.address,
				);

				const userEncryptedBalance = [...balance.eGCT.c1, ...balance.eGCT.c2];

				const { proof, publicInputs, senderBalancePCT } = await privateBurn(
					userA,
					userABalance,
					burnAmount,
					userEncryptedBalance,
					auditorPublicKey,
				);

				burnProof = { proof, publicInputs, senderBalancePCT };
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

				const totalBalance = await getDecryptedBalance(
					userA.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				const amountPCTs = balance.amountPCTs;

				const decryptedAmountPCTs = [];
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(userA.privateKey, pct);
					decryptedAmountPCTs.push(decrypted[0]);
				}

				expect(totalBalance).to.deep.equal(EXPECTED_BALANCE_AFTER_MINT);
				userABalance = totalBalance;

				console.log(
					"UserA Balance After Second Mint",
					userABalance,
					"has",
					amountPCTs.length,
					"amount pcts in contract and has",
					decryptedAmountPCTs,
				);
			});

			it("3. userA sends his burn proof", async () => {
				const userA = users[1];

				await encryptedERC
					.connect(userA.signer)
					.privateBurn(
						burnProof.proof,
						burnProof.publicInputs,
						burnProof.senderBalancePCT,
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

				const totalBalance = await getDecryptedBalance(
					userA.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				const decryptedBalancePCT = await decryptPCT(
					userA.privateKey,
					balance.balancePCT,
				);

				const amountPCTs = balance.amountPCTs;
				const decryptedAmountPCTs = [];
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(userA.privateKey, pct);
					decryptedAmountPCTs.push(decrypted[0]);
				}

				console.log("decryptedAmountPCTs", decryptedAmountPCTs);

				expect(totalBalance).to.deep.equal(userABalance);
				userABalance = totalBalance;

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

				const { proof, publicInputs, senderBalancePCT } = await privateBurn(
					userA,
					userABalance,
					burnAmount,
					userEncryptedBalance,
					auditorPublicKey,
				);

				await encryptedERC
					.connect(userA.signer)
					.privateBurn(proof, publicInputs, senderBalancePCT);

				console.log("userA balance before burn", userABalance);
				userABalance = userABalance - burnAmount;
				console.log("userA balance after burn", userABalance);
			});

			it("after that amount pcts should be updated properly", async () => {
				const userA = users[1];

				const balance = await encryptedERC.balanceOfStandalone(
					userA.signer.address,
				);

				const totalBalance = await getDecryptedBalance(
					userA.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				const decryptedBalancePCT = await decryptPCT(
					userA.privateKey,
					balance.balancePCT,
				);

				const amountPCTs = balance.amountPCTs;
				const decryptedAmountPCTs = [];
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(userA.privateKey, pct);
					decryptedAmountPCTs.push(decrypted[0]);
				}

				expect(totalBalance).to.deep.equal(userABalance);
				userABalance = totalBalance;

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

				const { proof, publicInputs, senderBalancePCT } = await privateBurn(
					userA,
					userABalance,
					burnAmount,
					userEncryptedBalance,
					auditorPublicKey,
				);

				await encryptedERC
					.connect(userA.signer)
					.privateBurn(proof, publicInputs, senderBalancePCT);

				console.log("userA balance before burn", userABalance);
				userABalance = userABalance - burnAmount;
				console.log("userA balance after burn", userABalance);
			});

			it("after that amount pcts should be updated properly", async () => {
				const userA = users[1];

				const balance = await encryptedERC.balanceOfStandalone(
					userA.signer.address,
				);

				const totalBalance = await getDecryptedBalance(
					userA.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				const decryptedBalancePCT = await decryptPCT(
					userA.privateKey,
					balance.balancePCT,
				);

				const amountPCTs = balance.amountPCTs;
				const decryptedAmountPCTs = [];
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(userA.privateKey, pct);
					decryptedAmountPCTs.push(decrypted[0]);
				}

				expect(totalBalance).to.deep.equal(userABalance);
				userABalance = totalBalance;

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

		describe("Private Transfer", () => {
			let senderBalance = 0n;
			const transferAmount = 500n;
			let validParams: {
				to: string;
				proof: string[];
				publicInputs: string[];
				senderBalancePCT: string[];
			};

			it("sender needs to calculate the encrypted balance", async () => {
				const sender = users[0];

				const balance = await encryptedERC.balanceOfStandalone(
					sender.signer.address,
				);

				const totalBalance = await getDecryptedBalance(
					sender.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				const decryptedBalance = decryptPoint(
					sender.privateKey,
					balance.eGCT.c1,
					balance.eGCT.c2,
				);

				const expectedPoint = mulPointEscalar(Base8, totalBalance);
				expect(decryptedBalance).to.deep.equal(expectedPoint);

				senderBalance = totalBalance;
				console.log("Before transfer sender balance is", senderBalance);
				console.log("Before transfer receiver balance is", 0n);
			});

			it("should transfer properly", async () => {
				const sender = users[0];
				const receiver = users[4];

				const senderEncryptedBalance = await encryptedERC.balanceOfStandalone(
					sender.signer.address,
				);

				const { proof, publicInputs, senderBalancePCT } = await privateTransfer(
					sender,
					senderBalance,
					receiver.publicKey,
					transferAmount,
					[
						...senderEncryptedBalance.eGCT.c1,
						...senderEncryptedBalance.eGCT.c2,
					],
					auditorPublicKey,
				);

				expect(
					await encryptedERC
						.connect(sender.signer)
						.transfer(
							receiver.signer.address,
							0n,
							proof,
							publicInputs,
							senderBalancePCT,
						),
				).to.be.not.reverted;

				validParams = {
					proof,
					publicInputs,
					senderBalancePCT,
					to: receiver.signer.address,
				};

				console.log("Sender transfers", transferAmount, "to receiver");
			});

			it("should revert if sender provided balance is not valid", async () => {
				const user = users[0];

				await expect(
					encryptedERC
						.connect(user.signer)
						.transfer(
							validParams.to,
							0n,
							validParams.proof,
							validParams.publicInputs,
							validParams.senderBalancePCT,
						),
				).to.be.reverted;
			});

			it("sender balance should be updated properly", async () => {
				const senderExpectedNewBalance = senderBalance - transferAmount;
				const sender = users[0];

				const balance = await encryptedERC.balanceOfStandalone(
					sender.signer.address,
				);

				const totalBalance = await getDecryptedBalance(
					sender.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				const decryptedBalance = decryptPoint(
					sender.privateKey,
					balance.eGCT.c1,
					balance.eGCT.c2,
				);

				expect(totalBalance).to.equal(senderExpectedNewBalance);
				const expectedPoint = mulPointEscalar(Base8, totalBalance);
				expect(decryptedBalance).to.deep.equal(expectedPoint);

				console.log("After transfer sender balance is", senderBalance);
			});

			it("receiver balance should be updated properly", async () => {
				const receiver = users[4];

				const balance = await encryptedERC.balanceOfStandalone(
					receiver.signer.address,
				);

				const totalBalance = await getDecryptedBalance(
					receiver.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				const decryptedBalance = decryptPoint(
					receiver.privateKey,
					balance.eGCT.c1,
					balance.eGCT.c2,
				);

				expect(totalBalance).to.equal(transferAmount); // ?
				const expectedPoint = mulPointEscalar(Base8, totalBalance);
				expect(decryptedBalance).to.deep.equal(expectedPoint);

				console.log("After transfer receiver balance is", totalBalance);
			});

			it("should revert is 'to' is not registered", async () => {
				const nonRegisteredUser = users[5];

				await expect(
					encryptedERC
						.connect(users[0].signer)
						.transfer(
							nonRegisteredUser.signer.address,
							0n,
							validParams.proof,
							validParams.publicInputs,
							validParams.senderBalancePCT,
						),
				).to.be.reverted;
			});

			it("should revert is 'from' is not registered", async () => {
				const nonRegisteredUser = users[5];

				await expect(
					encryptedERC
						.connect(nonRegisteredUser.signer)
						.transfer(
							users[0].signer.address,
							0n,
							validParams.proof,
							validParams.publicInputs,
							validParams.senderBalancePCT,
						),
				).to.be.reverted;
			});

			it("should revert if sender public key and public key from proof do not match ", async () => {
				// fromPublicKey is at index 0 and 1
				// only change [0]
				const _proof = validParams.proof;
				const _publicInputs = [...validParams.publicInputs];

				_publicInputs[0] = "100";
				_publicInputs[1] = validParams.publicInputs[1];

				await expect(
					encryptedERC
						.connect(users[0].signer)
						.transfer(
							validParams.to,
							0n,
							_proof,
							_publicInputs,
							validParams.senderBalancePCT,
						),
				).to.be.reverted;

				// change [1]
				_publicInputs[0] = validParams.publicInputs[0];
				_publicInputs[1] = "100";

				await expect(
					encryptedERC
						.connect(users[0].signer)
						.transfer(
							validParams.to,
							0n,
							_proof,
							_publicInputs,
							validParams.senderBalancePCT,
						),
				).to.be.reverted;
			});

			it("should revert if receiver public key and public key from proof do not match", async () => {
				// toPublicKey is at index 10 and 11
				// only change [10]
				const _proof = validParams.proof;
				const _publicInputs = [...validParams.publicInputs];

				_publicInputs[10] = "100";
				_publicInputs[11] = validParams.publicInputs[11];

				await expect(
					encryptedERC
						.connect(users[0].signer)
						.transfer(
							validParams.to,
							0n,
							_proof,
							_publicInputs,
							validParams.senderBalancePCT,
						),
				).to.be.reverted;

				// only change [11]
				_publicInputs[10] = validParams.publicInputs[10];
				_publicInputs[11] = "100";

				await expect(
					encryptedERC
						.connect(users[0].signer)
						.transfer(
							validParams.to,
							0n,
							_proof,
							_publicInputs,
							validParams.senderBalancePCT,
						),
				).to.be.reverted;
			});

			it("should revert if auditor public key is not match with public key in proof", async () => {
				const receiver = users[0];

				const _proof = validParams.proof;
				const _publicInputs = [...validParams.publicInputs];

				// auditor public key indexes are 23 and 24
				// only change [23]
				_publicInputs[23] = "100";
				_publicInputs[24] = validParams.publicInputs[24];

				await expect(
					encryptedERC
						.connect(owner)
						.transfer(
							validParams.to,
							0n,
							_proof,
							_publicInputs,
							validParams.senderBalancePCT,
						),
				).to.be.reverted;

				// only change [24]
				_publicInputs[23] = validParams.publicInputs[23];
				_publicInputs[24] = "100";

				await expect(
					encryptedERC
						.connect(owner)
						.transfer(
							validParams.to,
							0n,
							_proof,
							_publicInputs,
							validParams.senderBalancePCT,
						),
				).to.be.reverted;
			});
		});
	});
});
