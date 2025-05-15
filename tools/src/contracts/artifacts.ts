import fs from 'fs/promises';
import path from 'path';
import { ContractName } from './types.js';

interface ArtifactData {
  abi: any[];
  bytecode: string;
  linkReferences?: Record<string, Record<string, { length: number; start: number }[]>>;
  deployedLinkReferences?: Record<string, Record<string, { length: number; start: number }[]>>;
}

export class ArtifactLoader {
  private readonly basePath: string;

  constructor() {
    this.basePath = path.join(process.cwd(), 'artifacts/contracts');
  }

  async loadArtifact(name: ContractName): Promise<ArtifactData> {
    try {
      // Special case for Registrar and EncryptedERC which are in the root contracts directory
      const artifactPath = name === 'Registrar' || name === 'EncryptedERC'
        ? path.join(this.basePath, `${name}.sol`, `${name}.json`)
        :
        name === "BabyJubJub" ? path.join(this.basePath, 'libraries', 'BabyJubJub.sol' , `${name}.json`)
        : path.join(this.basePath, 'prod', `${name}.sol`, `${name}.json`);

      const content = await fs.readFile(artifactPath, 'utf-8');
      const artifact = JSON.parse(content);

      if (!artifact.abi || !artifact.bytecode) {
        throw new Error(`Invalid artifact format for ${name}`);
      }

      return {
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        linkReferences: artifact.linkReferences,
        deployedLinkReferences: artifact.deployedLinkReferences
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('ENOENT')) {
          throw new Error(`Artifact not found for ${name}. Please ensure the contract is compiled.`);
        }
        throw new Error(`Failed to load artifact for ${name}: ${error.message}`);
      }
      throw error;
    }
  }

  async validateArtifactsExist() {
    const requiredArtifacts: ContractName[] = [
      'RegistrationVerifier',
      'TransferVerifier',
      'MintVerifier',
      'WithdrawVerifier',
      'Registrar',
      'EncryptedERC'
    ];
    
    for (const name of requiredArtifacts) {
      try {
        await this.loadArtifact(name);
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Missing required artifact: ${name}. ${error.message}`);
        }
        throw error;
      }
    }
  }
} 