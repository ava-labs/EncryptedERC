"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ReplicatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplicatorService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto = require("crypto");
const blockchain_service_1 = require("../blockchain/blockchain.service");
const storage_service_1 = require("../storage/storage.service");
let ReplicatorService = ReplicatorService_1 = class ReplicatorService {
    constructor(blockchain, storage, config) {
        this.blockchain = blockchain;
        this.storage = storage;
        this.config = config;
        this.logger = new common_1.Logger(ReplicatorService_1.name);
        this.inFlight = new Set();
    }
    async onModuleInit() {
        this.nodeEndpoint = this.config.get('replication.nodeEndpoint');
        this.concurrency = this.config.get('replication.concurrency');
        this.startBlock = this.config.get('blockchain.startBlock');
        await this._replayCatchup();
        this.blockchain.onChunkUploaded((event) => this._handleChunkUploaded(event));
        this.blockchain.onChunkCooled((event) => this._handleChunkCooled(event));
        this.blockchain.onDataRequested((event) => this._handleDataRequested(event));
        this.logger.log('ReplicatorService initialised and listening for events');
    }
    async _replayCatchup() {
        this.logger.log(`Replaying past events from block ${this.startBlock} …`);
        const events = await this.blockchain.scanPastChunkUploads(this.startBlock);
        this.logger.log(`Found ${events.length} historical ChunkUploaded events`);
        for (let i = 0; i < events.length; i += this.concurrency) {
            const batch = events.slice(i, i + this.concurrency);
            await Promise.all(batch.map((e) => this._replicateChunk(e)));
        }
    }
    async _handleChunkUploaded(event) {
        this.logger.debug(`[live] ChunkUploaded ${event.chunkId}`);
        await this._replicateChunk(event);
    }
    async _handleChunkCooled(event) {
        this.logger.debug(`[live] ChunkCooled ${event.chunkId} → cid=${event.cid}`);
        await this.storage.updateReplicationState(event.chunkId, 1, event.cid, Number(event.confirmedReplicas));
    }
    async _handleDataRequested(event) {
        const has = await this.storage.hasChunk(event.chunkId);
        if (!has)
            return;
        this.logger.debug(`[live] DataRequested ${event.chunkId} by ${event.requester} — we have the data`);
    }
    async _replicateChunk(event) {
        const { chunkId } = event;
        if (this.inFlight.has(chunkId))
            return;
        this.inFlight.add(chunkId);
        try {
            const alreadyStored = await this.storage.hasChunk(chunkId);
            if (alreadyStored) {
                this.logger.debug(`Chunk ${chunkId} already stored — skipping`);
                return;
            }
            const rawBytes = Buffer.from(event.data.startsWith('0x') ? event.data.slice(2) : event.data, 'hex');
            const { ethers } = await Promise.resolve().then(() => require('ethers'));
            const computedId = ethers.keccak256(rawBytes);
            if (computedId.toLowerCase() !== chunkId.toLowerCase()) {
                this.logger.error(`Hash mismatch for chunk ${chunkId}: got ${computedId}`);
                return;
            }
            const cid = '0x' + crypto.createHash('sha256').update(rawBytes).digest('hex');
            await this.storage.storeChunk({
                chunkId,
                owner: event.owner,
                contentHash: chunkId,
                cid,
                requiredReplicas: Number(event.requiredReplicas),
                confirmedReplicas: 0,
                state: 0,
                uploadedAt: new Date(Number(event.timestamp) * 1000),
                isPrivate: event.isPrivate,
                blockNumber: event.blockNumber,
                txHash: event.transactionHash,
            }, rawBytes);
            await this.blockchain.confirmReplication(chunkId, cid, this.nodeEndpoint);
            this.logger.log(`Replicated chunk ${chunkId} (${rawBytes.length} bytes) → cid=${cid}`);
        }
        catch (err) {
            this.logger.error(`Failed to replicate chunk ${chunkId}: ${err.message}`);
        }
        finally {
            this.inFlight.delete(chunkId);
        }
    }
};
exports.ReplicatorService = ReplicatorService;
exports.ReplicatorService = ReplicatorService = ReplicatorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [blockchain_service_1.BlockchainService,
        storage_service_1.StorageService,
        config_1.ConfigService])
], ReplicatorService);
//# sourceMappingURL=replicator.service.js.map