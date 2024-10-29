// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;

interface IEncryptedERC {
    /**
     * @notice Sets the balance percentage for a user and token.
     * @param _user User address
     * @param _tokenId Token ID
     * @param _pct Balance percentage array
     * @dev Only the registrar can set the balance percentage
     */
    function setUserBalancePCT(
        address _user,
        uint256 _tokenId,
        uint256[7] memory _pct
    ) external;
}
