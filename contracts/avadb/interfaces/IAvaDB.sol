// SPDX-License-Identifier: Ecosystem
pragma solidity 0.8.27;

import {AvaDBRecord, CreateRecordParams} from "../types/AvaDBTypes.sol";

/// @title IAvaDB
/// @notice Interface for the AvaDB on-chain encrypted database
interface IAvaDB {
    ///////////////////////////////////////////////////
    ///                    Events                   ///
    ///////////////////////////////////////////////////

    /// @notice Emitted when a new record is created
    /// @param recordId Unique identifier of the record
    /// @param owner   Address of the record owner
    /// @param schema  Unencrypted schema hint supplied at creation
    event RecordCreated(
        bytes32 indexed recordId,
        address indexed owner,
        string schema
    );

    /// @notice Emitted when a record's encrypted content is updated
    /// @param recordId Unique identifier of the record
    /// @param owner   Address of the record owner
    event RecordUpdated(bytes32 indexed recordId, address indexed owner);

    /// @notice Emitted when a record is deleted
    /// @param recordId Unique identifier of the record
    /// @param owner   Address of the record owner
    event RecordDeleted(bytes32 indexed recordId, address indexed owner);

    /// @notice Emitted when the owner grants a viewer access to a record
    /// @param recordId Unique identifier of the record
    /// @param owner   Address of the record owner
    /// @param viewer  Address of the newly authorized viewer
    event AccessGranted(
        bytes32 indexed recordId,
        address indexed owner,
        address indexed viewer
    );

    /// @notice Emitted when the owner revokes a viewer's access to a record
    /// @param recordId Unique identifier of the record
    /// @param owner   Address of the record owner
    /// @param viewer  Address of the viewer whose access was removed
    event AccessRevoked(
        bytes32 indexed recordId,
        address indexed owner,
        address indexed viewer
    );

    ///////////////////////////////////////////////////
    ///                   External                  ///
    ///////////////////////////////////////////////////

    /// @notice Create a new encrypted record
    /// @param params  Struct containing encryptedContent and schema hint
    /// @return recordId The unique identifier of the created record
    function createRecord(
        CreateRecordParams calldata params
    ) external returns (bytes32 recordId);

    /// @notice Update the encrypted content of an existing record
    /// @dev Only callable by the record owner
    /// @param recordId        Unique identifier of the record to update
    /// @param encryptedContent New encrypted content (re-encrypted off-chain)
    function updateRecord(
        bytes32 recordId,
        bytes calldata encryptedContent
    ) external;

    /// @notice Soft-delete a record and revoke all viewer access
    /// @dev Only callable by the record owner
    /// @param recordId Unique identifier of the record to delete
    function deleteRecord(bytes32 recordId) external;

    /// @notice Grant a registered user read access to a record
    /// @dev The owner must supply the record content re-encrypted with
    ///      the viewer's BabyJubJub public key (off-chain operation).
    ///      Only callable by the record owner.
    /// @param recordId          Unique identifier of the record
    /// @param viewer            Address of the user receiving access
    /// @param reEncryptedContent Record content re-encrypted for the viewer
    function grantAccess(
        bytes32 recordId,
        address viewer,
        bytes calldata reEncryptedContent
    ) external;

    /// @notice Revoke a viewer's access to a record
    /// @dev Only callable by the record owner
    /// @param recordId Unique identifier of the record
    /// @param viewer   Address of the viewer to revoke
    function revokeAccess(bytes32 recordId, address viewer) external;

    ///////////////////////////////////////////////////
    ///                     Views                   ///
    ///////////////////////////////////////////////////

    /// @notice Retrieve metadata and encrypted content for a record
    /// @dev    If caller == owner:   returns content encrypted for the owner
    ///         If caller is viewer:  returns content re-encrypted for that viewer
    ///         Otherwise:            reverts with UnauthorizedAccess
    /// @param recordId Unique identifier of the record
    /// @return record   Metadata struct
    /// @return content  Encrypted bytes the caller can decrypt with their private key
    function getRecord(
        bytes32 recordId
    ) external view returns (AvaDBRecord memory record, bytes memory content);

    /// @notice Return all viewers currently granted access to a record
    /// @param recordId Unique identifier of the record
    /// @return viewers Array of authorized viewer addresses
    function getViewers(
        bytes32 recordId
    ) external view returns (address[] memory viewers);

    /// @notice Check whether a specific viewer has access to a record
    /// @param recordId Unique identifier of the record
    /// @param viewer   Address to check
    /// @return True if the viewer has been granted access
    function hasAccess(
        bytes32 recordId,
        address viewer
    ) external view returns (bool);

    /// @notice Return the current nonce for a given owner (used to derive record IDs)
    /// @param owner Address of the owner
    /// @return Current nonce value
    function nonces(address owner) external view returns (uint256);
}
