// SPDX-License-Identifier: Ecosystem
pragma solidity 0.8.27;

// interfaces
import {IRegistrar} from "../interfaces/IRegistrar.sol";
import {IAvaDB} from "./interfaces/IAvaDB.sol";

// types
import {AvaDBRecord, CreateRecordParams} from "./types/AvaDBTypes.sol";

// errors
import {ZeroAddress, UserNotRegistered, UnauthorizedAccess} from "../errors/Errors.sol";

//              /$$$$$$                        /$$$$$$$  /$$$$$$$$
//             /$$__  $$                      | $$__  $$| $$_____/
//            | $$  \ $$ /$$    /$$ /$$$$$$   | $$  \ $$| $$
//            | $$$$$$$$|  $$  /$$//$$__  $$  | $$  | $$| $$$$$
//            | $$__  $$ \  $$/$$/| $$  \ $$  | $$  | $$| $$__/
//            | $$  | $$  \  $$$/ | $$  | $$  | $$  | $$| $$
//            | $$  | $$   \  $/  |  $$$$$$/  | $$$$$$$/| $$$$$$$$
//            |__/  |__/    \_/    \______/   |_______/ |________/
//
/**
 * @title AvaDB
 * @notice An on-chain privacy-preserving database built on the eERC encryption standard.
 *
 * @dev AvaDB stores arbitrary data encrypted with BabyJubJub El-Gamal keys (the same curve
 *      used by the EncryptedERC protocol).  The privacy model is purely cryptographic:
 *
 *      - Record content is encrypted off-chain with the **owner's** BabyJubJub public key
 *        before being submitted to the contract.  Even though all bytes are visible at the
 *        storage layer, no one without the owner's private key can read the plaintext.
 *
 *      - When an owner wants to share a record, they re-encrypt the plaintext off-chain with
 *        the **viewer's** BabyJubJub public key and call `grantAccess`.  The viewer's copy is
 *        stored alongside the record; only the viewer can decrypt it.
 *
 *      - The contract enforces *write* access: only the record owner (identified by msg.sender
 *        linked to a registered BabyJubJub key via the Registrar) can create, update, delete,
 *        and manage access grants.
 *
 * Key features:
 * ─────────────────────────────────────────────────────────────────
 * 1. Encrypted Records  – Arbitrary bytes stored per record.
 * 2. Owner-Only Writes  – Only the registered owner can mutate a record.
 * 3. Granular Access    – Owner grants / revokes per-viewer re-encrypted copies.
 * 4. Schema Hints       – Optional unencrypted schema tag for SDK interop.
 * 5. Registrar Gating   – Callers must be registered with a valid BabyJubJub key.
 * ─────────────────────────────────────────────────────────────────
 *
 * Privacy model summary:
 * ┌──────────────┬──────────────────────────────────────────────────────┐
 * │ Party        │ What they can read                                   │
 * ├──────────────┼──────────────────────────────────────────────────────┤
 * │ Owner        │ Own encrypted content (decryptable with private key) │
 * │ Viewer       │ Re-encrypted copy granted by the owner               │
 * │ Anyone else  │ Metadata only (owner addr, timestamps, schema)       │
 * └──────────────┴──────────────────────────────────────────────────────┘
 */
contract AvaDB is IAvaDB {
    ///////////////////////////////////////////////////
    ///                State Variables              ///
    ///////////////////////////////////////////////////

    /// @notice Registrar used to verify that callers have a BabyJubJub public key
    IRegistrar public immutable registrar;

    /// @notice Record metadata indexed by recordId
    mapping(bytes32 recordId => AvaDBRecord) private _records;

    /// @notice Encrypted content for the record owner, indexed by recordId
    mapping(bytes32 recordId => bytes) private _ownerContent;

    /// @notice Re-encrypted content per authorized viewer, indexed by recordId then viewer
    mapping(bytes32 recordId => mapping(address viewer => bytes)) private _viewerContent;

    /// @notice Ordered list of viewers that have been granted access to a record
    mapping(bytes32 recordId => address[]) private _viewers;

    /// @notice Viewer index position inside _viewers array (1-based; 0 means not present)
    mapping(bytes32 recordId => mapping(address viewer => uint256)) private _viewerIndex;

    /// @notice Per-owner nonce used to derive unique record IDs
    mapping(address owner => uint256) public nonces;

    ///////////////////////////////////////////////////
    ///                  Modifiers                  ///
    ///////////////////////////////////////////////////

    /// @dev Reverts if the caller has not registered a BabyJubJub public key
    modifier onlyRegistered() {
        if (!registrar.isUserRegistered(msg.sender)) {
            revert UserNotRegistered();
        }
        _;
    }

    /// @dev Reverts if the caller is not the owner of the specified record
    modifier onlyOwner(bytes32 recordId) {
        if (_records[recordId].owner != msg.sender) {
            revert UnauthorizedAccess();
        }
        _;
    }

    /// @dev Reverts if the record does not exist (has been deleted or never created)
    modifier recordExists(bytes32 recordId) {
        require(_records[recordId].exists, "AvaDB: record does not exist");
        _;
    }

    ///////////////////////////////////////////////////
    ///                  Constructor                ///
    ///////////////////////////////////////////////////

    /**
     * @notice Deploy AvaDB and link it to an eERC Registrar
     * @param registrar_ Address of the deployed Registrar contract
     */
    constructor(address registrar_) {
        if (registrar_ == address(0)) revert ZeroAddress();
        registrar = IRegistrar(registrar_);
    }

    ///////////////////////////////////////////////////
    ///                   External                  ///
    ///////////////////////////////////////////////////

    /// @inheritdoc IAvaDB
    function createRecord(
        CreateRecordParams calldata params
    ) external onlyRegistered returns (bytes32 recordId) {
        require(params.encryptedContent.length > 0, "AvaDB: empty content");

        // Derive a deterministic, unique record ID for this owner
        uint256 nonce = nonces[msg.sender]++;
        recordId = keccak256(
            abi.encodePacked(msg.sender, nonce, block.chainid)
        );

        _records[recordId] = AvaDBRecord({
            owner: msg.sender,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            exists: true
        });

        _ownerContent[recordId] = params.encryptedContent;

        emit RecordCreated(recordId, msg.sender, params.schema);
    }

    /// @inheritdoc IAvaDB
    function updateRecord(
        bytes32 recordId,
        bytes calldata encryptedContent
    ) external onlyRegistered onlyOwner(recordId) recordExists(recordId) {
        require(encryptedContent.length > 0, "AvaDB: empty content");

        _ownerContent[recordId] = encryptedContent;
        _records[recordId].updatedAt = block.timestamp;

        emit RecordUpdated(recordId, msg.sender);
    }

    /// @inheritdoc IAvaDB
    function deleteRecord(
        bytes32 recordId
    ) external onlyRegistered onlyOwner(recordId) recordExists(recordId) {
        // Revoke all viewer access entries
        address[] storage viewers = _viewers[recordId];
        uint256 len = viewers.length;
        for (uint256 i = 0; i < len; i++) {
            address v = viewers[i];
            delete _viewerContent[recordId][v];
            delete _viewerIndex[recordId][v];
        }
        delete _viewers[recordId];

        // Clear owner content and mark deleted
        delete _ownerContent[recordId];
        _records[recordId].exists = false;

        emit RecordDeleted(recordId, msg.sender);
    }

    /// @inheritdoc IAvaDB
    function grantAccess(
        bytes32 recordId,
        address viewer,
        bytes calldata reEncryptedContent
    ) external onlyRegistered onlyOwner(recordId) recordExists(recordId) {
        if (viewer == address(0)) revert ZeroAddress();
        require(viewer != msg.sender, "AvaDB: owner cannot grant access to self");
        require(reEncryptedContent.length > 0, "AvaDB: empty re-encrypted content");

        // The viewer must also be a registered eERC user so they have a public key
        if (!registrar.isUserRegistered(viewer)) revert UserNotRegistered();

        // If this viewer is new, append to the ordered list
        if (_viewerIndex[recordId][viewer] == 0) {
            _viewers[recordId].push(viewer);
            _viewerIndex[recordId][viewer] = _viewers[recordId].length; // 1-based
        }

        _viewerContent[recordId][viewer] = reEncryptedContent;

        emit AccessGranted(recordId, msg.sender, viewer);
    }

    /// @inheritdoc IAvaDB
    function revokeAccess(
        bytes32 recordId,
        address viewer
    ) external onlyRegistered onlyOwner(recordId) recordExists(recordId) {
        uint256 idx = _viewerIndex[recordId][viewer]; // 1-based
        require(idx != 0, "AvaDB: viewer not found");

        // Swap-and-pop to remove from the list in O(1)
        address[] storage viewers = _viewers[recordId];
        uint256 lastIdx = viewers.length - 1;
        uint256 rawIdx = idx - 1; // convert to 0-based

        if (rawIdx != lastIdx) {
            address last = viewers[lastIdx];
            viewers[rawIdx] = last;
            _viewerIndex[recordId][last] = idx; // update 1-based index of swapped element
        }
        viewers.pop();

        delete _viewerContent[recordId][viewer];
        delete _viewerIndex[recordId][viewer];

        emit AccessRevoked(recordId, msg.sender, viewer);
    }

    ///////////////////////////////////////////////////
    ///                     Views                   ///
    ///////////////////////////////////////////////////

    /// @inheritdoc IAvaDB
    function getRecord(
        bytes32 recordId
    )
        external
        view
        recordExists(recordId)
        returns (AvaDBRecord memory record, bytes memory content)
    {
        record = _records[recordId];

        if (msg.sender == record.owner) {
            // Owner receives their own encrypted copy
            content = _ownerContent[recordId];
        } else {
            // Authorized viewer receives their re-encrypted copy
            content = _viewerContent[recordId][msg.sender];
            if (content.length == 0) revert UnauthorizedAccess();
        }
    }

    /// @inheritdoc IAvaDB
    function getViewers(
        bytes32 recordId
    )
        external
        view
        recordExists(recordId)
        returns (address[] memory viewers)
    {
        // Only the record owner may enumerate viewers
        if (_records[recordId].owner != msg.sender) revert UnauthorizedAccess();
        viewers = _viewers[recordId];
    }

    /// @inheritdoc IAvaDB
    function hasAccess(
        bytes32 recordId,
        address viewer
    ) external view returns (bool) {
        return _viewerIndex[recordId][viewer] != 0;
    }
}
