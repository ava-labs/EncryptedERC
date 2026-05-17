// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem
pragma solidity 0.8.27;

// -------------------------------------------------------
//  AvaDB-specific custom errors
// -------------------------------------------------------

/// @notice Thrown when a chunk with the given id does not exist
error AvaDB_ChunkNotFound();

/// @notice Thrown when attempting to upload a chunk that already exists
error AvaDB_AlreadyUploaded();

/// @notice Thrown when the caller is not the owner of the chunk
error AvaDB_NotOwner();

/// @notice Thrown when the caller does not have read access to a private chunk
error AvaDB_AccessDenied();

/// @notice Thrown when a chunk is already in Cool state
error AvaDB_ChunkAlreadyCool();

/// @notice Thrown when the caller is not a registered replicator
error AvaDB_NotReplicator();

/// @notice Thrown when the replicator has already confirmed this chunk
error AvaDB_AlreadyReplicated();

/// @notice Thrown when requiredReplicas == 0
error AvaDB_InvalidReplicas();

/// @notice Thrown when the caller is not registered in the Registrar
error AvaDB_UserNotRegistered();
