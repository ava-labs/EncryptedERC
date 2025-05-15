import { ethers } from 'ethers';
import { EncryptedERCParams } from '../types.js';
import { ArtifactLoader } from '../artifacts.js';

interface EncryptedERCLibraryAddresses {
  'contracts/libraries/BabyJubJub.sol:BabyJubJub': string;
}

interface CreateEncryptedERCParams {
  registrar: string;
  mintVerifier: string;
  withdrawVerifier: string;
  transferVerifier: string;
  name: string;
  symbol: string;
  decimals: number;
  isConverter: boolean;
}

export class EncryptedERCFactory {
  private static artifactLoader = new ArtifactLoader();

  static async linkBytecode(libraryAddresses: string): Promise<string> {
    const { bytecode } = await this.artifactLoader.loadArtifact('EncryptedERC');
    let linkedBytecode =  bytecode.replace(
      new RegExp("__\\$3599097dbd61087c0ceb2349e224575c52\\$__", "g"),
      libraryAddresses
      .replace(/^0x/, "")
      .toLowerCase()
    );
    return linkedBytecode;
  }

  static async linkBytecodeNew(libraryAddresses: EncryptedERCLibraryAddresses): Promise<string> {
    const { bytecode, linkReferences } = await this.artifactLoader.loadArtifact('EncryptedERC');
  
    let linkedBytecode = bytecode;
  
    // Traverse the link references object
    for (const fileName in linkReferences) {
      for (const libName in linkReferences[fileName]) {
        const address = libraryAddresses['contracts/libraries/BabyJubJub.sol:BabyJubJub'];
        if (!address) throw new Error(`Missing address for linked library: ${fileName}:${libName}`);
  
        for (const ref of linkReferences[fileName][libName]) {
          const start = 2 + ref.start * 2; // skip '0x' and convert byte offset to hex index
          const length = ref.length * 2;
  
          const addressNoPrefix = address.toLowerCase().replace(/^0x/, '');
          if (addressNoPrefix.length !== length) {
            throw new Error(`Invalid address length for ${libName}: expected ${length} characters`);
          }
  
          linkedBytecode =
            linkedBytecode.slice(0, start) +
            addressNoPrefix +
            linkedBytecode.slice(start + length);
        }
      }
    }
  
    return linkedBytecode;
  }

  async deploy(
    params: EncryptedERCParams,
    libraryAddresses: string,
    signer: ethers.Signer
  ): Promise<ethers.BaseContract> {
    const { abi } = await EncryptedERCFactory.artifactLoader.loadArtifact('EncryptedERC');
    const linkedBytecode = await EncryptedERCFactory.linkBytecode(libraryAddresses);
    
    const factory = new ethers.ContractFactory(abi, linkedBytecode, signer);
    return factory.deploy(
      params
    );
  }

  async getDeployTransaction(
    params: EncryptedERCParams,
    libraryAddresses: string,
    signer: ethers.Signer
  ): Promise<ethers.ContractDeployTransaction> {
    const { abi } = await EncryptedERCFactory.artifactLoader.loadArtifact('EncryptedERC');
    const linkedBytecode = await EncryptedERCFactory.linkBytecode(libraryAddresses);
    
    const factory = new ethers.ContractFactory(abi, linkedBytecode, signer);
    return factory.getDeployTransaction(params);
  }
} 