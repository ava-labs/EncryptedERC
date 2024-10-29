// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;

import {EncryptedBalance, EGCT, BalanceHistory} from "./types/Types.sol";

contract EncryptedUserBalances {
    mapping(address user => mapping(uint256 tokenId => EncryptedBalance balance))
        public balances;

    /**
     *
     * @param _user User address
     * @return eGCT Elgamal Ciphertext
     * @return nonce Nonce
     * @dev Returns the balance of the user for the standalone token (tokenId = 0)
     */
    function balanceOfForStandalone(
        address _user
    ) external view returns (EGCT memory eGCT, uint256 nonce) {
        return balanceOf(_user, 0);
    }

    /**
     * @param _user User address
     * @param _tokenId Token ID
     * @return eGCT Elgamal Ciphertext
     * @return nonce Nonce
     * @dev Returns the balance of the user for the given token
     */
    function balanceOf(
        address _user,
        uint256 _tokenId
    ) public view returns (EGCT memory eGCT, uint256 nonce) {
        EncryptedBalance storage balance = balances[_user][_tokenId];
        return (balance.eGCT, balance.nonce);
    }

    ///////////////////////////////////////////////////
    ///               Internal Functions            ///
    ///////////////////////////////////////////////////

    /**
     * @param _user User address
     * @param _tokenId Token ID
     * @dev Adds the balance hash to the user's history
     * @dev Hash EGCT with the nonce and mark the result as valid
     *      every time user send a transaction nonce is increased by 1
     *      so the balance hash is unique for each transaction and sender must prove
     *      that the balance hash is known beforehand with the current nonce
     */
    function _addToUserHistory(address _user, uint256 _tokenId) internal {
        EncryptedBalance storage balance = balances[_user][_tokenId];

        uint256 nonce = balance.nonce;
        uint256 balanceHash = _hashEGCT(balance.eGCT);
        balanceHash = uint256(keccak256(abi.encode(balanceHash, nonce)));

        // mark the balance hash as valid
        balance.balanceList[balanceHash] = BalanceHistory({
            index: balance.nextBalanceIndex,
            isValid: true
        });

        balance.nextBalanceIndex++;
    }

    /**
     * @param _eGCT Elgamal Ciphertext
     * @return hash of the Elgamal Ciphertext CRH(eGCT)
     */
    function _hashEGCT(EGCT memory _eGCT) internal pure returns (uint256) {
        return
            uint256(
                keccak256(
                    abi.encode(_eGCT.c1.X, _eGCT.c1.Y, _eGCT.c2.X, _eGCT.c2.Y)
                )
            );
    }

    /**
     * @param _user User address
     * @param _tokenId Token ID
     * @dev Deletes the user's history
     * @dev Instead of deleting the history mapping one by one, we can just
     *      increase the nonce by one and the old history will be mark as invalid
     */
    function _deleteUserHistory(address _user, uint256 _tokenId) internal {
        EncryptedBalance storage balance = balances[_user][_tokenId];

        // before setting the next balnace index to 0, we need to clear the amount pcts
        // from index 0 to balance.nextBalanceIndex
        uint256 newLength = balance.amountPCTs.length -
            balance.nextBalanceIndex;
        for (uint256 i = 0; i < newLength; i++) {
            balance.amountPCTs[i] = balance.amountPCTs[
                i + balance.nextBalanceIndex
            ];
        }
        // Resize the array to remove excess elements
        while (balance.amountPCTs.length > newLength) {
            balance.amountPCTs.pop();
        }

        balance.nonce++;
        // setting the next balance index to 0 to start over
        balance.nextBalanceIndex = 0;

        // and need to add the new balance hash to the history with the new nonce
        _addToUserHistory(_user, _tokenId);
    }

    /**
     * @param _user User address
     * @param _tokenId Token ID
     * @param _balanceHash Balance hash
     * @return isValid True if the balance hash is valid
     * @dev Hash the provided eGCT with the current nonce and check if it's in the history
     */
    function _isBalanceValid(
        address _user,
        uint256 _tokenId,
        uint256 _balanceHash
    ) internal view returns (bool) {
        uint256 nonce = balances[_user][_tokenId].nonce;
        uint256 hashWithNonce = uint256(
            keccak256(abi.encode(_balanceHash, nonce))
        );
        return balances[_user][_tokenId].balanceList[hashWithNonce].isValid;
    }

    /**
     * @param _user User address
     * @param _tokenId Token ID
     * @param _pct Balance pct
     * @dev Sets the balance pct for the user and token
     */
    function _setUserBalancePCT(
        address _user,
        uint256 _tokenId,
        uint256[7] memory _pct
    ) internal {
        balances[_user][_tokenId].balancePCT = _pct;
    }
}
