// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem

pragma solidity 0.8.27;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {TokenBlacklisted, InvalidOperation} from "../errors/Errors.sol";

/**
 * @title TokenTracker
 * @notice Contract for tracking ERC20 tokens in the encrypted ERC system
 * @dev This contract manages:
 *      1. Token registration and identification
 *      2. Token blacklisting for security
 *      3. Contract Mode (converter vs standalone)
 *
 * The contract can operate in two modes:
 * - Converter Mode: Wraps existing ERC20 tokens into encrypted tokens
 * - Standalone Mode: Operates as a standalone encrypted token
 */
contract TokenTracker is Ownable2Step {
    ///////////////////////////////////////////////////
    ///                   State Variables           ///
    ///////////////////////////////////////////////////

    /// @notice The next available token ID
    /// @dev Token IDs start from 1, with 0 reserved for the standalone version
    uint256 public nextTokenId = 1;

    /// @notice Indicates if the contract is operating in converter mode
    bool public isConverter;

    /// @notice Mapping from token address to token ID
    mapping(address tokenAddress => uint256 tokenId) public tokenIds;

    /// @notice Mapping from token ID to token address
    mapping(uint256 tokenId => address tokenAddress) public tokenAddresses;

    /// @notice Array of all registered token addresses
    address[] public tokens;

    /// @notice Mapping to track blacklisted tokens
    mapping(address tokenAddress => bool isBlacklisted)
        public blacklistedTokens;

    ///////////////////////////////////////////////////
    ///                   Modifiers                 ///
    ///////////////////////////////////////////////////

    /**
     * @notice Ensures the function is only called in converter mode
     * @dev Reverts with InvalidOperation if called in standalone mode
     */
    modifier onlyForConverter() {
        if (!isConverter) {
            revert InvalidOperation();
        }
        _;
    }

    /**
     * @notice Ensures the function is only called in standalone mode
     * @dev Reverts with InvalidOperation if called in converter mode
     */
    modifier onlyForStandalone() {
        if (isConverter) {
            revert InvalidOperation();
        }
        _;
    }

    /**
     * @notice Ensures the token is not blacklisted
     * @param tokenAddress Address of the token to check
     * @dev Reverts with TokenBlacklisted if the token is blacklisted
     */
    modifier revertIfBlacklisted(address tokenAddress) {
        if (blacklistedTokens[tokenAddress]) {
            revert TokenBlacklisted(tokenAddress);
        }
        _;
    }

    ///////////////////////////////////////////////////
    ///                   Constructor               ///
    ///////////////////////////////////////////////////

    /**
     * @notice Initializes the TokenTracker contract
     * @param isConverter_ Determines if the contract operates in converter mode
     * @dev Sets the initial mode of operation and initializes the owner
     */
    constructor(bool isConverter_) Ownable(msg.sender) {
        isConverter = isConverter_;
    }

    ///////////////////////////////////////////////////
    ///                   External                  ///
    ///////////////////////////////////////////////////

    /**
     * @notice Sets the blacklist status of a token
     * @param token Address of the token to blacklist/unblacklist
     * @param blacklisted True to blacklist, false to unblacklist
     * @dev Only the owner can call this function
     */
    function setTokenBlacklist(
        address token,
        bool blacklisted
    ) external onlyOwner {
        blacklistedTokens[token] = blacklisted;
    }

    /**
     * @notice Returns an array of all registered token addresses
     * @return Array of token addresses
     * @dev Used for enumeration and listing all supported tokens
     */
    function getTokens() external view returns (address[] memory) {
        return tokens;
    }

    ///////////////////////////////////////////////////
    ///                   Internal                  ///
    ///////////////////////////////////////////////////

    /**
     * @notice Adds a new token to the tracker
     * @param tokenAddress Address of the token to add
     * @dev This function:
     *      1. Assigns a new token ID
     *      2. Updates the token mappings
     *      3. Adds the token to the tokens array
     *      4. Increments the next token ID
     */
    function _addToken(address tokenAddress) internal {
        uint256 newTokenId = nextTokenId;
        tokenIds[tokenAddress] = newTokenId;
        tokenAddresses[newTokenId] = tokenAddress;
        tokens.push(tokenAddress);
        nextTokenId++;
    }
}
