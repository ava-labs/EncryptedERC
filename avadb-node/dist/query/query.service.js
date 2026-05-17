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
var QueryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryService = void 0;
const common_1 = require("@nestjs/common");
const storage_service_1 = require("../storage/storage.service");
const blockchain_service_1 = require("../blockchain/blockchain.service");
let QueryService = QueryService_1 = class QueryService {
    constructor(storage, blockchain) {
        this.storage = storage;
        this.blockchain = blockchain;
        this.logger = new common_1.Logger(QueryService_1.name);
    }
    async query(dto) {
        return this.storage.queryChunks({
            filter: dto.filter,
            orderBy: dto.orderBy,
            order: dto.order,
            limit: dto.limit,
            offset: dto.offset,
        });
    }
    async getChunkData(chunkId) {
        const raw = await this.storage.getRawChunk(chunkId);
        if (!raw) {
            throw new common_1.NotFoundException(`Chunk ${chunkId} not found on this node. ` +
                `Query the network for a replicator that holds it.`);
        }
        return raw;
    }
    async getChunkMeta(chunkId) {
        const local = await this.storage.getChunkMeta(chunkId);
        if (local)
            return local;
        const onChain = await this.blockchain.getChunkMetadata(chunkId).catch(() => null);
        if (!onChain || onChain.owner === '0x0000000000000000000000000000000000000000') {
            throw new common_1.NotFoundException(`Chunk ${chunkId} not found`);
        }
        return {
            chunkId,
            owner: onChain.owner,
            contentHash: onChain.contentHash,
            cid: onChain.cid,
            requiredReplicas: Number(onChain.requiredReplicas),
            confirmedReplicas: Number(onChain.confirmedReplicas),
            state: Number(onChain.state),
            uploadedAt: new Date(Number(onChain.uploadedAt) * 1000),
            isPrivate: onChain.isPrivate,
            blockNumber: 0,
            txHash: '',
        };
    }
    async getNodeStatus() {
        const blockNumber = await this.blockchain.getBlockNumber();
        return {
            status: 'ok',
            replicatorAddress: this.blockchain.walletAddress,
            blockNumber,
        };
    }
};
exports.QueryService = QueryService;
exports.QueryService = QueryService = QueryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [storage_service_1.StorageService,
        blockchain_service_1.BlockchainService])
], QueryService);
//# sourceMappingURL=query.service.js.map