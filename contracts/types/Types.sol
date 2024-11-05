// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;

struct Point {
    uint256 X;
    uint256 Y;
}

struct CreateEncryptedERCParams {
    address _registrar;
    bool _isConverter;
    string _name;
    string _symbol;
    uint8 _decimals;
    // verifiers
    address _mintVerifier;
    address _burnVerifier;
    address _transferVerifier;
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
