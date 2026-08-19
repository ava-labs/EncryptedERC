const { readFileSync } = require("node:fs");

const CIRCUITS = ["Registration", "Mint", "Transfer", "Burn", "Withdraw"];

// generated (hardhat-zkit): `uint256 public constant DELTA_X1 = ...;`
// production (snarkjs):     `uint256 constant deltax1 = ...;`
const parse = (path) => {
	const src = readFileSync(path, "utf8");
	const consts = new Map();
	for (const m of src.matchAll(
		/uint256\s+(?:public\s+)?constant\s+([A-Za-z0-9_]+)\s*=\s*(\d+);/g,
	)) {
		consts.set(m[1].toLowerCase().replace(/_/g, ""), m[2]);
	}

	const at = (name) => {
		const v = consts.get(name);
		if (v === undefined) throw new Error(`${path}: missing constant ${name}`);
		return v;
	};

	const ic = [];
	for (let i = 0; consts.has(`ic${i}x`); i++) ic.push(at(`ic${i}x`), at(`ic${i}y`));
	if (ic.length === 0) throw new Error(`${path}: no IC constants found`);

	return {
		gamma: ["gammax1", "gammax2", "gammay1", "gammay2"].map(at).join(","),
		delta: ["deltax1", "deltax2", "deltay1", "deltay2"].map(at).join(","),
		ic: ic.join(","),
	};
};

const failures = [];

for (const circuit of CIRCUITS) {
	const generatedPath = `contracts/verifiers/${circuit}CircuitGroth16Verifier.sol`;
	const prodPath = `contracts/prod/${circuit}Verifier.sol`;
	const generated = parse(generatedPath);
	const prod = parse(prodPath);

	for (const [label, path, key] of [
		["generated", generatedPath, generated],
		["production", prodPath, prod],
	]) {
		// delta and gamma are independent group elements in any honest setup; equality means
		// delta is the G2 generator, i.e. the trapdoor was never randomized
		if (key.delta === key.gamma) {
			failures.push(
				`${path}: delta == gamma, so the phase-2 trapdoor delta is 1 and this ${label} verifier accepts forged proofs for any public input. Re-run the setup with contributions >= 1 (see hardhat.config.ts).`,
			);
		}
	}

	if (generated.ic !== prod.ic) {
		failures.push(
			`${prodPath}: IC commitments differ from ${generatedPath}, so the production key was generated from a different constraint system than the current circuits. Proofs built from these circuits will not verify against it, and the key cannot be reproduced from this source tree. Re-run the ceremony.`,
		);
	}
}

if (failures.length > 0) {
	console.error(`\nVerification-key checks FAILED (${failures.length}):\n`);
	for (const f of failures) console.error(`  - ${f}\n`);
	process.exit(1);
}

console.log(
	`Verification-key checks passed for ${CIRCUITS.length} circuits (delta != gamma, generated and production IC commitments agree).`,
);
