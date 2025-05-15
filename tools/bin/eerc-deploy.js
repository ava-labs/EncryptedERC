#!/usr/bin/env node

import { Command } from 'commander';
const program = new Command();

program
.name('eerc-deploy')
.description('CLI tool to deploy eERC20 contracts on Avalanche')
.version('1.0.0');

import init from '../src/commands/init.js';
import deployCommand from '../src/commands/deploy.js';

program.addCommand(init);
program.addCommand(deployCommand);
program.parse(process.argv);
