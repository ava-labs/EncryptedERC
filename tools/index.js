#!/usr/bin/env node
import { Command } from 'commander';
import init from './commands/init.js';
import deploy from './commands/deploy.js';

const program = new Command();

program
  .name('eerc-cli')
  .description('CLI tool for deploying EncryptedERC20 contracts')
  .version('0.1.0');

// Register init
program.addCommand(init);

program.addCommand(deploy);

program.parse(process.argv);
