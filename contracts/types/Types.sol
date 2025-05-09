// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem

pragma solidity 0.8.27;

struct Point {
    uint256 x;
    uint256 y;
}

struct CreateEncryptedERCParams {
    // registrar contract address for fetching users public key
    address registrar;
    // eERC is converter mode or not
    bool isConverter;
    // eERC Token
    string name;
    string symbol;
    uint8 decimals;
    // verifiers
    address mintVerifier;
    address withdrawVerifier;
    address transferVerifier;
    address burnVerifier;
}

struct AmountPCT {
    uint256[7] pct;
    uint256 index;
}

struct EncryptedBalance {
    EGCT eGCT;
    mapping(uint256 index => BalanceHistory history) balanceList;
    uint256 nonce;
    uint256 transactionIndex;
    uint256[7] balancePCT; // user balance pcts
    AmountPCT[] amountPCTs; // user amount pcts
}

struct BalanceHistory {
    uint256 index;
    bool isValid;
}

struct EGCT {
    Point c1;
    Point c2;
}

/// @dev The proof base is used to verify the proof
struct ProofPoints {
    uint256[2] a;
    uint256[2][2] b;
    uint256[2] c;
}

struct RegisterProof {
    ProofPoints proofPoints;
    uint256[5] publicSignals;
}

struct MintProof {
    ProofPoints proofPoints;
    uint256[24] publicSignals;
}

struct TransferProof {
    ProofPoints proofPoints;
    uint256[32] publicSignals;
}

struct BurnProof {
    ProofPoints proofPoints;
    uint256[19] publicSignals;
}

struct WithdrawProof {
    ProofPoints proofPoints;
    uint256[16] publicSignals;
}

struct TransferInputs {
    EGCT providedBalance;
    EGCT senderEncryptedAmount;
    EGCT receiverEncryptedAmount;
    uint256[7] amountPCT;
}
