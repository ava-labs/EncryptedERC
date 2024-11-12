import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import util from "node:util";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/dist/src/signer-with-address";
import { Base8, mulPointEscalar } from "@zk-kit/baby-jubjub";
import { expect } from "chai";
import { formatPrivKeyForBabyJub } from "maci-crypto";
import {
	decryptPoint,
	encryptMessage,
	processPoseidonDecryption,
	processPoseidonEncryption,
} from "../src/jub/jub";
import type { AmountPCTStructOutput } from "../typechain-types/contracts/EncryptedERC";
import { BabyJubJub__factory } from "../typechain-types/factories/contracts/libraries";
import {
	MintVerifier__factory,
	RegistrationVerifier__factory,
	TransferVerifier__factory,
	WithdrawVerifier__factory,
} from "../typechain-types/factories/contracts/verifiers";
import type { User } from "./user";

const execAsync = util.promisify(exec);

let startTime: number;

export const startTimer = () => {
	startTime = Date.now();
};

export const stopTimer = () => {
	const endTime = Date.now();
	const duration = endTime - startTime;
	console.log(`Time taken: ${duration}ms`);
};

export const deployVerifiers = async (signer: SignerWithAddress) => {
	const registrationVerifierFactory = new RegistrationVerifier__factory(signer);
	const registrationVerifier = await registrationVerifierFactory.deploy();
	await registrationVerifier.waitForDeployment();

	const mintVerifierFactory = new MintVerifier__factory(signer);
	const mintVerifier = await mintVerifierFactory.deploy();
	await mintVerifier.waitForDeployment();

	const withdrawVerifierFactory = new WithdrawVerifier__factory(signer);
	const withdrawVerifier = await withdrawVerifierFactory.deploy();
	await withdrawVerifier.waitForDeployment();

	const transferVerifierFactory = new TransferVerifier__factory(signer);
	const transferVerifier = await transferVerifierFactory.deploy();
	await transferVerifier.waitForDeployment();

	return {
		registrationVerifier: registrationVerifier.target.toString(),
		mintVerifier: mintVerifier.target.toString(),
		withdrawVerifier: withdrawVerifier.target.toString(),
		transferVerifier: transferVerifier.target.toString(),
	};
};

export const deployLibrary = async (signer: SignerWithAddress) => {
	const babyJubJubFactory = new BabyJubJub__factory(signer);
	const babyJubJub = await babyJubJubFactory.deploy();
	await babyJubJub.waitForDeployment();

	return babyJubJub.target.toString();
};

/**
 *
 * @param {PROOF_TYPE} type  Proof type
 * @param {object}     input Proof Input
 * @returns Proof
 * @dev This function generates a proof for the given input and proof type.
 * 	    It uses the binary in the outputs folder.
 */
export const generateGnarkProof = async (
	type: string,
	input: string,
): Promise<string[]> => {
	const outputPath = path.join(__dirname, `${type}.output.json`);

	const pkPath = path.join(__dirname, "../", "build", `${type}.pk`);
	const csPath = path.join(__dirname, "../", "build", `${type}.r1cs`);

	const executableName = "encryptedERC";
	const executable = path.join(__dirname, "../", "zk", "build", executableName);

	const cmd = `${executable} --operation ${type} --input '${input}' --pk ${pkPath} --cs ${csPath} --output ${outputPath}`;

	// todo why stdout?
	startTimer();
	console.log("Generating proof for ", type);
	const { stderr: err } = await execAsync(cmd);
	stopTimer();
	if (err) throw new Error(err);

	const output = fs.readFileSync(outputPath, "utf-8");
	const { proof } = JSON.parse(output);

	fs.unlinkSync(outputPath);

	return proof;
};

export const privateMint = async (
	amount: bigint,
	receiverPublicKey: bigint[],
	auditorPublicKey: bigint[],
) => {
	// 1. encrypt mint amount with el-gamal
	const { cipher: encryptedAmount, random: encryptedAmountRandom } =
		encryptMessage(receiverPublicKey, amount);

	// 2. create pct for the receiver with the mint amount
	const {
		ciphertext: receiverCiphertext,
		nonce: receiverNonce,
		encRandom: receiverEncRandom,
		authKey: receiverAuthKey,
	} = processPoseidonEncryption([amount], receiverPublicKey);

	// 3. create pct for the auditor with the mint amount
	const {
		ciphertext: auditorCiphertext,
		nonce: auditorNonce,
		encRandom: auditorEncRandom,
		authKey: auditorAuthKey,
	} = processPoseidonEncryption([amount], auditorPublicKey);

	const publicInputs = [
		...receiverPublicKey.map(String),
		...encryptedAmount[0].map(String),
		...encryptedAmount[1].map(String),
		...receiverCiphertext.map(String),
		...receiverAuthKey.map(String),
		receiverNonce.toString(),
		...auditorPublicKey.map(String),
		...auditorCiphertext.map(String),
		...auditorAuthKey.map(String),
		auditorNonce.toString(),
	];

	const privateInputs = [
		encryptedAmountRandom.toString(),
		receiverEncRandom.toString(),
		auditorEncRandom.toString(),
		amount.toString(),
	];

	const input = {
		privateInputs,
		publicInputs,
	};

	const proof = await generateGnarkProof("MINT", JSON.stringify(input));

	return { proof, publicInputs };
};

// private burn is transferring the encrypted amount to BURN_USER
// which is the identity point (0, 1)
export const privateBurn = async (
	user: User,
	userBalance: bigint,
	amount: bigint,
	userEncryptedBalance: bigint[],
	auditorPublicKey: bigint[],
) => {
	return privateTransfer(
		user,
		userBalance,
		[0n, 1n],
		amount,
		userEncryptedBalance,
		auditorPublicKey,
	);
};

export const privateTransfer = async (
	sender: User,
	senderBalance: bigint,
	receiverPublicKey: bigint[],
	transferAmount: bigint,
	senderEncryptedBalance: bigint[],
	auditorPublicKey: bigint[],
) => {
	const senderNewBalance = senderBalance - transferAmount;
	// 1. encrypt the transfer amount with el-gamal for sender
	const { cipher: encryptedAmountSender, random: encryptedAmountSenderRandom } =
		encryptMessage(sender.publicKey, transferAmount);

	// 2. encrypt the transfer amount with el-gamal for receiver
	const {
		cipher: encryptedAmountReceiver,
		random: encryptedAmountReceiverRandom,
	} = encryptMessage(receiverPublicKey, transferAmount);

	// 3. creates a pct for receiver with the transfer amount
	const {
		ciphertext: receiverCiphertext,
		nonce: receiverNonce,
		authKey: receiverAuthKey,
		encRandom: receiverEncRandom,
	} = processPoseidonEncryption([transferAmount], receiverPublicKey);

	// 4. creates a pct for auditor with the transfer amount
	const {
		ciphertext: auditorCiphertext,
		nonce: auditorNonce,
		authKey: auditorAuthKey,
		encRandom: auditorEncRandom,
	} = processPoseidonEncryption([transferAmount], auditorPublicKey);

	// 5. create pct for the sender with the newly calculated balance
	const {
		ciphertext: senderCiphertext,
		nonce: senderNonce,
		authKey: senderAuthKey,
	} = processPoseidonEncryption([senderNewBalance], sender.publicKey);

	const publicInputs = [
		...sender.publicKey.map(String),
		...senderEncryptedBalance.map(String),
		...encryptedAmountSender[0].map(String),
		...encryptedAmountSender[1].map(String),
		...receiverPublicKey.map(String),
		...encryptedAmountReceiver[0].map(String),
		...encryptedAmountReceiver[1].map(String),
		...receiverCiphertext.map(String),
		...receiverAuthKey.map(String),
		receiverNonce.toString(),
		...auditorPublicKey.map(String),
		...auditorCiphertext.map(String),
		...auditorAuthKey.map(String),
		auditorNonce.toString(),
	];

	const privateInputs = [
		formatPrivKeyForBabyJub(sender.privateKey).toString(),
		senderBalance.toString(),
		encryptedAmountReceiverRandom.toString(),
		receiverEncRandom.toString(),
		auditorEncRandom.toString(),
		transferAmount.toString(),
	];

	const input = {
		privateInputs,
		publicInputs,
	};

	const proof = await generateGnarkProof("TRANSFER", JSON.stringify(input));

	return {
		proof,
		publicInputs,
		senderBalancePCT: [
			...senderCiphertext.map(String),
			...senderAuthKey.map(String),
			senderNonce.toString(),
		],
	};
};

export const decryptPCT = async (
	privateKey: bigint,
	pct: bigint[],
	length = 1,
) => {
	const ciphertext = pct.slice(0, 4);
	const authKey = pct.slice(4, 6);
	const nonce = pct[6];

	const decrypted = processPoseidonDecryption(
		ciphertext,
		authKey,
		nonce,
		privateKey,
		length,
	);

	return decrypted;
};

export const getDecryptedBalance = async (
	privateKey: bigint,
	amountPCTs: AmountPCTStructOutput[],
	balancePCT: bigint[],
	encryptedBalance: bigint[][],
) => {
	let totalBalance = 0n;

	if (balancePCT.some((e) => e !== 0n)) {
		const decryptedBalancePCT = await decryptPCT(privateKey, balancePCT);
		totalBalance += BigInt(decryptedBalancePCT[0]);
	}

	for (const [pct] of amountPCTs) {
		if (pct.some((e) => e !== 0n)) {
			const decryptedAmountPCT = await decryptPCT(privateKey, pct);
			totalBalance += BigInt(decryptedAmountPCT[0]);
		}
	}

	const decryptedBalance = decryptPoint(
		privateKey,
		encryptedBalance[0],
		encryptedBalance[1],
	);

	if (totalBalance !== 0n) {
		const expectedPoint = mulPointEscalar(Base8, totalBalance);
		expect(decryptedBalance).to.deep.equal(expectedPoint);
	}

	return totalBalance;
};

export const withdraw = async (
	amount: bigint,
	user: User,
	userEncryptedBalance: bigint[],
	userBalance: bigint,
	auditorPublicKey: bigint[],
) => {
	const newBalance = userBalance - amount;
	const userPublicKey = user.publicKey;

	// 2. create pct for the user with the newly calculated balance
	const {
		ciphertext: userCiphertext,
		nonce: userNonce,
		authKey: userAuthKey,
	} = processPoseidonEncryption([newBalance], userPublicKey);

	// 3. create pct for the auditor with the burn amount
	const {
		ciphertext: auditorCiphertext,
		nonce: auditorNonce,
		encRandom: auditorEncRandom,
		authKey: auditorAuthKey,
	} = processPoseidonEncryption([amount], auditorPublicKey);

	const publicInputs = [
		...userPublicKey.map(String),
		...userEncryptedBalance.map(String),
		...auditorPublicKey.map(String),
		...auditorCiphertext.map(String),
		...auditorAuthKey.map(String),
		auditorNonce.toString(),
		amount.toString(),
	];

	const privateInputs = [
		formatPrivKeyForBabyJub(user.privateKey).toString(),
		userBalance.toString(),
		auditorEncRandom.toString(),
	];

	const input = {
		privateInputs,
		publicInputs,
	};

	const proof = await generateGnarkProof("WITHDRAW", JSON.stringify(input));

	return {
		proof,
		publicInputs,
		userBalancePCT: [
			...userCiphertext.map(String),
			...userAuthKey.map(String),
			userNonce.toString(),
		],
	};
};
