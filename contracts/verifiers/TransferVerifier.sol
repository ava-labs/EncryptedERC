// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/// @title Groth16 verifier template.
/// @author Remco Bloemen
/// @notice Supports verifying Groth16 proofs. Proofs can be in uncompressed
/// (256 bytes) and compressed (128 bytes) format. A view function is provided
/// to compress proofs.
/// @notice See <https://2π.com/23/bn254-compression> for further explanation.
contract TransferVerifier {
    /// Some of the provided public input values are larger than the field modulus.
    /// @dev Public input elements are not automatically reduced, as this is can be
    /// a dangerous source of bugs.
    error PublicInputNotInField();

    /// The proof is invalid.
    /// @dev This can mean that provided Groth16 proof points are not on their
    /// curves, that pairing equation fails, or that the proof is not for the
    /// provided public input.
    error ProofInvalid();

    // Addresses of precompiles
    uint256 constant PRECOMPILE_MODEXP = 0x05;
    uint256 constant PRECOMPILE_ADD = 0x06;
    uint256 constant PRECOMPILE_MUL = 0x07;
    uint256 constant PRECOMPILE_VERIFY = 0x08;

    // Base field Fp order P and scalar field Fr order R.
    // For BN254 these are computed as follows:
    //     t = 4965661367192848881
    //     P = 36⋅t⁴ + 36⋅t³ + 24⋅t² + 6⋅t + 1
    //     R = 36⋅t⁴ + 36⋅t³ + 18⋅t² + 6⋅t + 1
    uint256 constant P =
        0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47;
    uint256 constant R =
        0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001;

    // Extension field Fp2 = Fp[i] / (i² + 1)
    // Note: This is the complex extension field of Fp with i² = -1.
    //       Values in Fp2 are represented as a pair of Fp elements (a₀, a₁) as a₀ + a₁⋅i.
    // Note: The order of Fp2 elements is *opposite* that of the pairing contract, which
    //       expects Fp2 elements in order (a₁, a₀). This is also the order in which
    //       Fp2 elements are encoded in the public interface as this became convention.

    // Constants in Fp
    uint256 constant FRACTION_1_2_FP =
        0x183227397098d014dc2822db40c0ac2ecbc0b548b438e5469e10460b6c3e7ea4;
    uint256 constant FRACTION_27_82_FP =
        0x2b149d40ceb8aaae81be18991be06ac3b5b4c5e559dbefa33267e6dc24a138e5;
    uint256 constant FRACTION_3_82_FP =
        0x2fcd3ac2a640a154eb23960892a85a68f031ca0c8344b23a577dcf1052b9e775;

    // Exponents for inversions and square roots mod P
    uint256 constant EXP_INVERSE_FP =
        0x30644E72E131A029B85045B68181585D97816A916871CA8D3C208C16D87CFD45; // P - 2
    uint256 constant EXP_SQRT_FP =
        0xC19139CB84C680A6E14116DA060561765E05AA45A1C72A34F082305B61F3F52; // (P + 1) / 4;

    // Groth16 alpha point in G1
    uint256 constant ALPHA_X =
        18208479328186416501775671869906599018263607661640168483692205444398395880622;
    uint256 constant ALPHA_Y =
        11152030444017600813581972989946461092566781880710754559837379968576109174747;

    // Groth16 beta point in G2 in powers of i
    uint256 constant BETA_NEG_X_0 =
        13129668257131166071529141890797012963439184689266655633633430519679299418816;
    uint256 constant BETA_NEG_X_1 =
        3205559007126568476917680730493456104310075843009898660628112126050665967296;
    uint256 constant BETA_NEG_Y_0 =
        3247545828843354662424990948492668145740143188454055347557512389438057978129;
    uint256 constant BETA_NEG_Y_1 =
        8616846900354151728471408987760592961377995762963397684869480472126902023265;

    // Groth16 gamma point in G2 in powers of i
    uint256 constant GAMMA_NEG_X_0 =
        18760218755508661364287071472864292051916879235871698089844105602928030251161;
    uint256 constant GAMMA_NEG_X_1 =
        5795036160420111770873196482055148291462565163224382104813500512152650654282;
    uint256 constant GAMMA_NEG_Y_0 =
        18422696096736248542847904695967123350329412892083356869097233471971520945770;
    uint256 constant GAMMA_NEG_Y_1 =
        19043330329985819493987872858836501846104194176724534126917545670710011477074;

    // Groth16 delta point in G2 in powers of i
    uint256 constant DELTA_NEG_X_0 =
        8499852897177171884526846891048007886993738963284404043527326095998863652241;
    uint256 constant DELTA_NEG_X_1 =
        19924900729218323770264413769075413977908012156634713787973301807872098166190;
    uint256 constant DELTA_NEG_Y_0 =
        16339313308529110320831000163732571157882444598806596302155575198306355229392;
    uint256 constant DELTA_NEG_Y_1 =
        19989397716568986908963633241118842423228668738488350241224596410746583601336;

    // Constant and public input points
    uint256 constant CONSTANT_X =
        6815354178552380645162204697509049749046514650672428893610108506008054722360;
    uint256 constant CONSTANT_Y =
        7069116516749754264565326083400630628937940480958576906898540068588052084339;
    uint256 constant PUB_0_X =
        7483432422485990181656804897927235193981424287773909620797013350614950739557;
    uint256 constant PUB_0_Y =
        285105833699806717491651219928117799334487906643199376686416609917041228252;
    uint256 constant PUB_1_X =
        7990810542749533716323442907136773279563767641852589437564626509047716530391;
    uint256 constant PUB_1_Y =
        1559220412347883792146958718200867102856257021877821974804003580358273488916;
    uint256 constant PUB_2_X =
        10139863713603149062443479520931079295060494625837988276557017959111477180707;
    uint256 constant PUB_2_Y =
        3099322327425567735722816188334994224782062027850715517376220536308513691746;
    uint256 constant PUB_3_X =
        19847080899625940119563010531150973234494285416961074861360084977562144931810;
    uint256 constant PUB_3_Y =
        7071537188851264683369066663841591487584411929653656486733077549834555116118;
    uint256 constant PUB_4_X =
        6440423841464569510097190164368478431607783655583676437392097592449647236084;
    uint256 constant PUB_4_Y =
        9923321682681255124094057401751228975629119611400380453071569385532821593877;
    uint256 constant PUB_5_X =
        18107557299095500397177981970366437351927682956602827832369803342112313075137;
    uint256 constant PUB_5_Y =
        5426358592766147831341165397431468578589829182978264286866607582620376794014;
    uint256 constant PUB_6_X =
        16562409314222073654846071270514403558170693580104156303188050548617546450469;
    uint256 constant PUB_6_Y =
        7587249287156616391565595246732510140085772842716095246219136339040247150899;
    uint256 constant PUB_7_X =
        10746248397723410297204568339770369664902579292525237906134997036775539923748;
    uint256 constant PUB_7_Y =
        573720349916532009479756571981281709778771688483924161160207908659973610030;
    uint256 constant PUB_8_X =
        5977732563894906984061383517363735506309852230327808677233127832443421685042;
    uint256 constant PUB_8_Y =
        15668931739967920698926809951128591356122687857989062285986537695029847575512;
    uint256 constant PUB_9_X =
        10788919955278134110838905291700340817741635227064111215314995939411358555200;
    uint256 constant PUB_9_Y =
        2233287375898078038424361986671477202888106356619408626217328575150066870776;
    uint256 constant PUB_10_X =
        679317939318900671721893569468516166902246998730570844996677746152724262132;
    uint256 constant PUB_10_Y =
        15766862428354954894185486628155970880596460242566998198548223448179002321759;
    uint256 constant PUB_11_X =
        4529808949520980526536479146711779000444094542711423167548671918312904072961;
    uint256 constant PUB_11_Y =
        755121155606751949186810605421194586598709456201368309680754553669918217507;
    uint256 constant PUB_12_X =
        2471000445292403695721390373355616958203346580811817334075091587045811415275;
    uint256 constant PUB_12_Y =
        14038208626323462379886732639114041690031088660363760752149235894303996474187;
    uint256 constant PUB_13_X =
        15089182384300868572382693585678085770230670230343952301854041806057882083480;
    uint256 constant PUB_13_Y =
        9068757705322189065983785271549015251723207413889097822835838961308395143039;
    uint256 constant PUB_14_X =
        10467140824871982665765703639828584494177334973132554357926819755077718838841;
    uint256 constant PUB_14_Y =
        14171287610410189761127445681241789292043877020398559494160511264898551789070;
    uint256 constant PUB_15_X =
        15185428061483560203291731602764277054535929030849129181391438530999785905186;
    uint256 constant PUB_15_Y =
        5213955345690617567017945709543279326135414896605286296175472577851715207145;
    uint256 constant PUB_16_X =
        15705829042686562366613483897574943078556371012408529014327269717789825046918;
    uint256 constant PUB_16_Y =
        16115033501366266512700455123420750819187223129004610597851744576059162438292;
    uint256 constant PUB_17_X =
        18231145214452554039935898015963946770874305199289005990176714458757616445551;
    uint256 constant PUB_17_Y =
        3140233084687523856525494655645918158385986088919933064030086282286009187757;
    uint256 constant PUB_18_X =
        16383966474833191294166662092154781059071548870905751568838105011474311807746;
    uint256 constant PUB_18_Y =
        8280579707058981459739551539497147887736075391719821503829334487912685315710;
    uint256 constant PUB_19_X =
        10806790895625125283616556681995139534276667986314660757580081843379589236561;
    uint256 constant PUB_19_Y =
        11309251810695809568855509027680177739123862161393059457552865814805727956364;
    uint256 constant PUB_20_X =
        21543195782312725924512262403739474402191583915312241130442728909733482400652;
    uint256 constant PUB_20_Y =
        18071035589643081533600023488323853332867318809952333571446591496847261488891;
    uint256 constant PUB_21_X =
        21861606186959127325607319314443239813571336995368928871617695450619650026650;
    uint256 constant PUB_21_Y =
        2189158232080648838552801961146853261332759154625401368210840983359482232591;
    uint256 constant PUB_22_X =
        408700894804622624266053427297563987579024886180078556657524156150740954756;
    uint256 constant PUB_22_Y =
        21077556744125928980352863981537316690261070027124365328258877205115334635627;
    uint256 constant PUB_23_X =
        9047236262259956473820708033866899196742592175570224526904393595187732560390;
    uint256 constant PUB_23_Y =
        16103888572280566398220118887482461003583070804793510872509298291992166566019;
    uint256 constant PUB_24_X =
        15919365507133210029465211139433357808790657807531502441959474420299565897468;
    uint256 constant PUB_24_Y =
        3677134514066553687993864972573072217490140976090543734891055279893428280598;
    uint256 constant PUB_25_X =
        1970432408899259969518794761361073376984055555861670617088609306608014354657;
    uint256 constant PUB_25_Y =
        7351077352038702191260481046642931416278075643510261814632607527358763525466;
    uint256 constant PUB_26_X =
        18284316625082549345377588259933500630404858875473549072974785029544003490318;
    uint256 constant PUB_26_Y =
        17956752882635733560904990008817849892428612237750157322477356777867261780155;
    uint256 constant PUB_27_X =
        1697361101935256995283422463602647871585322316240510226960023597287004189150;
    uint256 constant PUB_27_Y =
        7234176051502913953573951221938027170437945122036064806879708216964497748220;
    uint256 constant PUB_28_X =
        15844840138984593444164739874002725374145710038390707663256340819021890848341;
    uint256 constant PUB_28_Y =
        18774380950309990393748556888584772429569481890493292636313093960634420496306;
    uint256 constant PUB_29_X =
        6997240982998488347681938794479764389672814650081341731735743170727821636504;
    uint256 constant PUB_29_Y =
        17484025893681485429277037473440003660074690178159670602737251695886930261224;
    uint256 constant PUB_30_X =
        20820943013335528989810018569544422302084167994581942093373735344623795659261;
    uint256 constant PUB_30_Y =
        12954635595765677526699689527608979158560206714439506736978875947535618578291;
    uint256 constant PUB_31_X =
        1037659097286197129982379126575499153066544526108851935101023875503328540882;
    uint256 constant PUB_31_Y =
        11501987342441654380556093317155709481628338101044500389852904067983247742655;

    /// Negation in Fp.
    /// @notice Returns a number x such that a + x = 0 in Fp.
    /// @notice The input does not need to be reduced.
    /// @param a the base
    /// @return x the result
    function negate(uint256 a) internal pure returns (uint256 x) {
        unchecked {
            x = (P - (a % P)) % P; // Modulo is cheaper than branching
        }
    }

    /// Exponentiation in Fp.
    /// @notice Returns a number x such that a ^ e = x in Fp.
    /// @notice The input does not need to be reduced.
    /// @param a the base
    /// @param e the exponent
    /// @return x the result
    function exp(uint256 a, uint256 e) internal view returns (uint256 x) {
        bool success;
        assembly ("memory-safe") {
            let f := mload(0x40)
            mstore(f, 0x20)
            mstore(add(f, 0x20), 0x20)
            mstore(add(f, 0x40), 0x20)
            mstore(add(f, 0x60), a)
            mstore(add(f, 0x80), e)
            mstore(add(f, 0xa0), P)
            success := staticcall(gas(), PRECOMPILE_MODEXP, f, 0xc0, f, 0x20)
            x := mload(f)
        }
        if (!success) {
            // Exponentiation failed.
            // Should not happen.
            revert ProofInvalid();
        }
    }

    /// Invertsion in Fp.
    /// @notice Returns a number x such that a * x = 1 in Fp.
    /// @notice The input does not need to be reduced.
    /// @notice Reverts with ProofInvalid() if the inverse does not exist
    /// @param a the input
    /// @return x the solution
    function invert_Fp(uint256 a) internal view returns (uint256 x) {
        x = exp(a, EXP_INVERSE_FP);
        if (mulmod(a, x, P) != 1) {
            // Inverse does not exist.
            // Can only happen during G2 point decompression.
            revert ProofInvalid();
        }
    }

    /// Square root in Fp.
    /// @notice Returns a number x such that x * x = a in Fp.
    /// @notice Will revert with InvalidProof() if the input is not a square
    /// or not reduced.
    /// @param a the square
    /// @return x the solution
    function sqrt_Fp(uint256 a) internal view returns (uint256 x) {
        x = exp(a, EXP_SQRT_FP);
        if (mulmod(x, x, P) != a) {
            // Square root does not exist or a is not reduced.
            // Happens when G1 point is not on curve.
            revert ProofInvalid();
        }
    }

    /// Square test in Fp.
    /// @notice Returns whether a number x exists such that x * x = a in Fp.
    /// @notice Will revert with InvalidProof() if the input is not a square
    /// or not reduced.
    /// @param a the square
    /// @return x the solution
    function isSquare_Fp(uint256 a) internal view returns (bool) {
        uint256 x = exp(a, EXP_SQRT_FP);
        return mulmod(x, x, P) == a;
    }

    /// Square root in Fp2.
    /// @notice Fp2 is the complex extension Fp[i]/(i^2 + 1). The input is
    /// a0 + a1 ⋅ i and the result is x0 + x1 ⋅ i.
    /// @notice Will revert with InvalidProof() if
    ///   * the input is not a square,
    ///   * the hint is incorrect, or
    ///   * the input coefficents are not reduced.
    /// @param a0 The real part of the input.
    /// @param a1 The imaginary part of the input.
    /// @param hint A hint which of two possible signs to pick in the equation.
    /// @return x0 The real part of the square root.
    /// @return x1 The imaginary part of the square root.
    function sqrt_Fp2(
        uint256 a0,
        uint256 a1,
        bool hint
    ) internal view returns (uint256 x0, uint256 x1) {
        // If this square root reverts there is no solution in Fp2.
        uint256 d = sqrt_Fp(addmod(mulmod(a0, a0, P), mulmod(a1, a1, P), P));
        if (hint) {
            d = negate(d);
        }
        // If this square root reverts there is no solution in Fp2.
        x0 = sqrt_Fp(mulmod(addmod(a0, d, P), FRACTION_1_2_FP, P));
        x1 = mulmod(a1, invert_Fp(mulmod(x0, 2, P)), P);

        // Check result to make sure we found a root.
        // Note: this also fails if a0 or a1 is not reduced.
        if (
            a0 != addmod(mulmod(x0, x0, P), negate(mulmod(x1, x1, P)), P) ||
            a1 != mulmod(2, mulmod(x0, x1, P), P)
        ) {
            revert ProofInvalid();
        }
    }

    /// Compress a G1 point.
    /// @notice Reverts with InvalidProof if the coordinates are not reduced
    /// or if the point is not on the curve.
    /// @notice The point at infinity is encoded as (0,0) and compressed to 0.
    /// @param x The X coordinate in Fp.
    /// @param y The Y coordinate in Fp.
    /// @return c The compresed point (x with one signal bit).
    function compress_g1(
        uint256 x,
        uint256 y
    ) internal view returns (uint256 c) {
        if (x >= P || y >= P) {
            // G1 point not in field.
            revert ProofInvalid();
        }
        if (x == 0 && y == 0) {
            // Point at infinity
            return 0;
        }

        // Note: sqrt_Fp reverts if there is no solution, i.e. the x coordinate is invalid.
        uint256 y_pos = sqrt_Fp(addmod(mulmod(mulmod(x, x, P), x, P), 3, P));
        if (y == y_pos) {
            return (x << 1) | 0;
        } else if (y == negate(y_pos)) {
            return (x << 1) | 1;
        } else {
            // G1 point not on curve.
            revert ProofInvalid();
        }
    }

    /// Decompress a G1 point.
    /// @notice Reverts with InvalidProof if the input does not represent a valid point.
    /// @notice The point at infinity is encoded as (0,0) and compressed to 0.
    /// @param c The compresed point (x with one signal bit).
    /// @return x The X coordinate in Fp.
    /// @return y The Y coordinate in Fp.
    function decompress_g1(
        uint256 c
    ) internal view returns (uint256 x, uint256 y) {
        // Note that X = 0 is not on the curve since 0³ + 3 = 3 is not a square.
        // so we can use it to represent the point at infinity.
        if (c == 0) {
            // Point at infinity as encoded in EIP196 and EIP197.
            return (0, 0);
        }
        bool negate_point = c & 1 == 1;
        x = c >> 1;
        if (x >= P) {
            // G1 x coordinate not in field.
            revert ProofInvalid();
        }

        // Note: (x³ + 3) is irreducible in Fp, so it can not be zero and therefore
        //       y can not be zero.
        // Note: sqrt_Fp reverts if there is no solution, i.e. the point is not on the curve.
        y = sqrt_Fp(addmod(mulmod(mulmod(x, x, P), x, P), 3, P));
        if (negate_point) {
            y = negate(y);
        }
    }

    /// Compress a G2 point.
    /// @notice Reverts with InvalidProof if the coefficients are not reduced
    /// or if the point is not on the curve.
    /// @notice The G2 curve is defined over the complex extension Fp[i]/(i^2 + 1)
    /// with coordinates (x0 + x1 ⋅ i, y0 + y1 ⋅ i).
    /// @notice The point at infinity is encoded as (0,0,0,0) and compressed to (0,0).
    /// @param x0 The real part of the X coordinate.
    /// @param x1 The imaginary poart of the X coordinate.
    /// @param y0 The real part of the Y coordinate.
    /// @param y1 The imaginary part of the Y coordinate.
    /// @return c0 The first half of the compresed point (x0 with two signal bits).
    /// @return c1 The second half of the compressed point (x1 unmodified).
    function compress_g2(
        uint256 x0,
        uint256 x1,
        uint256 y0,
        uint256 y1
    ) internal view returns (uint256 c0, uint256 c1) {
        if (x0 >= P || x1 >= P || y0 >= P || y1 >= P) {
            // G2 point not in field.
            revert ProofInvalid();
        }
        if ((x0 | x1 | y0 | y1) == 0) {
            // Point at infinity
            return (0, 0);
        }

        // Compute y^2
        // Note: shadowing variables and scoping to avoid stack-to-deep.
        uint256 y0_pos;
        uint256 y1_pos;
        {
            uint256 n3ab = mulmod(mulmod(x0, x1, P), P - 3, P);
            uint256 a_3 = mulmod(mulmod(x0, x0, P), x0, P);
            uint256 b_3 = mulmod(mulmod(x1, x1, P), x1, P);
            y0_pos = addmod(
                FRACTION_27_82_FP,
                addmod(a_3, mulmod(n3ab, x1, P), P),
                P
            );
            y1_pos = negate(
                addmod(FRACTION_3_82_FP, addmod(b_3, mulmod(n3ab, x0, P), P), P)
            );
        }

        // Determine hint bit
        // If this sqrt fails the x coordinate is not on the curve.
        bool hint;
        {
            uint256 d = sqrt_Fp(
                addmod(mulmod(y0_pos, y0_pos, P), mulmod(y1_pos, y1_pos, P), P)
            );
            hint = !isSquare_Fp(
                mulmod(addmod(y0_pos, d, P), FRACTION_1_2_FP, P)
            );
        }

        // Recover y
        (y0_pos, y1_pos) = sqrt_Fp2(y0_pos, y1_pos, hint);
        if (y0 == y0_pos && y1 == y1_pos) {
            c0 = (x0 << 2) | (hint ? 2 : 0) | 0;
            c1 = x1;
        } else if (y0 == negate(y0_pos) && y1 == negate(y1_pos)) {
            c0 = (x0 << 2) | (hint ? 2 : 0) | 1;
            c1 = x1;
        } else {
            // G1 point not on curve.
            revert ProofInvalid();
        }
    }

    /// Decompress a G2 point.
    /// @notice Reverts with InvalidProof if the input does not represent a valid point.
    /// @notice The G2 curve is defined over the complex extension Fp[i]/(i^2 + 1)
    /// with coordinates (x0 + x1 ⋅ i, y0 + y1 ⋅ i).
    /// @notice The point at infinity is encoded as (0,0,0,0) and compressed to (0,0).
    /// @param c0 The first half of the compresed point (x0 with two signal bits).
    /// @param c1 The second half of the compressed point (x1 unmodified).
    /// @return x0 The real part of the X coordinate.
    /// @return x1 The imaginary poart of the X coordinate.
    /// @return y0 The real part of the Y coordinate.
    /// @return y1 The imaginary part of the Y coordinate.
    function decompress_g2(
        uint256 c0,
        uint256 c1
    ) internal view returns (uint256 x0, uint256 x1, uint256 y0, uint256 y1) {
        // Note that X = (0, 0) is not on the curve since 0³ + 3/(9 + i) is not a square.
        // so we can use it to represent the point at infinity.
        if (c0 == 0 && c1 == 0) {
            // Point at infinity as encoded in EIP197.
            return (0, 0, 0, 0);
        }
        bool negate_point = c0 & 1 == 1;
        bool hint = c0 & 2 == 2;
        x0 = c0 >> 2;
        x1 = c1;
        if (x0 >= P || x1 >= P) {
            // G2 x0 or x1 coefficient not in field.
            revert ProofInvalid();
        }

        uint256 n3ab = mulmod(mulmod(x0, x1, P), P - 3, P);
        uint256 a_3 = mulmod(mulmod(x0, x0, P), x0, P);
        uint256 b_3 = mulmod(mulmod(x1, x1, P), x1, P);

        y0 = addmod(FRACTION_27_82_FP, addmod(a_3, mulmod(n3ab, x1, P), P), P);
        y1 = negate(
            addmod(FRACTION_3_82_FP, addmod(b_3, mulmod(n3ab, x0, P), P), P)
        );

        // Note: sqrt_Fp2 reverts if there is no solution, i.e. the point is not on the curve.
        // Note: (X³ + 3/(9 + i)) is irreducible in Fp2, so y can not be zero.
        //       But y0 or y1 may still independently be zero.
        (y0, y1) = sqrt_Fp2(y0, y1, hint);
        if (negate_point) {
            y0 = negate(y0);
            y1 = negate(y1);
        }
    }

    /// Compute the public input linear combination.
    /// @notice Reverts with PublicInputNotInField if the input is not in the field.
    /// @notice Computes the multi-scalar-multiplication of the public input
    /// elements and the verification key including the constant term.
    /// @param input The public inputs. These are elements of the scalar field Fr.
    /// @return x The X coordinate of the resulting G1 point.
    /// @return y The Y coordinate of the resulting G1 point.
    function publicInputMSM(
        uint256[32] calldata input
    ) internal view returns (uint256 x, uint256 y) {
        // Note: The ECMUL precompile does not reject unreduced values, so we check this.
        // Note: Unrolling this loop does not cost much extra in code-size, the bulk of the
        //       code-size is in the PUB_ constants.
        // ECMUL has input (x, y, scalar) and output (x', y').
        // ECADD has input (x1, y1, x2, y2) and output (x', y').
        // We reduce commitments(if any) with constants as the first point argument to ECADD.
        // We call them such that ecmul output is already in the second point
        // argument to ECADD so we can have a tight loop.
        bool success = true;
        assembly ("memory-safe") {
            let f := mload(0x40)
            let g := add(f, 0x40)
            let s
            mstore(f, CONSTANT_X)
            mstore(add(f, 0x20), CONSTANT_Y)
            mstore(g, PUB_0_X)
            mstore(add(g, 0x20), PUB_0_Y)
            s := calldataload(input)
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_1_X)
            mstore(add(g, 0x20), PUB_1_Y)
            s := calldataload(add(input, 32))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_2_X)
            mstore(add(g, 0x20), PUB_2_Y)
            s := calldataload(add(input, 64))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_3_X)
            mstore(add(g, 0x20), PUB_3_Y)
            s := calldataload(add(input, 96))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_4_X)
            mstore(add(g, 0x20), PUB_4_Y)
            s := calldataload(add(input, 128))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_5_X)
            mstore(add(g, 0x20), PUB_5_Y)
            s := calldataload(add(input, 160))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_6_X)
            mstore(add(g, 0x20), PUB_6_Y)
            s := calldataload(add(input, 192))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_7_X)
            mstore(add(g, 0x20), PUB_7_Y)
            s := calldataload(add(input, 224))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_8_X)
            mstore(add(g, 0x20), PUB_8_Y)
            s := calldataload(add(input, 256))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_9_X)
            mstore(add(g, 0x20), PUB_9_Y)
            s := calldataload(add(input, 288))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_10_X)
            mstore(add(g, 0x20), PUB_10_Y)
            s := calldataload(add(input, 320))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_11_X)
            mstore(add(g, 0x20), PUB_11_Y)
            s := calldataload(add(input, 352))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_12_X)
            mstore(add(g, 0x20), PUB_12_Y)
            s := calldataload(add(input, 384))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_13_X)
            mstore(add(g, 0x20), PUB_13_Y)
            s := calldataload(add(input, 416))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_14_X)
            mstore(add(g, 0x20), PUB_14_Y)
            s := calldataload(add(input, 448))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_15_X)
            mstore(add(g, 0x20), PUB_15_Y)
            s := calldataload(add(input, 480))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_16_X)
            mstore(add(g, 0x20), PUB_16_Y)
            s := calldataload(add(input, 512))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_17_X)
            mstore(add(g, 0x20), PUB_17_Y)
            s := calldataload(add(input, 544))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_18_X)
            mstore(add(g, 0x20), PUB_18_Y)
            s := calldataload(add(input, 576))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_19_X)
            mstore(add(g, 0x20), PUB_19_Y)
            s := calldataload(add(input, 608))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_20_X)
            mstore(add(g, 0x20), PUB_20_Y)
            s := calldataload(add(input, 640))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_21_X)
            mstore(add(g, 0x20), PUB_21_Y)
            s := calldataload(add(input, 672))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_22_X)
            mstore(add(g, 0x20), PUB_22_Y)
            s := calldataload(add(input, 704))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_23_X)
            mstore(add(g, 0x20), PUB_23_Y)
            s := calldataload(add(input, 736))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_24_X)
            mstore(add(g, 0x20), PUB_24_Y)
            s := calldataload(add(input, 768))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_25_X)
            mstore(add(g, 0x20), PUB_25_Y)
            s := calldataload(add(input, 800))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_26_X)
            mstore(add(g, 0x20), PUB_26_Y)
            s := calldataload(add(input, 832))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_27_X)
            mstore(add(g, 0x20), PUB_27_Y)
            s := calldataload(add(input, 864))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_28_X)
            mstore(add(g, 0x20), PUB_28_Y)
            s := calldataload(add(input, 896))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_29_X)
            mstore(add(g, 0x20), PUB_29_Y)
            s := calldataload(add(input, 928))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_30_X)
            mstore(add(g, 0x20), PUB_30_Y)
            s := calldataload(add(input, 960))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )
            mstore(g, PUB_31_X)
            mstore(add(g, 0x20), PUB_31_Y)
            s := calldataload(add(input, 992))
            mstore(add(g, 0x40), s)
            success := and(success, lt(s, R))
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_MUL, g, 0x60, g, 0x40)
            )
            success := and(
                success,
                staticcall(gas(), PRECOMPILE_ADD, f, 0x80, f, 0x40)
            )

            x := mload(f)
            y := mload(add(f, 0x20))
        }
        if (!success) {
            // Either Public input not in field, or verification key invalid.
            // We assume the contract is correctly generated, so the verification key is valid.
            revert PublicInputNotInField();
        }
    }

    /// Compress a proof.
    /// @notice Will revert with InvalidProof if the curve points are invalid,
    /// but does not verify the proof itself.
    /// @param proof The uncompressed Groth16 proof. Elements are in the same order as for
    /// verifyProof. I.e. Groth16 points (A, B, C) encoded as in EIP-197.
    /// @return compressed The compressed proof. Elements are in the same order as for
    /// verifyCompressedProof. I.e. points (A, B, C) in compressed format.
    function compressProof(
        uint256[8] calldata proof
    ) public view returns (uint256[4] memory compressed) {
        compressed[0] = compress_g1(proof[0], proof[1]);
        (compressed[2], compressed[1]) = compress_g2(
            proof[3],
            proof[2],
            proof[5],
            proof[4]
        );
        compressed[3] = compress_g1(proof[6], proof[7]);
    }

    /// Verify a Groth16 proof with compressed points.
    /// @notice Reverts with InvalidProof if the proof is invalid or
    /// with PublicInputNotInField the public input is not reduced.
    /// @notice There is no return value. If the function does not revert, the
    /// proof was successfully verified.
    /// @param compressedProof the points (A, B, C) in compressed format
    /// matching the output of compressProof.
    /// @param input the public input field elements in the scalar field Fr.
    /// Elements must be reduced.
    function verifyCompressedProof(
        uint256[4] calldata compressedProof,
        uint256[32] calldata input
    ) public view {
        uint256[24] memory pairings;

        {
            (uint256 Ax, uint256 Ay) = decompress_g1(compressedProof[0]);
            (
                uint256 Bx0,
                uint256 Bx1,
                uint256 By0,
                uint256 By1
            ) = decompress_g2(compressedProof[2], compressedProof[1]);
            (uint256 Cx, uint256 Cy) = decompress_g1(compressedProof[3]);
            (uint256 Lx, uint256 Ly) = publicInputMSM(input);

            // Verify the pairing
            // Note: The precompile expects the F2 coefficients in big-endian order.
            // Note: The pairing precompile rejects unreduced values, so we won't check that here.
            // e(A, B)
            pairings[0] = Ax;
            pairings[1] = Ay;
            pairings[2] = Bx1;
            pairings[3] = Bx0;
            pairings[4] = By1;
            pairings[5] = By0;
            // e(C, -δ)
            pairings[6] = Cx;
            pairings[7] = Cy;
            pairings[8] = DELTA_NEG_X_1;
            pairings[9] = DELTA_NEG_X_0;
            pairings[10] = DELTA_NEG_Y_1;
            pairings[11] = DELTA_NEG_Y_0;
            // e(α, -β)
            pairings[12] = ALPHA_X;
            pairings[13] = ALPHA_Y;
            pairings[14] = BETA_NEG_X_1;
            pairings[15] = BETA_NEG_X_0;
            pairings[16] = BETA_NEG_Y_1;
            pairings[17] = BETA_NEG_Y_0;
            // e(L_pub, -γ)
            pairings[18] = Lx;
            pairings[19] = Ly;
            pairings[20] = GAMMA_NEG_X_1;
            pairings[21] = GAMMA_NEG_X_0;
            pairings[22] = GAMMA_NEG_Y_1;
            pairings[23] = GAMMA_NEG_Y_0;

            // Check pairing equation.
            bool success;
            uint256[1] memory output;
            assembly ("memory-safe") {
                success := staticcall(
                    gas(),
                    PRECOMPILE_VERIFY,
                    pairings,
                    0x300,
                    output,
                    0x20
                )
            }
            if (!success || output[0] != 1) {
                // Either proof or verification key invalid.
                // We assume the contract is correctly generated, so the verification key is valid.
                revert ProofInvalid();
            }
        }
    }

    /// Verify an uncompressed Groth16 proof.
    /// @notice Reverts with InvalidProof if the proof is invalid or
    /// with PublicInputNotInField the public input is not reduced.
    /// @notice There is no return value. If the function does not revert, the
    /// proof was successfully verified.
    /// @param proof the points (A, B, C) in EIP-197 format matching the output
    /// of compressProof.
    /// @param input the public input field elements in the scalar field Fr.
    /// Elements must be reduced.
    function verifyProof(
        uint256[8] calldata proof,
        uint256[32] calldata input
    ) public view {
        (uint256 x, uint256 y) = publicInputMSM(input);

        // Note: The precompile expects the F2 coefficients in big-endian order.
        // Note: The pairing precompile rejects unreduced values, so we won't check that here.
        bool success;
        assembly ("memory-safe") {
            let f := mload(0x40) // Free memory pointer.

            // Copy points (A, B, C) to memory. They are already in correct encoding.
            // This is pairing e(A, B) and G1 of e(C, -δ).
            calldatacopy(f, proof, 0x100)

            // Complete e(C, -δ) and write e(α, -β), e(L_pub, -γ) to memory.
            // OPT: This could be better done using a single codecopy, but
            //      Solidity (unlike standalone Yul) doesn't provide a way to
            //      to do this.
            mstore(add(f, 0x100), DELTA_NEG_X_1)
            mstore(add(f, 0x120), DELTA_NEG_X_0)
            mstore(add(f, 0x140), DELTA_NEG_Y_1)
            mstore(add(f, 0x160), DELTA_NEG_Y_0)
            mstore(add(f, 0x180), ALPHA_X)
            mstore(add(f, 0x1a0), ALPHA_Y)
            mstore(add(f, 0x1c0), BETA_NEG_X_1)
            mstore(add(f, 0x1e0), BETA_NEG_X_0)
            mstore(add(f, 0x200), BETA_NEG_Y_1)
            mstore(add(f, 0x220), BETA_NEG_Y_0)
            mstore(add(f, 0x240), x)
            mstore(add(f, 0x260), y)
            mstore(add(f, 0x280), GAMMA_NEG_X_1)
            mstore(add(f, 0x2a0), GAMMA_NEG_X_0)
            mstore(add(f, 0x2c0), GAMMA_NEG_Y_1)
            mstore(add(f, 0x2e0), GAMMA_NEG_Y_0)

            // Check pairing equation.
            success := staticcall(gas(), PRECOMPILE_VERIFY, f, 0x300, f, 0x20)
            // Also check returned value (both are either 1 or 0).
            success := and(success, mload(f))
        }
        if (!success) {
            // Either proof or verification key invalid.
            // We assume the contract is correctly generated, so the verification key is valid.
            revert ProofInvalid();
        }
    }
}
