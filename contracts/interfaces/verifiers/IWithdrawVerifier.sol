// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem

pragma solidity 0.8.27;

interface IWithdrawVerifier {
    function verifyProof(
        uint256[2] memory pointA_,
        uint256[2][2] memory pointB_,
        uint256[2] memory pointC_,
        uint256[16] memory publicSignals_
    ) external view returns (bool verified_);
}
