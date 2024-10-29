// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TokenTracker} from "./TokenTracker.sol";
import {EncryptedUserBalances} from "./EncryptedUserBalances.sol";

import {CreateEncryptedERCParams, Point, EGCT} from "./types/Types.sol";
import {UserNotRegistered, UnauthorizedAccess, AuditorKeyNotSet, InvalidProof, InvalidOperation} from "./errors/Errors.sol";

import {IRegistrar} from "./interfaces/IRegistrar.sol";
import {IMintVerifier} from "./interfaces/verifiers/IMintVerifier.sol";

contract EncryptedERC is TokenTracker, Ownable, EncryptedUserBalances {
    // registrar contract
    IRegistrar public registrar;

    // verifiers
    IMintVerifier public mintVerifier;

    // token name and symbol
    string public name;
    string public symbol;

    // 2 decimal places
    uint256 public constant decimals = 2;

    // auditor
    Point public auditorPublicKey;
    address public auditor;

    constructor(
        CreateEncryptedERCParams memory params
    ) TokenTracker(params._isConverter) Ownable(msg.sender) {
        registrar = IRegistrar(params._registrar);

        // if contract is not a converter, then set the name and symbol
        if (!params._isConverter) {
            name = params._name;
            symbol = params._symbol;
        }

        mintVerifier = IMintVerifier(params._mintVerifier);
    }

    ///////////////////////////////////////////////////
    ///                    Events                   ///
    ///////////////////////////////////////////////////

    /**
     * @param oldAuditor Address of the old auditor
     * @param newAuditor Address of the new auditor
     * @dev Emitted when the auditor public key is changed
     */
    event AuditorChanged(
        address indexed oldAuditor,
        address indexed newAuditor
    );

    /**
     * @param user Address of the user
     * @param auditorPCT Auditor PCT
     * @dev Emitted when a private mint is done
     */
    event PrivateMint(address indexed user, uint256[7] auditorPCT);

    function privateMint(
        address _user,
        uint256[8] calldata proof,
        uint256[22] calldata input
    ) external onlyOwner {
        if (!isAuditorKeySet()) {
            revert AuditorKeyNotSet();
        }

        {
            // user public key should match
            uint256[2] memory userPublicKey = registrar.getUserPublicKey(_user);
            if (userPublicKey[0] != input[0] || userPublicKey[1] != input[1]) {
                revert InvalidProof();
            }
        }

        {
            // auditor public key should match
            if (
                auditorPublicKey.X != input[13] ||
                auditorPublicKey.Y != input[14]
            ) {
                revert InvalidProof();
            }
        }

        mintVerifier.verifyProof(proof, input);
        _privateMint(_user, input);
    }

    /**
     *
     * @param _user Address of the user
     *
     * @dev sets the auditor public key
     */
    function setAuditorPublicKey(address _user) external onlyOwner {
        if (!registrar.isUserRegistered(_user)) {
            revert UserNotRegistered();
        }

        address oldAuditor = auditor;
        uint256[2] memory publicKey = registrar.getUserPublicKey(_user);

        auditor = _user;
        auditorPublicKey = Point({X: publicKey[0], Y: publicKey[1]});

        emit AuditorChanged(oldAuditor, _user);
    }

    /**
     * @return bool returns true if the auditor public key is set
     */
    function isAuditorKeySet() public view returns (bool) {
        return auditorPublicKey.X != 0 && auditorPublicKey.Y != 0;
    }

    ///////////////////////////////////////////////////
    ///                   Internal                 ///
    ///////////////////////////////////////////////////
    function _privateMint(address _user, uint256[22] calldata input) internal {
        if (isConverter) {
            revert InvalidOperation();
        }

        EGCT memory eGCT = EGCT({
            c1: Point({X: input[2], Y: input[3]}),
            c2: Point({X: input[4], Y: input[5]})
        });

        // since private mint is only for the standalone ERC, tokenId is always 0
        uint256 tokenId = 0;

        uint256[7] memory _amountPCT;
        uint256[7] memory _auditorPCT;
        for (uint256 i = 0; i < 7; i++) {
            _amountPCT[i] = input[6 + i];
            _auditorPCT[i] = input[15 + i];
        }

        _addToUserBalance(_user, tokenId, eGCT, _amountPCT);

        emit PrivateMint(_user, _auditorPCT);
    }
}
