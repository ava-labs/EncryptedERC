import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import util from "node:util";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/dist/src/signer-with-address";
import { formatPrivKeyForBabyJub } from "maci-crypto";
import {
	encryptMessage,
	processPoseidonDecryption,
	processPoseidonEncryption,
} from "../src/jub/jub";
import { BabyJubJub__factory } from "../typechain-types/factories/contracts/libraries";
import {
	BurnVerifier__factory,
	MintVerifier__factory,
	RegistrationVerifier__factory,
	TransferVerifier__factory,
} from "../typechain-types/factories/contracts/verifiers";
import type { User } from "./user";

const execAsync = util.promisify(exec);

export const deployVerifiers = async (signer: SignerWithAddress) => {
	const registrationVerifierFactory = new RegistrationVerifier__factory(signer);
	const registrationVerifier = await registrationVerifierFactory.deploy();
	await registrationVerifier.waitForDeployment();

	const mintVerifierFactory = new MintVerifier__factory(signer);
	const mintVerifier = await mintVerifierFactory.deploy();
	await mintVerifier.waitForDeployment();

	const burnVerifierFactory = new BurnVerifier__factory(signer);
	const burnVerifier = await burnVerifierFactory.deploy();
	await burnVerifier.waitForDeployment();

	const transferVerifierFactory = new TransferVerifier__factory(signer);
	const transferVerifier = await transferVerifierFactory.deploy();
	await transferVerifier.waitForDeployment();

	return {
		registrationVerifier: registrationVerifier.target.toString(),
		mintVerifier: mintVerifier.target.toString(),
		burnVerifier: burnVerifier.target.toString(),
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

	const { stderr: err, stdout } = await execAsync(cmd);

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

export const privateBurn = async (
	amount: bigint,
	user: User,
	userEncryptedBalance: bigint[],
	userBalance: bigint,
	auditorPublicKey: bigint[],
) => {
	const newBalance = userBalance - amount;
	const userPublicKey = user.publicKey;

	// 1. encrypt the negated burn amount with el-gamal
	const { cipher: encryptedAmount } = encryptMessage(userPublicKey, amount);

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
		...encryptedAmount[0].map(String),
		...encryptedAmount[1].map(String),
		...auditorPublicKey.map(String),
		...auditorCiphertext.map(String),
		...auditorAuthKey.map(String),
		auditorNonce.toString(),
	];

	const privateInputs = [
		formatPrivKeyForBabyJub(user.privateKey).toString(),
		userBalance.toString(),
		auditorEncRandom.toString(),
		amount.toString(),
	];

	const input = {
		privateInputs,
		publicInputs,
	};

	const proof = await generateGnarkProof("BURN", JSON.stringify(input));

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

export const privateTransfer = async (
	sender: User,
	senderBalance: bigint,
	receiver: User,
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
	} = encryptMessage(receiver.publicKey, transferAmount);

	// 3. creates a pct for receiver with the transfer amount
	const {
		ciphertext: receiverCiphertext,
		nonce: receiverNonce,
		authKey: receiverAuthKey,
		encRandom: receiverEncRandom,
	} = processPoseidonEncryption([transferAmount], receiver.publicKey);

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
		...receiver.publicKey.map(String),
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
