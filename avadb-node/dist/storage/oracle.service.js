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
var OracleService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OracleService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const oracledb = require("oracledb");
let OracleService = OracleService_1 = class OracleService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(OracleService_1.name);
    }
    async onModuleInit() {
        const user = this.config.get('oracle.user');
        const password = this.config.get('oracle.password');
        const connectionString = this.config.get('oracle.connectionString');
        oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
        this.pool = await oracledb.createPool({
            user,
            password,
            connectString: connectionString,
            poolMin: 2,
            poolMax: 10,
            poolIncrement: 1,
        });
        await this._ensureSchema();
        this.logger.log(`Oracle connection pool created (${connectionString})`);
    }
    async onModuleDestroy() {
        await this.pool?.close(0);
    }
    async _ensureSchema() {
        const conn = await this.pool.getConnection();
        try {
            await conn.execute(`
        BEGIN
          EXECUTE IMMEDIATE 'CREATE TABLE CHUNKS (
            CHUNK_ID         VARCHAR2(66)   PRIMARY KEY,
            OWNER            VARCHAR2(42)   NOT NULL,
            CONTENT_HASH     VARCHAR2(66)   NOT NULL,
            CID              VARCHAR2(255),
            REQUIRED_REPLICAS NUMBER(10)   NOT NULL,
            CONFIRMED_REPLICAS NUMBER(10)  DEFAULT 0,
            STATE            NUMBER(1)      DEFAULT 0,
            UPLOADED_AT      TIMESTAMP      NOT NULL,
            IS_PRIVATE       NUMBER(1)      DEFAULT 0,
            BLOCK_NUMBER     NUMBER(20),
            TX_HASH          VARCHAR2(66)
          )';
        EXCEPTION WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
        END;
      `);
            await conn.execute(`
        BEGIN
          EXECUTE IMMEDIATE 'CREATE TABLE CHUNK_REPLICAS (
            CHUNK_ID         VARCHAR2(66)   NOT NULL,
            REPLICATOR       VARCHAR2(42)   NOT NULL,
            LOCATION         VARCHAR2(512),
            CID              VARCHAR2(255),
            CONFIRMED_AT     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT PK_CHUNK_REPLICAS PRIMARY KEY (CHUNK_ID, REPLICATOR)
          )';
        EXCEPTION WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
        END;
      `);
            await conn.commit();
        }
        finally {
            await conn.close();
        }
    }
    async upsertChunk(chunk) {
        const conn = await this.pool.getConnection();
        try {
            await conn.execute(`MERGE INTO CHUNKS c
         USING DUAL
         ON (c.CHUNK_ID = :chunkId)
         WHEN MATCHED THEN UPDATE SET
           CONFIRMED_REPLICAS = :confirmedReplicas,
           STATE              = :state,
           CID                = :cid
         WHEN NOT MATCHED THEN INSERT (
           CHUNK_ID, OWNER, CONTENT_HASH, CID, REQUIRED_REPLICAS,
           CONFIRMED_REPLICAS, STATE, UPLOADED_AT, IS_PRIVATE, BLOCK_NUMBER, TX_HASH
         ) VALUES (
           :chunkId, :owner, :contentHash, :cid, :requiredReplicas,
           :confirmedReplicas, :state, :uploadedAt, :isPrivate, :blockNumber, :txHash
         )`, {
                chunkId: chunk.chunkId,
                owner: chunk.owner,
                contentHash: chunk.contentHash,
                cid: chunk.cid ?? null,
                requiredReplicas: chunk.requiredReplicas,
                confirmedReplicas: chunk.confirmedReplicas,
                state: chunk.state,
                uploadedAt: chunk.uploadedAt,
                isPrivate: chunk.isPrivate ? 1 : 0,
                blockNumber: chunk.blockNumber,
                txHash: chunk.txHash,
            });
            await conn.commit();
        }
        finally {
            await conn.close();
        }
    }
    async updateChunkState(chunkId, state, cid, confirmedReplicas) {
        const conn = await this.pool.getConnection();
        try {
            await conn.execute(`UPDATE CHUNKS SET
           STATE = :state,
           CID   = NVL(:cid, CID),
           CONFIRMED_REPLICAS = NVL(:confirmedReplicas, CONFIRMED_REPLICAS)
         WHERE CHUNK_ID = :chunkId`, {
                state,
                cid: cid ?? null,
                confirmedReplicas: confirmedReplicas ?? null,
                chunkId,
            });
            await conn.commit();
        }
        finally {
            await conn.close();
        }
    }
    async getChunk(chunkId) {
        const conn = await this.pool.getConnection();
        try {
            const result = await conn.execute(`SELECT * FROM CHUNKS WHERE CHUNK_ID = :chunkId`, { chunkId });
            if (!result.rows || result.rows.length === 0)
                return null;
            return this._mapRow(result.rows[0]);
        }
        finally {
            await conn.close();
        }
    }
    async upsertReplica(chunkId, replicator, location, cid) {
        const conn = await this.pool.getConnection();
        try {
            await conn.execute(`MERGE INTO CHUNK_REPLICAS r
         USING DUAL
         ON (r.CHUNK_ID = :chunkId AND r.REPLICATOR = :replicator)
         WHEN MATCHED THEN UPDATE SET LOCATION = :location, CID = :cid
         WHEN NOT MATCHED THEN INSERT (CHUNK_ID, REPLICATOR, LOCATION, CID)
           VALUES (:chunkId, :replicator, :location, :cid)`, { chunkId, replicator, location, cid });
            await conn.commit();
        }
        finally {
            await conn.close();
        }
    }
    async queryChunks(params) {
        const conditions = ['1=1'];
        const binds = {};
        if (params.filter?.owner) {
            conditions.push('OWNER = :owner');
            binds.owner = params.filter.owner;
        }
        if (params.filter?.state !== undefined) {
            conditions.push('STATE = :state');
            binds.state = params.filter.state;
        }
        if (params.filter?.isPrivate !== undefined) {
            conditions.push('IS_PRIVATE = :isPrivate');
            binds.isPrivate = params.filter.isPrivate ? 1 : 0;
        }
        if (params.filter?.chunkId) {
            conditions.push('CHUNK_ID = :chunkId');
            binds.chunkId = params.filter.chunkId;
        }
        if (params.filter?.cid) {
            conditions.push('CID = :cid');
            binds.cid = params.filter.cid;
        }
        const allowedOrderBy = ['UPLOADED_AT', 'CONFIRMED_REPLICAS', 'CHUNK_ID'];
        const rawOrderBy = (params.orderBy ?? 'UPLOADED_AT').toUpperCase();
        const safeOrderBy = allowedOrderBy.includes(rawOrderBy)
            ? rawOrderBy
            : 'UPLOADED_AT';
        const safeOrder = params.order === 'asc' ? 'ASC' : 'DESC';
        const limit = Math.min(params.limit ?? 50, 1000);
        const offset = params.offset ?? 0;
        const sql = `
      SELECT * FROM (
        SELECT c.*, ROWNUM rn FROM CHUNKS c
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${safeOrderBy} ${safeOrder}
      ) WHERE rn > :offset AND rn <= :limitPlusOffset
    `;
        binds.offset = offset;
        binds.limitPlusOffset = offset + limit;
        const conn = await this.pool.getConnection();
        try {
            const result = await conn.execute(sql, binds);
            return (result.rows ?? []).map(this._mapRow);
        }
        finally {
            await conn.close();
        }
    }
    _mapRow(row) {
        return {
            chunkId: row.CHUNK_ID,
            owner: row.OWNER,
            contentHash: row.CONTENT_HASH,
            cid: row.CID,
            requiredReplicas: row.REQUIRED_REPLICAS,
            confirmedReplicas: row.CONFIRMED_REPLICAS,
            state: row.STATE,
            uploadedAt: row.UPLOADED_AT,
            isPrivate: row.IS_PRIVATE === 1,
            blockNumber: row.BLOCK_NUMBER,
            txHash: row.TX_HASH,
        };
    }
};
exports.OracleService = OracleService;
exports.OracleService = OracleService = OracleService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OracleService);
//# sourceMappingURL=oracle.service.js.map