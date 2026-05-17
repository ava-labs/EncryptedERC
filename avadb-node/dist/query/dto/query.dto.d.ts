export declare class QueryFilterDto {
    owner?: string;
    state?: number;
    isPrivate?: boolean;
    chunkId?: string;
    cid?: string;
}
export declare class QueryDto {
    filter?: QueryFilterDto;
    orderBy?: string;
    order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
}
