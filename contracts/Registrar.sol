// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Point, UserPublicKey} from "./types/Types.sol";
import {UserAlreadyRegistered} from "./errors/Errors.sol";

// import {Point, User, RegisterProof} from "./structs/Structs.sol";
// import {IRegisterVerifier} from "./interfaces/IRegisterVerifier.sol";
// import {DuplicatePublicKey, InvalidProof} from "./errors/Errors.sol";

contract Registrar is Ownable {
    address public constant BURN_USER =
        0x1111111111111111111111111111111111111111;

    /**
     * @dev Mapping of user addresses to their public keys
     */
    mapping(address userAddress => UserPublicKey userPublicKey) public users;

    constructor() Ownable(msg.sender) {
        // setting burn user to the identity point (0, 1)
        users[BURN_USER] = UserPublicKey({publicKey: Point({X: 0, Y: 1})});
    }

    /**
     *
     * @param user Address of the user
     * @param publicKey Public key of the user
     */
    event Register(address indexed user, Point publicKey);

    // function register(registerProof memory _proof) external;
    function register() external {
        address account = _msgSender();

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
        users[_user] = UserPublicKey({publicKey: _publicKey});
        emit Register(_user, _publicKey);
    }

    /**
     *
     * @param _user Address of the user
     *
     * @return bool True if the user is registered
     */
    function isUserRegistered(address _user) public view returns (bool) {
        return users[_user].publicKey.X != 0 && users[_user].publicKey.Y != 0;
    }
}
