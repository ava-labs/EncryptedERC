import { Base8, type Point, mulPointEscalar } from "@zk-kit/baby-jubjub";
import {
	formatPrivKeyForBabyJub,
	genRandomBabyJubValue,
	poseidonDecrypt,
	poseidonEncrypt,
} from "maci-crypto";
import { randomBytes } from "node:crypto";
import { BASE_POINT_ORDER } from "../constants";

/**
 * Generates a random nonce
 * @returns A cryptographically secure random number
 */
export const randomNonce = (): bigint => {
	const bytes = randomBytes(16);
	// add 1 to make sure it's non-zero
	return BigInt(`0x${bytes.toString("hex")}`) + 1n;
};

/**
 *
 * @param inputs Input array to encrypt
 * @param publicKey Public key
 * @returns ciphertext - Encrypted message
 * @returns nonce - Nonce used for the poseidon encryption
 * @returns encRandom - Randomness used for the encryption
 * @returns poseidonEncryptionKey - Encryption key (publicKey * encRandom)
 * @returns authKey - Authentication key (Base8 * encRandom)
 */
export const processPoseidonEncryption = (
	inputs: bigint[],
	publicKey: bigint[],
) => {
	const nonce = randomNonce();

	let encRandom = genRandomBabyJubValue();
	if (encRandom >= BASE_POINT_ORDER) {
		encRandom = genRandomBabyJubValue() / 10n;
	}

	const poseidonEncryptionKey = mulPointEscalar(
		publicKey as Point<bigint>,
		encRandom,
	);
	const authKey = mulPointEscalar(Base8, encRandom);
	const ciphertext = poseidonEncrypt(inputs, poseidonEncryptionKey, nonce);

	return { ciphertext, nonce, encRandom, poseidonEncryptionKey, authKey };
};

/**
 * Decrypts a message encrypted with Poseidon
 * @param ciphertext Encrypted message
 * @param authKey Authentication key
 * @param nonce Nonce used for the poseidon encryption
 * @param privateKey Private key
 * @param length Length of the original input array
 * @returns Decrypted message as an array
 */
export const processPoseidonDecryption = (
	ciphertext: bigint[],
	authKey: bigint[],
	nonce: bigint,
	privateKey: bigint,
	length: number,
) => {
	const sharedKey = mulPointEscalar(
		authKey as Point<bigint>,
		formatPrivKeyForBabyJub(privateKey),
	);

	const decrypted = poseidonDecrypt(ciphertext, sharedKey, nonce, length);

	return decrypted.slice(0, length);
};


