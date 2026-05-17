import { Response } from 'express';
import { QueryService } from './query.service';
import { QueryDto } from './dto/query.dto';
export declare class QueryController {
    private readonly queryService;
    constructor(queryService: QueryService);
    getStatus(): Promise<Record<string, unknown>>;
    query(dto: QueryDto): Promise<{
        count: number;
        data: import("../storage/oracle.service").ChunkRecord[];
    }>;
    getChunkMeta(chunkId: string): Promise<import("../storage/oracle.service").ChunkRecord>;
    getChunkData(chunkId: string, res: Response): Promise<void>;
}
