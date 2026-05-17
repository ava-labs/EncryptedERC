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
var RocksDBService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RocksDBService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const rocksdb = require("rocksdb");
const path = require("path");
const fs = require("fs");
let RocksDBService = RocksDBService_1 = class RocksDBService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(RocksDBService_1.name);
        this.ready = false;
    }
    async onModuleInit() {
        const dbPath = this.config.get('rocksdb.path');
        fs.mkdirSync(path.resolve(dbPath), { recursive: true });
        this.db = rocksdb(path.resolve(dbPath));
        await new Promise((resolve, reject) => {
            this.db.open({ createIfMissing: true }, (err) => {
                if (err)
                    return reject(err);
                this.ready = true;
                this.logger.log(`RocksDB opened at ${dbPath}`);
                resolve();
            });
        });
    }
    async onModuleDestroy() {
        if (this.ready) {
            await new Promise((resolve, reject) => {
                this.db.close((err) => {
                    if (err)
                        return reject(err);
                    resolve();
                });
            });
        }
    }
    async putChunk(chunkId, data) {
        return new Promise((resolve, reject) => {
            this.db.put(chunkId, data, (err) => {
                if (err)
                    return reject(err);
                resolve();
            });
        });
    }
    async getChunk(chunkId) {
        return new Promise((resolve, reject) => {
            this.db.get(chunkId, { asBuffer: true }, (err, value) => {
                if (err) {
                    if (err.notFound || err.message?.includes('NotFound')) {
                        return resolve(null);
                    }
                    return reject(err);
                }
                resolve(value);
            });
        });
    }
    async hasChunk(chunkId) {
        const value = await this.getChunk(chunkId);
        return value !== null;
    }
    async deleteChunk(chunkId) {
        return new Promise((resolve, reject) => {
            this.db.del(chunkId, (err) => {
                if (err)
                    return reject(err);
                resolve();
            });
        });
    }
    async listChunkIds() {
        return new Promise((resolve, reject) => {
            const ids = [];
            const iterator = this.db.iterator({ keys: true, values: false });
            const next = () => {
                iterator.next((err, key) => {
                    if (err) {
                        iterator.end(() => reject(err));
                        return;
                    }
                    if (key === undefined) {
                        iterator.end((endErr) => {
                            if (endErr)
                                return reject(endErr);
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
};
exports.RocksDBService = RocksDBService;
exports.RocksDBService = RocksDBService = RocksDBService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RocksDBService);
//# sourceMappingURL=rocksdb.service.js.map