import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
export interface ChunkUploadedEvent {
    chunkId: string;
    owner: string;
    requiredReplicas: bigint;
    data: string;
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
    queryPayload: string;
}
export declare class BlockchainService implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly logger;
    private provider;
    private wallet;
    private contract;
    private readonly _listeners;
    constructor(config: ConfigService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): void;
    confirmReplication(chunkId: string, cid: string, location: string): Promise<ethers.TransactionReceipt>;
    getChunkMetadata(chunkId: string): Promise<any>;
    isChunkAccessible(chunkId: string, user: string): Promise<boolean>;
    scanPastChunkUploads(startBlock: number): Promise<ChunkUploadedEvent[]>;
    onChunkUploaded(callback: (event: ChunkUploadedEvent) => void): void;
    onChunkCooled(callback: (event: ChunkCooledEvent) => void): void;
    onDataRequested(callback: (event: DataRequestedEvent) => void): void;
    get walletAddress(): string;
    getBlockNumber(): Promise<number>;
}
