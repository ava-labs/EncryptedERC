// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem

pragma solidity 0.8.27;

import {EncryptedBalance, EGCT, BalanceHistory, AmountPCT} from "./types/Types.sol";
import {InvalidProof} from "./errors/Errors.sol";
import {BabyJubJub} from "./libraries/BabyJubJub.sol";

/**
 * @title EncryptedUserBalances
 * @notice Contract for managing encrypted user balances in the privacy-preserving ERC system
 * @dev This contract handles:
 *      1. Storage and retrieval of encrypted balances
 *      2. Balance history tracking for transaction validation
 *      3. Cryptographic operations on encrypted balances
 *
 * The contract uses ElGamal encryption (EGCT) to store balances privately,
 * allowing users to prove they have sufficient funds without revealing the actual amount.
 */
contract EncryptedUserBalances {
    ///////////////////////////////////////////////////
    ///                   State Variables           ///
    ///////////////////////////////////////////////////

    /// @notice Mapping of user addresses to their encrypted balances for each token
    /// @dev Structure: user => tokenId => EncryptedBalance
    mapping(address user => mapping(uint256 tokenId => EncryptedBalance balance))
        public balances;

    ///////////////////////////////////////////////////
    ///                   External                  ///
    ///////////////////////////////////////////////////

    /**
     * @notice Returns the encrypted balance for a user's standalone token
     * @param user The address of the user
     * @return eGCT The ElGamal ciphertext representing the encrypted balance
     * @return nonce The current nonce used for balance validation
     * @return amountPCTs Array of amount PCT
     * @return balancePCT The current balance PCT
     * @return transactionIndex The current transaction index
     * @dev Since in standalone mode, the tokenId is always 0
     */
    function balanceOfStandalone(
        address user
    )
        external
        view
        returns (
            EGCT memory eGCT,
            uint256 nonce,
            AmountPCT[] memory amountPCTs,
            uint256[7] memory balancePCT,
            uint256 transactionIndex
        )
    {
        return balanceOf(user, 0);
    }

    /**
     * @notice Returns the encrypted balance for a user's specified token
     * @param user The address of the user
     * @param tokenId The ID of the token
     * @return eGCT The ElGamal ciphertext representing the encrypted balance
     * @return nonce The current nonce used for balance validation
     * @return amountPCTs Array of amount PCT
     * @return balancePCT The current balance PCT
     * @return transactionIndex The current transaction index
     */
    function balanceOf(
        address user,
        uint256 tokenId
    )
        public
        view
        returns (
            EGCT memory eGCT,
            uint256 nonce,
            AmountPCT[] memory amountPCTs,
            uint256[7] memory balancePCT,
            uint256 transactionIndex
        )
    {
        EncryptedBalance storage balance = balances[user][tokenId];
        return (
            balance.eGCT,
            balance.nonce,
            balance.amountPCTs,
            balance.balancePCT,
            balance.transactionIndex
        );
    }

    ///////////////////////////////////////////////////
    ///                   Internal                  ///
    ///////////////////////////////////////////////////

    /**
     * @notice Adds an encrypted amount to a user's balance
     * @param user The address of the user
     * @param tokenId The ID of the token
     * @param eGCT The ElGamal ciphertext representing the amount to add
     * @param amountPCT The amount PCT for transaction history
     * @dev This function:
     *      1. Initializes the balance if it's the first transaction
     *      2. Adds the encrypted amount to the existing balance
     *      3. Updates the user history (by adding new amount PCT)
     */
    function _addToUserBalance(
        address user,
        uint256 tokenId,
        EGCT memory eGCT,
        uint256[7] memory amountPCT
    ) internal {
        EncryptedBalance storage balance = balances[user][tokenId];

        // if user balance is not initialized, initialize it
        if (balance.eGCT.c1.x == 0 && balance.eGCT.c1.y == 0) {
            balance.eGCT = eGCT;
        } else {
            // if user balance is already initialized, add the encrypted amount to the balance
            balance.eGCT.c1 = BabyJubJub._add(balance.eGCT.c1, eGCT.c1);
            balance.eGCT.c2 = BabyJubJub._add(balance.eGCT.c2, eGCT.c2);
        }

        // in all the case
        _addToUserHistory(user, tokenId, amountPCT);
    }

    /**
     * @notice Subtracts an encrypted amount from a user's balance
     * @param user The address of the user
     * @param tokenId The ID of the token
     * @param eGCT The ElGamal ciphertext representing the amount to subtract
     * @param balancePCT The new balance PCT after subtraction
     * @param transactionIndex The transaction index to delete from history
     * @dev This function:
     *      1. Subtracts the encrypted amount from the balance
     *      2. Updates the user history (by removing the specified transaction)
     *      3. Updates the balance PCT for user
     */
    function _subtractFromUserBalance(
        address user,
        uint256 tokenId,
        EGCT memory eGCT,
        uint256[7] memory balancePCT,
        uint256 transactionIndex
    ) internal {
        EncryptedBalance storage balance = balances[user][tokenId];

        balance.eGCT.c1 = BabyJubJub._sub(balance.eGCT.c1, eGCT.c1);
        balance.eGCT.c2 = BabyJubJub._sub(balance.eGCT.c2, eGCT.c2);

        // delete the amount pct from the balance
        _deleteUserHistory(user, tokenId, transactionIndex);

        // update balance pct
        balance.balancePCT = balancePCT;
    }

    /**
     * @notice Adds a transaction to the user's balance history
     * @param user The address of the user
     * @param tokenId The ID of the token
     * @param amountPCT The amount PCT for the transaction
     * @dev This function:
     *      1. Calculates a unique hash for the current balance state
     *      2. Marks this hash as valid in the balance history
     *      3. Adds the amount PCT to the transaction history
     *      4. Increments the transaction index
     *
     * The balance hash is unique for each transaction because it includes the nonce,
     * which is incremented after each transaction. This ensures that each transaction
     * can be uniquely identified and validated.
     */
    function _addToUserHistory(
        address user,
        uint256 tokenId,
        uint256[7] memory amountPCT
    ) internal {
        EncryptedBalance storage balance = balances[user][tokenId];

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
            AmountPCT({pct: amountPCT, index: balance.transactionIndex})
        );

        balance.transactionIndex++;
    }

    /**
     * @notice Commits the current balance state to the user's history
     * @param user The address of the user
     * @param tokenId The ID of the token
     * @dev This function:
     *      1. Calculates a unique hash for the current balance state
     *      2. Marks this hash as valid in the balance history
     *      3. Increments the transaction index
     *
     * This is used to create a checkpoint of the balance state after operations
     * that don't change the balance amount but need to be recorded in history.
     */
    function _commitUserBalance(address user, uint256 tokenId) internal {
        EncryptedBalance storage balance = balances[user][tokenId];

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
     * @notice Deletes transaction history up to a specific transaction index
     * @param user The address of the user
     * @param tokenId The ID of the token
     * @param transactionIndex The transaction index to delete up to
     * @dev This function:
     *      1. Removes amount PCTs from the history up to the specified index
     *      2. Increments the nonce (invalidate all previous balance hashes)
     *      3. Commits the new balance state to history
     *
     * Instead of deleting individual history entries, this function uses the nonce
     * to invalidate all previous balance hashes at once, which is more gas efficient.
     */
    function _deleteUserHistory(
        address user,
        uint256 tokenId,
        uint256 transactionIndex
    ) internal {
        EncryptedBalance storage balance = balances[user][tokenId];

        for (uint256 i = balance.amountPCTs.length; i > 0; i--) {
            uint256 index = i - 1;

            if (balance.amountPCTs[index].index <= transactionIndex) {
                balance.amountPCTs[index] = balance.amountPCTs[
                    balance.amountPCTs.length - 1
                ];
                balance.amountPCTs.pop();
            }
        }

        balance.nonce++;

        _commitUserBalance(user, tokenId);
    }

    /**
     * @notice Checks if a balance hash is valid for a user
     * @param user The address of the user
     * @param tokenId The ID of the token
     * @param balanceHash The hash to validate
     * @return isValid True if the hash is valid, false otherwise
     * @return index The transaction index associated with the hash
     * This is used to validate that a user is using a recent and valid balance
     * in their transactions.
     */
    function _isBalanceValid(
        address user,
        uint256 tokenId,
        uint256 balanceHash
    ) internal view returns (bool, uint256) {
        uint256 nonce = balances[user][tokenId].nonce;
        uint256 hashWithNonce = uint256(
            keccak256(abi.encode(balanceHash, nonce))
        );
        return (
            balances[user][tokenId].balanceList[hashWithNonce].isValid,
            balances[user][tokenId].balanceList[hashWithNonce].index
        );
    }

    /**
     * @notice Verifies a user's balance
     * @param user The address of the user
     * @param tokenId The ID of the token
     * @param eGCT The ElGamal ciphertext representing the balance
     * @return transactionIndex The transaction index associated with the balance
     * @dev If balance is not valid, it reverts with InvalidProof error
     */
    function _verifyUserBalance(
        address user,
        uint256 tokenId,
        EGCT memory eGCT
    ) internal view returns (uint256) {
        // hash the encrypted balance
        uint256 balanceHash = _hashEGCT(eGCT);

        (bool isValid, uint256 transactionIndex) = _isBalanceValid(
            user,
            tokenId,
            balanceHash
        );
        if (!isValid) {
            revert InvalidProof();
        }

        return transactionIndex;
    }

    /**
     * @notice Calculates a hash of an ElGamal ciphertext
     * @param eGCT The ElGamal ciphertext to hash
     * @return The hash of the ciphertext
     * @dev This function creates a unique identifier for an encrypted balance
     *      by hashing all components of the ElGamal ciphertext.
     */
    function _hashEGCT(EGCT memory eGCT) internal pure returns (uint256) {
        return
            uint256(
                keccak256(
                    abi.encode(eGCT.c1.x, eGCT.c1.y, eGCT.c2.x, eGCT.c2.y)
                )
            );
    }
}
