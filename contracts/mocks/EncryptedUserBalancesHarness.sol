// (c) 2026, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem

pragma solidity 0.8.27;

import {EncryptedUserBalances} from "../EncryptedUserBalances.sol";
import {AmountPCT, EncryptedBalance} from "../types/Types.sol";

/**
 * @dev Test-only harness for measuring the cost of pruning pending amount PCT history.
 * It seeds fully non-zero entries so the benchmark reflects the expensive storage-clear path.
 */
contract EncryptedUserBalancesHarness is EncryptedUserBalances {
    function seedHistory(
        address user,
        uint256 tokenId,
        uint256 count
    ) external {
        EncryptedBalance storage balance = balances[user][tokenId];
        uint256 startIndex = balance.amountPCTs.length;

        for (uint256 i = 0; i < count; i++) {
            uint256[7] memory pct;
            for (uint256 j = 0; j < pct.length; j++) {
                pct[j] = (startIndex + i) * pct.length + j + 1;
            }
            balance.amountPCTs.push(
                AmountPCT({pct: pct, index: startIndex + i})
            );
        }

        balance.transactionIndex = startIndex + count;
    }

    function appendHistory(address user, uint256 tokenId) external {
        uint256[7] memory pct;
        pct[0] = 1;
        _addToUserHistory(user, tokenId, pct);
    }

    function pruneHistory(
        address user,
        uint256 tokenId,
        uint256 transactionIndex
    ) external {
        _deleteUserHistory(user, tokenId, transactionIndex);
    }

    function pendingHistoryLength(
        address user,
        uint256 tokenId
    ) external view returns (uint256) {
        return balances[user][tokenId].amountPCTs.length;
    }
}
