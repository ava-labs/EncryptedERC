import { Injectable, Logger } from '@nestjs/common';
import { RocksDBService } from './rocksdb.service';
import { OracleService, ChunkRecord } from './oracle.service';

/**
 * StorageService
 *
 * Unified facade that routes:
 *   • binary / file data → RocksDB  (fast key-value, ordered by chunkId)
 *   • structured metadata / JSON    → Oracle (rich queries, exportable)
 *
 * Callers should always use this service rather than touching RocksDB or
 * Oracle directly.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly rocksdb: RocksDBService,
    private readonly oracle: OracleService,
  ) { }

  // ── Write path ──────────────────────────────────────────────────────────────

  /**
   * Persist a chunk to both backends atomically.
   * 1. Raw bytes → RocksDB
   * 2. Metadata record → Oracle
   */
  async storeChunk(
    meta: ChunkRecord,
    rawData: Buffer,
  ): Promise<void> {
    this.logger.debug(`Storing chunk ${meta.chunkId} (${rawData.length} bytes)`);

    await Promise.all([
      this.rocksdb.putChunk(meta.chunkId, rawData),
      this.oracle.upsertChunk(meta),
    ]);
  }

  /**
   * Update the replication state in Oracle (called when a replication is
   * confirmed by the contract).
   */
  async updateReplicationState(
    chunkId: string,
    state: number,
    cid?: string,
    confirmedReplicas?: number,
    replicator?: string,
    location?: string,
  ): Promise<void> {
    const promises: Promise<void>[] = [
      this.oracle.updateChunkState(chunkId, state, cid, confirmedReplicas),
    ];

    if (replicator && location && cid) {
      promises.push(
        this.oracle.upsertReplica(chunkId, replicator, location, cid),
      );
    }

    await Promise.all(promises);
  }

  // ── Read path ───────────────────────────────────────────────────────────────

  /**
   * Retrieve raw chunk bytes from RocksDB.
   */
  async getRawChunk(chunkId: string): Promise<Buffer | null> {
    return this.rocksdb.getChunk(chunkId);
  }

  /**
   * Retrieve chunk metadata from Oracle.
   */
  async getChunkMeta(chunkId: string): Promise<ChunkRecord | null> {
    return this.oracle.getChunk(chunkId);
  }

  /**
   * JSON query interface — delegates to Oracle.
   */
  async queryChunks(params: Parameters<OracleService['queryChunks']>[0]): Promise<ChunkRecord[]> {
    return this.oracle.queryChunks(params);
  }

  /**
   * Check whether this node has a chunk in RocksDB.
   */
  async hasChunk(chunkId: string): Promise<boolean> {
    return this.rocksdb.hasChunk(chunkId);
  }
}
