// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem
pragma solidity 0.8.27;

/**
 * @title IAvaDBStorage
 * @notice Interface for the AvaDB decentralized storage contract
 */
interface IAvaDBStorage {
    enum DataState {
        Hot,
        Cool
    }

    struct ChunkMetadata {
        address owner;
        bytes32 contentHash;
        string cid;
        uint256 requiredReplicas;
        uint256 confirmedReplicas;
        DataState state;
        uint256 uploadedAt;
        bool isPrivate;
    }

    // -------------------------------------------------------
    //  Events
    // -------------------------------------------------------

    /**
     * @notice Emitted when a chunk is uploaded. Data is stored in event logs
     *         (calldata), NOT in contract storage, to minimise gas costs.
     */
    event ChunkUploaded(
        bytes32 indexed chunkId,
        address indexed owner,
        uint256 requiredReplicas,
        bytes data,
        bool isPrivate,
        uint256 timestamp
    );

    /// @notice Emitted when a replicator confirms they stored a chunk
    event ReplicationConfirmed(
        bytes32 indexed chunkId,
        address indexed replicator,
        string location,
        string cid,
        uint256 confirmedReplicas,
        uint256 requiredReplicas
    );

    /// @notice Emitted once the replication threshold (default 60%) is reached
    event ChunkCooled(
        bytes32 indexed chunkId,
        string cid,
        uint256 confirmedReplicas
    );

    /// @notice Emitted when a user requests data for a chunk
    event DataRequested(
        bytes32 indexed chunkId,
        address indexed requester,
        bytes queryPayload
    );

    event AccessGranted(
        bytes32 indexed chunkId,
        address indexed owner,
        address indexed grantee
    );

    event AccessRevoked(
        bytes32 indexed chunkId,
        address indexed owner,
        address indexed grantee
    );

    event ReplicatorRegistered(address indexed replicator);
    event ReplicatorRemoved(address indexed replicator);

    // -------------------------------------------------------
    //  Mutative functions
    // -------------------------------------------------------

    function uploadChunk(
        bytes calldata data,
        uint256 requiredReplicas,
        bool isPrivate
    ) external returns (bytes32 chunkId);

    function confirmReplication(
        bytes32 chunkId,
        string calldata cid,
        string calldata location
    ) external;

    function requestData(
        bytes32 chunkId,
        bytes calldata queryPayload
    ) external;

    function grantAccess(bytes32 chunkId, address grantee) external;

    function revokeAccess(bytes32 chunkId, address grantee) external;

    // -------------------------------------------------------
    //  View functions
    // -------------------------------------------------------

    function getChunkMetadata(
        bytes32 chunkId
    ) external view returns (ChunkMetadata memory);

    function isChunkAccessible(
        bytes32 chunkId,
        address user
    ) external view returns (bool);
}
