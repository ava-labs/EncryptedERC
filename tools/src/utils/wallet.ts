import { ethers } from 'ethers';
import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import { WalletOptions } from '../contracts/types.js';
import chalk from 'chalk';

export class WalletManager {
  private static readonly DEFAULT_KEY_FILE = 'encryptedkey.json';

  static async getSigner(options?: WalletOptions): Promise<ethers.Signer> {
    if (!options) {
      return this.promptForWallet();
    }

    if (options.privateKey) {
      return new ethers.Wallet(options.privateKey);
    }

    if (options.encryptedKey) {
      if (!options.passphrase) {
        throw new Error('Passphrase required for encrypted key');
      }
      return await ethers.Wallet.fromEncryptedJson(options.encryptedKey, options.passphrase);
    }

    return this.promptForWallet();
  }

  static async encryptPrivateKey(privateKey: string, passphrase: string): Promise<string> {
    try {
      const wallet = new ethers.Wallet(privateKey);
      const encryptedJson = await wallet.encrypt(passphrase);
      return encryptedJson;
    } catch (error) {
      throw new Error(`Failed to encrypt private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async generateEncryptedKey(): Promise<void> {
    const { privateKey } = await inquirer.prompt([{
      type: 'password',
      name: 'privateKey',
      message: 'Enter your private key:',
      validate: (input: string) => {
        try {
          new ethers.Wallet(input);
          return true;
        } catch {
          return 'Invalid private key format';
        }
      }
    }]);

    const { passphrase } = await inquirer.prompt([{
      type: 'password',
      name: 'passphrase',
      message: 'Enter a passphrase to encrypt your private key:',
      validate: (input: string) => input.length >= 8 || 'Passphrase must be at least 8 characters long'
    }]);

    const { confirmPassphrase } = await inquirer.prompt([{
      type: 'password',
      name: 'confirmPassphrase',
      message: 'Confirm your passphrase:',
      validate: (input: string) => input === passphrase || 'Passphrases do not match'
    }]);

    try {
      const encryptedJson = await this.encryptPrivateKey(privateKey, passphrase);
      const parsedJson = JSON.parse(encryptedJson);
      
      console.log('\nYour encrypted wallet:');
      console.log('--------------------');
      console.log(chalk.bgGray(encryptedJson));
      
      console.log('\nWallet Details:');
      console.log('--------------');
      console.log(`Address: ${chalk.cyan(parsedJson.address)}`);
      console.log(`Version: ${chalk.cyan(parsedJson.version)}`);
      console.log(`Encryption: ${chalk.cyan(parsedJson.Crypto.cipher)}`);
      console.log(`Key Derivation: ${chalk.cyan(parsedJson.Crypto.kdf)}`);

      const { saveToFile } = await inquirer.prompt([{
        type: 'confirm',
        name: 'saveToFile',
        message: 'Would you like to save this encrypted wallet to a file?',
        default: true
      }]);

      if (saveToFile) {
        const { keyFilePath } = await inquirer.prompt([{
          type: 'input',
          name: 'keyFilePath',
          message: 'Enter path to save encrypted wallet (default: encryptedkey.json):',
          default: this.DEFAULT_KEY_FILE
        }]);

        await fs.writeFile(keyFilePath, encryptedJson);
        console.log(chalk.green(`\nEncrypted wallet saved to: ${keyFilePath}`));
      }
      
      console.log('\nIMPORTANT:');
      console.log('1. Save the entire JSON output securely');
      console.log('2. Remember your passphrase');
      console.log('3. Never share your raw private key');
      console.log('4. You can use this encrypted wallet with the --encrypted-key option');
      console.log('\nNote: The encrypted wallet is in Ethereum\'s standard format (v3)');
      console.log('      and contains all necessary parameters for decryption.');
    } catch (error) {
      console.error('Failed to encrypt private key:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  }

  private static async promptForWallet(): Promise<ethers.Signer> {
    const { walletType } = await inquirer.prompt([{
      type: 'list',
      name: 'walletType',
      message: 'How would you like to provide your wallet?',
      choices: [
        { name: 'Private Key', value: 'privateKey' },
        { name: 'Encrypted Key + Passphrase', value: 'encrypted' },
        { name: 'Load from encryptedkey.json', value: 'file' }
      ]
    }]);

    if (walletType === 'privateKey') {
      const { privateKey } = await inquirer.prompt([{
        type: 'password',
        name: 'privateKey',
        message: 'Enter your private key:',
        validate: (input: string) => {
          try {
            new ethers.Wallet(input);
            return true;
          } catch {
            return 'Invalid private key format';
          }
        }
      }]);

      return new ethers.Wallet(privateKey);
    } else if (walletType === 'file') {
      try {
        const keyFilePath = this.DEFAULT_KEY_FILE;
        const encryptedKey = await fs.readFile(keyFilePath, 'utf-8');
        
        const { passphrase } = await inquirer.prompt([{
          type: 'password',
          name: 'passphrase',
          message: 'Enter your passphrase:'
        }]);

        const wallet = await ethers.Wallet.fromEncryptedJson(
          encryptedKey,
          passphrase
        );
        return wallet;
      } catch (error) {
        if (error instanceof Error && error.message.includes('ENOENT')) {
          throw new Error(`Encrypted key file not found at ${this.DEFAULT_KEY_FILE}`);
        }
        throw new Error(`Failed to load encrypted wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      const { encryptedKey, passphrase } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'encryptedKey',
          message: 'Enter your encrypted key (will open in editor):',
          validate: (input: string) => {
            try {
              JSON.parse(input);
              return true;
            } catch {
              return 'Invalid JSON format';
            }
          }
        },
        {
          type: 'password',
          name: 'passphrase',
          message: 'Enter your passphrase:'
        }
      ]);

      try {
        const wallet = await ethers.Wallet.fromEncryptedJson(
          encryptedKey,
          passphrase
        );
        return wallet;
      } catch (error) {
        throw new Error(`Failed to decrypt wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
} 