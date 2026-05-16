import { ethers } from "hardhat";
import { deployVerifiers, deployLibrary } from "../test/helpers";

/**
 * Deployment script for AvaDB
 *
 * AvaDB relies on the same Registrar used by EncryptedERC so that users
 * who are already registered in the eERC ecosystem can interact with the
 * database without an extra registration step.
 *
 * Deploy order:
 *  1. ZK verifiers (Registration verifier is required by Registrar)
 *  2. BabyJubJub library
 *  3. Registrar
 *  4. AvaDB
 *
 * Set isProd = true to use the production verifiers (trusted-setup zkeys).
 */
const main = async () => {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying AvaDB contracts...");
  console.log("Deployer:", deployer.address);

  // ── 1. Deploy ZK verifiers ──────────────────────────────────────────────
  // isProd = false → uses the locally-compiled circuit verifiers
  const { registrationVerifier } = await deployVerifiers(deployer);

  // ── 2. Deploy BabyJubJub library ────────────────────────────────────────
  const babyJubJub = await deployLibrary(deployer);

  // ── 3. Deploy Registrar ─────────────────────────────────────────────────
  const registrarFactory = await ethers.getContractFactory("Registrar");
  const registrar = await registrarFactory.deploy(registrationVerifier);
  await registrar.waitForDeployment();

  // ── 4. Deploy AvaDB ─────────────────────────────────────────────────────
  const avaDBFactory = await ethers.getContractFactory("AvaDB");
  const avaDB = await avaDBFactory.deploy(registrar.target);
  await avaDB.waitForDeployment();

  console.log("\n─── AvaDB Deployment Summary ───────────────────────────────");
  console.table({
    registrationVerifier,
    babyJubJub,
    registrar: registrar.target,
    avaDB: avaDB.target,
  });
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
