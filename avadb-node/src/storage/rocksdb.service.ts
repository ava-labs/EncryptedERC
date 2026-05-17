import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as rocksdb from 'rocksdb';
import * as path from 'path';
import * as fs from 'fs';

/**
 * RocksDBService
 *
 * Handles raw binary chunk storage.  Each chunk is stored with key = chunkId
 * (bytes32 hex string) and value = raw bytes Buffer.
 *
 * RocksDB is optimised for sequential write-heavy workloads and large values,
 * making it ideal for binary file/chunk storage.
 */
@Injectable()
export class RocksDBService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RocksDBService.name);
  private db: rocksdb.RocksDB;
  private ready = false;

  constructor(private readonly config: ConfigService) { }

  async onModuleInit(): Promise<void> {
    const dbPath = this.config.get<string>('rocksdb.path');

    // Ensure directory exists
    fs.mkdirSync(path.resolve(dbPath), { recursive: true });

    this.db = rocksdb(path.resolve(dbPath));

    await new Promise<void>((resolve, reject) => {
      this.db.open({ createIfMissing: true }, (err) => {
        if (err) return reject(err);
        this.ready = true;
        this.logger.log(`RocksDB opened at ${dbPath}`);
        resolve();
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.ready) {
      await new Promise<void>((resolve, reject) => {
        this.db.close((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  /**
   * Store a chunk by its chunkId.
   * @param chunkId  hex string (bytes32) — used as the key
   * @param data     Buffer with the raw chunk bytes
   */
  async putChunk(chunkId: string, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.put(chunkId, data, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  /**
   * Retrieve a chunk by its chunkId.
   * @returns Buffer or null when not found
   */
  async getChunk(chunkId: string): Promise<Buffer | null> {
    return new Promise((resolve, reject) => {
      this.db.get(chunkId, { asBuffer: true }, (err, value) => {
        if (err) {
          // RocksDB returns a "NotFound" error when key doesn't exist
          if ((err as any).notFound || err.message?.includes('NotFound')) {
            return resolve(null);
          }
          return reject(err);
        }
        resolve(value as Buffer);
      });
    });
  }

  /**
   * Check if a chunk exists in the store.
   */
  async hasChunk(chunkId: string): Promise<boolean> {
    const value = await this.getChunk(chunkId);
    return value !== null;
  }

  /**
   * Delete a chunk from the store.
   */
  async deleteChunk(chunkId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.del(chunkId, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  /**
   * List all stored chunkIds using an iterator.
   * Use with caution on large datasets — prefer paginated queries via Oracle.
   */
  async listChunkIds(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const ids: string[] = [];
      const iterator = this.db.iterator({ keys: true, values: false });

      const next = () => {
        iterator.next((err, key) => {
          if (err) {
            iterator.end(() => reject(err));
            return;
          }
          if (key === undefined) {
            iterator.end((endErr) => {
              if (endErr) return reject(endErr);
              resolve(ids);
            });
            return;
          }
          ids.push(key.toString());
          next();
        });
      };

      next();
    });
  }
}
