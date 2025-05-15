import { TokenConfig as ConfigTokenConfig } from '../config/types.js';
import { Network } from 'ethers';

export interface ContractArtifact {
  abi: any[];
  bytecode: string;
}

export interface DeploymentResult {
  network: string;
  timestamp: string;
  contracts: {
    registrationVerifier: string;
    transferVerifier: string;
    mintVerifier: string;
    withdrawVerifier: string;
    registrar: string;
    encryptedERC: string;
  };
  config: ConfigTokenConfig;
}

export interface WalletOptions {
  privateKey?: string;
  encryptedKey?: string;
  passphrase?: string;
}

export interface DeployOptions {
  configPath?: string;
  outputPath?: string;
  wallet?: WalletOptions;
  verbose?: boolean;
  dryRun?: boolean;
}

export const REQUIRED_ARTIFACTS = [
  'RegistrationVerifier',
  'TransferVerifier',
  'MintVerifier',
  'WithdrawVerifier',
  'Registrar',
  'EncryptedERC'
] as const;

export type ArtifactName = typeof REQUIRED_ARTIFACTS[number];

// Re-export TokenConfig for convenience
export type TokenConfig = ConfigTokenConfig;

export interface DeployConfig {
  rpcUrl: string;
  name: string;
  symbol: string;
  decimals: number;
  isConverter: boolean;
  existingAddresses?: {
    RegistrationVerifier?: string;
    MintVerifier?: string;
    WithdrawVerifier?: string;
    TransferVerifier?: string;
    BabyJubJub?: string;
    Registrar?: string;
  };
}

export interface DeployResult {
  network: Network;
  contracts: {
    [key: string]: string;
  };
  timestamp: string;
}

export interface EncryptedERCParams {
  registrar: string;
  mintVerifier: string;
  withdrawVerifier: string;
  transferVerifier: string;
  name: string;
  symbol: string;
  decimals: number;
  isConverter: boolean;
}

export interface LibraryConfig {
  name: string;
  path: string;
}

export const REQUIRED_LIBRARIES: LibraryConfig[] = [
  {
    name: 'BabyJubJub',
    path: 'contracts/libraries/BabyJubJub.sol:BabyJubJub'
  }
];

export type ContractName = 
  | 'RegistrationVerifier'
  | 'TransferVerifier'
  | 'MintVerifier'
  | 'WithdrawVerifier'
  | 'Registrar'
  | 'EncryptedERC'
  | 'BabyJubJub'; 