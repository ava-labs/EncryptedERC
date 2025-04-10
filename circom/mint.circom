pragma circom 2.1.9;

include "./components.circom";

template MintCircuit () {
    signal input ValueToMint;

    signal input ChainID;
    signal input NullifierHash;

    signal input ReceiverPublicKey[2];
    signal input ReceiverVTTC1[2];
    signal input ReceiverVTTC2[2];
    signal input ReceiverVTTRandom;
    
    signal input ReceiverPCT[4];
    signal input ReceiverPCTAuthKey[2];
    signal input ReceiverPCTNonce;
    signal input ReceiverPCTRandom;

    signal input AuditorPublicKey[2];
    signal input AuditorPCT[4];
    signal input AuditorPCTAuthKey[2];
    signal input AuditorPCTNonce;
    signal input AuditorPCTRandom;

    var baseOrder = 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    component bitCheck1 = Num2Bits(252);
    bitCheck1.in <== ValueToMint;

    component bitCheck2 = Num2Bits(252);
    bitCheck2.in <== baseOrder;

    component lt = LessThan(252);
    lt.in[0] <== ValueToMint;
    lt.in[1] <== baseOrder;
    lt.out === 1;

    // Verify receiver's encrypted value is the mint amount
    component checkReceiverValue = CheckReceiverValue();
    checkReceiverValue.receiverValue <== ValueToMint;
    checkReceiverValue.receiverPublicKey[0] <== ReceiverPublicKey[0];
    checkReceiverValue.receiverPublicKey[1] <== ReceiverPublicKey[1];
    checkReceiverValue.receiverRandom <== ReceiverVTTRandom;
    checkReceiverValue.receiverValueC1[0] <== ReceiverVTTC1[0];
    checkReceiverValue.receiverValueC1[1] <== ReceiverVTTC1[1];
    checkReceiverValue.receiverValueC2[0] <== ReceiverVTTC2[0];
    checkReceiverValue.receiverValueC2[1] <== ReceiverVTTC2[1];

	// Verify nullifier hash is not used
    component checkNullifierHash = CheckNullifierHash();
    checkNullifierHash.nullifierHash <== NullifierHash;
    checkNullifierHash.chainID <== ChainID;
    checkNullifierHash.auditorCiphertext[0] <== AuditorPCT[0];
    checkNullifierHash.auditorCiphertext[1] <== AuditorPCT[1];
    checkNullifierHash.auditorCiphertext[2] <== AuditorPCT[2];
    checkNullifierHash.auditorCiphertext[3] <== AuditorPCT[3];

    // Verify receiver's encrypted summary includes the mint amount and is encrypted with the receiver's public key
    component checkReceiverPCT = CheckPCT();
    checkReceiverPCT.publicKey[0] <== ReceiverPublicKey[0];
    checkReceiverPCT.publicKey[1] <== ReceiverPublicKey[1];
    checkReceiverPCT.pct <== ReceiverPCT;
    checkReceiverPCT.authKey[0] <== ReceiverPCTAuthKey[0];
    checkReceiverPCT.authKey[1] <== ReceiverPCTAuthKey[1];
    checkReceiverPCT.nonce <== ReceiverPCTNonce;
    checkReceiverPCT.random <== ReceiverPCTRandom;
    checkReceiverPCT.value <== ValueToMint;

    // Verify auditor's encrypted summary includes the mint amount and is encrypted with the auditor's public key
    component checkAuditorPCT = CheckPCT();
    checkAuditorPCT.publicKey[0] <== AuditorPublicKey[0];
    checkAuditorPCT.publicKey[1] <== AuditorPublicKey[1];
    checkAuditorPCT.pct <== AuditorPCT;
    checkAuditorPCT.authKey[0] <== AuditorPCTAuthKey[0];
    checkAuditorPCT.authKey[1] <== AuditorPCTAuthKey[1];
    checkAuditorPCT.nonce <== AuditorPCTNonce;
    checkAuditorPCT.random <== AuditorPCTRandom;
    checkAuditorPCT.value <== ValueToMint;
    
}

component main { public [ ReceiverPublicKey, AuditorPublicKey, ReceiverVTTC1, ReceiverVTTC2, ReceiverPCT, ReceiverPCTAuthKey, ReceiverPCTNonce, AuditorPCT, AuditorPCTAuthKey, AuditorPCTNonce, ChainID, NullifierHash ] } = MintCircuit();