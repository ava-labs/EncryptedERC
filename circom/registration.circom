pragma circom 2.1.9;

include "./components.circom";

template RegistrationCircuit() {
    signal input SenderPrivateKey;
    signal input SenderPublicKey[2];
    signal input SenderAddress;
    signal input ChainID;
    signal input RegistrationHash;

    // Verify that the sender's public key is well-formed
    component checkSenderPublicKey = CheckPublicKey();
    checkSenderPublicKey.privKey <== SenderPrivateKey;
    checkSenderPublicKey.pubKey[0] <== SenderPublicKey[0];
    checkSenderPublicKey.pubKey[1] <== SenderPublicKey[1];

    // Verify that the sender's registration hash is well-formed
    component checkRegistrationHash = CheckRegistrationHash();
    checkRegistrationHash.registrationHash <== RegistrationHash;
    checkRegistrationHash.chainID <== ChainID;
    checkRegistrationHash.senderPrivateKey <== SenderPrivateKey;
    checkRegistrationHash.senderAddress <== SenderAddress;
}

component main { public [ SenderPublicKey, SenderAddress, ChainID, RegistrationHash ] } = RegistrationCircuit();