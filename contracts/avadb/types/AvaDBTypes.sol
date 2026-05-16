// SPDX-License-Identifier: Ecosystem
pragma solidity 0.8.27;

/// @notice Core record stored in AvaDB.
/// @dev encryptedContent is stored separately in the main contract's mapping
///      to keep this struct gas-efficient. Only metadata lives here.
struct AvaDBRecord {
    /// @notice Ethereum address of the record owner
    address owner;
    /// @notice Unix timestamp of record creation
    uint256 createdAt;
    /// @notice Unix timestamp of last update
    uint256 updatedAt;
    /// @notice Whether the record exists (soft-delete guard)
    bool exists;
}

/// @notice Parameters used to create a new AvaDB record
struct CreateRecordParams {
    /// @notice Encrypted content (encrypted off-chain with the owner's BabyJubJub public key)
    bytes encryptedContent;
    /// @notice Human-readable schema hint (e.g. "json", "abi", "raw") – NOT encrypted
    string schema;
}
