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
var BlockchainService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockchainService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ethers_1 = require("ethers");
const AvaDBStorage_json_1 = require("./abi/AvaDBStorage.json");
let BlockchainService = BlockchainService_1 = class BlockchainService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(BlockchainService_1.name);
        this._listeners = [];
    }
    async onModuleInit() {
        const rpcUrl = this.config.get('blockchain.avadbRpcUrl');
        const privateKey = this.config.get('blockchain.replicatorPrivateKey');
        const contractAddress = this.config.get('blockchain.avadbStorageAddress');
        this.provider = new ethers_1.JsonRpcProvider(rpcUrl);
        this.wallet = new ethers_1.Wallet(privateKey, this.provider);
        this.contract = new ethers_1.Contract(contractAddress, AvaDBStorage_json_1.default, this.wallet);
        this.logger.log(`Connected to AvaDB RPC: ${rpcUrl}`);
        this.logger.log(`Replicator address: ${this.wallet.address}`);
        this.logger.log(`AvaDBStorage contract: ${contractAddress}`);
    }
    onModuleDestroy() {
        this._listeners.forEach((remove) => remove());
        this.provider.removeAllListeners();
    }
    async confirmReplication(chunkId, cid, location) {
        this.logger.debug(`confirmReplication chunkId=${chunkId} cid=${cid}`);
        const tx = await this.contract.confirmReplication(chunkId, cid, location);
        return tx.wait();
    }
    async getChunkMetadata(chunkId) {
        return this.contract.getChunkMetadata(chunkId);
    }
    async isChunkAccessible(chunkId, user) {
        return this.contract.isChunkAccessible(chunkId, user);
    }
    async scanPastChunkUploads(startBlock) {
        this.logger.log(`Scanning past ChunkUploaded events from block ${startBlock}`);
        const filter = this.contract.filters.ChunkUploaded();
        const logs = await this.contract.queryFilter(filter, startBlock, 'latest');
        return logs.map((log) => {
            const parsed = this.contract.interface.parseLog(log);
            return {
                chunkId: parsed.args.chunkId,
                owner: parsed.args.owner,
                requiredReplicas: parsed.args.requiredReplicas,
                data: parsed.args.data,
                isPrivate: parsed.args.isPrivate,
                timestamp: parsed.args.timestamp,
                blockNumber: log.blockNumber,
                transactionHash: log.transactionHash,
            };
        });
    }
    onChunkUploaded(callback) {
        const handler = (chunkId, owner, requiredReplicas, data, isPrivate, timestamp, eventPayload) => {
            callback({
                chunkId,
                owner,
                requiredReplicas,
                data,
                isPrivate,
                timestamp,
                blockNumber: eventPayload.log.blockNumber,
                transactionHash: eventPayload.log.transactionHash,
            });
        };
        this.contract.on('ChunkUploaded', handler);
        this._listeners.push(() => this.contract.off('ChunkUploaded', handler));
    }
    onChunkCooled(callback) {
        const handler = (chunkId, cid, confirmedReplicas) => {
            callback({ chunkId, cid, confirmedReplicas });
        };
        this.contract.on('ChunkCooled', handler);
        this._listeners.push(() => this.contract.off('ChunkCooled', handler));
    }
    onDataRequested(callback) {
        const handler = (chunkId, requester, queryPayload) => {
            callback({ chunkId, requester, queryPayload });
        };
        this.contract.on('DataRequested', handler);
        this._listeners.push(() => this.contract.off('DataRequested', handler));
    }
    get walletAddress() {
        return this.wallet.address;
    }
    async getBlockNumber() {
        return this.provider.getBlockNumber();
    }
};
exports.BlockchainService = BlockchainService;
exports.BlockchainService = BlockchainService = BlockchainService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], BlockchainService);
//# sourceMappingURL=blockchain.service.js.map