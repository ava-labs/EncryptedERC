import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class RocksDBService implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly logger;
    private db;
    private ready;
    constructor(config: ConfigService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    putChunk(chunkId: string, data: Buffer): Promise<void>;
    getChunk(chunkId: string): Promise<Buffer | null>;
    hasChunk(chunkId: string): Promise<boolean>;
    deleteChunk(chunkId: string): Promise<void>;
    listChunkIds(): Promise<string[]>;
}
