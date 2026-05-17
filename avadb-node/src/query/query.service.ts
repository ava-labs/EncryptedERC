import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { QueryDto } from './dto/query.dto';
import { ChunkRecord } from '../storage/oracle.service';

@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly blockchain: BlockchainService,
  ) { }

  /**
   * JSON query — returns metadata records matching the filter.
   */
  async query(dto: QueryDto): Promise<ChunkRecord[]> {
    return this.storage.queryChunks({
      filter: dto.filter,
      orderBy: dto.orderBy,
      order: dto.order,
      limit: dto.limit,
      offset: dto.offset,
    });
  }

  /**
   * Retrieve raw binary chunk data from local RocksDB.
   * Falls back to on-chain metadata when local copy is missing.
   */
  async getChunkData(chunkId: string): Promise<Buffer> {
    const raw = await this.storage.getRawChunk(chunkId);
    if (!raw) {
      throw new NotFoundException(
        `Chunk ${chunkId} not found on this node. ` +
        `Query the network for a replicator that holds it.`,
      );
    }
    return raw;
  }

  /**
   * Get chunk metadata — tries local Oracle first, then on-chain.
   */
  async getChunkMeta(chunkId: string): Promise<ChunkRecord> {
    const local = await this.storage.getChunkMeta(chunkId);
    if (local) return local;

    // Fallback: fetch from smart contract
    const onChain = await this.blockchain.getChunkMetadata(chunkId).catch(
      () => null,
    );

    if (!onChain || onChain.owner === '0x0000000000000000000000000000000000000000') {
      throw new NotFoundException(`Chunk ${chunkId} not found`);
    }

    return {
      chunkId,
      owner: onChain.owner,
      contentHash: onChain.contentHash,
      cid: onChain.cid,
      requiredReplicas: Number(onChain.requiredReplicas),
      confirmedReplicas: Number(onChain.confirmedReplicas),
      state: Number(onChain.state),
      uploadedAt: new Date(Number(onChain.uploadedAt) * 1000),
      isPrivate: onChain.isPrivate,
      blockNumber: 0,
      txHash: '',
    };
  }

  /**
   * Health/status of this replicator node.
   */
  async getNodeStatus(): Promise<Record<string, unknown>> {
    const blockNumber = await this.blockchain.getBlockNumber();
    return {
      status: 'ok',
      replicatorAddress: this.blockchain.walletAddress,
      blockNumber,
    };
  }
}
