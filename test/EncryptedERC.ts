import { expect } from "chai";
import { ethers } from "hardhat";
import type { Registrar } from "../typechain-types/contracts/Registrar";
import { Registrar__factory } from "../typechain-types/factories/contracts";

describe("EncryptedERC", () => {
	let registrar: Registrar;

	const deployFixture = async () => {
		const [owner, otherAccount] = await ethers.getSigners();

		const registrarFactory = new Registrar__factory(owner);
		const registrar_ = await registrarFactory.connect(owner).deploy();
		await registrar_.waitForDeployment();
		registrar = registrar_;
	};

	beforeEach(async () => {
		await deployFixture();
	});

	describe("Registrar", () => {
		it("should deploy registrar properly", async () => {
			expect(registrar.target).to.not.be.null;
			expect(registrar).to.not.be.null;
		});

		it("should initialize properly", async () => {
			const burnUserAddress = await registrar.BURN_USER();
			const burnUserPublicKey = await registrar.userPublicKeys(burnUserAddress);
			expect(burnUserPublicKey).to.deep.equal([0n, 1n]);
		});
	});
});
