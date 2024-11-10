// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IWithdrawVerifier {
    function verifyProof(
        uint256[8] calldata proof,
        uint256[20] calldata input
    ) external view;
}
