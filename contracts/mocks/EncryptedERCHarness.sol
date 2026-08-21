// (c) 2026, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem

pragma solidity 0.8.27;

import {EncryptedERC} from "../EncryptedERC.sol";
import {AmountPCT, CreateEncryptedERCParams, EncryptedBalance} from "../types/Types.sol";

/**
 * @dev Test-only EncryptedERC variant that can construct a worst-case pending history.
 */
contract EncryptedERCHarness is EncryptedERC {
    constructor(CreateEncryptedERCParams memory params) EncryptedERC(params) {}

    function seedPendingHistory(
        address user,
        uint256 tokenId,
        uint256[7] calldata pct,
        uint256 count,
        uint256 checkpointIndex
    ) external {
        EncryptedBalance storage balance = balances[user][tokenId];
        for (uint256 i = 0; i < count; i++) {
            balance.amountPCTs.push(
                AmountPCT({pct: pct, index: checkpointIndex})
            );
        }
    }
}
