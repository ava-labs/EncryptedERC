// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem
pragma solidity 0.8.27;

import {Point} from "../types/Types.sol";
import {ZeroAddress} from "../errors/Errors.sol";

/**
 * @title AuditorManager
 * @notice Abstract contract that manages auditor-related functionality for encrypted ERC operations
 * @dev This contract is responsible for:
 *      1. Storing and managing the auditor's address and public key
 *      2. Providing access control for auditor-related operations
 *      3. Emitting events when auditor information changes
 *
 * The auditor is a crucial component in the encrypted ERC system that:
 * - Ensures compliance with regulatory requirements
 * - Provides oversight for private operations
 */
abstract contract AuditorManager {
    ///////////////////////////////////////////////////
    ///                   State Variables           ///
    ///////////////////////////////////////////////////

    /// @notice The address of the current auditor
    /// @dev This address is used to identify the auditor and for access control
    address public auditor = address(0);

    /// @notice The public key of the current auditor
    /// @dev This is used in zero-knowledge proofs to validate auditor signatures
    ///      The point (0,1) is considered invalid as it's the identity point in the elliptic curve
    Point public auditorPublicKey = Point({x: 0, y: 0});

    ///////////////////////////////////////////////////
    ///                    Events                   ///
    ///////////////////////////////////////////////////

    /**
     * @notice Emitted when the auditor's information is updated
     * @param oldAuditor The previous auditor's address
     * @param newAuditor The new auditor's address
     */
    event AuditorChanged(
        address indexed oldAuditor,
        address indexed newAuditor
    );

    ///////////////////////////////////////////////////
    ///                   Modifiers                 ///
    ///////////////////////////////////////////////////

    /**
     * @notice Ensures that an auditor is properly
     * @dev This modifier checks two conditions:
     *      1. The auditor's public key is valid (not the identity point)
     *      2. The auditor's address is not the zero address
     *
     * Requirements:
     * - Auditor public key must be set (not the identity point)
     * - Auditor address must be set (not zero address)
     */
    modifier onlyIfAuditorSet() {
        require(
            auditorPublicKey.x != 0 && auditorPublicKey.y != 1,
            "Auditor public key not set"
        );
        require(auditor != address(0), "Auditor not set");
        _;
    }

    ///////////////////////////////////////////////////
    ///                   External                  ///
    ///////////////////////////////////////////////////

    /**
     * @notice Checks if the auditor's public key is properly set
     * @return bool True if the auditor's public key is set and valid
     * @dev This function is used to verify if the contract is ready for
     *      operations that require auditor validation
     */
    function isAuditorKeySet() external view returns (bool) {
        return auditorPublicKey.x != 0 && auditorPublicKey.y != 1;
    }

    ///////////////////////////////////////////////////
    ///                   Internal                  ///
    ///////////////////////////////////////////////////

    /**
     * @notice Updates the auditor's information
     * @param newAuditor The address of the new auditor
     * @param publicKey The public key of the new auditor
     * @dev This function:
     *      1. Validates the new auditor's address
     *      2. Updates the auditor's information
     *      3. Emits an event to track the change
     *
     * Requirements:
     * - newAuditor must not be the zero address
     * - publicKey must be a valid point on the elliptic curve
     */
    function _updateAuditor(
        address newAuditor,
        uint256[2] memory publicKey
    ) internal {
        address oldAuditor = auditor;
        // check if the auditor is the zero address
        if (newAuditor == address(0)) {
            revert ZeroAddress();
        }

        auditor = newAuditor;
        auditorPublicKey = Point({x: publicKey[0], y: publicKey[1]});

        emit AuditorChanged(oldAuditor, newAuditor);
    }
}
