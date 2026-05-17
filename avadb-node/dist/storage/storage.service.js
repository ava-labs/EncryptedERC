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
var StorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const common_1 = require("@nestjs/common");
const rocksdb_service_1 = require("./rocksdb.service");
const oracle_service_1 = require("./oracle.service");
let StorageService = StorageService_1 = class StorageService {
    constructor(rocksdb, oracle) {
        this.rocksdb = rocksdb;
        this.oracle = oracle;
        this.logger = new common_1.Logger(StorageService_1.name);
    }
    async storeChunk(meta, rawData) {
        this.logger.debug(`Storing chunk ${meta.chunkId} (${rawData.length} bytes)`);
        await Promise.all([
            this.rocksdb.putChunk(meta.chunkId, rawData),
            this.oracle.upsertChunk(meta),
        ]);
    }
    async updateReplicationState(chunkId, state, cid, confirmedReplicas, replicator, location) {
        const promises = [
            this.oracle.updateChunkState(chunkId, state, cid, confirmedReplicas),
        ];
        if (replicator && location && cid) {
            promises.push(this.oracle.upsertReplica(chunkId, replicator, location, cid));
        }
        await Promise.all(promises);
    }
    async getRawChunk(chunkId) {
        return this.rocksdb.getChunk(chunkId);
    }
    async getChunkMeta(chunkId) {
        return this.oracle.getChunk(chunkId);
    }
    async queryChunks(params) {
        return this.oracle.queryChunks(params);
    }
    async hasChunk(chunkId) {
        return this.rocksdb.hasChunk(chunkId);
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = StorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [rocksdb_service_1.RocksDBService,
        oracle_service_1.OracleService])
], StorageService);
//# sourceMappingURL=storage.service.js.map