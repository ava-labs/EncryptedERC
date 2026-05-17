import { RocksDBService } from './rocksdb.service';
import { OracleService, ChunkRecord } from './oracle.service';
export declare class StorageService {
    private readonly rocksdb;
    private readonly oracle;
    private readonly logger;
    constructor(rocksdb: RocksDBService, oracle: OracleService);
    storeChunk(meta: ChunkRecord, rawData: Buffer): Promise<void>;
    updateReplicationState(chunkId: string, state: number, cid?: string, confirmedReplicas?: number, replicator?: string, location?: string): Promise<void>;
    getRawChunk(chunkId: string): Promise<Buffer | null>;
    getChunkMeta(chunkId: string): Promise<ChunkRecord | null>;
    queryChunks(params: Parameters<OracleService['queryChunks']>[0]): Promise<ChunkRecord[]>;
    hasChunk(chunkId: string): Promise<boolean>;
}
