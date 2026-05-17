import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers, Contract, Wallet, JsonRpcProvider } from 'ethers';
import AvaDBStorageAbi from './abi/AvaDBStorage.json';

export interface ChunkUploadedEvent {
  chunkId: string;
  owner: string;
  requiredReplicas: bigint;
  data: string; // hex-encoded bytes
  isPrivate: boolean;
  timestamp: bigint;
  blockNumber: number;
  transactionHash: string;
}

export interface ReplicationConfirmedEvent {
  chunkId: string;
  replicator: string;
  location: string;
  cid: string;
  confirmedReplicas: bigint;
  requiredReplicas: bigint;
}

export interface ChunkCooledEvent {
  chunkId: string;
  cid: string;
  confirmedReplicas: bigint;
}

export interface DataRequestedEvent {
  chunkId: string;
  requester: string;
  queryPayload: string; // hex-encoded bytes
}

@Injectable()
export class BlockchainService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BlockchainService.name);

  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private contract: Contract;

  /** Listeners registered for cleanup on destroy */
  private readonly _listeners: Array<() => void> = [];

  constructor(private readonly config: ConfigService) { }

  async onModuleInit(): Promise<void> {
    const rpcUrl = this.config.get<string>('blockchain.avadbRpcUrl');
    const privateKey = this.config.get<string>('blockchain.replicatorPrivateKey');
    const contractAddress = this.config.get<string>('blockchain.avadbStorageAddress');

    this.provider = new JsonRpcProvider(rpcUrl);
    this.wallet = new Wallet(privateKey, this.provider);

    this.contract = new Contract(contractAddress, AvaDBStorageAbi, this.wallet);

    this.logger.log(`Connected to AvaDB RPC: ${rpcUrl}`);
    this.logger.log(`Replicator address: ${this.wallet.address}`);
    this.logger.log(`AvaDBStorage contract: ${contractAddress}`);
  }

  onModuleDestroy(): void {
    this._listeners.forEach((remove) => remove());
    this.provider.removeAllListeners();
  }

  // ── Contract write ──────────────────────────────────────────────────────────

  /**
   * Call confirmReplication on the AvaDBStorage contract.
   * The replicator wallet must be registered on-chain before calling this.
   */
  async confirmReplication(
    chunkId: string,
    cid: string,
    location: string,
  ): Promise<ethers.TransactionReceipt> {
    this.logger.debug(`confirmReplication chunkId=${chunkId} cid=${cid}`);
    const tx = await this.contract.confirmReplication(chunkId, cid, location);
    return tx.wait();
  }

  // ── Contract reads ──────────────────────────────────────────────────────────

  async getChunkMetadata(chunkId: string): Promise<any> {
    return this.contract.getChunkMetadata(chunkId);
  }

  async isChunkAccessible(chunkId: string, user: string): Promise<boolean> {
    return this.contract.isChunkAccessible(chunkId, user);
  }

  // ── Event scanning ──────────────────────────────────────────────────────────

  /**
   * Scan historical ChunkUploaded events from startBlock to "latest".
   * Used on node startup to catch up with any uploads that happened while
   * the replicator was offline.
   */
  async scanPastChunkUploads(
    startBlock: number,
  ): Promise<ChunkUploadedEvent[]> {
    this.logger.log(`Scanning past ChunkUploaded events from block ${startBlock}`);
    const filter = this.contract.filters.ChunkUploaded();
    const logs = await this.contract.queryFilter(filter, startBlock, 'latest');

    return logs.map((log) => {
      const parsed = this.contract.interface.parseLog(log);
      return {
        chunkId: parsed.args.chunkId,
        owner: parsed.args.owner,
        requiredReplicas: parsed.args.requiredReplicas,
        data: parsed.args.data,
        isPrivate: parsed.args.isPrivate,
        timestamp: parsed.args.timestamp,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      };
    });
  }

  // ── Live event subscriptions ────────────────────────────────────────────────

  /**
   * Subscribe to new ChunkUploaded events and invoke the callback.
   */
  onChunkUploaded(callback: (event: ChunkUploadedEvent) => void): void {
    const handler = (
      chunkId: string,
      owner: string,
      requiredReplicas: bigint,
      data: string,
      isPrivate: boolean,
      timestamp: bigint,
      eventPayload: any,
    ) => {
      callback({
        chunkId,
        owner,
        requiredReplicas,
        data,
        isPrivate,
        timestamp,
        blockNumber: eventPayload.log.blockNumber,
        transactionHash: eventPayload.log.transactionHash,
      });
    };

    this.contract.on('ChunkUploaded', handler);
    this._listeners.push(() => this.contract.off('ChunkUploaded', handler));
  }

  onChunkCooled(callback: (event: ChunkCooledEvent) => void): void {
    const handler = (
      chunkId: string,
      cid: string,
      confirmedReplicas: bigint,
    ) => {
      callback({ chunkId, cid, confirmedReplicas });
    };

    this.contract.on('ChunkCooled', handler);
    this._listeners.push(() => this.contract.off('ChunkCooled', handler));
  }

  onDataRequested(callback: (event: DataRequestedEvent) => void): void {
    const handler = (
      chunkId: string,
      requester: string,
      queryPayload: string,
    ) => {
      callback({ chunkId, requester, queryPayload });
    };

    this.contract.on('DataRequested', handler);
    this._listeners.push(() => this.contract.off('DataRequested', handler));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  get walletAddress(): string {
    return this.wallet.address;
  }

  async getBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }
}
