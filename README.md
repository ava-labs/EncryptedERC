# Encrypted ERC-20 (eERC)

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

## Specifications

On-chain gas costs (Fuji):

-   Mint (Deposit): 750397 TODO
-   Burn (Withdraw): 584371 TODO
-   Register: 870487 TODO
-   Transfer: 1359399 TODO

ZK Proof generation (Macbook Pro M1 TODO (M3 Pro)):

-   Burn (Withdraw) Circuit: 318.66ms (0.32s) TODO
-   Register Circuit: 26.39ms (0.03s) TODO
-   Transfer Circuit: 369.66ms (0.37s) TODO
