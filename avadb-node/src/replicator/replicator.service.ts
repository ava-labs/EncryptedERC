import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  BlockchainService,
  ChunkUploadedEvent,
  ChunkCooledEvent,
  DataRequestedEvent,
} from '../blockchain/blockchain.service';
import { StorageService } from '../storage/storage.service';

/**
 * ReplicatorService
 *
 * Core replicator logic:
 *
 * 1. On startup, scan all past `ChunkUploaded` events from `startBlock`
 *    and replicate any chunks that this node has not yet stored.
 *
 * 2. Subscribe to live `ChunkUploaded` events and immediately replicate.
 *
 * 3. Subscribe to `ChunkCooled` events to update local state.
 *
 * 4. Subscribe to `DataRequested` events and serve data if this node
 *    holds the relevant chunk.
 *
 * Replication flow per chunk:
 *   a) Extract raw bytes from the event `data` field
 *   b) Verify content hash (keccak256 == chunkId)
 *   c) Store in RocksDB + Oracle
 *   d) Compute CID (sha256 of raw bytes, hex-prefixed)
 *   e) Call `confirmReplication(chunkId, cid, nodeEndpoint)` on-chain
 */
@Injectable()
export class ReplicatorService implements OnModuleInit {
  private readonly logger = new Logger(ReplicatorService.name);

  /** Queue to avoid concurrent replication of the same chunk */
  private readonly inFlight = new Set<string>();

  private nodeEndpoint: string;
  private concurrency: number;
  private startBlock: number;

  constructor(
    private readonly blockchain: BlockchainService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) { }

  async onModuleInit(): Promise<void> {
    this.nodeEndpoint = this.config.get<string>('replication.nodeEndpoint');
    this.concurrency = this.config.get<number>('replication.concurrency');
    this.startBlock = this.config.get<number>('blockchain.startBlock');

    // ── 1. Catch up with historical events ────────────────────────────────
    await this._replayCatchup();

    // ── 2. Subscribe to live events ───────────────────────────────────────
    this.blockchain.onChunkUploaded((event) =>
      this._handleChunkUploaded(event),
    );

    this.blockchain.onChunkCooled((event) =>
      this._handleChunkCooled(event),
    );

    this.blockchain.onDataRequested((event) =>
      this._handleDataRequested(event),
    );

    this.logger.log('ReplicatorService initialised and listening for events');
  }

  // ── Historical replay ───────────────────────────────────────────────────────

  private async _replayCatchup(): Promise<void> {
    this.logger.log(`Replaying past events from block ${this.startBlock} …`);
    const events = await this.blockchain.scanPastChunkUploads(this.startBlock);
    this.logger.log(`Found ${events.length} historical ChunkUploaded events`);

    // Process in batches limited by concurrency
    for (let i = 0; i < events.length; i += this.concurrency) {
      const batch = events.slice(i, i + this.concurrency);
      await Promise.all(batch.map((e) => this._replicateChunk(e)));
    }
  }

  // ── Live event handlers ─────────────────────────────────────────────────────

  private async _handleChunkUploaded(event: ChunkUploadedEvent): Promise<void> {
    this.logger.debug(`[live] ChunkUploaded ${event.chunkId}`);
    await this._replicateChunk(event);
  }

  private async _handleChunkCooled(event: ChunkCooledEvent): Promise<void> {
    this.logger.debug(
      `[live] ChunkCooled ${event.chunkId} → cid=${event.cid}`,
    );
    await this.storage.updateReplicationState(
      event.chunkId,
      1 /* Cool */,
      event.cid,
      Number(event.confirmedReplicas),
    );
  }

  private async _handleDataRequested(event: DataRequestedEvent): Promise<void> {
    const has = await this.storage.hasChunk(event.chunkId);
    if (!has) return; // another node will serve it

    this.logger.debug(
      `[live] DataRequested ${event.chunkId} by ${event.requester} — we have the data`,
    );

    // The actual data serving happens via the HTTP query API (QueryController).
    // Here we just log that this node is a candidate to serve.
  }

  // ── Replication core ────────────────────────────────────────────────────────

  private async _replicateChunk(event: ChunkUploadedEvent): Promise<void> {
    const { chunkId } = event;

    if (this.inFlight.has(chunkId)) return;
    this.inFlight.add(chunkId);

    try {
      // Skip if we already have this chunk locally
      const alreadyStored = await this.storage.hasChunk(chunkId);
      if (alreadyStored) {
        this.logger.debug(`Chunk ${chunkId} already stored — skipping`);
        return;
      }

      // ── a) Decode raw bytes from event ──────────────────────────────────
      const rawBytes = Buffer.from(
        event.data.startsWith('0x') ? event.data.slice(2) : event.data,
        'hex',
      );

      // ── b) Verify content hash ──────────────────────────────────────────
      const { ethers } = await import('ethers');
      const computedId = ethers.keccak256(rawBytes);
      if (computedId.toLowerCase() !== chunkId.toLowerCase()) {
        this.logger.error(
          `Hash mismatch for chunk ${chunkId}: got ${computedId}`,
        );
        return;
      }

      // ── c) Compute CID (sha256 hex) ─────────────────────────────────────
      const cid = '0x' + crypto.createHash('sha256').update(rawBytes).digest('hex');

      // ── d) Persist in RocksDB + Oracle ──────────────────────────────────
      await this.storage.storeChunk(
        {
          chunkId,
          owner: event.owner,
          contentHash: chunkId,
          cid,
          requiredReplicas: Number(event.requiredReplicas),
          confirmedReplicas: 0,
          state: 0 /* Hot */,
          uploadedAt: new Date(Number(event.timestamp) * 1000),
          isPrivate: event.isPrivate,
          blockNumber: event.blockNumber,
          txHash: event.transactionHash,
        },
        rawBytes,
      );

      // ── e) Confirm replication on-chain ─────────────────────────────────
      await this.blockchain.confirmReplication(
        chunkId,
        cid,
        this.nodeEndpoint,
      );

      this.logger.log(
        `Replicated chunk ${chunkId} (${rawBytes.length} bytes) → cid=${cid}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to replicate chunk ${chunkId}: ${(err as Error).message}`,
      );
    } finally {
      this.inFlight.delete(chunkId);
    }
  }
}
