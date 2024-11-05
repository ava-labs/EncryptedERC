import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import type { Registrar } from "../typechain-types/contracts/Registrar";
import {
	EncryptedERC__factory,
	Registrar__factory,
	SimpleERC20__factory,
} from "../typechain-types/factories/contracts";

import { formatPrivKeyForBabyJub } from "maci-crypto";
import { decryptPoint, processPoseidonEncryption } from "../src/jub/jub";
import type { EncryptedERC } from "../typechain-types/contracts/EncryptedERC";
import type { SimpleERC20 } from "../typechain-types/contracts/SimpleERC20";
import {
	decryptPCT,
	deployLibrary,
	deployVerifiers,
	generateGnarkProof,
	getDecryptedBalance,
	privateTransfer,
} from "./helpers";
import { User } from "./user";

describe("EncryptedERC - Converter", () => {
	let registrar: Registrar;
	let users: User[];
	let signers: SignerWithAddress[];
	let owner: SignerWithAddress;
	let encryptedERC: EncryptedERC;
	let erc20: SimpleERC20;

	const deployFixture = async () => {
		signers = await ethers.getSigners();
		owner = signers[0];

		const {
			registrationVerifier,
			mintVerifier,
			burnVerifier,
			transferVerifier,
		} = await deployVerifiers(owner);
		const babyJubJub = await deployLibrary(owner);

		const simpleERC20Factory = new SimpleERC20__factory(owner);
		const simpleERC20_ = await simpleERC20Factory
			.connect(owner)
			.deploy("Test", "TEST");
		await simpleERC20_.waitForDeployment();
		erc20 = simpleERC20_;

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
			_isConverter: true,
			_name: "Test",
			_symbol: "TEST",
			_mintVerifier: mintVerifier,
			_burnVerifier: burnVerifier,
			_transferVerifier: transferVerifier,
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

			// since eerc is standalone name and symbol should not be set
			expect(await encryptedERC.name()).to.equal("");
			expect(await encryptedERC.symbol()).to.equal("");

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

		it("should revert if user try to private mint", async () => {
			await expect(
				encryptedERC.connect(users[0].signer).privateMint(
					users[0].signer.address,
					Array.from({ length: 8 }, () => 1n),
					Array.from({ length: 22 }, () => 1n),
				),
			).to.be.reverted;
		});

		describe("Auditor Key Set", () => {
			it("can not deposit if auditor key is not set", async () => {
				await expect(
					encryptedERC.connect(users[0].signer).deposit(
						1n,
						erc20.target,
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
		});

		describe("Depositing Tokens", () => {
			const mintAmount = 1000000000000000000000000n;
			let userEncryptedBalance = 0n;

			it("should initialize user balance to 0", async () => {
				const ownerUser = users[0];
				const balance = await encryptedERC.balanceOfStandalone(
					ownerUser.signer.address,
				);

				const decryptedBalance = decryptPoint(
					ownerUser.privateKey,
					balance.eGCT.c1,
					balance.eGCT.c2,
				);

				expect(decryptedBalance).to.deep.equal([0n, 0n]);

				let sum = 0n;
				// check if the amount pct is set properly
				if (balance.amountPCTs.length > 0) {
					const amountPCT = balance.amountPCTs[0];
					const decrypted = await decryptPCT(
						ownerUser.privateKey,
						amountPCT[0],
					);
					expect(decrypted).to.deep.equal([0n]);
					sum = decrypted[0];
				}

				userEncryptedBalance = sum;
			});

			it("mint some tokens to the owner", async () => {
				const tx = await erc20.connect(owner).mint(owner.address, mintAmount);
				await tx.wait();

				const balance = await erc20.balanceOf(owner.address);
				expect(balance).to.equal(mintAmount);
			});

			it("should deposit tokens to EncryptedERC and return the dust properly and mint the proper balance", async () => {
				const ownerUser = users[0];

				const cases = [
					{
						convertedAmount: 100_500_000n, // Represents 100.500000 in 6 decimals
						dust: 0n,
						encryptedValue: 10050n, // 100.50 in 2 decimals
					},
					{
						convertedAmount: 100_000_000n, // Represents 100.000000 in 6 decimals
						dust: 0n,
						encryptedValue: 10000n, // 100.00 in 2 decimals
					},
					{
						convertedAmount: 100_001n, // Represents 0.100001 in 6 decimals
						dust: 1n,
						encryptedValue: 10n, // 0.10 in 2 decimals
					},
					{
						convertedAmount: 100_001_001n, // Represents 100.001001 in 6 decimals
						dust: 1_001n,
						encryptedValue: 10000n, // 100.00 in 2 decimals
					},
					{
						convertedAmount: 100_000n, // Represents 0.100000 in 6 decimals
						dust: 0n,
						encryptedValue: 10n, // 0.10 in 2 decimals
					},
				];

				for (const testCase of cases) {
					// approve the deposit
					await erc20
						.connect(owner)
						.approve(encryptedERC.target, testCase.convertedAmount);

					const erc20BalanceBefore = await erc20.balanceOf(owner.address);

					// need to create a new pct for the balance pct
					const { ciphertext, nonce, encRandom, authKey } =
						processPoseidonEncryption(
							[userEncryptedBalance + testCase.encryptedValue],
							ownerUser.publicKey,
						);

					await encryptedERC
						.connect(owner)
						.deposit(testCase.convertedAmount, erc20.target, [
							...ciphertext,
							...authKey,
							nonce,
						]);

					const erc20BalanceAfter = await erc20.balanceOf(owner.address);
					expect(erc20BalanceAfter).to.equal(
						erc20BalanceBefore - testCase.convertedAmount + testCase.dust,
					);

					const balance = await encryptedERC.balanceOf(
						ownerUser.signer.address,
						1,
					);

					const totalBalance = await getDecryptedBalance(
						ownerUser.privateKey,
						balance.amountPCTs,
						balance.balancePCT,
						balance.eGCT,
					);

					expect(totalBalance).to.equal(
						userEncryptedBalance + testCase.encryptedValue,
					);
					userEncryptedBalance = totalBalance;
				}
			});

			// this test should be here because it needs the encryptedERC to be initialized and deposit to be done
			it("get tokens should return the proper addresses", async () => {
				const contractTokens = await encryptedERC.getTokens();
				expect(contractTokens).to.deep.equal([erc20.target]);
			});

			it("should revert if user is not registered", async () => {
				await expect(
					encryptedERC.connect(users[5].signer).deposit(
						1n,
						users[0].signer.address,
						Array.from({ length: 7 }, () => 1n),
					),
				).to.be.reverted;
			});
		});

		describe("Transferring Tokens", () => {
			let senderBalance = 30070n; // hardcoded for now from the deposit test
			const transferAmount = 1000n;

			it("should transfer tokens properly", async () => {
				const sender = users[0];
				const receiver = users[1];

				const balance = await encryptedERC.balanceOf(sender.signer.address, 1);
				const senderEncryptedBalance = [...balance.eGCT.c1, ...balance.eGCT.c2];

				const { proof, publicInputs, senderBalancePCT } = await privateTransfer(
					sender,
					senderBalance,
					receiver,
					transferAmount,
					senderEncryptedBalance,
					auditorPublicKey,
				);

				expect(
					await encryptedERC
						.connect(sender.signer)
						.transfer(
							receiver.signer.address,
							1n,
							proof,
							publicInputs,
							senderBalancePCT,
						),
				).to.be.not.reverted;

				senderBalance = senderBalance - transferAmount;
			});

			it("sender balance should be updated properly", async () => {
				const sender = users[0];

				const balance = await encryptedERC.balanceOf(sender.signer.address, 1);

				const totalBalance = await getDecryptedBalance(
					sender.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				expect(totalBalance).to.equal(senderBalance);
			});

			it("receiver balance should be updated properly", async () => {
				const receiver = users[1];

				const balance = await encryptedERC.balanceOf(
					receiver.signer.address,
					1,
				);

				const totalBalance = await getDecryptedBalance(
					receiver.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				expect(totalBalance).to.equal(transferAmount);
			});
		});
	});
});
