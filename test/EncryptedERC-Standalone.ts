import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Base8, mulPointEscalar } from "@zk-kit/baby-jubjub";
import { expect } from "chai";
import { ethers, zkit } from "hardhat";
import type {
	CalldataMintCircuitGroth16,
	CalldataRegistrationCircuitGroth16,
	RegistrationCircuit,
} from "../generated-types/zkit";
import { BN254_SCALAR_FIELD } from "../src/constants";
import { decryptPoint } from "../src/jub/jub";
import type {
	EncryptedERC,
	MintProofStruct,
	TransferProofStruct,
} from "../typechain-types/contracts/EncryptedERC";
import type {
	RegisterProofStruct,
	Registrar,
} from "../typechain-types/contracts/Registrar";
import {
	EncryptedERC__factory,
	Registrar__factory,
} from "../typechain-types/factories/contracts";
import {
	decryptPCT,
	deployLibrary,
	deployVerifiers,
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
			burnVerifier,
		} = await deployVerifiers(owner, false);

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
			registrar: registrar_.target,
			isConverter: false,
			name: "Test",
			symbol: "TEST",
			mintVerifier,
			withdrawVerifier,
			transferVerifier,
			burnVerifier,
			decimals: DECIMALS,
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

		describe("Registration", () => {
			let registrationCircuit: RegistrationCircuit;
			let validProof: CalldataRegistrationCircuitGroth16;
			const mockRegisterProof = {
				proofPoints: {
					a: ["0x0", "0x0"],
					b: [
						["0x0", "0x0"],
						["0x0", "0x0"],
					],
					c: ["0x0", "0x0"],
				},
				publicSignals: Array.from({ length: 5 }, () => 1n), // index 3 is chain id
			};

			before(async () => {
				const circuit = await zkit.getCircuit("RegistrationCircuit");
				registrationCircuit = circuit as unknown as RegistrationCircuit;
			});

			it("should revert if chain id is not matching", async () => {
				const sender = users[0];
				const publicSignals = [...mockRegisterProof.publicSignals];

				// index 2 is for account address
				publicSignals[2] = BigInt(sender.signer.address);
				// index 3 is for chain id
				publicSignals[3] = 100n;

				await expect(
					registrar.connect(sender.signer).register({
						proofPoints: mockRegisterProof.proofPoints,
						publicSignals: publicSignals,
					} as RegisterProofStruct),
				).to.be.revertedWithCustomError(registrar, "InvalidChainId");
			});

			it("should revert if registration hash is not valid", async () => {
				const sender = users[0];
				const publicSignals = [...mockRegisterProof.publicSignals];
				const chainId = await ethers.provider
					.getNetwork()
					.then((network) => network.chainId);

				// index 2 is for account address
				publicSignals[2] = BigInt(sender.signer.address);
				// index 3 is for chain id
				publicSignals[3] = chainId;
				// index 4 is for registration hash
				publicSignals[4] = BN254_SCALAR_FIELD + 1n;

				await expect(
					registrar.connect(sender.signer).register({
						proofPoints: mockRegisterProof.proofPoints,
						publicSignals: publicSignals,
					} as RegisterProofStruct),
				).to.be.revertedWithCustomError(registrar, "InvalidRegistrationHash");
			});

			it("users should be able to register properly", async () => {
				const chainId = await ethers.provider
					.getNetwork()
					.then((network) => network.chainId);

				for (const user of users.slice(0, 5)) {
					const registrationHash = user.genRegistrationHash(chainId);

					const input = {
						SenderPrivateKey: user.formattedPrivateKey,
						SenderPublicKey: user.publicKey,
						SenderAddress: BigInt(user.signer.address),
						ChainID: chainId,
						RegistrationHash: registrationHash,
					};

					const proof = await registrationCircuit.generateProof(input);
					const calldata = await registrationCircuit.generateCalldata(proof);
					// verify the proof
					await expect(registrationCircuit).to.verifyProof(proof);

					const tx = await registrar.connect(user.signer).register({
						proofPoints: calldata.proofPoints,
						publicSignals: calldata.publicSignals,
					});
					await tx.wait();

					expect(await registrar.isUserRegistered(user.signer.address)).to.be
						.true;
					// and the public key is set
					const contractPublicKey = await registrar.getUserPublicKey(
						user.signer.address,
					);
					expect(contractPublicKey).to.deep.equal(user.publicKey);

					// and the registration hash is set
					const contractRegistrationHash = await registrar.isRegistered(
						input.RegistrationHash,
					);
					expect(contractRegistrationHash).to.be.true;

					validProof = calldata;
				}
			});

			it("already registered user can not register again", async () => {
				const alreadyRegisteredUser = users[4];

				await expect(
					registrar.connect(alreadyRegisteredUser.signer).register({
						proofPoints: validProof.proofPoints,
						publicSignals: validProof.publicSignals,
					}),
				).to.be.revertedWithCustomError(registrar, "UserAlreadyRegistered");
			});

			it("should revert if sender is not matching", async () => {
				// valid proof is for user[4] but we are using user[0]
				const sender = users[0];

				await expect(
					registrar.connect(sender.signer).register({
						proofPoints: validProof.proofPoints,
						publicSignals: validProof.publicSignals,
					} as RegisterProofStruct),
				).to.be.revertedWithCustomError(registrar, "InvalidSender");
			});

			it("should revert if proof is not valid", async () => {
				const user = new User(signers[5]);
				const chainId = await ethers.provider
					.getNetwork()
					.then((network) => network.chainId);

				const registrationHash = user.genRegistrationHash(chainId);

				const input = {
					SenderPrivateKey: user.formattedPrivateKey,
					SenderPublicKey: user.publicKey,
					SenderAddress: BigInt(user.signer.address),
					ChainID: chainId,
					RegistrationHash: registrationHash,
				};

				const proof = await registrationCircuit.generateProof(input);
				const calldata = await registrationCircuit.generateCalldata(proof);

				await expect(
					registrar.connect(user.signer).register({
						proofPoints: mockRegisterProof.proofPoints,
						publicSignals: calldata.publicSignals,
					} as RegisterProofStruct),
				).to.be.revertedWithCustomError(registrar, "InvalidProof");
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

		describe("Auditor Key Set", () => {
			it("should revert is user try to send transfer without an auditor key", async () => {
				const mockTransferProof = {
					proofPoints: {
						a: ["0x0", "0x0"],
						b: [
							["0x0", "0x0"],
							["0x0", "0x0"],
						],
						c: ["0x0", "0x0"],
					},
					publicSignals: Array.from({ length: 32 }, () => 1n),
				};

				await expect(
					encryptedERC.connect(users[0].signer).transfer(
						users[0].signer.address,
						0n,
						mockTransferProof as TransferProofStruct,
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
		});

		describe("Private Mint", () => {
			const mockMintProof = {
				proofPoints: {
					a: ["0x0", "0x0"],
					b: [
						["0x0", "0x0"],
						["0x0", "0x0"],
					],
					c: ["0x0", "0x0"],
				},
				publicSignals: Array.from({ length: 24 }, () => 1n),
			};
			const mintAmount = 10000n;
			let userBalance = 0n;
			let validProof: CalldataMintCircuitGroth16;

			it("after auditor key is set, only owner should be able to mint", async () => {
				const receiver = users[1];
				const receiverPublicKey = receiver.publicKey;

				const calldata = await privateMint(
					mintAmount,
					receiverPublicKey,
					auditorPublicKey,
				);

				await encryptedERC.connect(owner).privateMint(receiver.signer.address, {
					proofPoints: calldata.proofPoints,
					publicSignals: calldata.publicSignals,
				});

				validProof = calldata;
			});

			it("should revert if user try to call private mint with the same proof (nullifier)", async () => {
				await expect(
					encryptedERC
						.connect(users[0].signer)
						.privateMint(users[0].signer.address, validProof),
				).to.be.revertedWithCustomError(encryptedERC, "InvalidProof");
			});

			it("after private mint, balance should be updated properly", async () => {
				const receiver = users[1];

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
					encryptedERC
						.connect(nonOwner.signer)
						.privateMint(nonOwner.signer.address, {
							proofPoints: mockMintProof.proofPoints,
							publicSignals: mockMintProof.publicSignals,
						} as MintProofStruct),
				).to.be.reverted;
			});

			it("if receiver user is not registered, mint should revert", async () => {
				const nonRegisteredUser = users[5];

				const network = await ethers.provider.getNetwork();

				const input = Array.from({ length: 24 }, () => 0n);

				input[0] = BigInt(network.chainId);

				await expect(
					encryptedERC
						.connect(owner)
						.privateMint(nonRegisteredUser.signer.address, {
							proofPoints: mockMintProof.proofPoints,
							publicSignals: input,
						} as MintProofStruct),
				).to.be.revertedWithCustomError(encryptedERC, "UserNotRegistered");
			});

			it("if chain id is not correct, mint should revert", async () => {
				const user = users[0];

				await expect(
					encryptedERC.connect(owner).privateMint(user.signer.address, {
						proofPoints: mockMintProof.proofPoints,
						publicSignals: mockMintProof.publicSignals,
					} as MintProofStruct),
				).to.be.revertedWithCustomError(encryptedERC, "InvalidChainId");
			});

			it("mint nullifier should be unique", async () => {
				const user = users[0];

				await expect(
					encryptedERC.connect(owner).privateMint(user.signer.address, {
						proofPoints: validProof.proofPoints,
						publicSignals: validProof.publicSignals,
					} as MintProofStruct),
				).to.be.revertedWithCustomError(encryptedERC, "InvalidProof");
			});

			it("should revert if nullifier is greater than or equal to BabyJubJub.Q", async () => {
				const user = users[1];

				const inputs = [...validProof.publicSignals];

				inputs[1] = String(BN254_SCALAR_FIELD + 1n);

				await expect(
					encryptedERC.connect(owner).privateMint(user.signer.address, {
						proofPoints: validProof.proofPoints,
						publicSignals: inputs,
					}),
				).to.be.revertedWithCustomError(encryptedERC, "InvalidNullifier");
			});

			it("user public key X and public key X from proof should match, if not revert", async () => {
				const notUser0 = users[4];

				await expect(
					encryptedERC.connect(owner).privateMint(notUser0.signer.address, {
						proofPoints: validProof.proofPoints,
						publicSignals: validProof.publicSignals,
					}),
				).to.be.reverted;
			});

			it("auditor public key with proof should match, if not revert", async () => {
				const receiver = users[0];

				const _publicInputs = [...validProof.publicSignals];

				// auditor public key indexes are 15 and 16
				// only change [15]
				_publicInputs[15] = "100";
				// _publicInputs[16] = validProof.publicSignals[14];

				await expect(
					encryptedERC.connect(owner).privateMint(receiver.signer.address, {
						proofPoints: validProof.proofPoints,
						publicSignals: _publicInputs,
					}),
				).to.be.revertedWithCustomError(encryptedERC, "InvalidProof");

				// only change [16]
				_publicInputs[15] = validProof.publicSignals[15];
				_publicInputs[16] = "100";

				await expect(
					encryptedERC.connect(owner).privateMint(receiver.signer.address, {
						proofPoints: validProof.proofPoints,
						publicSignals: _publicInputs,
					}),
				).to.be.revertedWithCustomError(encryptedERC, "InvalidProof");
			});
		});

		describe("Private Burn", () => {
			const burnAmount = 100n;
			let userBalance = 0n;
			let validProof: TransferProofStruct;

			it("should burn properly", async () => {
				const user = users[1];
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
				// set as initial balance
				userBalance = userDecryptedBalance;

				const { proof, userBalancePCT } = await privateBurn(
					user,
					userDecryptedBalance,
					burnAmount,
					userEncryptedBalance,
					auditorPublicKey,
				);

				const tx = await encryptedERC.connect(user.signer).privateBurn(
					{
						proofPoints: proof.proofPoints,
						publicSignals: proof.publicSignals,
					},
					userBalancePCT,
				);
				await tx.wait();

				validProof = proof;
			});

			it("users balance pct and elgamal ciphertext should be updated properly", async () => {
				const user = users[1];
				const balance = await encryptedERC.balanceOfStandalone(
					user.signer.address,
				);

				const totalBalance = await getDecryptedBalance(
					user.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				expect(totalBalance).to.equal(userBalance - burnAmount);
			});

			it("should revert if proved balance is not valid", async () => {
				const user = users[0];

				await expect(
					encryptedERC.connect(user.signer).privateBurn(
						validProof,
						Array.from({ length: 7 }, () => 1n),
					),
				).to.be.reverted;
			});

			it("should revert if user is not registered", async () => {
				const nonRegisteredUser = users[5];

				await expect(
					encryptedERC.connect(nonRegisteredUser.signer).privateBurn(
						validProof,
						Array.from({ length: 7 }, () => 1n),
					),
				).to.be.reverted;
			});

			it("user public key should match with proof, if not revert", async () => {
				const notUser0 = users[4];

				await expect(
					encryptedERC.connect(notUser0.signer).privateBurn(
						validProof,
						Array.from({ length: 7 }, () => 1n),
					),
				).to.be.reverted;
			});

			it("auditor public key should match with proof, if not revert", async () => {
				const user = users[0];

				const _publicInputs = [...validProof.publicSignals];

				// auditor public key indexes are 10 and 11
				// only change [10]
				_publicInputs[10] = "100";
				_publicInputs[11] = validProof.publicSignals[11];

				await expect(
					encryptedERC.connect(user.signer).privateBurn(
						{
							proofPoints: validProof.proofPoints,
							publicSignals: _publicInputs,
						} as TransferProofStruct,
						Array.from({ length: 7 }, () => 1n),
					),
				).to.be.reverted;

				// only change [11]
				_publicInputs[10] = validProof.publicSignals[10];
				_publicInputs[11] = "100";

				await expect(
					encryptedERC.connect(user.signer).privateBurn(
						{
							proofPoints: validProof.proofPoints,
							publicSignals: _publicInputs,
						} as TransferProofStruct,
						Array.from({ length: 7 }, () => 1n),
					),
				).to.be.reverted;
			});
		});

		// In order to test front running protection what we can do is to
		// 0. owner mints some tokens to USER
		// 1. USER creates a burn proof but do not send it to the contract
		// 2. owner mints some tokens to USER. repeatedly so USER.'s amount PCTs are updated
		// 3. USER. sends his burn proof
		// after step 3, burn proof should be valid and need to updated pcts accordingly
		describe("Front Running Protection", () => {
			const INITIAL_MINT_COUNT = 4;
			const SECOND_MINT_COUNT = 5;
			const PER_MINT = 100n;
			const EXPECTED_BALANCE_AFTER_INITIAL_MINT = 1000n;
			const EXPECTED_BALANCE_AFTER_MINT = 2500n;
			let USER: (typeof users)[number];

			const burnAmount = 100n;
			let userBalance = 0n;

			let burnProof: {
				proof: TransferProofStruct;
				senderBalancePCT: bigint[];
			};

			it("0. owner mints some tokens to USER.", async () => {
				console.log("USER. Initial Balance", userBalance);

				// user is the second user
				USER = users[2];

				for (let i = 0; i < INITIAL_MINT_COUNT; i++) {
					const receiverPublicKey = USER.publicKey;
					const mintAmount = PER_MINT * BigInt(i + 1);
					const proof = await privateMint(
						mintAmount,
						receiverPublicKey,
						auditorPublicKey,
					);

					await encryptedERC
						.connect(owner)
						.privateMint(USER.signer.address, proof);
				}
			});

			it("USER. balance should be updated properly", async () => {
				const balance = await encryptedERC.balanceOfStandalone(
					USER.signer.address,
				);

				const totalBalance = await getDecryptedBalance(
					USER.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				const amountPCTs = balance.amountPCTs;

				const decryptedAmountPCTs = [];
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(USER.privateKey, pct);
					decryptedAmountPCTs.push(decrypted[0]);
				}

				expect(totalBalance).to.deep.equal(EXPECTED_BALANCE_AFTER_INITIAL_MINT);
				userBalance = totalBalance;

				console.log(
					"USER. Balance After Initial Mint",
					userBalance,
					"has",
					amountPCTs.length,
					`amount pcts in contract before generating burn proof and has ${decryptedAmountPCTs.length} different amount pcts that have`,
					decryptedAmountPCTs,
				);
			});

			it("1. USER. creates a burn proof but do not send it to the contract", async () => {
				const balance = await encryptedERC.balanceOfStandalone(
					USER.signer.address,
				);

				const userEncryptedBalance = [...balance.eGCT.c1, ...balance.eGCT.c2];

				const { proof, userBalancePCT: senderBalancePCT } = await privateBurn(
					USER,
					userBalance,
					burnAmount,
					userEncryptedBalance,
					auditorPublicKey,
				);

				burnProof = { proof, senderBalancePCT };
			});

			it("2. owner mints some tokens to USER. repeatedly so USER.'s amount PCTs are updated", async () => {
				const receiverPublicKey = USER.publicKey;
				for (let i = 0; i < SECOND_MINT_COUNT; i++) {
					const proof = await privateMint(
						PER_MINT * BigInt(i + 1),
						receiverPublicKey,
						auditorPublicKey,
					);

					await encryptedERC
						.connect(owner)
						.privateMint(USER.signer.address, proof);
				}
			});

			it("USER. balance should be updated properly", async () => {
				const balance = await encryptedERC.balanceOfStandalone(
					USER.signer.address,
				);

				const totalBalance = await getDecryptedBalance(
					USER.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				const amountPCTs = balance.amountPCTs;

				const decryptedAmountPCTs = [];
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(USER.privateKey, pct);
					decryptedAmountPCTs.push(decrypted[0]);
				}

				expect(totalBalance).to.deep.equal(EXPECTED_BALANCE_AFTER_MINT);
				userBalance = totalBalance;

				console.log(
					"USER. Balance After Second Mint",
					userBalance,
					"has",
					amountPCTs.length,
					"amount pcts in contract and has",
					decryptedAmountPCTs,
				);
			});

			it("3. USER. sends his burn proof", async () => {
				await encryptedERC
					.connect(USER.signer)
					.privateBurn(burnProof.proof, burnProof.senderBalancePCT);

				console.log("USER. balance before burn", userBalance);
				userBalance = userBalance - burnAmount;
				console.log("USER. balance after burn", userBalance);
			});

			it("after that amount pcts should be updated properly", async () => {
				const balance = await encryptedERC.balanceOfStandalone(
					USER.signer.address,
				);

				const totalBalance = await getDecryptedBalance(
					USER.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				const decryptedBalancePCT = await decryptPCT(
					USER.privateKey,
					balance.balancePCT,
				);

				const amountPCTs = balance.amountPCTs;
				const decryptedAmountPCTs = [];
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(USER.privateKey, pct);
					decryptedAmountPCTs.push(decrypted[0]);
				}

				console.log("decryptedAmountPCTs", decryptedAmountPCTs);

				expect(totalBalance).to.deep.equal(userBalance);
				userBalance = totalBalance;

				console.log(
					"USER. Balance After Burn",
					userBalance,
					"has",
					amountPCTs.length,
					"amount pcts in contract and has",
					decryptedAmountPCTs,
					"and balance pct is",
					decryptedBalancePCT[0],
				);
			});

			it("USER. can burn again", async () => {
				const balance = await encryptedERC.balanceOfStandalone(
					USER.signer.address,
				);

				const userEncryptedBalance = [...balance.eGCT.c1, ...balance.eGCT.c2];

				const { proof, userBalancePCT: senderBalancePCT } = await privateBurn(
					USER,
					userBalance,
					burnAmount,
					userEncryptedBalance,
					auditorPublicKey,
				);

				await encryptedERC
					.connect(USER.signer)
					.privateBurn(proof, senderBalancePCT);

				console.log("USER. balance before burn", userBalance);
				userBalance = userBalance - burnAmount;
				console.log("USER. balance after burn", userBalance);
			});

			it("after that amount pcts should be updated properly", async () => {
				const balance = await encryptedERC.balanceOfStandalone(
					USER.signer.address,
				);

				const totalBalance = await getDecryptedBalance(
					USER.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				const decryptedBalancePCT = await decryptPCT(
					USER.privateKey,
					balance.balancePCT,
				);

				const amountPCTs = balance.amountPCTs;
				const decryptedAmountPCTs = [];
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(USER.privateKey, pct);
					decryptedAmountPCTs.push(decrypted[0]);
				}

				expect(totalBalance).to.deep.equal(userBalance);
				userBalance = totalBalance;

				console.log(
					"USER. Balance After Burn",
					userBalance,
					"has",
					amountPCTs.length,
					"amount pcts in contract and has",
					decryptedAmountPCTs,
					"and balance pct is",
					decryptedBalancePCT[0],
				);
			});

			it("USER. can burn again", async () => {
				const balance = await encryptedERC.balanceOfStandalone(
					USER.signer.address,
				);

				const userEncryptedBalance = [...balance.eGCT.c1, ...balance.eGCT.c2];

				const { proof, userBalancePCT: senderBalancePCT } = await privateBurn(
					USER,
					userBalance,
					burnAmount,
					userEncryptedBalance,
					auditorPublicKey,
				);

				await encryptedERC
					.connect(USER.signer)
					.privateBurn(proof, senderBalancePCT);

				console.log("USER. balance before burn", userBalance);
				userBalance = userBalance - burnAmount;
				console.log("USER. balance after burn", userBalance);
			});

			it("after that amount pcts should be updated properly", async () => {
				const balance = await encryptedERC.balanceOfStandalone(
					USER.signer.address,
				);

				const totalBalance = await getDecryptedBalance(
					USER.privateKey,
					balance.amountPCTs,
					balance.balancePCT,
					balance.eGCT,
				);

				const decryptedBalancePCT = await decryptPCT(
					USER.privateKey,
					balance.balancePCT,
				);

				const amountPCTs = balance.amountPCTs;
				const decryptedAmountPCTs = [];
				for (const [pct] of amountPCTs) {
					const decrypted = await decryptPCT(USER.privateKey, pct);
					decryptedAmountPCTs.push(decrypted[0]);
				}

				expect(totalBalance).to.deep.equal(userBalance);
				userBalance = totalBalance;

				console.log(
					"USER. Balance After Burn",
					userBalance,
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
				proof: TransferProofStruct;
				senderBalancePCT: bigint[];
			};

			it("sender needs to calculate the encrypted balance", async () => {
				const sender = users[1];

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
				const sender = users[1];
				const receiver = users[4];

				const senderEncryptedBalance = await encryptedERC.balanceOfStandalone(
					sender.signer.address,
				);

				const { proof, senderBalancePCT } = await privateTransfer(
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
						.transfer(receiver.signer.address, 0n, proof, senderBalancePCT),
				).to.be.not.reverted;

				validParams = {
					proof,
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
							validParams.senderBalancePCT,
						),
				).to.be.reverted;
			});

			it("sender balance should be updated properly", async () => {
				const senderExpectedNewBalance = senderBalance - transferAmount;
				const sender = users[1];

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
							validParams.senderBalancePCT,
						),
				).to.be.reverted;
			});

			it("should revert if sender public key and public key from proof do not match ", async () => {
				// fromPublicKey is at index 0 and 1
				// only change [0]
				const _proof = validParams.proof;
				const _publicInputs = [...validParams.proof.publicSignals];

				_publicInputs[0] = "100";
				_publicInputs[1] = validParams.proof.publicSignals[1];

				await expect(
					encryptedERC.connect(users[0].signer).transfer(
						validParams.to,
						0n,
						{
							proofPoints: _proof.proofPoints,
							publicSignals: _publicInputs,
						} as TransferProofStruct,
						validParams.senderBalancePCT,
					),
				).to.be.reverted;

				// change [1]
				_publicInputs[0] = validParams.proof.publicSignals[0];
				_publicInputs[1] = "100";

				await expect(
					encryptedERC.connect(users[0].signer).transfer(
						validParams.to,
						0n,
						{
							proofPoints: _proof.proofPoints,
							publicSignals: _publicInputs,
						} as TransferProofStruct,
						validParams.senderBalancePCT,
					),
				).to.be.reverted;
			});

			it("should revert if receiver public key and public key from proof do not match", async () => {
				// toPublicKey is at index 10 and 11
				// only change [10]
				const _proof = validParams.proof;
				const _publicInputs = [...validParams.proof.publicSignals];

				_publicInputs[10] = "100";
				_publicInputs[11] = validParams.proof.publicSignals[11];

				await expect(
					encryptedERC.connect(users[0].signer).transfer(
						validParams.to,
						0n,
						{
							proofPoints: _proof.proofPoints,
							publicSignals: _publicInputs,
						} as TransferProofStruct,
						validParams.senderBalancePCT,
					),
				).to.be.reverted;

				// only change [11]
				_publicInputs[10] = validParams.proof.publicSignals[10];
				_publicInputs[11] = "100";

				await expect(
					encryptedERC.connect(users[0].signer).transfer(
						validParams.to,
						0n,
						{
							proofPoints: _proof.proofPoints,
							publicSignals: _publicInputs,
						},
						validParams.senderBalancePCT,
					),
				).to.be.reverted;
			});

			it("should revert if auditor public key is not match with public key in proof", async () => {
				const receiver = users[0];

				const _proof = validParams.proof;
				const _publicInputs = [...validParams.proof.publicSignals];

				// auditor public key indexes are 23 and 24
				// only change [23]
				_publicInputs[23] = "100";
				_publicInputs[24] = validParams.proof.publicSignals[24];

				await expect(
					encryptedERC.connect(owner).transfer(
						validParams.to,
						0n,
						{
							proofPoints: _proof.proofPoints,
							publicSignals: _publicInputs,
						} as TransferProofStruct,
						validParams.senderBalancePCT,
					),
				).to.be.reverted;

				// only change [24]
				_publicInputs[23] = validParams.proof.publicSignals[23];
				_publicInputs[24] = "100";

				await expect(
					encryptedERC.connect(owner).transfer(
						validParams.to,
						0n,
						{
							proofPoints: _proof.proofPoints,
							publicSignals: _publicInputs,
						},
						validParams.senderBalancePCT,
					),
				).to.be.reverted;
			});
		});
	});
});
