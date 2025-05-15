import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import { TokenConfig, DEFAULT_CONFIG } from '../config/types.js';

export async function initCommand() {
  try {
    // Check if config file already exists
    const configPath = path.join(process.cwd(), 'eerc.config.json');
    try {
      await fs.access(configPath);
      const { overwrite } = await inquirer.prompt([{
        type: 'confirm',
        name: 'overwrite',
        message: 'Configuration file already exists. Do you want to overwrite it?',
        default: false
      }]);

      if (!overwrite) {
        console.log('Operation cancelled.');
        return;
      }
    } catch (error) {
      // File doesn't exist, continue with creation
    }

    // Prompt for configuration
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'rpcUrl',
        message: 'Enter RPC URL:',
        default: DEFAULT_CONFIG.rpcUrl
      },
      {
        type: 'input',
        name: 'name',
        message: 'Enter token name:',
        default: DEFAULT_CONFIG.name
      },
      {
        type: 'input',
        name: 'symbol',
        message: 'Enter token symbol:',
        default: DEFAULT_CONFIG.symbol
      },
      {
        type: 'number',
        name: 'decimals',
        message: 'Enter token decimals:',
        default: DEFAULT_CONFIG.decimals
      },
      {
        type: 'confirm',
        name: 'isConverter',
        message: 'Is this a converter token?',
        default: DEFAULT_CONFIG.isConverter
      }
    ]);

    const config: TokenConfig = {
      rpcUrl: answers.rpcUrl,
      name: answers.name,
      symbol: answers.symbol,
      decimals: answers.decimals,
      isConverter: answers.isConverter
    };

    // Write config to file
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log('Configuration file created successfully at:', configPath);
  } catch (error) {
    console.error('Error creating configuration:', error);
    process.exit(1);
  }
} 