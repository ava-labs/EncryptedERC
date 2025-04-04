// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem

pragma solidity 0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SimpleERC20 is ERC20 {
    // token decimals
    uint8 public decimals_;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimal
    ) ERC20(name, symbol) {
        decimals_ = decimal;
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function decimals() public view virtual override returns (uint8) {
        return decimals_;
    }
}
