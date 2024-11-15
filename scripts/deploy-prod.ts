import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import { deployLibrary, deployVerifiers } from "../test/helpers";
import {
	EncryptedERC__factory,
	Registrar__factory,
	SimpleERC20__factory,
} from "../typechain-types/factories/contracts";
import { ProductionMintVerifier__factory } from "../typechain-types/factories/contracts/x/g16_eerc_mint.sol";
import { ProductionRegisterVerifier__factory } from "../typechain-types/factories/contracts/x/g16_eerc_register.sol";
import { ProductionTransferVerifier__factory } from "../typechain-types/factories/contracts/x/g16_eerc_transfer.sol";
import { ProductionWithdrawVerifier__factory } from "../typechain-types/factories/contracts/x/g16_eerc_withdraw.sol/ProductionWithdrawVerifier__factory";

const deployProductionVerifiers = async (signer: SignerWithAddress) => {
	const registrationVerifierFactory = new ProductionRegisterVerifier__factory(
		signer,
	);
	const registrationVerifier = await registrationVerifierFactory.deploy();
	await registrationVerifier.waitForDeployment();

	const mintVerifierFactory = new ProductionMintVerifier__factory(signer);
	const mintVerifier = await mintVerifierFactory.deploy();
	await mintVerifier.waitForDeployment();

	const withdrawVerifierFactory = new ProductionWithdrawVerifier__factory(
		signer,
	);
	const withdrawVerifier = await withdrawVerifierFactory.deploy();
	await withdrawVerifier.waitForDeployment();

	const transferVerifierFactory = new ProductionTransferVerifier__factory(
		signer,
	);
	const transferVerifier = await transferVerifierFactory.deploy();
	await transferVerifier.waitForDeployment();

	return {
		registrationVerifier: registrationVerifier.target.toString(),
		mintVerifier: mintVerifier.target.toString(),
		withdrawVerifier: withdrawVerifier.target.toString(),
		transferVerifier: transferVerifier.target.toString(),
	};
};

const main = async () => {
	const DECIMALS = 4;
	const [deployer] = await ethers.getSigners();

	const {
		registrationVerifier,
		mintVerifier,
		withdrawVerifier,
		transferVerifier,
	} = await deployProductionVerifiers(deployer);

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

	const erc20Factory = new SimpleERC20__factory(deployer);
	const erc20 = await erc20Factory.deploy("Test", "TEST", DECIMALS);
	await erc20.waitForDeployment();
	console.log("---- ERC20 ----");
	console.log(`ERC20                 : ${erc20.target}`);
	{
		const tx = await erc20
			.connect(deployer)
			.mint(deployer.address, 1000000000000000000000000000n);
		await tx.wait();
		console.log("Minted 1000000000000000000000000000 to deployer");
	}

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

	{
		const tx = await erc20
			.connect(deployer)
			.approve(encryptedERC.target, 10000000000000000000000n);
		await tx.wait();
		console.log("Approved 10000000000000000000000n to EncryptedERC Contract");
	}

	console.log("---- EncryptedERC ----");
	console.log(`EncryptedERC          : ${encryptedERC.target}`);
};

main();
