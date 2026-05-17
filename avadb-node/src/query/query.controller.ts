import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { QueryService } from './query.service';
import { QueryDto } from './dto/query.dto';

/**
 * QueryController
 *
 * REST API for querying the AvaDB network from this replicator node.
 *
 * Endpoints:
 *   GET  /status                    — node health + current block
 *   POST /query                     — JSON query language (filter, sort, page)
 *   GET  /chunk/:chunkId/meta       — on-chain metadata for a chunk
 *   GET  /chunk/:chunkId/data       — raw binary data (served as octet-stream)
 */
@ApiTags('AvaDB')
@Controller()
export class QueryController {
  constructor(private readonly queryService: QueryService) { }

  // ── Node status ─────────────────────────────────────────────────────────────

  @Get('status')
  @ApiOperation({ summary: 'Node health and current block number' })
  async getStatus() {
    return this.queryService.getNodeStatus();
  }

  // ── JSON query language ─────────────────────────────────────────────────────

  /**
   * Execute a structured JSON query against the local Oracle index.
   *
   * Example body:
   * ```json
   * {
   *   "filter": { "owner": "0xabc…", "state": 1 },
   *   "orderBy": "uploadedAt",
   *   "order": "desc",
   *   "limit": 20,
   *   "offset": 0
   * }
   * ```
   */
  @Post('query')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'JSON query for stored chunks' })
  @ApiResponse({ status: 200, description: 'Array of matching chunk records' })
  async query(@Body() dto: QueryDto) {
    const results = await this.queryService.query(dto);
    return { count: results.length, data: results };
  }

  // ── Chunk endpoints ─────────────────────────────────────────────────────────

  @Get('chunk/:chunkId/meta')
  @ApiOperation({ summary: 'Get metadata for a specific chunk' })
  @ApiParam({ name: 'chunkId', description: 'bytes32 hex chunk identifier' })
  async getChunkMeta(@Param('chunkId') chunkId: string) {
    return this.queryService.getChunkMeta(chunkId);
  }

  @Get('chunk/:chunkId/data')
  @ApiOperation({ summary: 'Download raw binary chunk data' })
  @ApiParam({ name: 'chunkId', description: 'bytes32 hex chunk identifier' })
  @ApiResponse({
    status: 200,
    description: 'Raw bytes as application/octet-stream',
  })
  async getChunkData(
    @Param('chunkId') chunkId: string,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.queryService.getChunkData(chunkId);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${chunkId}.bin"`);
    res.setHeader('X-Chunk-Id', chunkId);
    res.setHeader('Content-Length', data.length);
    res.send(data);
  }
}
