// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TokenTracker} from "./TokenTracker.sol";
import {EncryptedUserBalances} from "./EncryptedUserBalances.sol";

import {IRegistrar} from "./interfaces/IRegistrar.sol";
import {CreateEncryptedERCParams, Point} from "./types/Types.sol";
import {UserNotRegistered, UnauthorizedAccess} from "./errors/Errors.sol";

contract EncryptedERC is TokenTracker, Ownable, EncryptedUserBalances {
    // registrar contract
    IRegistrar public registrar;

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
     * @param _user User address
     * @param _tokenId Token ID
     * @param _pct Balance pct
     * @dev Sets the balance pct for the user and token
     * @dev Only the registrar can set the balance pct
     */
    function setUserBalancePCT(
        address _user,
        uint256 _tokenId,
        uint256[7] memory _pct
    ) external {
        address sender = msg.sender;
        if (sender != address(registrar)) {
            revert UnauthorizedAccess();
        }

        _setUserBalancePCT(_user, _tokenId, _pct);
    }

    /**
     * @return bool returns true if the auditor public key is set
     */
    function isAuditorKeySet() public view returns (bool) {
        return auditorPublicKey.X != 0 && auditorPublicKey.Y != 0;
    }
}
