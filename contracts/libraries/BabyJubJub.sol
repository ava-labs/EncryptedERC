// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Structs
import {Point, EGCT} from "../types/Types.sol";

/**
 * @dev BabyJubJub curve operations
 */
library BabyJubJub {
    // Curve parameters
    // E: A^2 + y^2 = 1 + Dx^2y^2 (mod Q)
    uint256 internal constant A = 168700;
    uint256 internal constant D = 168696;
    uint256 internal constant Q =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 internal constant H =
        10944121435919637611123202872628637544274182200208017171849102093287904247808;
    uint256 internal constant R =
        2736030358979909402780800718157159386076813972158567259200215660948447373041;

    /**
     * @dev Default generator
     */
    function base8() public pure returns (Point memory) {
        return
            Point({
                X: 5299619240641551281634865583518297030282874472190772894086521144482721001553,
                Y: 16950150798460657717958625567821834550301663161624707787222815936182638968203
            });
    }

    /**
     * @dev Subtract a BabyJubJub point from another BabyJubJub point
     * @param _point1 the point which will be subtracted from
     * @param _point2 point to subtract
     * @return result
     */
    function _sub(
        Point memory _point1,
        Point memory _point2
    ) public view returns (Point memory) {
        return _add(_point1, negate(_point2));
    }

    /**
     * @dev Add 2 points on BabyJubJub curve
     * Formulae for adding 2 points on a twisted Edwards curve:
     * x3 = (x1y2 + y1x2) / (1 + dx1x2y1y2)
     * y3 = (y1y2 - ax1x2) / (1 - dx1x2y1y2)
     * @param _point1 first point
     * @param _point2 second point
     * @return resulting point
     */
    function _add(
        Point memory _point1,
        Point memory _point2
    ) public view returns (Point memory) {
        uint256 x1x2 = mulmod(_point1.X, _point2.X, Q);
        uint256 y1y2 = mulmod(_point1.Y, _point2.Y, Q);

        uint256 dx1x2y1y2 = mulmod(D, mulmod(x1x2, y1y2, Q), Q);

        uint256 x3Num = addmod(
            mulmod(_point1.X, _point2.Y, Q),
            mulmod(_point1.Y, _point2.X, Q),
            Q
        );
        uint256 y3Num = submod(y1y2, mulmod(A, x1x2, Q));

        return
            Point({
                X: mulmod(x3Num, invmod(addmod(1, dx1x2y1y2, Q)), Q),
                Y: mulmod(y3Num, invmod(submod(1, dx1x2y1y2)), Q)
            });
    }

    /**
     * @dev Double a point on BabyJubJub curve
     * @param _p point to double
     * @return doubled point
     */
    function double(Point memory _p) internal view returns (Point memory) {
        return _add(_p, _p);
    }

    /**
     * @dev Multiply a BabyJubJub point by a scalar
     * Use the double and add algorithm
     * @param _point point be multiplied by a scalar
     * @param _scalar scalar value
     * @return resulting point
     */
    function scalarMultiply(
        Point memory _point,
        uint256 _scalar
    ) public view returns (Point memory) {
        // Initial scalar remainder
        uint256 remaining = _scalar % R;

        // Copy initial point so that we don't mutate it
        Point memory initial = _point;

        // Initialize result
        Point memory result = Point({X: 0, Y: 1});

        // Loop while remainder is greater than 0
        while (remaining != 0) {
            // If the right-most binary digit is 1 (number is odd) add initial point to result
            if ((remaining & 1) != 0) {
                result = _add(result, initial);
            }

            // Double initial point
            initial = double(initial);

            // Shift bits to the right
            remaining = remaining >> 1;
        }

        return result;
    }

    /**
     * @dev Negate a BabyJubJub point
     * @param _point point to negate
     * @return p = -(_p)
     */
    function negate(Point memory _point) internal pure returns (Point memory) {
        return Point({X: Q - _point.X, Y: _point.Y});
    }

    /**
     * @dev Check if a BabyJubJub point is on the curve
     * (168700x^2 + y^2) = (1 + 168696x^2y^2)
     * @param _point point to check
     * @return is on curve
     */
    function isOnCurve(Point memory _point) internal pure returns (bool) {
        uint256 xSq = mulmod(_point.X, _point.X, Q);
        uint256 ySq = mulmod(_point.Y, _point.Y, Q);

        uint256 lhs = addmod(mulmod(A, xSq, Q), ySq, Q);
        uint256 rhs = addmod(1, mulmod(mulmod(D, xSq, Q), ySq, Q), Q);

        return submod(lhs, rhs) == 0;
    }

    /**
     * @dev Modular subtract (mod n).
     * @param _a The first number
     * @param _b The number to be subtracted
     * @return result
     */
    function submod(uint256 _a, uint256 _b) internal pure returns (uint256) {
        return addmod(_a, Q - _b, Q);
    }

    /**
     * @dev Compute modular inverse of a number
     * @param _a the value to be inverted in mod Q
     */
    function invmod(uint256 _a) internal view returns (uint256) {
        // We can use Euler's theorem instead of the extended Euclidean algorithm
        // Since m = Q and Q is prime we have: a^-1 = a^(m - 2) (mod m)
        return
            expmod(
                _a,
                0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffffff
            );
    }

    /**
     * @dev Exponentiation modulo Q
     * @param _base the base of the exponentiation
     * @param _exponent the exponent
     * @return result
     */
    function expmod(
        uint256 _base,
        uint256 _exponent
    ) internal view returns (uint256) {
        uint256 result;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            let
                localQ
            := 0x30644E72E131A029B85045B68181585D2833E84879B9709143E1F593F0000001
            let memPtr := mload(0x40)
            mstore(memPtr, 0x20) // Length of base _b
            mstore(add(memPtr, 0x20), 0x20) // Length of exponent _e
            mstore(add(memPtr, 0x40), 0x20) // Length of modulus Q
            mstore(add(memPtr, 0x60), _base) // Base _b
            mstore(add(memPtr, 0x80), _exponent) // Exponent _e
            mstore(add(memPtr, 0xa0), localQ) // Modulus Q

            // The bigModExp precompile is at 0x05
            let success := staticcall(gas(), 0x05, memPtr, 0xc0, memPtr, 0x20)
            switch success
            case 0 {
                revert(0x0, 0x0)
            }
            default {
                result := mload(memPtr)
            }
        }

        return result;
    }

    /**
     *
     * @param _publicKey Public Key that will be used in encryption
     * @param _msg Message in scalar form to be encrypted
     */
    function elGamalEncryption(
        Point memory _publicKey,
        uint256 _msg
    ) public view returns (EGCT memory) {
        uint256 random = 1;
        Point memory b8 = base8();

        Point memory c1 = scalarMultiply(b8, random);
        Point memory pkr = scalarMultiply(_publicKey, random);
        Point memory pMsg = scalarMultiply(b8, _msg);

        Point memory c2 = _add(pkr, pMsg);

        return EGCT({c1: c1, c2: c2});
    }

    // encrypts zero point with random (1 in this case)
    function encryptZero(
        Point memory _publicKey
    ) public view returns (EGCT memory) {
        return elGamalEncryption(_publicKey, 0);
    }

    // elgamal encryption with a given message
    function encrypt(
        Point memory _publicKey,
        uint256 _msg
    ) public view returns (EGCT memory) {
        return elGamalEncryption(_publicKey, _msg);
    }
}
