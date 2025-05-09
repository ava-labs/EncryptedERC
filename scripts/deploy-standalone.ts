import { ethers } from "hardhat";
import { deployLibrary, deployVerifiers } from "../test/helpers";
import { EncryptedERC__factory } from "../typechain-types";
import { DECIMALS } from "./constants";

const main = async () => {
	// get deployer
	const [deployer] = await ethers.getSigners();

	// deploy verifiers
	// if true, deploys verifiers for prod, generated with proper trusted setup
	const {
		registrationVerifier,
		mintVerifier,
		withdrawVerifier,
		transferVerifier,
		burnVerifier,
	} = await deployVerifiers(deployer);

	// deploy babyjub library
	const babyJubJub = await deployLibrary(deployer);

	// deploy registrar contract
	const registrarFactory = await ethers.getContractFactory("Registrar");
	const registrar = await registrarFactory.deploy(registrationVerifier);
	await registrar.waitForDeployment();

	// deploy eERC20
	const encryptedERCFactory = new EncryptedERC__factory({
		"contracts/libraries/BabyJubJub.sol:BabyJubJub": babyJubJub,
	});
	const encryptedERC_ = await encryptedERCFactory.connect(deployer).deploy({
		registrar: registrar.target,
		isConverter: false, // This is a standalone eERC
		name: "Test",
		symbol: "TEST",
		mintVerifier,
		withdrawVerifier,
		transferVerifier,
		burnVerifier,
		decimals: DECIMALS,
	});
	await encryptedERC_.waitForDeployment();

	console.table({
		registrationVerifier,
		mintVerifier,
		withdrawVerifier,
		transferVerifier,
		babyJubJub,
		registrar: registrar.target,
		encryptedERC: encryptedERC_.target,
	});
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
