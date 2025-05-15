import fs from 'fs/promises';
import { ethers } from 'ethers';
import chalk from 'chalk';
import { ContractDeployer } from '../contracts/deployer.js';
import { ArtifactLoader } from '../contracts/artifacts.js';
import { WalletManager } from '../utils/wallet.js';
import { DeployOptions } from '../contracts/types.js';

class Logger {
  constructor(private verbose: boolean) {}

  info(message: string) {
    console.log(chalk.blue('ℹ'), message);
  }

  success(message: string) {
    console.log(chalk.green('✓'), message);
  }

  warning(message: string) {
    console.log(chalk.yellow('⚠'), message);
  }

  error(message: string) {
    console.log(chalk.red('✖'), message);
  }

  step(message: string) {
    if (this.verbose) {
      console.log(chalk.cyan('→'), message);
    }
  }

  gasEstimate(contract: string, gas: bigint) {
    if (this.verbose) {
      console.log(chalk.magenta('⛽'), `${contract}: ${ethers.formatUnits(gas, 0)} gas`);
    }
  }
}

export async function deployCommand(options: DeployOptions) {
  const logger = new Logger(options.verbose || false);

  try {
    // Load and validate config
    logger.step('Loading configuration...');
    const configPath = options.configPath || 'eerc.config.json';
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    logger.success('Configuration loaded successfully');

    // Create provider
    logger.step('Connecting to network...');
    logger.step(`Network: ${config.rpcUrl}`);
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const network = await provider.getNetwork();
    logger.success(`Connected to ${network.name} (chainId: ${network.chainId})`);

    // Get signer
    logger.step('Setting up wallet...');
    const signer = await WalletManager.getSigner(options.wallet);
    const connectedSigner = signer.connect(provider);
    const address = await connectedSigner.getAddress();
    logger.success(`Using wallet: ${address}`);

    // Validate artifacts exist
    logger.step('Validating contract artifacts...');
    const artifactLoader = new ArtifactLoader();
    await artifactLoader.validateArtifactsExist();
    logger.success('All required artifacts found');

    if (options.dryRun) {
      logger.warning('Running in dry-run mode - no contracts will be deployed');
    }

    // Deploy contracts
    logger.step('Starting deployment process...');
    const deployer = new ContractDeployer(provider, connectedSigner, logger);
    const result = await deployer.deployAll(config, options.dryRun);

    if (options.dryRun) {
      logger.success('Dry run completed successfully');
      logger.info('\nContract addresses (dry run):');
      logger.info('----------------------------');
      for (const [name, address] of Object.entries(result.contracts)) {
        logger.info(`${name}: ${address}`);
      }
      return;
    }

    // Save deployment result
    logger.step('Saving deployment results...');
    const outputPath = options.outputPath || 'deployment.json';
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2));

    logger.success('\nDeployment completed successfully!');
    logger.info('Deployment details saved to: ' + outputPath);
    logger.info('\nDeployed contracts:');
    logger.info('-------------------');
    for (const [name, address] of Object.entries(result.contracts)) {
      logger.info(`${name}: ${address}`);
    }
  } catch (error) {
    logger.error(`Exited with ${error ?? "Unknown error"}`);
    process.exit(1);
  }
} 