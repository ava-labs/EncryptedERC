// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Point} from "./types/Types.sol";
import {UserAlreadyRegistered} from "./errors/Errors.sol";

// import {Point, User, RegisterProof} from "./structs/Structs.sol";
// import {IRegisterVerifier} from "./interfaces/IRegisterVerifier.sol";
// import {DuplicatePublicKey, InvalidProof} from "./errors/Errors.sol";

contract Registrar {
    address public constant BURN_USER =
        0x1111111111111111111111111111111111111111;

    /**
     * @dev Mapping of user addresses to their public keys
     */
    mapping(address userAddress => Point userPublicKey) public userPublicKeys;

    constructor() {
        // setting burn user to the identity point (0, 1)
        userPublicKeys[BURN_USER] = Point({X: 0, Y: 1});
    }

    /**
     *
     * @param user Address of the user
     * @param publicKey Public key of the user
     */
    event Register(address indexed user, Point publicKey);

    // TODO(@mberatoz): pass the proof as a parameter
    function register() external {
        address account = msg.sender;

        // TODO(@mberatoz): verify the proof

        if (isUserRegistered(account)) {
            revert UserAlreadyRegistered();
        }

        // TODO(@mberatoz): change this to the actual public key from the public ins
        _register(account, Point({X: 0, Y: 1}));
    }

    /**
     *
     * @param _user Address of the user
     * @param _publicKey Public key of the user
     *
     * @dev Internal function for setting user public key
     */
    function _register(address _user, Point memory _publicKey) internal {
        userPublicKeys[_user] = _publicKey;
        emit Register(_user, _publicKey);
    }

    /**
     *
     * @param _user Address of the user
     *
     * @return bool True if the user is registered
     */
    function isUserRegistered(address _user) public view returns (bool) {
        return userPublicKeys[_user].X != 0 && userPublicKeys[_user].Y != 0;
    }

    /**
     *
     * @param _user Address of the user
     *
     * @return publicKey Public key of the user as [x, y] coordinates
     */
    function getUserPublicKey(
        address _user
    ) public view returns (uint256[2] memory publicKey) {
        return [userPublicKeys[_user].X, userPublicKeys[_user].Y];
    }
}
