import { ethers } from "hardhat";
import { deployLibrary, deployVerifiers } from "../test/helpers";

const main = async () => {
	const [deployer] = await ethers.getSigners();
	// console.log(signers.length);

	const { registrationVerifier, mintVerifier, burnVerifier, transferVerifier } =
		await deployVerifiers(deployer);

	console.log("---- Verifiers ----");
	console.log(`RegistrationVerifier  : ${registrationVerifier}`);
	console.log(`MintVerifier          : ${mintVerifier}`);
	console.log(`BurnVerifier          : ${burnVerifier}`);
	console.log(`TransferVerifier      : ${transferVerifier}`);

	const babyJubJub = await deployLibrary(deployer);
	console.log("---- Library ----");
	console.log(`BabyJubJub            : ${babyJubJub}`);
};

main();
