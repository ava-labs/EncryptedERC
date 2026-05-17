import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export interface ChunkRecord {
    chunkId: string;
    owner: string;
    contentHash: string;
    cid: string;
    requiredReplicas: number;
    confirmedReplicas: number;
    state: number;
    uploadedAt: Date;
    isPrivate: boolean;
    blockNumber: number;
    txHash: string;
}
export declare class OracleService implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly logger;
    private pool;
    constructor(config: ConfigService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private _ensureSchema;
    upsertChunk(chunk: ChunkRecord): Promise<void>;
    updateChunkState(chunkId: string, state: number, cid?: string, confirmedReplicas?: number): Promise<void>;
    getChunk(chunkId: string): Promise<ChunkRecord | null>;
    upsertReplica(chunkId: string, replicator: string, location: string, cid: string): Promise<void>;
    queryChunks(params: {
        filter?: Partial<{
            owner: string;
            state: number;
            isPrivate: boolean;
            chunkId: string;
            cid: string;
        }>;
        orderBy?: string;
        order?: 'asc' | 'desc';
        limit?: number;
        offset?: number;
    }): Promise<ChunkRecord[]>;
    private _mapRow;
}
