// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;

struct UserPublicKey {
    Point publicKey;
}

struct Point {
    uint256 X;
    uint256 Y;
}
