declare const _default: () => {
    port: number;
    blockchain: {
        avadbRpcUrl: string;
        avadbChainId: number;
        avalancheRpcUrl: string;
        avalancheChainId: number;
        replicatorPrivateKey: string;
        avadbStorageAddress: string;
        registrarAddress: string;
        startBlock: number;
    };
    rocksdb: {
        path: string;
    };
    oracle: {
        user: string;
        password: string;
        connectionString: string;
    };
    replication: {
        nodeEndpoint: string;
        concurrency: number;
    };
};
export default _default;
