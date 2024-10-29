import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import util from "node:util";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/dist/src/signer-with-address";
import { encryptMessage, processPoseidonEncryption } from "../src/jub/jub";
import { BabyJubJub__factory } from "../typechain-types/factories/contracts/libraries";
import {
	MintVerifier__factory,
	RegistrationVerifier__factory,
} from "../typechain-types/factories/contracts/verifiers";

const execAsync = util.promisify(exec);

export const deployVerifiers = async (signer: SignerWithAddress) => {
	const registrationVerifierFactory = new RegistrationVerifier__factory(signer);
	const registrationVerifier = await registrationVerifierFactory.deploy();
	await registrationVerifier.waitForDeployment();

	const mintVerifierFactory = new MintVerifier__factory(signer);
	const mintVerifier = await mintVerifierFactory.deploy();
	await mintVerifier.waitForDeployment();

	return {
		registrationVerifier: registrationVerifier.target.toString(),
		mintVerifier: mintVerifier.target.toString(),
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

	let pkPath = "";
	let csPath = "";

	switch (type) {
		case "REGISTER":
			pkPath = path.join(__dirname, "../", "build", "register.pk");
			csPath = path.join(__dirname, "../", "build", "register.r1cs");
			break;
		case "MINT":
			pkPath = path.join(__dirname, "../", "build", "mint.pk");
			csPath = path.join(__dirname, "../", "build", "mint.r1cs");
			break;
		default:
			break;
	}

	const executableName = "encryptedERC";
	const executable = path.join(__dirname, "../", "zk", "build", executableName);

	const cmd = `${executable} --operation ${type} --input '${input}' --pk ${pkPath} --cs ${csPath} --output ${outputPath}`;

	const { stderr: err, stdout } = await execAsync(cmd);
	console.log(stdout);

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
