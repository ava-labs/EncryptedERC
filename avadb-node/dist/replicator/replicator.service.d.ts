import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainService } from '../blockchain/blockchain.service';
import { StorageService } from '../storage/storage.service';
export declare class ReplicatorService implements OnModuleInit {
    private readonly blockchain;
    private readonly storage;
    private readonly config;
    private readonly logger;
    private readonly inFlight;
    private nodeEndpoint;
    private concurrency;
    private startBlock;
    constructor(blockchain: BlockchainService, storage: StorageService, config: ConfigService);
    onModuleInit(): Promise<void>;
    private _replayCatchup;
    private _handleChunkUploaded;
    private _handleChunkCooled;
    private _handleDataRequested;
    private _replicateChunk;
}
