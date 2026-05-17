"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplicatorModule = void 0;
const common_1 = require("@nestjs/common");
const blockchain_module_1 = require("../blockchain/blockchain.module");
const storage_module_1 = require("../storage/storage.module");
const replicator_service_1 = require("./replicator.service");
let ReplicatorModule = class ReplicatorModule {
};
exports.ReplicatorModule = ReplicatorModule;
exports.ReplicatorModule = ReplicatorModule = __decorate([
    (0, common_1.Module)({
        imports: [blockchain_module_1.BlockchainModule, storage_module_1.StorageModule],
        providers: [replicator_service_1.ReplicatorService],
        exports: [replicator_service_1.ReplicatorService],
    })
], ReplicatorModule);
//# sourceMappingURL=replicator.module.js.map