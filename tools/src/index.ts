#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { deployCommand } from './commands/deploy.js';
import { WalletManager } from './utils/wallet.js';

const program = new Command();

program
  .name('eerc-deploy')
  .description('CLI tool for deploying EncryptedERC tokens')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize configuration for EncryptedERC token deployment')
  .action(initCommand);

program
  .command('deploy')
  .description('Deploy EncryptedERC token and all required contracts')
  .option('--private-key <key>', 'Private key for deployment')
  .option('--encrypted-key <key>', 'Encrypted private key')
  .option('--passphrase <phrase>', 'Passphrase for encrypted key')
  .option('--config <path>', 'Path to config file', 'eerc.config.json')
  .option('--output <path>', 'Path to save deployment results', 'deployment.json')
  .option('--verbose', 'Show detailed deployment progress')
  .option('--dry-run', 'Estimate gas without deploying')
  .action(async (options) => {
    const walletOptions = {
      privateKey: options.privateKey,
      encryptedKey: options.encryptedKey,
      passphrase: options.passphrase
    };

    await deployCommand({
      wallet: walletOptions,
      configPath: options.config,
      outputPath: options.output,
      verbose: options.verbose,
      dryRun: options.dryRun
    });
  });

program
  .command('encrypt-key')
  .description('Generate an encrypted private key from a raw private key')
  .action(() => WalletManager.generateEncryptedKey());

program.parse(); 