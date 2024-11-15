// SPDX-License-Identifier: AML
//
// Copyright 2017 Christian Reitwiessner
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

// 2019 OKIMS

pragma solidity ^0.8.0;

library Pairing {
    uint256 constant PRIME_Q =
        21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct G1Point {
        uint256 X;
        uint256 Y;
    }

    // Encoding of field elements is: X[0] * z + X[1]
    struct G2Point {
        uint256[2] X;
        uint256[2] Y;
    }

    /*
     * @return The negation of p, i.e. p.plus(p.negate()) should be zero.
     */
    function negate(G1Point memory p) internal pure returns (G1Point memory) {
        // The prime q in the base field F_q for G1
        if (p.X == 0 && p.Y == 0) {
            return G1Point(0, 0);
        } else {
            return G1Point(p.X, PRIME_Q - (p.Y % PRIME_Q));
        }
    }

    /*
     * @return The sum of two points of G1
     */
    function plus(
        G1Point memory p1,
        G1Point memory p2
    ) internal view returns (G1Point memory r) {
        uint256[4] memory input;
        input[0] = p1.X;
        input[1] = p1.Y;
        input[2] = p2.X;
        input[3] = p2.Y;
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 6, input, 0xc0, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success
            case 0 {
                invalid()
            }
        }

        require(success, "pairing-add-failed");
    }

    /*
     * Same as plus but accepts raw input instead of struct
     * @return The sum of two points of G1, one is represented as array
     */
    function plus_raw(uint256[4] memory input, G1Point memory r) internal view {
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 6, input, 0xc0, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success
            case 0 {
                invalid()
            }
        }

        require(success, "pairing-add-failed");
    }

    /*
     * @return The product of a point on G1 and a scalar, i.e.
     *         p == p.scalar_mul(1) and p.plus(p) == p.scalar_mul(2) for all
     *         points p.
     */
    function scalar_mul(
        G1Point memory p,
        uint256 s
    ) internal view returns (G1Point memory r) {
        uint256[3] memory input;
        input[0] = p.X;
        input[1] = p.Y;
        input[2] = s;
        bool success;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 7, input, 0x80, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success
            case 0 {
                invalid()
            }
        }
        require(success, "pairing-mul-failed");
    }

    /*
     * Same as scalar_mul but accepts raw input instead of struct,
     * Which avoid extra allocation. provided input can be allocated outside and re-used multiple times
     */
    function scalar_mul_raw(
        uint256[3] memory input,
        G1Point memory r
    ) internal view {
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 7, input, 0x80, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success
            case 0 {
                invalid()
            }
        }
        require(success, "pairing-mul-failed");
    }

    /* @return The result of computing the pairing check
     *         e(p1[0], p2[0]) *  .... * e(p1[n], p2[n]) == 1
     *         For example,
     *         pairing([P1(), P1().negate()], [P2(), P2()]) should return true.
     */
    function pairing(
        G1Point memory a1,
        G2Point memory a2,
        G1Point memory b1,
        G2Point memory b2,
        G1Point memory c1,
        G2Point memory c2,
        G1Point memory d1,
        G2Point memory d2
    ) internal view returns (bool) {
        G1Point[4] memory p1 = [a1, b1, c1, d1];
        G2Point[4] memory p2 = [a2, b2, c2, d2];
        uint256 inputSize = 24;
        uint256[] memory input = new uint256[](inputSize);

        for (uint256 i = 0; i < 4; i++) {
            uint256 j = i * 6;
            input[j + 0] = p1[i].X;
            input[j + 1] = p1[i].Y;
            input[j + 2] = p2[i].X[0];
            input[j + 3] = p2[i].X[1];
            input[j + 4] = p2[i].Y[0];
            input[j + 5] = p2[i].Y[1];
        }

        uint256[1] memory out;
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(
                sub(gas(), 2000),
                8,
                add(input, 0x20),
                mul(inputSize, 0x20),
                out,
                0x20
            )
            // Use "invalid" to make gas estimation work
            switch success
            case 0 {
                invalid()
            }
        }

        require(success, "pairing-opcode-failed");

        return out[0] != 0;
    }
}

contract ProductionMintVerifier {
    /// The proof is invalid.
    /// @dev This can mean that provided Groth16 proof points are not on their
    /// curves, that pairing equation fails, or that the proof is not for the
    /// provided public input.
    error ProofInvalid();
    using Pairing for *;

    uint256 constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant PRIME_Q =
        21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct VerifyingKey {
        Pairing.G1Point alfa1;
        Pairing.G2Point beta2;
        Pairing.G2Point gamma2;
        Pairing.G2Point delta2;
        // []G1Point IC (K in gnark) appears directly in verifyProof
    }

    struct Proof {
        Pairing.G1Point A;
        Pairing.G2Point B;
        Pairing.G1Point C;
    }

    function verifyingKey() internal pure returns (VerifyingKey memory vk) {
        vk.alfa1 = Pairing.G1Point(
            uint256(
                10281764569703569485877423601756121941782891284766570261545086923589312027089
            ),
            uint256(
                12294666204280358035032314808670738736416125662270554314331586352282289131939
            )
        );
        vk.beta2 = Pairing.G2Point(
            [
                uint256(
                    2810117028410940533254294349284824348316637952185131031416686036337624068464
                ),
                uint256(
                    10520563254095089553976882482426716061267384538228726036389568533021105582406
                )
            ],
            [
                uint256(
                    15540006419521679590912544053270317487049132720682268285486949181216934122446
                ),
                uint256(
                    481494130730287750008763830632212054694127468622733392438200868958842952318
                )
            ]
        );
        vk.gamma2 = Pairing.G2Point(
            [
                uint256(
                    5051032617271725743091638688374916585396067651679619285126802959202335302186
                ),
                uint256(
                    21180197446053477072437095574817547303219649968124938737736300815049704938460
                )
            ],
            [
                uint256(
                    9286163053052774484391070326975036938966786473174159322000935297903638628278
                ),
                uint256(
                    1722271958566228627753515213322081324078154318904486761244543965033758643930
                )
            ]
        );
        vk.delta2 = Pairing.G2Point(
            [
                uint256(
                    3441034600899790628824116836283556300959766001298782704844062403683922584816
                ),
                uint256(
                    12078137652237507444665165916367052907970353766756270528561402998372115251162
                )
            ],
            [
                uint256(
                    7813367908880395233168838980085060003717544434644680956490336200498839225217
                ),
                uint256(
                    15247881650296701261700674519662381681058052453193091156068166181336442844589
                )
            ]
        );
    }

    // accumulate scalarMul(mul_input) into q
    // that is computes sets q = (mul_input[0:2] * mul_input[3]) + q
    function accumulate(
        uint256[3] memory mul_input,
        Pairing.G1Point memory p,
        uint256[4] memory buffer,
        Pairing.G1Point memory q
    ) internal view {
        // computes p = mul_input[0:2] * mul_input[3]
        Pairing.scalar_mul_raw(mul_input, p);

        // point addition inputs
        buffer[0] = q.X;
        buffer[1] = q.Y;
        buffer[2] = p.X;
        buffer[3] = p.Y;

        // q = p + q
        Pairing.plus_raw(buffer, q);
    }

    /*
     * @returns Whether the proof is valid given the hardcoded verifying key
     *          above and the public inputs
     */
    function verifyProof_internal(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[22] calldata input
    ) internal view returns (bool r) {
        Proof memory proof;
        proof.A = Pairing.G1Point(a[0], a[1]);
        proof.B = Pairing.G2Point([b[0][0], b[0][1]], [b[1][0], b[1][1]]);
        proof.C = Pairing.G1Point(c[0], c[1]);

        // Make sure that proof.A, B, and C are each less than the prime q
        require(proof.A.X < PRIME_Q, "verifier-aX-gte-prime-q");
        require(proof.A.Y < PRIME_Q, "verifier-aY-gte-prime-q");

        require(proof.B.X[0] < PRIME_Q, "verifier-bX0-gte-prime-q");
        require(proof.B.Y[0] < PRIME_Q, "verifier-bY0-gte-prime-q");

        require(proof.B.X[1] < PRIME_Q, "verifier-bX1-gte-prime-q");
        require(proof.B.Y[1] < PRIME_Q, "verifier-bY1-gte-prime-q");

        require(proof.C.X < PRIME_Q, "verifier-cX-gte-prime-q");
        require(proof.C.Y < PRIME_Q, "verifier-cY-gte-prime-q");

        // Make sure that every input is less than the snark scalar field
        for (uint256 i = 0; i < input.length; i++) {
            require(
                input[i] < SNARK_SCALAR_FIELD,
                "verifier-gte-snark-scalar-field"
            );
        }

        VerifyingKey memory vk = verifyingKey();

        // Compute the linear combination vk_x
        Pairing.G1Point memory vk_x = Pairing.G1Point(0, 0);

        // Buffer reused for addition p1 + p2 to avoid memory allocations
        // [0:2] -> p1.X, p1.Y ; [2:4] -> p2.X, p2.Y
        uint256[4] memory add_input;

        // Buffer reused for multiplication p1 * s
        // [0:2] -> p1.X, p1.Y ; [3] -> s
        uint256[3] memory mul_input;

        // temporary point to avoid extra allocations in accumulate
        Pairing.G1Point memory q = Pairing.G1Point(0, 0);

        vk_x.X = uint256(
            9098174903107364431482057567587475018582773752405486875907085139365284087305
        ); // vk.K[0].X
        vk_x.Y = uint256(
            10422929005848687649059100224052851192644888961198335134825245007027956462457
        ); // vk.K[0].Y
        mul_input[0] = uint256(
            7640189952610992472044298740442209449050505397104198298714268998915712890574
        ); // vk.K[1].X
        mul_input[1] = uint256(
            1686537726813712371940619015626405770798215979130054916579260370175844029865
        ); // vk.K[1].Y
        mul_input[2] = input[0];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[1] * input[0]
        mul_input[0] = uint256(
            4263156553740444431394438315653901774181111296208782789127392158390849978423
        ); // vk.K[2].X
        mul_input[1] = uint256(
            7675219973366310117009525015262052555182327894881626258072694940577622209463
        ); // vk.K[2].Y
        mul_input[2] = input[1];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[2] * input[1]
        mul_input[0] = uint256(
            8120992242408091174117436896802903981533726475799928560085322090521284532920
        ); // vk.K[3].X
        mul_input[1] = uint256(
            17377565655890859104669939084074333726907104533760981443088763416666685184524
        ); // vk.K[3].Y
        mul_input[2] = input[2];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[3] * input[2]
        mul_input[0] = uint256(
            10496412515111024130058821563713004472174962536234442501761064687346915331816
        ); // vk.K[4].X
        mul_input[1] = uint256(
            6633400221057967253013380956888007060623200214571484275638304685334346459917
        ); // vk.K[4].Y
        mul_input[2] = input[3];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[4] * input[3]
        mul_input[0] = uint256(
            7000625324135929505788645537433116232638561992369426563491816469209139253810
        ); // vk.K[5].X
        mul_input[1] = uint256(
            14435389721938383200058276426515359793457517279820679797114872637325346492949
        ); // vk.K[5].Y
        mul_input[2] = input[4];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[5] * input[4]
        mul_input[0] = uint256(
            15399358525396431812280442834048701325513244633419500402572141191006113673343
        ); // vk.K[6].X
        mul_input[1] = uint256(
            3310180467876090003821425249437612056704436305932600213247000201088564049822
        ); // vk.K[6].Y
        mul_input[2] = input[5];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[6] * input[5]
        mul_input[0] = uint256(
            2301958033408164132574169573909976196255318929349136905734290414285196457183
        ); // vk.K[7].X
        mul_input[1] = uint256(
            16032263089243561413003646067265134156539661035722749807826921136577074521372
        ); // vk.K[7].Y
        mul_input[2] = input[6];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[7] * input[6]
        mul_input[0] = uint256(
            9399453844270631698195369581459723361079656249084702418776246135138545811392
        ); // vk.K[8].X
        mul_input[1] = uint256(
            11498362995587403552243339719101795750529553527602474509332528264366883284493
        ); // vk.K[8].Y
        mul_input[2] = input[7];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[8] * input[7]
        mul_input[0] = uint256(
            14564697828213412458319536563429137799935039748533023459599598548433944053047
        ); // vk.K[9].X
        mul_input[1] = uint256(
            3860945279573126325977548773324782159797914817912146663577261943936929294590
        ); // vk.K[9].Y
        mul_input[2] = input[8];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[9] * input[8]
        mul_input[0] = uint256(
            2234044162009711122057872285679962824903345577292051596492387731383315530316
        ); // vk.K[10].X
        mul_input[1] = uint256(
            14950560261789026293053637687704577314401893522273736976751716012583763345490
        ); // vk.K[10].Y
        mul_input[2] = input[9];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[10] * input[9]
        mul_input[0] = uint256(
            6741034419553586889083200191035930448853567587972130377350133178585727224920
        ); // vk.K[11].X
        mul_input[1] = uint256(
            7564356864654078813105518805675896886467790761174729235069703005259875640357
        ); // vk.K[11].Y
        mul_input[2] = input[10];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[11] * input[10]
        mul_input[0] = uint256(
            14448197045862178129339415073128379929867882870253246290149674225173140300558
        ); // vk.K[12].X
        mul_input[1] = uint256(
            18523502989640774942745469261086824085265278270803385332527345452123628801326
        ); // vk.K[12].Y
        mul_input[2] = input[11];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[12] * input[11]
        mul_input[0] = uint256(
            4307011021665826416240772732749601725806415801439623300498061781551043554420
        ); // vk.K[13].X
        mul_input[1] = uint256(
            19767314120473357606972326620723348049450676826645739637587778663004529930905
        ); // vk.K[13].Y
        mul_input[2] = input[12];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[13] * input[12]
        mul_input[0] = uint256(
            11407308247091436951322714607587316004393539976124403160747125422655336143653
        ); // vk.K[14].X
        mul_input[1] = uint256(
            8923246661824159501767573580669486066313872399795717886406128284193089067096
        ); // vk.K[14].Y
        mul_input[2] = input[13];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[14] * input[13]
        mul_input[0] = uint256(
            9708988259796935730187789827846652100782230734975347296842949234262355267713
        ); // vk.K[15].X
        mul_input[1] = uint256(
            1959034164885825537059224297168437804173535226547630879329119152667348222796
        ); // vk.K[15].Y
        mul_input[2] = input[14];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[15] * input[14]
        mul_input[0] = uint256(
            3928111516320161494171711983695556001276627819052142912192228808768495776346
        ); // vk.K[16].X
        mul_input[1] = uint256(
            18027175705668783122221238490050495063663434256660059129116385567997889026591
        ); // vk.K[16].Y
        mul_input[2] = input[15];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[16] * input[15]
        mul_input[0] = uint256(
            584224424268597384579992157165315697473788436424654487386028348429334181298
        ); // vk.K[17].X
        mul_input[1] = uint256(
            20669338015669682765991459366955381494430659397864995143527615407515825502341
        ); // vk.K[17].Y
        mul_input[2] = input[16];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[17] * input[16]
        mul_input[0] = uint256(
            12559316001939876728527001853155322416452140861423882877711964965028763754959
        ); // vk.K[18].X
        mul_input[1] = uint256(
            12617373217636110863644666782461871199177526049530107862596428799658046875102
        ); // vk.K[18].Y
        mul_input[2] = input[17];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[18] * input[17]
        mul_input[0] = uint256(
            19980043778838992661920743666691323624434299739338405429391216790052245865899
        ); // vk.K[19].X
        mul_input[1] = uint256(
            3365246504294998668381532855338082830998173576151117619921478491731324503136
        ); // vk.K[19].Y
        mul_input[2] = input[18];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[19] * input[18]
        mul_input[0] = uint256(
            16064564121721206317024249802710455602281384363242419879104901584246460015423
        ); // vk.K[20].X
        mul_input[1] = uint256(
            3277540578811748189841772089716469979835798302457612445967665163416510549583
        ); // vk.K[20].Y
        mul_input[2] = input[19];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[20] * input[19]
        mul_input[0] = uint256(
            19518415002416119586632696422505810534633282279612307946349332402846895633264
        ); // vk.K[21].X
        mul_input[1] = uint256(
            13548544616016974125039131804150427091665854571655858707612284929374978675811
        ); // vk.K[21].Y
        mul_input[2] = input[20];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[21] * input[20]
        mul_input[0] = uint256(
            12608883739549650735193941236859707115617480684760814462504850181493349294463
        ); // vk.K[22].X
        mul_input[1] = uint256(
            17799549701150786285282389753142419236576687291492381266168509944035352681417
        ); // vk.K[22].Y
        mul_input[2] = input[21];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[22] * input[21]

        return
            Pairing.pairing(
                Pairing.negate(proof.A),
                proof.B,
                vk.alfa1,
                vk.beta2,
                vk_x,
                vk.gamma2,
                proof.C,
                vk.delta2
            );
    }

    function verifyProof(
        uint256[8] calldata proof,
        uint256[22] calldata input
    ) public view {
        uint256[2] memory a = [proof[0], proof[1]];
        uint256[2][2] memory b = [[proof[2], proof[3]], [proof[4], proof[5]]];
        uint256[2] memory c = [proof[6], proof[7]];

        bool result = verifyProof_internal(a, b, c, input);
        if (!result) revert ProofInvalid();
    }
}
