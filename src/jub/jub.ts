import {
	Base8,
	Fr,
	type Point,
	addPoint,
	mulPointEscalar,
} from "@zk-kit/baby-jubjub";
import { formatPrivKeyForBabyJub, genRandomBabyJubValue } from "maci-crypto";

// el-gamal decryption
export const decryptPoint = (
	privateKey: bigint,
	c1: bigint[],
	c2: bigint[],
): bigint[] => {
	const privKey = formatPrivKeyForBabyJub(privateKey);

	const c1x = mulPointEscalar(c1 as Point<bigint>, privKey);
	const c1xInverse = [Fr.e(c1x[0] * -1n), c1x[1]];
	return addPoint(c2 as Point<bigint>, c1xInverse as Point<bigint>);
};

// el-gamal encryption
export const encryptPoint = (
	publicKey: bigint[],
	point: bigint[],
	random = genRandomBabyJubValue(),
): [Point<bigint>, Point<bigint>] => {
	const c1 = mulPointEscalar(Base8, random);
	const pky = mulPointEscalar(publicKey as Point<bigint>, random);
	const c2 = addPoint(point as Point<bigint>, pky);

	return [c1, c2];
};

export const encryptMessage = (
	publicKey: bigint[],
	message: bigint,
	random = genRandomBabyJubValue(),
): { cipher: [bigint[], bigint[]]; random: bigint } => {
	const p = mulPointEscalar(Base8, message);

	return {
		cipher: encryptPoint(publicKey, p, random),
		random,
	};
};
