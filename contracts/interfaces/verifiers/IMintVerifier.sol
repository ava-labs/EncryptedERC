// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IMintVerifier {
    function verifyProof(
        uint256[8] calldata proof,
        uint256[22] calldata input
    ) external view;
}
