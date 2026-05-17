// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem
pragma solidity 0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IRegistrar} from "../interfaces/IRegistrar.sol";
import {IAvaDBStorage} from "./interfaces/IAvaDBStorage.sol";
import {
    AvaDB_ChunkNotFound,
    AvaDB_AlreadyUploaded,
    AvaDB_NotOwner,
    AvaDB_AccessDenied,
    AvaDB_ChunkAlreadyCool,
    AvaDB_NotReplicator,
    AvaDB_AlreadyReplicated,
    AvaDB_InvalidReplicas,
    AvaDB_UserNotRegistered
} from "./errors/AvaDBErrors.sol";

//             /$$$$$$                        /$$$$$$$  /$$$$$$
//            /$$__  $$                      | $$__  $$| $$__  $$
//   /$$$$$$$/$$  \ $$/$$    /$$  /$$$$$$   | $$  \ $$| $$  \ $$
//  |______ /$$$$$$$|  $$   /$$/|      $$  | $$  | $$| $$$$$$$ /
//   /$$$$$|$$__  $$ \  $$ /$$/ | $$$$$$$  | $$  | $$| $$__  $$
//  /$$__  $$ $$  \ $$  \  $$$/ /$$__  $$  | $$  | $$| $$  \ $$
// |  $$$$$$ $$  | $$ $$  \     /  $$$$$$$  | $$$$$$$/ | $$$$$$$/
//  \_______\__/  |__/__/  \___/\_________/  |_______/ |_______/
//
/**
 * @title AvaDBStorage
 * @notice Decentralised, privacy-preserving chunk storage built on Avalanche.
 *
 * @dev Architecture overview
 * ─────────────────────────
 *  HOT STATE  — When a chunk is uploaded, its raw bytes are emitted inside a
 *               `ChunkUploaded` event (calldata → logs, ~8 gas/non-zero byte).
 *               Only minimal metadata is written to contract storage so that
 *               upload remains cheap.  Replicator nodes scan the event log,
 *               pull the data and persist it locally (RocksDB for binary
 *               blobs, Oracle for structured JSON objects).
 *
 *  COOL STATE — Once the fraction of confirmed replicators reaches
 *               `replicationThreshold`% of `requiredReplicas`, the chunk
 *               transitions to Cool.  The raw bytes are no longer referenced
 *               on-chain; only the content-addressed CID survives in storage.
 *               Future readers ask any replicator for the data via the
 *               `DataRequested` event / off-chain query API.
 *
 *  ACCESS CONTROL — Uploads can be marked `isPrivate`.  Private chunks are
 *                   only retrievable by the owner and explicitly granted
 *                   addresses.  Callers must also be registered in the shared
 *                   Registrar (same identity layer used by EncryptedERC).
 */
contract AvaDBStorage is Ownable, IAvaDBStorage {
    ///////////////////////////////////////////////////
    ///                State Variables              ///
    ///////////////////////////////////////////////////

    /// @notice Registrar used for caller identity verification
    IRegistrar public registrar;

    /// @notice Percentage of requiredReplicas that must confirm before cool
    ///         transition (default 60, range 1–100)
    uint256 public replicationThreshold = 60;

    /// @notice Chunk metadata: chunkId → ChunkMetadata
    mapping(bytes32 chunkId => ChunkMetadata meta) private _chunks;

    /// @notice Per-chunk read-access list for private data
    mapping(bytes32 chunkId => mapping(address user => bool allowed))
        public hasAccess;

    /// @notice Storage location reported by each replicator for a given chunk
    mapping(bytes32 chunkId => mapping(address replicator => string location))
        public replicatorLocations;

    /// @notice Addresses authorised to call confirmReplication
    mapping(address replicator => bool active) public registeredReplicators;

    ///////////////////////////////////////////////////
    ///                  Constructor                ///
    ///////////////////////////////////////////////////

    /**
     * @param registrar_ Address of the shared Registrar contract
     */
    constructor(address registrar_) Ownable(msg.sender) {
        registrar = IRegistrar(registrar_);
    }

    ///////////////////////////////////////////////////
    ///           Replicator Administration         ///
    ///////////////////////////////////////////////////

    /**
     * @notice Allows the contract owner to whitelist a replicator node address
     * @param replicator The address to register
     */
    function registerReplicator(address replicator) external onlyOwner {
        registeredReplicators[replicator] = true;
        emit ReplicatorRegistered(replicator);
    }

    /**
     * @notice Remove a replicator from the whitelist
     * @param replicator The address to remove
     */
    function removeReplicator(address replicator) external onlyOwner {
        registeredReplicators[replicator] = false;
        emit ReplicatorRemoved(replicator);
    }

    /**
     * @notice Update the replication threshold percentage (1–100)
     * @param threshold New percentage value
     */
    function setReplicationThreshold(uint256 threshold) external onlyOwner {
        require(threshold > 0 && threshold <= 100, "AvaDB: invalid threshold");
        replicationThreshold = threshold;
    }

    ///////////////////////////////////////////////////
    ///                   Upload                    ///
    ///////////////////////////////////////////////////

    /**
     * @notice Upload a data chunk.
     *
     * @dev Gas design — The raw `data` bytes are intentionally NOT stored in
     *      contract state (which costs 20 000 gas per new 32-byte word).
     *      Instead they are emitted via the `ChunkUploaded` event so that
     *      replicator nodes can retrieve them from the transaction log at
     *      negligible cost (~375 gas/log topic + ~8 gas per non-zero byte).
     *      Only lightweight metadata goes into storage.
     *
     * @param data             Raw bytes of the chunk to store
     * @param requiredReplicas Number of replicators expected to store the data
     * @param isPrivate        When true only owner and granted addresses can read
     * @return chunkId         keccak256 hash of `data`, used as the chunk identifier
     */
    function uploadChunk(
        bytes calldata data,
        uint256 requiredReplicas,
        bool isPrivate
    ) external returns (bytes32 chunkId) {
        if (!registrar.isUserRegistered(msg.sender))
            revert AvaDB_UserNotRegistered();
        if (requiredReplicas == 0) revert AvaDB_InvalidReplicas();

        chunkId = keccak256(data);

        if (_chunks[chunkId].owner != address(0)) revert AvaDB_AlreadyUploaded();

        _chunks[chunkId] = ChunkMetadata({
            owner: msg.sender,
            contentHash: chunkId,
            cid: "",
            requiredReplicas: requiredReplicas,
            confirmedReplicas: 0,
            state: DataState.Hot,
            uploadedAt: block.timestamp,
            isPrivate: isPrivate
        });

        // Owner always has access
        hasAccess[chunkId][msg.sender] = true;

        // Emit data into event logs — cheap hot storage
        emit ChunkUploaded(
            chunkId,
            msg.sender,
            requiredReplicas,
            data,
            isPrivate,
            block.timestamp
        );
    }

    ///////////////////////////////////////////////////
    ///                  Replication                ///
    ///////////////////////////////////////////////////

    /**
     * @notice Called by a replicator node after it has persisted the chunk
     *         locally.  Once the confirmation count reaches the cool threshold,
     *         the chunk state is flipped to Cool and a `ChunkCooled` event is
     *         emitted so all other nodes can discard the hot-cache entry.
     *
     * @param chunkId  The identifier of the chunk (keccak256 of raw data)
     * @param cid      Content identifier assigned by the replicator (e.g. IPFS CID)
     * @param location Network address / endpoint where this node serves the data
     */
    function confirmReplication(
        bytes32 chunkId,
        string calldata cid,
        string calldata location
    ) external {
        if (!registeredReplicators[msg.sender]) revert AvaDB_NotReplicator();

        ChunkMetadata storage chunk = _chunks[chunkId];
        if (chunk.owner == address(0)) revert AvaDB_ChunkNotFound();
        if (chunk.state == DataState.Cool) revert AvaDB_ChunkAlreadyCool();
        if (bytes(replicatorLocations[chunkId][msg.sender]).length > 0)
            revert AvaDB_AlreadyReplicated();

        replicatorLocations[chunkId][msg.sender] = location;
        chunk.confirmedReplicas++;

        // First replicator wins the CID assignment
        if (bytes(chunk.cid).length == 0) {
            chunk.cid = cid;
        }

        emit ReplicationConfirmed(
            chunkId,
            msg.sender,
            location,
            cid,
            chunk.confirmedReplicas,
            chunk.requiredReplicas
        );

        // Transition to Cool when ≥ threshold% confirmed
        uint256 needed = (chunk.requiredReplicas * replicationThreshold) / 100;
        // Ensure at least 1 replicator is required
        if (needed == 0) needed = 1;

        if (chunk.confirmedReplicas >= needed) {
            chunk.state = DataState.Cool;
            emit ChunkCooled(chunkId, chunk.cid, chunk.confirmedReplicas);
        }
    }

    ///////////////////////////////////////////////////
    ///                   Retrieval                 ///
    ///////////////////////////////////////////////////

    /**
     * @notice Signal that a user wants to retrieve a chunk.
     *         Replicator nodes listen for `DataRequested` events and serve
     *         the data off-chain.  `queryPayload` may carry an AvaDB JSON
     *         query for structured lookups.
     *
     * @param chunkId      Identifier of the chunk
     * @param queryPayload Optional ABI-encoded JSON query for replicators
     */
    function requestData(
        bytes32 chunkId,
        bytes calldata queryPayload
    ) external {
        ChunkMetadata storage chunk = _chunks[chunkId];
        if (chunk.owner == address(0)) revert AvaDB_ChunkNotFound();

        if (chunk.isPrivate && !hasAccess[chunkId][msg.sender])
            revert AvaDB_AccessDenied();

        emit DataRequested(chunkId, msg.sender, queryPayload);
    }

    ///////////////////////////////////////////////////
    ///               Access Control                ///
    ///////////////////////////////////////////////////

    /**
     * @notice Grant read access to `grantee` for a private chunk
     * @param chunkId Identifier of the chunk
     * @param grantee Address to grant access to
     */
    function grantAccess(bytes32 chunkId, address grantee) external {
        if (_chunks[chunkId].owner != msg.sender) revert AvaDB_NotOwner();
        hasAccess[chunkId][grantee] = true;
        emit AccessGranted(chunkId, msg.sender, grantee);
    }

    /**
     * @notice Revoke read access from `grantee` for a private chunk
     * @param chunkId Identifier of the chunk
     * @param grantee Address to revoke access from
     */
    function revokeAccess(bytes32 chunkId, address grantee) external {
        if (_chunks[chunkId].owner != msg.sender) revert AvaDB_NotOwner();
        hasAccess[chunkId][grantee] = false;
        emit AccessRevoked(chunkId, msg.sender, grantee);
    }

    ///////////////////////////////////////////////////
    ///                  View Functions             ///
    ///////////////////////////////////////////////////

    /**
     * @notice Returns all public metadata for a stored chunk
     * @param chunkId Identifier of the chunk
     * @return meta ChunkMetadata struct (cid is empty while state is Hot)
     */
    function getChunkMetadata(
        bytes32 chunkId
    ) external view returns (ChunkMetadata memory meta) {
        if (_chunks[chunkId].owner == address(0)) revert AvaDB_ChunkNotFound();
        return _chunks[chunkId];
    }

    /**
     * @notice Check if `user` can read a chunk
     * @param chunkId Identifier of the chunk
     * @param user    Address to check
     * @return true if the chunk is public or the user has been granted access
     */
    function isChunkAccessible(
        bytes32 chunkId,
        address user
    ) external view returns (bool) {
        ChunkMetadata storage chunk = _chunks[chunkId];
        if (chunk.owner == address(0)) return false;
        if (!chunk.isPrivate) return true;
        return hasAccess[chunkId][user];
    }
}
