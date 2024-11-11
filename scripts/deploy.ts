import { ethers } from "hardhat";
import { deployLibrary, deployVerifiers } from "../test/helpers";
import {
	EncryptedERC__factory,
	Registrar__factory,
} from "../typechain-types/factories/contracts";

const main = async () => {
	const DECIMALS = 4;
	const [deployer] = await ethers.getSigners();

	const {
		registrationVerifier,
		mintVerifier,
		withdrawVerifier,
		transferVerifier,
	} = await deployVerifiers(deployer);

	console.log("---- Verifiers ----");
	console.log(`RegistrationVerifier  : ${registrationVerifier}`);
	console.log(`MintVerifier          : ${mintVerifier}`);
	console.log(`WithdrawVerifier      : ${withdrawVerifier}`);
	console.log(`TransferVerifier      : ${transferVerifier}`);

	const babyJubJub = await deployLibrary(deployer);
	console.log("---- Library ----");
	console.log(`BabyJubJub            : ${babyJubJub}`);

	const registrarFactory = new Registrar__factory(deployer);
	const registrar = await registrarFactory.deploy(registrationVerifier);
	console.log("---- Registrar ----");
	console.log(`Registrar             : ${registrar.target}`);

	const encryptedERCFactory = new EncryptedERC__factory({
		"contracts/libraries/BabyJubJub.sol:BabyJubJub": babyJubJub,
	});
	const encryptedERC = await encryptedERCFactory.connect(deployer).deploy({
		_registrar: registrar.target,
		_isConverter: false, // lets leave it false for now
		_name: "Encrypted ERC",
		_symbol: "EERC",
		_mintVerifier: mintVerifier,
		_withdrawVerifier: withdrawVerifier,
		_transferVerifier: transferVerifier,
		_decimals: DECIMALS,
	});
	await encryptedERC.waitForDeployment();

	console.log("---- EncryptedERC ----");
	console.log(`EncryptedERC          : ${encryptedERC.target}`);
};

main();
