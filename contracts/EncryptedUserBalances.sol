// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;
import {EncryptedBalance, EGCT, BalanceHistory, AmountPCT} from "./types/Types.sol";
import {BabyJubJub} from "./libraries/BabyJubJub.sol";

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
    function balanceOfStandalone(
        address _user
    )
        external
        view
        returns (
            EGCT memory eGCT,
            uint256 nonce,
            AmountPCT[] memory amountPCTs,
            uint256[7] memory balancePCT
        )
    {
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
    )
        public
        view
        returns (
            EGCT memory eGCT,
            uint256 nonce,
            AmountPCT[] memory amountPCTs,
            uint256[7] memory balancePCT
        )
    {
        EncryptedBalance storage balance = balances[_user][_tokenId];
        return (
            balance.eGCT,
            balance.nonce,
            balance.amountPCTs,
            balance.balancePCT
        );
    }

    ///////////////////////////////////////////////////
    ///               Internal Functions            ///
    ///////////////////////////////////////////////////

    function _addToUserBalance(
        address _user,
        uint256 _tokenId,
        EGCT memory _eGCT,
        uint256[7] memory _amountPCT
    ) internal {
        EncryptedBalance storage balance = balances[_user][_tokenId];

        // if user balance is not initialized, initialize it
        if (balance.eGCT.c1.X == 0 && balance.eGCT.c1.Y == 0) {
            balance.eGCT = _eGCT;
        } else {
            // if user balance is already initialized, add the encrypted amount to the balance
            balance.eGCT.c1 = BabyJubJub._add(balance.eGCT.c1, _eGCT.c1);
            balance.eGCT.c2 = BabyJubJub._add(balance.eGCT.c2, _eGCT.c2);
        }

        // in all the case
        _addToUserHistory(_user, _tokenId, _amountPCT);
    }

    function _subtractFromUserBalance(
        address _user,
        uint256 _tokenId,
        EGCT memory _eGCT,
        uint256[7] memory _balancePCT,
        uint256 _transactionIndex
    ) internal {
        EncryptedBalance storage balance = balances[_user][_tokenId];

        // since we are encrypting the negated amount, we need to add it to the balance
        balance.eGCT.c1 = BabyJubJub._sub(balance.eGCT.c1, _eGCT.c1);
        balance.eGCT.c2 = BabyJubJub._sub(balance.eGCT.c2, _eGCT.c2);

        // delete the amount pct from the balance
        _deleteUserHistory(_user, _tokenId, _transactionIndex);

        // update balance pct
        balance.balancePCT = _balancePCT;
    }

    /**
     * @param _user User address
     * @param _tokenId Token ID
     * @dev Adds the balance hash to the user's history
     * @dev Hash EGCT with the nonce and mark the result as valid
     *      every time user send a transaction nonce is increased by 1
     *      so the balance hash is unique for each transaction and sender must prove
     *      that the balance hash is known beforehand with the current nonce
     */
    function _addToUserHistory(
        address _user,
        uint256 _tokenId,
        uint256[7] memory _amountPCT
    ) internal {
        EncryptedBalance storage balance = balances[_user][_tokenId];

        uint256 nonce = balance.nonce;
        uint256 balanceHash = _hashEGCT(balance.eGCT);
        balanceHash = uint256(keccak256(abi.encode(balanceHash, nonce)));

        // mark the balance hash as valid
        balance.balanceList[balanceHash] = BalanceHistory({
            index: balance.transactionIndex,
            isValid: true
        });

        // add the amount pct to the balance
        balance.amountPCTs.push(
            AmountPCT({pct: _amountPCT, index: balance.transactionIndex})
        );

        balance.transactionIndex++;
    }

    function _commitUserBalance(address _user, uint256 _tokenId) internal {
        EncryptedBalance storage balance = balances[_user][_tokenId];

        uint256 nonce = balance.nonce;
        uint256 balanceHash = _hashEGCT(balance.eGCT);
        balanceHash = uint256(keccak256(abi.encode(balanceHash, nonce)));

        balance.balanceList[balanceHash] = BalanceHistory({
            index: balance.transactionIndex,
            isValid: true
        });

        balance.transactionIndex++;
    }

    /**
     * @param _user User address
     * @param _tokenId Token ID
     * @dev Deletes the user's history
     * @dev Instead of deleting the history mapping one by one, we can just
     *      increase the nonce by one and the old history will be mark as invalid
     */
    function _deleteUserHistory(
        address _user,
        uint256 _tokenId,
        uint256 _transactionIndex
    ) internal {
        EncryptedBalance storage balance = balances[_user][_tokenId];

        for (uint256 i = balance.amountPCTs.length; i > 0; i--) {
            uint256 index = i - 1;

            if (balance.amountPCTs[index].index <= _transactionIndex) {
                balance.amountPCTs[index] = balance.amountPCTs[
                    balance.amountPCTs.length - 1
                ];
                balance.amountPCTs.pop();
            }
        }

        balance.nonce++;

        _commitUserBalance(_user, _tokenId);
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
     * @param _balanceHash Balance hash
     * @return isValid True if the balance hash is valid
     * @dev Hash the provided eGCT with the current nonce and check if it's in the history
     */
    function _isBalanceValid(
        address _user,
        uint256 _tokenId,
        uint256 _balanceHash
    ) internal view returns (bool, uint256) {
        uint256 nonce = balances[_user][_tokenId].nonce;
        uint256 hashWithNonce = uint256(
            keccak256(abi.encode(_balanceHash, nonce))
        );
        return (
            balances[_user][_tokenId].balanceList[hashWithNonce].isValid,
            balances[_user][_tokenId].balanceList[hashWithNonce].index
        );
    }
}
