import { ethers } from "hardhat";

/**
 * Deploys the AvaDBStorage contract along with a fresh Registrar.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-avadb.ts --network avadb
 *   npx hardhat run scripts/deploy-avadb.ts --network avalanche
 *   npx hardhat run scripts/deploy-avadb.ts --network localhost
 */
const main = async () => {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying AvaDB contracts with account:", deployer.address);
  console.log(
    "Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "AVAX",
  );

  // ── 1. Deploy RegistrationVerifier (reuse prod verifier) ───────────────────
  const RegistrationVerifierFactory = await ethers.getContractFactory(
    "RegistrationCircuitGroth16Verifier",
  );
  const registrationVerifier = await RegistrationVerifierFactory.connect(
    deployer,
  ).deploy();
  await registrationVerifier.waitForDeployment();
  console.log(
    "RegistrationVerifier deployed to:",
    await registrationVerifier.getAddress(),
  );

  // ── 2. Deploy Registrar ─────────────────────────────────────────────────────
  const RegistrarFactory = await ethers.getContractFactory("Registrar");
  const registrar = await RegistrarFactory.connect(deployer).deploy(
    await registrationVerifier.getAddress(),
  );
  await registrar.waitForDeployment();
  console.log("Registrar deployed to:", await registrar.getAddress());

  // ── 3. Deploy AvaDBStorage ──────────────────────────────────────────────────
  const AvaDBStorageFactory = await ethers.getContractFactory("AvaDBStorage");
  const avaDBStorage = await AvaDBStorageFactory.connect(deployer).deploy(
    await registrar.getAddress(),
  );
  await avaDBStorage.waitForDeployment();
  console.log("AvaDBStorage deployed to:", await avaDBStorage.getAddress());

  // ── 4. Print deployment summary ─────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════");
  console.log("AvaDB Deployment Summary");
  console.log("══════════════════════════════════════════════");
  console.table({
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    registrationVerifier: await registrationVerifier.getAddress(),
    registrar: await registrar.getAddress(),
    avaDBStorage: await avaDBStorage.getAddress(),
  });
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
