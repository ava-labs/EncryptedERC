import { Module } from '@nestjs/common';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { StorageModule } from '../storage/storage.module';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [StorageModule, BlockchainModule],
  controllers: [QueryController],
  providers: [QueryService],
})
export class QueryModule { }
