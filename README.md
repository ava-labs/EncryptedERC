<div  align="center">

<img  src="images/banner.png">

</div>

---

# Encrypted ERC-20 Protocol

The Encrypted ERC-20 (eERC) standard enables secure and confidential token transfers on Avalanche blockchains. Leveraging zk-SNARKs and partially homomorphic encryption, the eERC protocol offers robust privacy without requiring protocol-level modifications or off-chain intermediaries.
AvaCloud API documentation can be found [here](https://docs.avacloud.io/encrypted-erc/getting-started/what-is-encrypted-erc)

## Key features

- **Confidential Transactions**: User balances and transaction amounts remain completely hidden, ensuring financial privacy.

- **Large Integers**: Efficiently handles token amounts up to 128 bits (2^128), accommodating substantial financial transactions.

- **Client-Side Operations**: Users retain control, performing encryption, decryption, and zk-proof generation directly on their own devices.

- **Fully On-chain Nature**: Operates entirely on-chain without the need for relayers or off-chain actors.

- **Built-in Compliance**: Supports external auditors, ensuring regulatory compliance.

- **Dual-Mode Operation**: Supports both standalone tokens and conversion of existing ERC-20 tokens.

- **Zero-Knowledge Proofs**: Uses zk-SNARKs to validate transactions without revealing sensitive information.

- **Homomorphic Encryption**: Leverages ElGamal encryption for private balance management.

## Architecture

The eERC protocol consists of several key components:

### Core Contracts

- **EncryptedERC**: The main contract that implements the privacy-preserving ERC-20 functionality.

- **Registrar**: Manages user registration and public key association.

- **EncryptedUserBalances**: Handles encrypted balance storage and updates.

- **TokenTracker**: Manages token registration and tracking.

- **AuditorManager**: Provides auditor-related functionality for compliance.

### Cryptographic Components

- **BabyJubJub**: Library for elliptic curve operations on the BabyJubJub curve.

- **Zero-Knowledge Circuits**: Circom-based circuits for proof generation and verification.

- Registration Circuit

- Mint Circuit

- Transfer Circuit

- Withdraw Circuit

### Operation Modes

1.  **Standalone Mode**: Creates entirely new private ERC-20 tokens with built-in privacy.

2.  **Converter Mode**: Adds privacy features to existing ERC-20 tokens. Wraps existing ERC20-

## File structure

- [contracts](#contracts) Smart contract source files

  - `EncryptedERC.sol` - Main contract implementation

  - `Registrar.sol` - User registration management

  - `EncryptedUserBalances.sol` - Encrypted balance handling

  - `tokens/TokenTracker.sol` - Token registration and tracking

  - `auditor/AuditorManager.sol` - Auditor functionality

  - `libraries/BabyJubJub.sol` - Cryptographic operations

  - `types/Types.sol` - Data structures and types

  - `interfaces/` - Contract interfaces

  - `verifiers/` - Zero-knowledge proof verifiers

- [scripts](#scripts) Utility and deployment scripts

- [src](#src) Encryption utilities for TypeScript

- [tests](#tests) Test scripts and helpers

- [circom](#circom) Zero-knowledge proof circuits

## Getting Started

### Prerequisites

You need following dependencies for setup:

- `NodeJS >= v16.x`

- `Golang >= 1.23.x`

### Installation

1. Clone the repo

```sh

git clone https://github.com/ava-labs/EncryptedERC.git

```

2. Install NPM packages

```sh
npm install
```

3. Compile the contracts

```sh
npx hardhat compile

```

4. Compile Verifiers

```
TODO
```

## Deployment (Local)

### Standalone

The Standalone version lets users create entirely new private ERC-20 tokens with built-in privacy, supporting confidential minting and burning.

1. Start the local node

```sh
npx  hardhat  node

```

2. Deploy the contract

```sh
npx  hardhat  run  scripts/deploy-standalone.ts  --network  localhost

```

Refer to the [scripts/deploy-standalone.ts](scripts/deploy-standalone.ts) script for deployment examples.

### Converter

The Converter version adds privacy features to existing ERC-20 tokens, enabling users to convert standard ERC-20 tokens to private ones and switch between public and private states through deposit and withdrawal functions.

1. Start the local node

```sh
npx  hardhat  node

```

2. Deploy the contract

```sh
npx  hardhat  run  scripts/deploy-converter.ts  --network  localhost

```

Refer to the [scripts/deploy-converter.ts](scripts/deploy-converter.ts) script for deployment examples.

## Run Tests/Coverage

Contract tests:

```bash
npx  hardhat  test

```

Coverage report:

```bash
npx  hardhat  coverage
```

## 📊 Performance Overview

### ⛽ Avg. On-Chain Gas Costs (C-Chain Mainnet)

```sh
······················································································································································································
|  Solidity and Network Configuration                                                                                                                                                │
·································································································|·················|···············|·················|································
|  Solidity: 0.8.27                                                                              ·  Optim: true    ·  Runs: 200    ·  viaIR: false   ·     Block: 30,000,000 gas     │
·································································································|·················|···············|·················|································
|  Network: AVALANCHE                                                                            ·  L1: 1 gwei                     ·                 ·        18.10 usd/avax         │
·································································································|·················|···············|·················|················|···············
|  Contracts / Methods                                                                           ·  Min            ·  Max          ·  Avg            ·    calls       ·  usd (avg)   │
·································································································|·················|···············|·················|················|···············
|  EncryptedERC                                                                                  ·                                                                                   │
·································································································|·················|···············|·················|················|···············
|      deposit(uint256,address,uint256[7])                                                       ·         71,668  ·      841,735  ·        564,887  ·            16  ·        0.01  │
·································································································|·················|···············|·················|················|···············
|      privateBurn(((uint256[2],uint256[2][2],uint256[2]),uint256[32]),uint256[7])               ·        890,543  ·    1,227,968  ·      1,028,687  ·             4  ·        0.02  │
·································································································|·················|···············|·················|················|···············
|      privateMint(address,((uint256[2],uint256[2][2],uint256[2]),uint256[24]))                  ·        712,316  ·      760,612  ·        722,000  ·            10  ·        0.01  │
·································································································|·················|···············|·················|················|···············
|      setAuditorPublicKey(address)                                                              ·              -  ·            -  ·        103,851  ·             4  ·           △  │
·································································································|·················|···············|·················|················|···············
|      setTokenBlacklist(address,bool)                                                           ·              -  ·            -  ·         46,443  ·             1  ·           △  │
·································································································|·················|···············|·················|················|···············
|      transfer(address,uint256,((uint256[2],uint256[2][2],uint256[2]),uint256[32]),uint256[7])  ·              -  ·            -  ·        947,283  ·             4  ·        0.02  │
·································································································|·················|···············|·················|················|···············
|      withdraw(uint256,((uint256[2],uint256[2][2],uint256[2]),uint256[16]),uint256[7])          ·        775,138  ·      828,341  ·        796,231  ·             6  ·        0.01  │
·································································································|·················|···············|·················|················|···············
|  FeeERC20                                                                                      ·                                                                                   │
·································································································|·················|···············|·················|················|···············
|      approve(address,uint256)                                                                  ·              -  ·            -  ·         46,335  ·             1  ·           △  │
·································································································|·················|···············|·················|················|···············
|      mint(address,uint256)                                                                     ·              -  ·            -  ·         68,508  ·             1  ·           △  │
·································································································|·················|···············|·················|················|···············
|  Registrar                                                                                     ·                                                                                   │
·································································································|·················|···············|·················|················|···············
|      register(((uint256[2],uint256[2][2],uint256[2]),uint256[5]))                              ·        322,126  ·      322,150  ·        322,142  ·            20  ·        0.01  │
·································································································|·················|···············|·················|················|···············
|  SimpleERC20                                                                                   ·                                                                                   │
·································································································|·················|···············|·················|················|···············
|      approve(address,uint256)                                                                  ·         46,323  ·       46,383  ·         46,350  ·            16  ·           △  │
·································································································|·················|···············|·················|················|···············
|      mint(address,uint256)                                                                     ·         68,433  ·       68,457  ·         68,441  ·             6  ·           △  │
·································································································|·················|···············|·················|················|···············
|  Deployments                                                                                                     ·                                 ·  % of limit    ·              │
·································································································|·················|···············|·················|················|···············
|  BabyJubJub                                                                                    ·              -  ·            -  ·        447,616  ·         1.5 %  ·        0.01  │
·································································································|·················|···············|·················|················|···············
|  EncryptedERC                                                                                  ·      3,704,659  ·    3,729,785  ·      3,717,222  ·        12.4 %  ·        0.07  │
·································································································|·················|···············|·················|················|···············
|  FeeERC20                                                                                      ·              -  ·            -  ·        658,116  ·         2.2 %  ·        0.01  │
·································································································|·················|···············|·················|················|···············
|  MintCircuitGroth16Verifier                                                                    ·              -  ·            -  ·      1,690,470  ·         5.6 %  ·        0.03  │
·································································································|·················|···············|·················|················|···············
|  Registrar                                                                                     ·              -  ·            -  ·        508,067  ·         1.7 %  ·        0.01  │
·································································································|·················|···············|·················|················|···············
|  RegistrationCircuitGroth16Verifier                                                            ·              -  ·            -  ·        810,848  ·         2.7 %  ·        0.01  │
·································································································|·················|···············|·················|················|···············
|  SimpleERC20                                                                                   ·        557,086  ·      557,146  ·        557,101  ·         1.9 %  ·        0.01  │
·································································································|·················|···············|·················|················|···············
|  TransferCircuitGroth16Verifier                                                                ·              -  ·            -  ·      2,052,092  ·         6.8 %  ·        0.04  │
·································································································|·················|···············|·················|················|···············
|  WithdrawCircuitGroth16Verifier                                                                ·              -  ·            -  ·      1,319,158  ·         4.4 %  ·        0.02  │
·································································································|·················|···············|·················|················|···············
|  Key                                                                                                                                                                               │
······················································································································································································
|  ◯  Execution gas for this method does not include intrinsic gas overhead                                                                                                          │
······················································································································································································
|  △  Cost was non-zero but below the precision setting for the currency display (see options)                                                                                       │
······················································································································································································
|  Toolchain:  hardhat                                                                                                                                                               │
······················································································································································································

```

### ⏱️ Circuit Benchmarks for Proof Generation

| **Operation**    | **Proving Time** |
| ---------------- | ---------------- |
| Registration     | 458 ms           |
| Private Mint     | 863 ms           |
| Private Burn     | 360 ms           |
| Private Transfer | 1120 ms          |

## Security Considerations

- **Auditor Integration**: The protocol includes built-in auditor functionality for regulatory compliance.

- **Nullifier System**: Prevents double-spending through a robust nullifier mechanism.

- **Blacklisting**: Supports token blacklisting for security purposes.

- **Input Validation**: Comprehensive validation of all inputs to prevent attacks.

- **Access Control**: Proper access control mechanisms for sensitive operations.

## License

This project is licensed under the Ecosystem License - see the LICENSE file for details.
