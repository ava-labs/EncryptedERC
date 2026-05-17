export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),

  blockchain: {
    avadbRpcUrl:
      process.env.AVADB_RPC_URL ??
      'http://127.0.0.1:9654/ext/bc/2aaCzyq19qTZLZVzDn2XxQdVwpcq945pwmrUJrdYvufJT7B4KC/rpc',
    avadbChainId: parseInt(process.env.AVADB_CHAIN_ID ?? '1152111412', 10),
    avalancheRpcUrl:
      process.env.AVALANCHE_RPC_URL ??
      'https://api.avax.network/ext/bc/C/rpc',
    avalancheChainId: parseInt(
      process.env.AVALANCHE_CHAIN_ID ?? '43114',
      10,
    ),
    replicatorPrivateKey: process.env.REPLICATOR_PRIVATE_KEY ?? '',
    avadbStorageAddress:
      process.env.AVADB_STORAGE_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    registrarAddress:
      process.env.REGISTRAR_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    startBlock: parseInt(process.env.START_BLOCK ?? '0', 10),
  },

  rocksdb: {
    path: process.env.ROCKSDB_PATH ?? './data/rocksdb',
  },

  oracle: {
    user: process.env.ORACLE_USER ?? 'avadb',
    password: process.env.ORACLE_PASSWORD ?? '',
    connectionString:
      process.env.ORACLE_CONNECTION_STRING ?? 'localhost:1521/XEPDB1',
  },

  replication: {
    nodeEndpoint: process.env.NODE_ENDPOINT ?? 'http://localhost:3000',
    concurrency: parseInt(process.env.REPLICATION_CONCURRENCY ?? '5', 10),
  },
});
