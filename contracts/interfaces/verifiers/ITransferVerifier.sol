// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ITransferVerifier {
    function verifyProof(
        uint256[8] calldata proof,
        uint256[32] calldata input
    ) external view;
}
