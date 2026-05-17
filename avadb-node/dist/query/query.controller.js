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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const query_service_1 = require("./query.service");
const query_dto_1 = require("./dto/query.dto");
let QueryController = class QueryController {
    constructor(queryService) {
        this.queryService = queryService;
    }
    async getStatus() {
        return this.queryService.getNodeStatus();
    }
    async query(dto) {
        const results = await this.queryService.query(dto);
        return { count: results.length, data: results };
    }
    async getChunkMeta(chunkId) {
        return this.queryService.getChunkMeta(chunkId);
    }
    async getChunkData(chunkId, res) {
        const data = await this.queryService.getChunkData(chunkId);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${chunkId}.bin"`);
        res.setHeader('X-Chunk-Id', chunkId);
        res.setHeader('Content-Length', data.length);
        res.send(data);
    }
};
exports.QueryController = QueryController;
__decorate([
    (0, common_1.Get)('status'),
    (0, swagger_1.ApiOperation)({ summary: 'Node health and current block number' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], QueryController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ transform: true, whitelist: true })),
    (0, swagger_1.ApiOperation)({ summary: 'JSON query for stored chunks' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Array of matching chunk records' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_dto_1.QueryDto]),
    __metadata("design:returntype", Promise)
], QueryController.prototype, "query", null);
__decorate([
    (0, common_1.Get)('chunk/:chunkId/meta'),
    (0, swagger_1.ApiOperation)({ summary: 'Get metadata for a specific chunk' }),
    (0, swagger_1.ApiParam)({ name: 'chunkId', description: 'bytes32 hex chunk identifier' }),
    __param(0, (0, common_1.Param)('chunkId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], QueryController.prototype, "getChunkMeta", null);
__decorate([
    (0, common_1.Get)('chunk/:chunkId/data'),
    (0, swagger_1.ApiOperation)({ summary: 'Download raw binary chunk data' }),
    (0, swagger_1.ApiParam)({ name: 'chunkId', description: 'bytes32 hex chunk identifier' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Raw bytes as application/octet-stream',
    }),
    __param(0, (0, common_1.Param)('chunkId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], QueryController.prototype, "getChunkData", null);
exports.QueryController = QueryController = __decorate([
    (0, swagger_1.ApiTags)('AvaDB'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [query_service_1.QueryService])
], QueryController);
//# sourceMappingURL=query.controller.js.map