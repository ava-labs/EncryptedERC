pragma circom 2.1.9;

include "./components.circom";

template BurnCircuit () {
    signal input ValueToBurn;
    
    signal input SenderPrivateKey;
    signal input SenderPublicKey[2];
    signal input SenderBalance;
    signal input SenderBalanceC1[2];
    signal input SenderBalanceC2[2];

    signal input SenderVTBC1[2];
    signal input SenderVTBC2[2];

    signal input AuditorPublicKey[2];
    signal input AuditorPCT[4];
    signal input AuditorPCTAuthKey[2];
    signal input AuditorPCTNonce;
    signal input AuditorPCTRandom;

    // Verify that the transfer amount is less than or equal to the sender's balance and is less than the base order
    var baseOrder = 2736030358979909402780800718157159386076813972158567259200215660948447373041;   

    component bitCheck1 = Num2Bits(252);
    bitCheck1.in <== ValueToBurn;

    component bitCheck2 = Num2Bits(252);
    bitCheck2.in <== baseOrder;

    component lt = LessThan(252);
    lt.in[0] <== ValueToBurn;
    lt.in[1] <== baseOrder;
    lt.out === 1;

    component bitCheck3 = Num2Bits(252);
    bitCheck3.in <== SenderBalance + 1;

    component checkValue = LessThan(252);
    checkValue.in[0] <== ValueToBurn;
    checkValue.in[1] <== SenderBalance + 1;
    checkValue.out === 1;


    // Verify that the sender's public key is well-formed
    component checkSenderPK = CheckPublicKey();
    checkSenderPK.privKey <== SenderPrivateKey;
    checkSenderPK.pubKey[0] <== SenderPublicKey[0];
    checkSenderPK.pubKey[1] <== SenderPublicKey[1];

    // Verify that the sender's encrypted balance is well-formed
    component checkSenderBalance = CheckValue();
    checkSenderBalance.value <== SenderBalance;
    checkSenderBalance.privKey <== SenderPrivateKey;
    checkSenderBalance.valueC1[0] <== SenderBalanceC1[0];
    checkSenderBalance.valueC1[1] <== SenderBalanceC1[1];
    checkSenderBalance.valueC2[0] <== SenderBalanceC2[0];
    checkSenderBalance.valueC2[1] <== SenderBalanceC2[1];

    // Verify that the sender's encrypted value to burn is the burn amount
    component checkSenderVTB = CheckValue();
    checkSenderVTB.value <== ValueToBurn;
    checkSenderVTB.privKey <== SenderPrivateKey;
    checkSenderVTB.valueC1[0] <== SenderVTBC1[0];
    checkSenderVTB.valueC1[1] <== SenderVTBC1[1];
    checkSenderVTB.valueC2[0] <== SenderVTBC2[0];
    checkSenderVTB.valueC2[1] <== SenderVTBC2[1];

    // Verify auditor's encrypted summary includes the burn amount and is encrypted with the auditor's public key
    component checkAuditorPCT = CheckPCT();
    checkAuditorPCT.publicKey[0] <== AuditorPublicKey[0];
    checkAuditorPCT.publicKey[1] <== AuditorPublicKey[1];
    checkAuditorPCT.pct <== AuditorPCT;
    checkAuditorPCT.authKey[0] <== AuditorPCTAuthKey[0];
    checkAuditorPCT.authKey[1] <== AuditorPCTAuthKey[1];
    checkAuditorPCT.nonce <== AuditorPCTNonce;
    checkAuditorPCT.random <== AuditorPCTRandom;
    checkAuditorPCT.value <== ValueToBurn;
}

component main { public [ SenderPublicKey, AuditorPublicKey, SenderBalanceC1, SenderBalanceC2, SenderVTBC1, SenderVTBC2, AuditorPCT, AuditorPCTAuthKey, AuditorPCTNonce ] } = BurnCircuit();