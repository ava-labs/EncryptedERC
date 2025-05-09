pragma circom 2.1.9;

include "./circomlib/poseidon.circom";
include "./circomlib/babyjub.circom";
include "./circomlib/escalarmulany.circom";

// Performs a Poseidon decryption of a given length
// Taken from https://github.com/Shigoto-dev19/poseidon-encryption-circom2/blob/master-circom2/circom/poseidon.circom
template PoseidonDecrypt(l) {
    var decryptedLength = l;
    while (decryptedLength % 3 != 0) {
        decryptedLength += 1;
    }

    signal input ciphertext[decryptedLength + 1];
    signal input nonce;
    signal input key[2];
    signal output decrypted[decryptedLength];

    var two128 = 2 ** 128;

    component bitCheck1 = Num2Bits(252);
    bitCheck1.in <== nonce;

    component bitCheck2 = Num2Bits(252);
    bitCheck2.in <== two128;

    component lt = LessThan(252);
    lt.in[0] <== nonce;
    lt.in[1] <== two128;
    lt.out === 1;

    var n = (decryptedLength + 1) \ 3;

    component strategies[n + 1];
    strategies[0] = PoseidonEx(3, 4);
    strategies[0].initialState <== 0;
    strategies[0].inputs[0] <== key[0];
    strategies[0].inputs[1] <== key[1];
    strategies[0].inputs[2] <== nonce + (l * two128);

    for (var i = 0; i < n; i ++) {
        for (var j = 0; j < 3; j ++) {
            decrypted[i * 3 + j] <== ciphertext[i * 3 + j] - strategies[i].out[j + 1];
        }

        strategies[i + 1] = PoseidonEx(3, 4);
        strategies[i + 1].initialState <== strategies[i].out[0];
        for (var j = 0; j < 3; j ++) {
            strategies[i + 1].inputs[j] <== ciphertext[i * 3 + j];
        }
    }

    // Check the last ciphertext element
    ciphertext[decryptedLength] === strategies[n].out[1];

    // If length > 3, check if the last (3 - (l mod 3)) elements of the message
    // are 0
    if (l % 3 > 0) {
        if (l % 3 == 1) {
            decrypted[decryptedLength - 1] === 0;
        } else if (l % 3 == 2) {
            decrypted[decryptedLength - 1] === 0;
            decrypted[decryptedLength - 2] === 0;
        }
    }
}

// BabyJubJub Scalar Multiplication
// Converted from https://github.com/iden3/circomlib/blob/master/circuits/babyjub.circom BabyPbk()
template BabyScalarMul() {
    signal input  scalar;
    signal input point[2];
    signal output Ax;
    signal output Ay;

    component checkPoint = BabyCheck();
    checkPoint.x <== point[0];
    checkPoint.y <== point[1];

    component scalarBits = Num2Bits(253);
    scalarBits.in <== scalar;

    component mulAny = EscalarMulAny(253);
    mulAny.p[0] <== point[0];
    mulAny.p[1] <== point[1];

    var i;
    for (i=0; i<253; i++) {
        mulAny.e[i] <== scalarBits.out[i];
    }
    Ax  <== mulAny.out[0];
    Ay  <== mulAny.out[1];
}


// ElGamal encryption over BabyJubJub curve while preserving the additively homomorphic property.
// The scheme maps a scalar to a point on the curve and then adds it to the public key point. It outputs the two points of the resulting ciphertext (c1, c2).
template ElGamalEncrypt() {
    signal input random;
    signal input pk[2];
    signal input msg[2];
    signal output encryptedC1X;
    signal output encryptedC1Y;
    signal output encryptedC2X;
    signal output encryptedC2Y;

    component checkPoint = BabyCheck();
    checkPoint.x <== pk[0];
    checkPoint.y <== pk[1];

    component checkPoint2 = BabyCheck();
    checkPoint2.x <== msg[0];
    checkPoint2.y <== msg[1];

    component randomBits = Num2Bits(253);
    randomBits.in <== random;

    component randomToPoint = BabyPbk();
    randomToPoint.in <== random;

    component pkandr = EscalarMulAny(253);
    for (var i = 0; i < 253; i ++) {
        pkandr.e[i] <== randomBits.out[i];
    }
    pkandr.p[0] <== pk[0];
    pkandr.p[1] <== pk[1];
    
    component addRes = BabyAdd();
    addRes.x1 <== msg[0];
    addRes.y1 <== msg[1];
    addRes.x2 <== pkandr.out[0];
    addRes.y2 <== pkandr.out[1];

    encryptedC1X <== randomToPoint.Ax;
    encryptedC1Y <== randomToPoint.Ay;
    encryptedC2X <== addRes.xout;
    encryptedC2Y <== addRes.yout;

}

// ElGamal Decryption scheme over BabyJub curve while preserving the additively homomorphic property.
// The scheme takes the two points of the ciphertext (c1, c2) and the private key and outputs the message, mapped to a point.
template ElGamalDecrypt() {
    signal input c1[2];
    signal input c2[2];
    signal input privKey;
    signal output outx;
    signal output outy;

    component checkPoint = BabyCheck();
    checkPoint.x <== c1[0];
    checkPoint.y <== c1[1];

    component checkPoint2 = BabyCheck();
    checkPoint2.x <== c2[0];
    checkPoint2.y <== c2[1];

    // Convert the private key to bits
    component privKeyBits = Num2Bits(253);
    privKeyBits.in <== privKey;

    // c1 ** x
    component c1x = EscalarMulAny(253);
    for (var i = 0; i < 253; i ++) {
        c1x.e[i] <== privKeyBits.out[i];
    }
    c1x.p[0] <== c1[0];
    c1x.p[1] <== c1[1];

    // (c1 * x) * -1
    signal c1xInverseX;
    c1xInverseX <== 0 - c1x.out[0];

    // ((c1 * x) * - 1) * c2
    component decryptedPoint = BabyAdd();
    decryptedPoint.x1 <== c1xInverseX;
    decryptedPoint.y1 <== c1x.out[1];
    decryptedPoint.x2 <== c2[0];
    decryptedPoint.y2 <== c2[1];

    outx <== decryptedPoint.xout;
    outy <== decryptedPoint.yout;
}

template CheckPublicKey() {
    signal input privKey;
    signal input pubKey[2];

    // Verify the private key is not zero
    component checkIsZero = IsZero();
    checkIsZero.in <== privKey;
    checkIsZero.out === 0;

    component checkPoint = BabyCheck();
    checkPoint.x <== pubKey[0];
    checkPoint.y <== pubKey[1];
    
    // Verify the private key is less than the base order
    var baseOrder = 2736030358979909402780800718157159386076813972158567259200215660948447373041;

    component bitCheck1 = Num2Bits(252);
    bitCheck1.in <== privKey;

    component bitCheck2 = Num2Bits(252);
    bitCheck2.in <== baseOrder;

    component lt = LessThan(252);
    lt.in[0] <== privKey;
    lt.in[1] <== baseOrder;
    lt.out === 1;

    component checkPK = BabyPbk();
    checkPK.in <== privKey;

    checkPK.Ax === pubKey[0];
    checkPK.Ay === pubKey[1];
}

template CheckValue() {
    signal input value;
    signal input privKey;
    signal input valueC1[2];
    signal input valueC2[2];

    component checkPoint = BabyCheck();
    checkPoint.x <== valueC1[0];
    checkPoint.y <== valueC1[1];

    component checkPoint2 = BabyCheck();
    checkPoint2.x <== valueC2[0];
    checkPoint2.y <== valueC2[1];
    
    // Verify the value is less than the base order
    var baseOrder = 2736030358979909402780800718157159386076813972158567259200215660948447373041;

    component bitCheck1 = Num2Bits(252);
    bitCheck1.in <== value;

    component bitCheck2 = Num2Bits(252);
    bitCheck2.in <== baseOrder;

    component lt = LessThan(252);
    lt.in[0] <== value;
    lt.in[1] <== baseOrder;
    lt.out === 1;

    component checkValue = ElGamalDecrypt();
    checkValue.c1[0] <== valueC1[0];
    checkValue.c1[1] <== valueC1[1];
    checkValue.c2[0] <== valueC2[0];
    checkValue.c2[1] <== valueC2[1];
    checkValue.privKey <== privKey;
    
    component valueToPoint = BabyPbk();
    valueToPoint.in <== value;

    valueToPoint.Ax === checkValue.outx;
    valueToPoint.Ay === checkValue.outy;
}


template CheckReceiverValue() {
    signal input receiverValue;
    signal input receiverPublicKey[2];
    signal input receiverRandom;
    signal input receiverValueC1[2];
    signal input receiverValueC2[2];

    component checkPoint = BabyCheck();
    checkPoint.x <== receiverValueC1[0];
    checkPoint.y <== receiverValueC1[1];

    component checkPoint2 = BabyCheck();
    checkPoint2.x <== receiverValueC2[0];
    checkPoint2.y <== receiverValueC2[1];

    // Verify the receiver value is less than the base order
    var baseOrder = 2736030358979909402780800718157159386076813972158567259200215660948447373041;

    component bitCheck1 = Num2Bits(252);
    bitCheck1.in <== receiverValue;

    component bitCheck2 = Num2Bits(252);
    bitCheck2.in <== baseOrder;

    component lt = LessThan(252);
    lt.in[0] <== receiverValue;
    lt.in[1] <== baseOrder;
    lt.out === 1;
    
    component receiverValueToPoint = BabyPbk();
    receiverValueToPoint.in <== receiverValue;

    component receiverValueEncrypt = ElGamalEncrypt();
    receiverValueEncrypt.random <== receiverRandom;
    receiverValueEncrypt.pk[0] <== receiverPublicKey[0];
    receiverValueEncrypt.pk[1] <== receiverPublicKey[1];
    receiverValueEncrypt.msg[0] <== receiverValueToPoint.Ax;
    receiverValueEncrypt.msg[1] <== receiverValueToPoint.Ay;

    receiverValueEncrypt.encryptedC1X === receiverValueC1[0];
    receiverValueEncrypt.encryptedC1Y === receiverValueC1[1];
    receiverValueEncrypt.encryptedC2X === receiverValueC2[0];
    receiverValueEncrypt.encryptedC2Y === receiverValueC2[1];
}

template CheckPCT() {
    signal input publicKey[2];
    signal input pct[4];
    signal input authKey[2];
    signal input nonce;
    signal input random;
    signal input value;

    component checkPoint = BabyCheck();
    checkPoint.x <== publicKey[0];
    checkPoint.y <== publicKey[1];

    component checkPoint2 = BabyCheck();
    checkPoint2.x <== authKey[0];
    checkPoint2.y <== authKey[1];

    // Verify the random is less than the base order
    var baseOrder = 2736030358979909402780800718157159386076813972158567259200215660948447373041;

    component bitCheck1 = Num2Bits(252);
    bitCheck1.in <== random;

    component bitCheck2 = Num2Bits(252);
    bitCheck2.in <== baseOrder;

    component lt = LessThan(252);
    lt.in[0] <== random;
    lt.in[1] <== baseOrder;
    lt.out === 1;

    component checkAuthKey = BabyPbk();
    checkAuthKey.in <== random;

    checkAuthKey.Ax === authKey[0];
    checkAuthKey.Ay === authKey[1];

    component checkEncKey = BabyScalarMul();
    checkEncKey.scalar <== random;
    checkEncKey.point[0] <== publicKey[0];
    checkEncKey.point[1] <== publicKey[1];

    component decryptedPCT = PoseidonDecrypt(1);
    decryptedPCT.ciphertext <== pct;
    decryptedPCT.nonce <== nonce;
    decryptedPCT.key[0] <== checkEncKey.Ax;
    decryptedPCT.key[1] <== checkEncKey.Ay;


    decryptedPCT.decrypted[0] === value;
}

template CheckNullifierHash() {
    signal input nullifierHash;
    signal input chainID;
    signal input auditorCiphertext[4];

    component hash = Poseidon(5);
    hash.inputs[0] <== chainID;
    hash.inputs[1] <== auditorCiphertext[0];
    hash.inputs[2] <== auditorCiphertext[1];
    hash.inputs[3] <== auditorCiphertext[2];
    hash.inputs[4] <== auditorCiphertext[3];

    hash.out === nullifierHash;
}

template CheckRegistrationHash() {
    signal input registrationHash;
    signal input chainID;
    signal input senderPrivateKey;
    signal input senderAddress;

    component hash = Poseidon(3);
    hash.inputs[0] <== chainID;
    hash.inputs[1] <== senderPrivateKey;
    hash.inputs[2] <== senderAddress;

    hash.out === registrationHash;
}