// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem

pragma solidity 0.8.27;

import {SimpleERC20} from "./SimpleERC20.sol";

/**
 * @title FeeERC20
 * @dev ERC20 token with a fee mechanism for testing
 */
contract FeeERC20 is SimpleERC20 {
    uint256 public feeRate;
    address public feeCollector;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimal,
        uint256 feeRates,
        address feeCollectors
    ) SimpleERC20(name, symbol, decimal) {
        feeRate = feeRates;
        feeCollector = feeCollectors;
    }

    /**
     * @dev Override transferFrom to apply a fee
     * @param sender The address to transfer from
     * @param recipient The address to transfer to
     * @param amount The amount to transfer
     * @return A boolean that indicates if the operation was successful
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        address spender = _msgSender();

        // Calculate fee
        uint256 fee = (amount * feeRate) / 100;
        uint256 amountAfterFee = amount - fee;

        // Deduct allowance
        _spendAllowance(sender, spender, amount);

        // Transfer amount after fee to recipient
        _transfer(sender, recipient, amountAfterFee);

        // Transfer fee to fee collector
        if (fee > 0) {
            _transfer(sender, feeCollector, fee);
        }

        return true;
    }
}
