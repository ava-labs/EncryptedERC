# Encrypted ERC-20 Protocol

The Encrypted ERC-20 (eERC) is a protocol that enables efficient confidential token transfers on Avalanche blockchain. eERC does not require modification at the protocol level or off-chain actors and relies purely on zk-SNARKs and homomorphic encryption. It comes with various features such as:

-   Confidential Transactions: Conceals the token balances of users and the amounts in each transaction.
-   Supports large integers: Allows for the use of integers up to 2^128 bits.
-   Client-side operations: Encryption, decryption and proof generation are conducted by the users from client side.
-   Fully on-chain Nature: Operates entirely on-chain without the need for relayers or off-chain actors.
-   Native compliance: Auditors can audit the transaction details.

## Overview

TODO 

# File structure

-   [contracts](#contracts) Smart contract source files for the eERC protocol.
-   [scripts](#scripts) Utility and deployment scripts for contracts.
-   [src](#src)  TODO
-   [tests](#tests) Test scripts and files of eERC protocol.
-   [zk-SNARKs](#zk) Implementation of zero-knowledge proof components used by eERC.


## Getting Started

### Prerequisites

You need following dependencies for setup:

-   `NodeJS >= v16.x `
-   `Golang >= 1.20.x `

### Installation

1. Clone the repo
    ```sh
    git clone https://github.com/ava-labs/EncryptedERC.git
    ```
2. Install NPM packages

    ```sh
    npm install
    ```

    Note: This command will run a bash script to compile gnark's circuits, if this does not work:
    In [zk](#zk) directory run the following command to build manually:

    On x64:

    ```sh
    go build -o ../outputs/eerc20_zk_x64
    ```

    On arm64:

    ```sh
    go build -o ../outputs/eerc20_zk
    ```

### Run Tests/Coverage

Contract tests:

```
npx hardhat coverage
```

Jest:

```
npm run test --coverage
```

## 📊 Performance Overview

### ⛽ On-Chain Gas Costs (Fuji Testnet)

| **Operation**        | **Gas Cost**   |
|----------------------|----------------|
| Register             | 273,085 gas    |
| Deposit              | 556,273 gas    |
| Withdraw             | *TODO*      |
| Private Burn         | 646,666 gas    |
| Private Mint         | 677,304 gas    |
| Private Transfer     | 1,036,451 gas  |
| Update Auditor       | 103,753 gas    |

### ⏱️ Circuit Proving Times

Tested on a MacBook (M3 Pro CPU):

| **Operation**        | **Proving Time** |
|----------------------|------------------|
| Registration         | 71 ms            |
| Private Mint         | 359 ms           |
| Private Burn         | 360 ms           |
| Private Transfer     | 606 ms           |
