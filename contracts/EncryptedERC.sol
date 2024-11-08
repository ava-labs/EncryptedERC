// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;
// contracts
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TokenTracker} from "./TokenTracker.sol";
import {EncryptedUserBalances} from "./EncryptedUserBalances.sol";

// libraries
import {BabyJubJub} from "./libraries/BabyJubJub.sol";

// types
import {CreateEncryptedERCParams, Point, EGCT, EncryptedBalance, AmountPCT} from "./types/Types.sol";

// errors
import {UserNotRegistered, UnauthorizedAccess, AuditorKeyNotSet, InvalidProof, InvalidOperation, TransferFailed, TokenDecimalsTooLow} from "./errors/Errors.sol";

// interfaces
import {IRegistrar} from "./interfaces/IRegistrar.sol";
import {IMintVerifier} from "./interfaces/verifiers/IMintVerifier.sol";
import {IBurnVerifier} from "./interfaces/verifiers/IBurnVerifier.sol";
import {ITransferVerifier} from "./interfaces/verifiers/ITransferVerifier.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract EncryptedERC is TokenTracker, Ownable, EncryptedUserBalances {
    // registrar contract
    IRegistrar public registrar;

    // verifiers
    IMintVerifier public mintVerifier;
    IBurnVerifier public burnVerifier;
    ITransferVerifier public transferVerifier;

    // token name and symbol
    string public name;
    string public symbol;

    // token decimals
    uint8 public decimals;

    // auditor
    Point public auditorPublicKey = Point({X: 0, Y: 0});
    address public auditor = address(0);

    constructor(
        CreateEncryptedERCParams memory params
    ) TokenTracker(params._isConverter) Ownable(msg.sender) {
        registrar = IRegistrar(params._registrar);

        // if contract is not a converter, then set the name and symbol
        if (!params._isConverter) {
            name = params._name;
            symbol = params._symbol;
        }

        decimals = params._decimals;

        mintVerifier = IMintVerifier(params._mintVerifier);
        burnVerifier = IBurnVerifier(params._burnVerifier);
        transferVerifier = ITransferVerifier(params._transferVerifier);
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
     * @param auditorAddress Auditor Address
     * @dev Emitted when a private mint occurs
     */
    event PrivateMint(
        address indexed user,
        uint256[7] auditorPCT,
        address auditorAddress
    );

    /**
     * @param user Address of the user
     * @param auditorPCT Auditor PCT
     * @param auditorAddress Auditor Address
     * @dev Emitted when a private burn occurs
     */
    event PrivateBurn(
        address indexed user,
        uint256[7] auditorPCT,
        address auditorAddress
    );

    /**
     * @param from Address of the sender
     * @param to Address of the receiver
     * @param auditorPCT Auditor PCT
     * @param auditorAddress Auditor Address
     * @dev Emitted when a private transfer occurs
     */
    event PrivateTransfer(
        address indexed from,
        address indexed to,
        uint256[7] auditorPCT,
        address auditorAddress
    );

    /**
     * @param user Address of the user
     * @param amount Amount of the deposit
     * @param dust Amount of the dust
     * @param tokenId Token ID
     * @dev Emitted when a deposit occurs
     */
    event Deposit(
        address indexed user,
        uint256 amount,
        uint256 dust,
        uint256 tokenId
    );

    ///////////////////////////////////////////////////
    ///                   Public                    ///
    ///////////////////////////////////////////////////

    /**
     * @param _user Address of the user
     * @param proof Proof
     * @param input Public inputs for the proof
     */
    function privateMint(
        address _user,
        uint256[8] calldata proof,
        uint256[22] calldata input
    ) external onlyOwner {
        if (isConverter) {
            revert InvalidOperation();
        }

        if (!isAuditorKeySet()) {
            revert AuditorKeyNotSet();
        }

        if (!registrar.isUserRegistered(_user)) {
            revert UserNotRegistered();
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
     * @param proof Proof
     * @param input Public inputs for the proof
     */
    function privateBurn(
        uint256[8] calldata proof,
        uint256[19] calldata input,
        uint256[7] calldata _balancePCT
    ) external {
        address _user = msg.sender;

        if (!registrar.isUserRegistered(_user)) {
            revert UserNotRegistered();
        }

        {
            // user public key should match
            uint256[2] memory userPublicKey = registrar.getUserPublicKey(_user);
            if (userPublicKey[0] != input[0] || userPublicKey[1] != input[1]) {
                revert InvalidProof();
            }
        }

        {
            // auditor public keys should match
            if (
                auditorPublicKey.X != input[10] ||
                auditorPublicKey.Y != input[11]
            ) {
                revert InvalidProof();
            }
        }

        burnVerifier.verifyProof(proof, input);

        _privateBurn(_user, input, _balancePCT);
    }

    /**
     * @param _to Address of the receiver
     * @param _tokenId Token ID
     * @param proof Proof
     * @param input Public inputs for the proof
     * @param _balancePCT Balance PCT
     */
    function transfer(
        address _to,
        uint256 _tokenId,
        uint256[8] calldata proof,
        uint256[32] calldata input,
        uint256[7] calldata _balancePCT
    ) external {
        address _from = msg.sender;
        if (!isAuditorKeySet()) {
            revert AuditorKeyNotSet();
        }

        {
            // check if the from and to users are registered
            if (
                !registrar.isUserRegistered(_from) ||
                !registrar.isUserRegistered(_to)
            ) {
                revert UserNotRegistered();
            }
        }

        {
            // sender and receiver public keys should match
            uint256[2] memory fromPublicKey = registrar.getUserPublicKey(_from);
            uint256[2] memory toPublicKey = registrar.getUserPublicKey(_to);

            if (
                fromPublicKey[0] != input[0] ||
                fromPublicKey[1] != input[1] ||
                toPublicKey[0] != input[10] ||
                toPublicKey[1] != input[11]
            ) {
                revert InvalidProof();
            }
        }

        {
            // auditor public keys should match
            if (
                auditorPublicKey.X != input[23] ||
                auditorPublicKey.Y != input[24]
            ) {
                revert InvalidProof();
            }
        }

        transferVerifier.verifyProof(proof, input);

        _transfer(_from, _to, _tokenId, input, _balancePCT);
    }

    /**
     *
     * @param _user Address of the user
     *
     * @dev Sets the auditor's public key
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
        return auditorPublicKey.X != 0 && auditorPublicKey.Y != 1;
    }

    ///////////////////////////////////////////////////
    ///                   Internal                 ///
    ///////////////////////////////////////////////////

    /**
     * @param _user Address of the user
     * @param input Public inputs for the proof
     */
    function _privateMint(address _user, uint256[22] calldata input) internal {
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

        emit PrivateMint(_user, _auditorPCT, auditor);
    }

    /**
     * @param _user Address of the user
     * @param input Public inputs for the proof
     * @param _balancePCT Balance PCT
     */
    function _privateBurn(
        address _user,
        uint256[19] calldata input,
        uint256[7] calldata _balancePCT
    ) internal {
        EGCT memory providedBalance = EGCT({
            c1: Point({X: input[2], Y: input[3]}),
            c2: Point({X: input[4], Y: input[5]})
        });

        uint256 balanceHash = _hashEGCT(providedBalance);
        (bool isValid, uint256 transactionIndex) = _isBalanceValid(
            _user,
            0,
            balanceHash
        );
        if (!isValid) {
            revert InvalidProof();
        }

        EGCT memory encryptedBurnAmount = EGCT({
            c1: Point({X: input[6], Y: input[7]}),
            c2: Point({X: input[8], Y: input[9]})
        });

        _subtractFromUserBalance(
            _user,
            0,
            encryptedBurnAmount,
            _balancePCT,
            transactionIndex
        );

        uint256[7] memory auditorPCT;
        for (uint256 i = 0; i < 7; i++) {
            auditorPCT[i] = input[12 + i];
        }

        emit PrivateBurn(_user, auditorPCT, auditor);
    }

    /**
     * @param _from Address of the sender
     * @param _to Address of the receiver
     * @param _tokenId Token ID
     * @param input Public inputs for the proof
     * @param _balancePCT Balance PCT
     */
    function _transfer(
        address _from,
        address _to,
        uint256 _tokenId,
        uint256[32] calldata input,
        uint256[7] calldata _balancePCT
    ) internal {
        {
            EGCT memory providedBalance = EGCT({
                c1: Point({X: input[2], Y: input[3]}),
                c2: Point({X: input[4], Y: input[5]})
            });

            uint256 balanceHash = _hashEGCT(providedBalance);
            (bool isValid, uint256 transactionIndex) = _isBalanceValid(
                _from,
                _tokenId,
                balanceHash
            );
            if (!isValid) {
                revert InvalidProof();
            }

            EGCT memory fromEncryptedAmount = EGCT({
                c1: Point({X: input[6], Y: input[7]}),
                c2: Point({X: input[8], Y: input[9]})
            });

            _subtractFromUserBalance(
                _from,
                _tokenId,
                fromEncryptedAmount,
                _balancePCT,
                transactionIndex
            );
        }

        {
            EGCT memory toEncryptedAmount = EGCT({
                c1: Point({X: input[12], Y: input[13]}),
                c2: Point({X: input[14], Y: input[15]})
            });

            uint256[7] memory amountPCT;
            for (uint256 i = 0; i < 7; i++) {
                amountPCT[i] = input[16 + i];
            }

            _addToUserBalance(_to, _tokenId, toEncryptedAmount, amountPCT);
        }

        {
            uint256[7] memory auditorPCT;
            for (uint256 i = 0; i < 7; i++) {
                auditorPCT[i] = input[25 + i];
            }

            emit PrivateTransfer(_from, _to, auditorPCT, auditor);
        }
    }

    ///////////////////////////////////////////////////
    ///                Only Converter                ///
    ///////////////////////////////////////////////////

    /**
     *
     * @param _amount Amount to deposit
     * @param _tokenAddress Token address
     *
     * @dev Deposits an existing ERC20 token to the contract which trivially encrypts the amount and adds it to the user's balance
     */
    function deposit(
        uint256 _amount,
        address _tokenAddress,
        uint256[7] memory _amountPCT
    ) public {
        // revert if auditor key is not set
        if (!isAuditorKeySet()) {
            revert AuditorKeyNotSet();
        }

        // revert if contract is not a converter
        if (!isConverter) {
            revert InvalidOperation();
        }

        IERC20 token = IERC20(_tokenAddress);
        uint256 dust;
        uint256 tokenId;
        address to = msg.sender;

        // revert if the user is not registered to registrar contract
        if (!registrar.isUserRegistered(to)) {
            revert UserNotRegistered();
        }

        // this function reverts if the transfer fails
        token.transferFrom(to, address(this), _amount);

        (dust, tokenId) = _convertFrom(to, _amount, _tokenAddress, _amountPCT);

        // transfer the dust back to the user
        token.transfer(to, dust);

        emit Deposit(to, _amount, dust, tokenId);
    }

    function withdraw(uint256 _tokenId) public {}

    /**
     *
     * @param _to Address of the receiver
     * @param _amount Amount to convert
     * @param _tokenAddress Token address
     *
     * @dev Converts the ERC20 token to the native token
     * @dev Converts the amount by changing the decimals
     * @dev Also checks if this token is already added, if not adds it
     *
     * Returns dust and tokenId
     */
    function _convertFrom(
        address _to,
        uint256 _amount,
        address _tokenAddress,
        uint256[7] memory _amountPCT
    ) internal returns (uint256 dust, uint256 tokenId) {
        uint8 tokenDecimals = IERC20Metadata(_tokenAddress).decimals();

        uint256 value;
        if (tokenDecimals > decimals) {
            // scale up
            uint256 scalingFactor = 10 ** (tokenDecimals - decimals);
            value = _amount / scalingFactor;
            dust = _amount % scalingFactor;
        } else if (tokenDecimals < decimals) {
            // scale down
            uint256 scalingFactor = 10 ** (decimals - tokenDecimals);
            value = _amount * scalingFactor;
            dust = 0;
        } else {
            // no scaling needed
            value = _amount;
            dust = 0;
        }
        // check if it's a new token
        if (tokenIds[_tokenAddress] == 0) {
            _addToken(_tokenAddress);
        }
        tokenId = tokenIds[_tokenAddress];

        if (value == 0) {
            return (dust, tokenId);
        }

        {
            uint256[2] memory publicKey = registrar.getUserPublicKey(_to);

            EGCT memory _eGCT = BabyJubJub.encrypt(
                Point({X: publicKey[0], Y: publicKey[1]}),
                value
            );

            EncryptedBalance storage balance = balances[_to][tokenId];

            if (balance.eGCT.c1.X == 0 && balance.eGCT.c1.Y == 0) {
                balance.eGCT = _eGCT;
            } else {
                balance.eGCT.c1 = BabyJubJub._add(balance.eGCT.c1, _eGCT.c1);
                balance.eGCT.c2 = BabyJubJub._add(balance.eGCT.c2, _eGCT.c2);
            }

            balance.amountPCTs.push(
                AmountPCT({pct: _amountPCT, index: balance.transactionIndex})
            );
            balance.transactionIndex++;

            _commitUserBalance(_to, tokenId);
        }

        return (dust, tokenId);
    }
}
