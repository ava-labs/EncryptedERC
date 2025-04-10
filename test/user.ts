import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/dist/src/signer-with-address";
import { Base8, mulPointEscalar, subOrder } from "@zk-kit/baby-jubjub";
import { formatPrivKeyForBabyJub, genPrivKey, hash2 } from "maci-crypto";
import { poseidon3 } from "poseidon-lite";

export const AUDITOR_SECRET_KEY =
	12847321338015819245445518144028570538408927360876901642159872299055545378037n;

export class User {
	privateKey: bigint;
	formattedPrivateKey: bigint;
	publicKey: bigint[];
	signer: SignerWithAddress;

	constructor(signer: SignerWithAddress) {
		this.signer = signer;
		// gen private key
		this.privateKey = genPrivKey();
		// format private key for baby jubjub
		this.formattedPrivateKey =
			formatPrivKeyForBabyJub(this.privateKey) % subOrder;
		// gen public key
		this.publicKey = mulPointEscalar(Base8, this.formattedPrivateKey).map((x) =>
			BigInt(x),
		);
	}

	get address() {
		const address = hash2(this.publicKey);
		return address;
	}

	/**
	 *
	 * @param chainId Chain ID of the network
	 * @returns The registration hash for the user CRH(CHAIN_ID | PRIVATE_KEY | ADDRESS)
	 */
	genRegistrationHash(chainId: bigint) {
		const registrationHash = poseidon3([
			chainId,
			this.formattedPrivateKey,
			BigInt(this.signer.address),
		]);

		return registrationHash;
	}
}

export class BurnUser {
	privateKey: bigint;
	publicKey: bigint[];

	constructor() {
		this.privateKey = BigInt(0);
		this.publicKey = [0n, 1n];
	}

	get address() {
		const address = "0x1111111111111111111111111111111111111111";
		return address;
	}
}
