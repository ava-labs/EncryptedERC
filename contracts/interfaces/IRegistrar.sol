// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;

interface IRegistrar {
    /**
     * @dev Returns the public key of a user.
     * @param _user Address of the user.
     * @return publicKey The public key of the user as an array of two uint256 values.
     */
    function getUserPublicKey(
        address _user
    ) external view returns (uint256[2] memory publicKey);

    /**
     * @dev Returns true if the user is registered.
     * @param _user Address of the user.
     * @return isRegistered True if the user is registered, false otherwise.
     */
    function isUserRegistered(address _user) external view returns (bool);
}
