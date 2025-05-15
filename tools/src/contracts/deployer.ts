import { ethers } from 'ethers';
import { ArtifactLoader } from './artifacts.js';
import { DeployConfig, DeployResult, ContractName, EncryptedERCParams, REQUIRED_LIBRARIES } from './types.js';
import { EncryptedERCFactory } from './factories/EncryptedERCFactory.js';
import ora, { Ora } from 'ora';
import inquirer from 'inquirer';

interface Logger {
  step(message: string): void;
  success(message: string): void;
  warning(message: string): void;
  error(message: string): void;
  gasEstimate(contract: string, gas: bigint): void;
}

export class ContractDeployer {
  private artifactLoader: ArtifactLoader;
  private deployedAddresses: Map<string, string> = new Map();
  private spinner: Ora;

  constructor(
    private provider: ethers.Provider,
    private signer: ethers.Signer,
    private logger: Logger
  ) {
    this.artifactLoader = new ArtifactLoader();
    this.spinner = ora({
      text: 'Starting deployment...',
      color: 'cyan'
    });
  }

  async deployAll(config: DeployConfig, dryRun: boolean = false): Promise<DeployResult> {
    this.spinner.start('Initializing deployment...');
    
    const result: DeployResult = {
      network: await this.provider.getNetwork(),
      contracts: {},
      timestamp: new Date().toISOString()
    };

    try {
      this.spinner.text = 'Setting up verifier contracts...';
      
      // Deploy or use existing contracts
      const registrationVerifierAddress = await this.handleContractDeployment(
        'RegistrationVerifier',
        [],
        config.existingAddresses?.RegistrationVerifier,
        dryRun
      );
      result.contracts.RegistrationVerifier = registrationVerifierAddress;
      this.deployedAddresses.set('RegistrationVerifier', registrationVerifierAddress);

      const mintVerifierAddress = await this.handleContractDeployment(
        'MintVerifier',
        [],
        config.existingAddresses?.MintVerifier,
        dryRun
      );
      result.contracts.MintVerifier = mintVerifierAddress;
      this.deployedAddresses.set('MintVerifier', mintVerifierAddress);

      const withdrawVerifierAddress = await this.handleContractDeployment(
        'WithdrawVerifier',
        [],
        config.existingAddresses?.WithdrawVerifier,
        dryRun
      );
      result.contracts.WithdrawVerifier = withdrawVerifierAddress;
      this.deployedAddresses.set('WithdrawVerifier', withdrawVerifierAddress);

      const transferVerifierAddress = await this.handleContractDeployment(
        'TransferVerifier',
        [],
        config.existingAddresses?.TransferVerifier,
        dryRun
      );
      result.contracts.TransferVerifier = transferVerifierAddress;
      this.deployedAddresses.set('TransferVerifier', transferVerifierAddress);

      const babyJubJubAddress = await this.handleContractDeployment(
        'BabyJubJub',
        [],
        config.existingAddresses?.BabyJubJub,
        dryRun
      );
      result.contracts.BabyJubJub = babyJubJubAddress;
      this.deployedAddresses.set('BabyJubJub', babyJubJubAddress);

      const registrarAddress = await this.handleContractDeployment(
        'Registrar',
        [registrationVerifierAddress],
        config.existingAddresses?.Registrar,
        dryRun
      );
      result.contracts.Registrar = registrarAddress;
      this.deployedAddresses.set('Registrar', registrarAddress);

      // Always deploy new EncryptedERC
      const encryptedERCAddress = await this.deployEncryptedERC({
        registrar: registrarAddress,
        mintVerifier: mintVerifierAddress,
        withdrawVerifier: withdrawVerifierAddress,
        transferVerifier: transferVerifierAddress,
        name: config.name,
        symbol: config.symbol,
        decimals: config.decimals,
        isConverter: config.isConverter
      }, dryRun);
      result.contracts.EncryptedERC = encryptedERCAddress;
      this.deployedAddresses.set('EncryptedERC', encryptedERCAddress);

      this.spinner.succeed('All contracts deployed successfully!');
      return result;
    } catch (error: any) {
      this.spinner.fail(`${error.message}`);
      process.exit(1);
    }
  }

  private async handleContractDeployment(
    contractName: ContractName,
    args: any[],
    existingAddress: string | undefined,
    dryRun: boolean
  ): Promise<string> {
    if (existingAddress && !dryRun) {
      this.spinner.stop();
      const { useExisting } = await inquirer.prompt([{
        type: 'confirm',
        name: 'useExisting',
        message: `Found existing ${contractName} at ${existingAddress}. Use this address?`,
        default: true
      }]);
      this.spinner.start();

      if (useExisting && !dryRun) {
        this.logger.success(`Using existing ${contractName} at: ${existingAddress}`);
        return existingAddress;
      }
    }

    this.spinner.text = `Deploying ${contractName}...`;
    const contract = await this.deployContract(contractName, args, dryRun);
    const address = await contract.getAddress();
    if(!dryRun)
      this.logger.success(`${contractName} deployed at: ${address}`);
    return address;
  }

  private async deployEncryptedERC(
    params: EncryptedERCParams,
    dryRun: boolean
  ): Promise<string> {
    this.spinner.text = 'Deploying EncryptedERC...';
    const babyJubJubAddress = this.deployedAddresses.get('BabyJubJub');
    if (!babyJubJubAddress) {
      throw new Error('BabyJubJub library not deployed');
    }

    const factory = new EncryptedERCFactory();
    
    if (dryRun) {
      try {
        const deployTx = await factory.getDeployTransaction(
          params,
          babyJubJubAddress,
          this.signer
        );
        const gasEstimate = await this.provider.estimateGas(deployTx);
        this.logger.gasEstimate('EncryptedERC', gasEstimate);
        
        const from = await this.signer.getAddress();
        const nonce = await this.provider.getTransactionCount(from);
        const dummyAddress = ethers.getCreateAddress({ from, nonce });
        
        this.logger.success(`EncryptedERC (dry-run) would be deployed to: ${dummyAddress}`);
        return dummyAddress;
      } catch (error: any) {
        this.logger.error(`Failed to estimate gas for EncryptedERC: ${error.message}`);
        throw error;
      }
    }

    try {
      const contract = await factory.deploy(
        params,
        babyJubJubAddress,
        this.signer
      );
      
      const address = await contract.getAddress();
      this.logger.success(`EncryptedERC deployed to: ${address}`);
      return address;
    } catch (error: any) {
      throw error;
    }
  }

  private async deployContract(
    name: ContractName,
    args: any[],
    dryRun: boolean
  ): Promise<ethers.BaseContract> {
    const { abi, bytecode } = await this.artifactLoader.loadArtifact(name);
    const factory = new ethers.ContractFactory(abi, bytecode, this.signer);
    
    if (dryRun) {
      const deployTx = await factory.getDeployTransaction(...args);
      const gasEstimate = await this.provider.estimateGas(deployTx);
      this.logger.gasEstimate(name, gasEstimate);
      
      const dummyAddress = ethers.getCreateAddress({
        from: await this.signer.getAddress(),
        nonce: await this.provider.getTransactionCount(await this.signer.getAddress())
      });
      
      return new ethers.Contract(dummyAddress, abi, this.signer);
    }

    const contract = await factory.deploy(...args);
    await contract.waitForDeployment();
    const deployedContract = await contract.getDeployedCode();
    if (!deployedContract) {
      throw new Error(`Failed to deploy ${name}`);
    }
    return contract;
  }
} 