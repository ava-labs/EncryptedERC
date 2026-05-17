import { Module } from '@nestjs/common';
import { RocksDBService } from './rocksdb.service';
import { OracleService } from './oracle.service';
import { StorageService } from './storage.service';

@Module({
  providers: [RocksDBService, OracleService, StorageService],
  exports: [StorageService],
})
export class StorageModule { }
