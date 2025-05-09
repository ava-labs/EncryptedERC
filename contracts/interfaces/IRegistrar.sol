// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem

pragma solidity 0.8.27;

interface IRegistrar {
    /**
     * @dev Returns the public key of a user.
     * @param user Address of the user.
     * @return publicKey The public key of the user as an array of two uint256 values.
     */
    function getUserPublicKey(
        address user
    ) external view returns (uint256[2] memory publicKey);

    /**
     * @dev Returns true if the user is registered.
     * @param user Address of the user.
     * @return isRegistered True if the user is registered, false otherwise.
     */
    function isUserRegistered(address user) external view returns (bool);
}
