// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IBurnVerifier {
    function verifyProof(
        uint256[8] calldata proof,
        uint256[19] calldata input
    ) external view;
}
