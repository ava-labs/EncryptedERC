import { Module } from '@nestjs/common';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { StorageModule } from '../storage/storage.module';
import { ReplicatorService } from './replicator.service';

@Module({
  imports: [BlockchainModule, StorageModule],
  providers: [ReplicatorService],
  exports: [ReplicatorService],
})
export class ReplicatorModule { }
