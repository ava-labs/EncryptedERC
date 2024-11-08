import { ethers } from "hardhat";
import { deployLibrary, deployVerifiers } from "../test/helpers";
import {
	EncryptedERC__factory,
	Registrar__factory,
} from "../typechain-types/factories/contracts";

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
		_decimals: 4,
		_mintVerifier: mintVerifier,
		_burnVerifier: burnVerifier,
		_transferVerifier: transferVerifier,
	});
	await encryptedERC.waitForDeployment();

	console.log("---- EncryptedERC ----");
	console.log(`EncryptedERC          : ${encryptedERC.target}`);
};

main();
