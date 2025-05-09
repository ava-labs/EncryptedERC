// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem

pragma solidity 0.8.27;

import {Point, RegisterProof} from "./types/Types.sol";
import {IRegistrationVerifier} from "./interfaces/verifiers/IRegistrationVerifier.sol";
import {UserAlreadyRegistered, InvalidChainId, InvalidSender, InvalidRegistrationHash, InvalidProof} from "./errors/Errors.sol";

// libraries
import {BabyJubJub} from "./libraries/BabyJubJub.sol";

/**
 * @title Registrar
 * @notice Contract for managing user registration in the privacy-preserving ERC system
 * @dev This contract handles:
 *      1. User registration with public keys
 *      2. Verification of registration proofs
 *
 * The Registrar is a critical component that:
 * - Associates Ethereum addresses with public keys for encrypted operations
 */
contract Registrar {
    ///////////////////////////////////////////////////
    ///                   State Variables           ///
    ///////////////////////////////////////////////////

    /// @notice The verifier contract used to validate registration proofs
    IRegistrationVerifier public registrationVerifier;

    /// @notice Mapping of user addresses to their public keys
    mapping(address userAddress => Point userPublicKey) public userPublicKeys;

    /// @notice Mapping of registration hashes to registration status
    /// @dev Used to prevent duplicate registrations
    mapping(uint256 registrationHash => bool isRegistered) public isRegistered;

    ///////////////////////////////////////////////////
    ///                    Events                   ///
    ///////////////////////////////////////////////////

    /// @notice Emitted when a user is registered
    /// @param user Address of the user
    /// @param publicKey Public key of the user
    event Register(address indexed user, Point publicKey);

    ///////////////////////////////////////////////////
    ///                   Constructor               ///
    ///////////////////////////////////////////////////

    /**
     * @notice Initializes the Registrar contract
     * @param registrationVerifier_ Address of the registration verifier contract
     */
    constructor(address registrationVerifier_) {
        registrationVerifier = IRegistrationVerifier(registrationVerifier_);
    }

    ///////////////////////////////////////////////////
    ///                   External                  ///
    ///////////////////////////////////////////////////

    /**
     * @notice Registers a user with their public key
     * @param proof The zero-knowledge proof proving the validity of the registration
     * @dev This function:
     *      1. Verifies the sender matches the account in the proof
     *      2. Checks the chain ID matches
     *      3. Validates the registration hash
     *      4. Verifies the zero-knowledge proof
     *      5. Registers the user with their public key
     *
     * Requirements:
     * - Sender must match the account in the proof
     * - Chain ID must match
     * - Registration hash must be valid
     * - User must not be already registered
     * - Proof must be valid
     */
    function register(RegisterProof calldata proof) external {
        // extract public inputs
        uint256[5] memory input = proof.publicSignals;

        address account = address(uint160(input[2]));

        // check if the sender matches the account in the proof
        if (msg.sender != account) {
            revert InvalidSender();
        }

        // check if the chain ID matches
        if (block.chainid != input[3]) {
            revert InvalidChainId();
        }

        // check if the registration hash is valid
        uint256 registrationHash = input[4];
        if (registrationHash >= BabyJubJub.Q) {
            revert InvalidRegistrationHash();
        }

        // check if the user is already registered
        if (isRegistered[registrationHash] && isUserRegistered(account)) {
            revert UserAlreadyRegistered();
        }

        // Verify the proof
        _verifyProof(proof);

        _register(account, Point({x: input[0], y: input[1]}), registrationHash);
    }

    /**
     * @notice Checks if a user is registered
     * @param user The address of the user to check
     * @return bool True if the user is registered, false otherwise
     * @dev A user is considered registered if their public key is not the zero point (0,0)
     */
    function isUserRegistered(address user) public view returns (bool) {
        return userPublicKeys[user].x != 0 && userPublicKeys[user].y != 0;
    }

    /**
     * @notice Gets the public key of a user
     * @param user The address of the user
     * @return publicKey The public key of the user as a uint256 array
     * @dev Returns the x and y coordinates of the user's public key
     */
    function getUserPublicKey(
        address user
    ) public view returns (uint256[2] memory publicKey) {
        return [userPublicKeys[user].x, userPublicKeys[user].y];
    }

    ///////////////////////////////////////////////////
    ///                   Internal                  ///
    ///////////////////////////////////////////////////

    /**
     * @notice Registers a user with their public key
     * @param user The address of the user
     * @param publicKey The public key of the user
     * @param registrationHash The registration hash
     * @dev This function:
     *      1. Sets the user's public key
     *      2. Marks the registration hash as used
     *      3. Emits a Register event
     */
    function _register(
        address user,
        Point memory publicKey,
        uint256 registrationHash
    ) internal {
        userPublicKeys[user] = publicKey;
        isRegistered[registrationHash] = true;
        emit Register(user, publicKey);
    }

    /**
     * @notice Verifies a registration proof
     * @param proof_ The proof to verify
     * @dev This function:
     *      1. Extracts the proof points and public inputs
     *      2. Calls the verifier contract to verify the proof
     *      3. Reverts if the proof is invalid
     */
    function _verifyProof(RegisterProof calldata proof_) internal view {
        uint256[2] memory pointA_ = proof_.proofPoints.a;
        uint256[2][2] memory pointB_ = proof_.proofPoints.b;
        uint256[2] memory pointC_ = proof_.proofPoints.c;
        uint256[5] memory input = proof_.publicSignals;

        // Verify the proof
        bool verified_ = registrationVerifier.verifyProof(
            pointA_,
            pointB_,
            pointC_,
            input
        );

        if (!verified_) {
            revert InvalidProof();
        }
    }
}
