import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { BlockchainModule } from './blockchain/blockchain.module';
import { StorageModule } from './storage/storage.module';
import { ReplicatorModule } from './replicator/replicator.module';
import { QueryModule } from './query/query.module';

@Module({
  imports: [
    // Load env vars and config factory globally
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
    }),
    BlockchainModule,
    StorageModule,
    ReplicatorModule,
    QueryModule,
  ],
})
export class AppModule { }
