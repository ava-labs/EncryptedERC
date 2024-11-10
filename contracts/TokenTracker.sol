// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;

contract TokenTracker {
    // starting from 1 becase 0 is for standalone version of the EncryptedERC
    uint256 public nextTokenId = 1;
    // indicates if the contract is a converter
    bool public isConverter;

    // token address to token id
    mapping(address tokenAddress => uint256 tokenId) public tokenIds;

    // token id to token address
    mapping(uint256 tokenId => address tokenAddress) public tokenAddresses;

    // array of token addresses
    address[] public tokens;

    constructor(bool _isConverter) {
        isConverter = _isConverter;
    }

    /**
     * @return Array of token addresses
     */
    function getTokens() external view returns (address[] memory) {
        return tokens;
    }

    /**
     * @param tokenAddress Address of the token
     * @dev Adds a token to the tracker
     */
    function _addToken(address tokenAddress) internal {
        uint256 newTokenId = nextTokenId;
        tokenIds[tokenAddress] = newTokenId;
        tokenAddresses[newTokenId] = tokenAddress;
        tokens.push(tokenAddress);
        nextTokenId++;
    }
}
