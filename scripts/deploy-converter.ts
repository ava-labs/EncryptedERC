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
		isConverter: true, // This is a converter eERC
		name: "",
		symbol: "",
		mintVerifier,
		withdrawVerifier,
		transferVerifier,
		burnVerifier,
		decimals: DECIMALS,
	});
	await encryptedERC_.waitForDeployment();

	// also deploys new erc20
	const erc20Factory = await ethers.getContractFactory("SimpleERC20");
	const erc20 = await erc20Factory.deploy("Test", "TEST", 18);
	await erc20.waitForDeployment();

	// mints some amount to deployer as well
	const tx = await erc20.mint(deployer.address, ethers.parseEther("10000"));
	await tx.wait();

	console.log("ERC20 deployed at:", erc20.target);
	console.log("Minted 10000 erc20 to deployer");

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
