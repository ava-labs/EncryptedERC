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

contract ProductionTransferVerifier {
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
                1480556907149124128924111759708514013311577686295598672000924827491354960294
            ),
            uint256(
                6681269863426638295975310078592353485442952841055633702151773727838313169899
            )
        );
        vk.beta2 = Pairing.G2Point(
            [
                uint256(
                    8036318523628983098955165410932339347746568890851188486545535505563518355735
                ),
                uint256(
                    7767379788233761926815015266948943671797397305696347101383338082384842379977
                )
            ],
            [
                uint256(
                    10219116327853755746867749974815162723563932174638695896594234599628399275818
                ),
                uint256(
                    83588494193193682439058779685980468617633488108632988382552968179679597738
                )
            ]
        );
        vk.gamma2 = Pairing.G2Point(
            [
                uint256(
                    4500506899102096711817635815940655488077825308487638804385285411067657422191
                ),
                uint256(
                    11372574009429721735673522298155444977516261012386393259465697055754835033512
                )
            ],
            [
                uint256(
                    11944711538613407328105124883271476340444001790774935311978017132279577745806
                ),
                uint256(
                    3864514950736227183409036693151701234666469497397414518420311432779631491123
                )
            ]
        );
        vk.delta2 = Pairing.G2Point(
            [
                uint256(
                    19230784059994114450787005566521567232611718280114828937784640831193574407570
                ),
                uint256(
                    7071263123573523906124742194181283666020115050339342062762066407555725339546
                )
            ],
            [
                uint256(
                    14003164456112535471274223208635364996182424120644215182302601115714044496943
                ),
                uint256(
                    13277976564273971409923043744628788103532009324654760366631110021240568233502
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
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[32] calldata input
    ) public view returns (bool r) {
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
            13759715315416382606456161459634794348977764089638869995543452728329215678717
        ); // vk.K[0].X
        vk_x.Y = uint256(
            9073349077534424549837470754229197848895585193006569678559233700060120337670
        ); // vk.K[0].Y
        mul_input[0] = uint256(
            1069310190792498944558937186534516481021596248881019404658566828369053534089
        ); // vk.K[1].X
        mul_input[1] = uint256(
            1760287884088809464186497921769471306467298933172863688281905897332810456435
        ); // vk.K[1].Y
        mul_input[2] = input[0];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[1] * input[0]
        mul_input[0] = uint256(
            11700027773908135763123959347536318719566496644558837701765420808397054996041
        ); // vk.K[2].X
        mul_input[1] = uint256(
            8876761616011360411031948664243258941896021266403414967769897274989658226830
        ); // vk.K[2].Y
        mul_input[2] = input[1];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[2] * input[1]
        mul_input[0] = uint256(
            8645533008870148147659690992038584361920591146647666975694594717394065071370
        ); // vk.K[3].X
        mul_input[1] = uint256(
            519487351370344991745066509691659736991894163921148546685778601436203231862
        ); // vk.K[3].Y
        mul_input[2] = input[2];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[3] * input[2]
        mul_input[0] = uint256(
            21687637322818020336750912379401047059611720531109896954558315109111792244177
        ); // vk.K[4].X
        mul_input[1] = uint256(
            12888372362401723738019173532010811583138889322160994717366667497471539721174
        ); // vk.K[4].Y
        mul_input[2] = input[3];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[4] * input[3]
        mul_input[0] = uint256(
            10367054241536885078554775809616932645366569697239808244770527928811396712451
        ); // vk.K[5].X
        mul_input[1] = uint256(
            11259449051802768917418168732213511233903416633701989069573132820656180920413
        ); // vk.K[5].Y
        mul_input[2] = input[4];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[5] * input[4]
        mul_input[0] = uint256(
            7354956135256963737069069177572026933188565517892744459926990560399608609711
        ); // vk.K[6].X
        mul_input[1] = uint256(
            3408494487368764698665867909979108228524924503163805252915997872815780062329
        ); // vk.K[6].Y
        mul_input[2] = input[5];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[6] * input[5]
        mul_input[0] = uint256(
            2123506261691965893723461572912291353576815569794159619171589799871820068726
        ); // vk.K[7].X
        mul_input[1] = uint256(
            19304595840696206540944518331564842079749239138186435289703528392060279443577
        ); // vk.K[7].Y
        mul_input[2] = input[6];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[7] * input[6]
        mul_input[0] = uint256(
            16029984109829748596894471838285025902918565192208155559355328798952729073045
        ); // vk.K[8].X
        mul_input[1] = uint256(
            6385797647223543120881996047912363745711766765832917881795584899981307937821
        ); // vk.K[8].Y
        mul_input[2] = input[7];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[8] * input[7]
        mul_input[0] = uint256(
            15268444018840669746107004590983843196545435624820249972745933961152414348351
        ); // vk.K[9].X
        mul_input[1] = uint256(
            9158659988331454003681603176842259872525499449934351663698454991762133900259
        ); // vk.K[9].Y
        mul_input[2] = input[8];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[9] * input[8]
        mul_input[0] = uint256(
            15061358914281981738622495257739243449823223686942456707511760847710372366581
        ); // vk.K[10].X
        mul_input[1] = uint256(
            5033239801579641163060741335670451888103910209468510339887842443236022807592
        ); // vk.K[10].Y
        mul_input[2] = input[9];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[10] * input[9]
        mul_input[0] = uint256(
            19026454420368662863005141451051308765797097803055734811680018110274958891259
        ); // vk.K[11].X
        mul_input[1] = uint256(
            20544160925270847678438223196393078811806878020740439328985182150226343303015
        ); // vk.K[11].Y
        mul_input[2] = input[10];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[11] * input[10]
        mul_input[0] = uint256(
            18928601596241844910185348641012037708252736874084922776584365980969662226841
        ); // vk.K[12].X
        mul_input[1] = uint256(
            17713996856207999190561707034913060297301239990797876793983291828248769743618
        ); // vk.K[12].Y
        mul_input[2] = input[11];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[12] * input[11]
        mul_input[0] = uint256(
            9481076295734078826088480956744574941753327825879092931662125485512765320153
        ); // vk.K[13].X
        mul_input[1] = uint256(
            12897574571478794007209917117594139377730330764223298557302622986102469368647
        ); // vk.K[13].Y
        mul_input[2] = input[12];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[13] * input[12]
        mul_input[0] = uint256(
            4624669131714918599416397935327227163457651721901298231997434957541479757564
        ); // vk.K[14].X
        mul_input[1] = uint256(
            63649915863911310674226000101833911887764160029550793149435760576876674034
        ); // vk.K[14].Y
        mul_input[2] = input[13];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[14] * input[13]
        mul_input[0] = uint256(
            14498002183781451003253998666655823988243045727182646761495690944595789404647
        ); // vk.K[15].X
        mul_input[1] = uint256(
            18570989640457612954878033785805382531209997731349067042721560257400318035287
        ); // vk.K[15].Y
        mul_input[2] = input[14];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[15] * input[14]
        mul_input[0] = uint256(
            20688870664483403226676542915561225604966854736010810326237515565728982251681
        ); // vk.K[16].X
        mul_input[1] = uint256(
            465048779785335088353381912784731160939855820819682144757865814927591014176
        ); // vk.K[16].Y
        mul_input[2] = input[15];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[16] * input[15]
        mul_input[0] = uint256(
            15455590373867293775594681992229039295706188588732420874283109697395266599625
        ); // vk.K[17].X
        mul_input[1] = uint256(
            4877546051920165900052568887703001035956365084270775690773994122878283675775
        ); // vk.K[17].Y
        mul_input[2] = input[16];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[17] * input[16]
        mul_input[0] = uint256(
            5661729202122948313427813523406104998719624293461339328932575492773038141994
        ); // vk.K[18].X
        mul_input[1] = uint256(
            18497532663752232046619667409918452966777912249918737422169649927651467807307
        ); // vk.K[18].Y
        mul_input[2] = input[17];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[18] * input[17]
        mul_input[0] = uint256(
            5641904388578484402331218668359932693764946591537206426859567427253978051081
        ); // vk.K[19].X
        mul_input[1] = uint256(
            10872688834372076005571440288213931788626460320288035108675271299359389951583
        ); // vk.K[19].Y
        mul_input[2] = input[18];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[19] * input[18]
        mul_input[0] = uint256(
            20023452092904643594628059760195965685203162390679473549692182591192092630139
        ); // vk.K[20].X
        mul_input[1] = uint256(
            1167289515056200265733503697946386252565181612055485164160996507824869067349
        ); // vk.K[20].Y
        mul_input[2] = input[19];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[20] * input[19]
        mul_input[0] = uint256(
            4856556828392253739876528846385705095519572343480730535740210065125134368203
        ); // vk.K[21].X
        mul_input[1] = uint256(
            8194080138486482902454685555588963351378183695085015577970061617498617055523
        ); // vk.K[21].Y
        mul_input[2] = input[20];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[21] * input[20]
        mul_input[0] = uint256(
            19244777401003469664547407943047380257358834629792388415292065965875643221420
        ); // vk.K[22].X
        mul_input[1] = uint256(
            14645228632604117372978494821168087549972755325422777158142833746768017367349
        ); // vk.K[22].Y
        mul_input[2] = input[21];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[22] * input[21]
        mul_input[0] = uint256(
            9267687278474815216859242891607224069643979527699007582717555599383252093831
        ); // vk.K[23].X
        mul_input[1] = uint256(
            3082929783619588497699963632753507939605391726819715600909654214065749304968
        ); // vk.K[23].Y
        mul_input[2] = input[22];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[23] * input[22]
        mul_input[0] = uint256(
            13989564849547187941247983719214390308752577829512241582436632735382460043409
        ); // vk.K[24].X
        mul_input[1] = uint256(
            4649632217408646917111685717830794427841232781134581886549753590780481493657
        ); // vk.K[24].Y
        mul_input[2] = input[23];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[24] * input[23]
        mul_input[0] = uint256(
            4675935423523593112492751383206358313734878929057908449285669796989797756080
        ); // vk.K[25].X
        mul_input[1] = uint256(
            14015340187616035298267626577972738986524384666351234155850691742352660410203
        ); // vk.K[25].Y
        mul_input[2] = input[24];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[25] * input[24]
        mul_input[0] = uint256(
            16198176692256695774784940114484593698632207973013153444743247840520228448492
        ); // vk.K[26].X
        mul_input[1] = uint256(
            1751607273180626551553570692545872616193613241279646601124066411147644244702
        ); // vk.K[26].Y
        mul_input[2] = input[25];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[26] * input[25]
        mul_input[0] = uint256(
            7590985221647810523436962703761717565119171872989795418049913614095670928004
        ); // vk.K[27].X
        mul_input[1] = uint256(
            15011631430845028398693281717421423021537505848492311607519439284511274669494
        ); // vk.K[27].Y
        mul_input[2] = input[26];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[27] * input[26]
        mul_input[0] = uint256(
            15109775001865320698339238831312635962641047638787271702307224260902706045661
        ); // vk.K[28].X
        mul_input[1] = uint256(
            10414326735362374277839688062764764063289722942128606713261866886567027964647
        ); // vk.K[28].Y
        mul_input[2] = input[27];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[28] * input[27]
        mul_input[0] = uint256(
            15987918944838488503244438300227953199678503609843205743514759676047185258516
        ); // vk.K[29].X
        mul_input[1] = uint256(
            20950601020689750504574837995932293710479738462663935220900798524622208027907
        ); // vk.K[29].Y
        mul_input[2] = input[28];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[29] * input[28]
        mul_input[0] = uint256(
            11216267910332473483675511874401698270164197621363153839830806364438982438491
        ); // vk.K[30].X
        mul_input[1] = uint256(
            17172454244437496893068181095590065955115296117322661219656499702569639986617
        ); // vk.K[30].Y
        mul_input[2] = input[29];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[30] * input[29]
        mul_input[0] = uint256(
            8047766275807019718632481206411526864469482143924861389638536624040478564129
        ); // vk.K[31].X
        mul_input[1] = uint256(
            3082247433511374435127432612369716346305819622899212915318590862598760483007
        ); // vk.K[31].Y
        mul_input[2] = input[30];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[31] * input[30]
        mul_input[0] = uint256(
            1668297914697446541652102101182102230148827919813158251536224223326861174312
        ); // vk.K[32].X
        mul_input[1] = uint256(
            21543340365291110641146560719684042088350283998015108381818363144885905792587
        ); // vk.K[32].Y
        mul_input[2] = input[31];
        accumulate(mul_input, q, add_input, vk_x); // vk_x += vk.K[32] * input[31]

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
}
