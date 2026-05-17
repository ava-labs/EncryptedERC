import { StorageService } from '../storage/storage.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { QueryDto } from './dto/query.dto';
import { ChunkRecord } from '../storage/oracle.service';
export declare class QueryService {
    private readonly storage;
    private readonly blockchain;
    private readonly logger;
    constructor(storage: StorageService, blockchain: BlockchainService);
    query(dto: QueryDto): Promise<ChunkRecord[]>;
    getChunkData(chunkId: string): Promise<Buffer>;
    getChunkMeta(chunkId: string): Promise<ChunkRecord>;
    getNodeStatus(): Promise<Record<string, unknown>>;
}
