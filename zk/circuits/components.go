package circuits

import (
	"github.com/ava-labs/ac-etracrypto/crypto/babyjub"
	poseidon "github.com/ava-labs/ac-etracrypto/crypto/poseidon"
	"github.com/consensys/gnark/frontend"
)

/*
CheckPublicKey checks if the given private key generates the given public key over the BabyJubjub curve
*/
func CheckPublicKey(api frontend.API, bj *babyjub.BjWrapper, sender Sender) {
	generatedSenderPublicKey := bj.MulWithBasePoint(sender.PrivateKey)
	bj.AssertPoint(generatedSenderPublicKey, sender.PublicKey.P.X, sender.PublicKey.P.Y)
}

/*
CheckPublicKey checks if the given private key generates the given public key over the BabyJubjub curve
*/
func CheckRegistrationPublicKey(api frontend.API, bj *babyjub.BjWrapper, sender RegistrationSender) {
	generatedSenderPublicKey := bj.MulWithBasePoint(sender.PrivateKey)
	bj.AssertPoint(generatedSenderPublicKey, sender.PublicKey.P.X, sender.PublicKey.P.Y)
}

/*
CheckBalance checks if the sender's balance is a well-formed ElGamal ciphertext by decryption
*/
func CheckBalance(api frontend.API, bj *babyjub.BjWrapper, sender Sender) {
	decSenderBalanceP := bj.ElGamalDecrypt([2]frontend.Variable{sender.BalanceEGCT.C1.X, sender.BalanceEGCT.C1.Y}, [2]frontend.Variable{sender.BalanceEGCT.C2.X, sender.BalanceEGCT.C2.Y}, sender.PrivateKey)
	givenSenderBalanceP := bj.MulWithBasePoint(sender.Balance)
	bj.AssertPoint(givenSenderBalanceP, decSenderBalanceP.X, decSenderBalanceP.Y)
}

/*
CheckNegativeValue verifies if the sender's value is the encryption of the negative of the given value by decryption
*/
func CheckNegativeValue(api frontend.API, bj *babyjub.BjWrapper, sender Sender, value frontend.Variable) {
	negativeValueP := bj.MulWithBasePoint(api.Neg(value))
	decSenderValueP := bj.ElGamalDecrypt([2]frontend.Variable{sender.ValueEGCT.C1.X, sender.ValueEGCT.C1.Y}, [2]frontend.Variable{sender.ValueEGCT.C2.X, sender.ValueEGCT.C2.Y}, sender.PrivateKey)
	bj.AssertPoint(negativeValueP, decSenderValueP.X, decSenderValueP.Y)
}

/*
CheckPositiveValue verifies if the sender's value is the encryption of the given value by decryption
*/
func CheckPositiveValue(api frontend.API, bj *babyjub.BjWrapper, sender Sender, value frontend.Variable) {
	positiveValueP := bj.MulWithBasePoint(value)
	decSenderValueP := bj.ElGamalDecrypt([2]frontend.Variable{sender.ValueEGCT.C1.X, sender.ValueEGCT.C1.Y}, [2]frontend.Variable{sender.ValueEGCT.C2.X, sender.ValueEGCT.C2.Y}, sender.PrivateKey)
	bj.AssertPoint(positiveValueP, decSenderValueP.X, decSenderValueP.Y)
}

/*
CheckValue verifies if the receiver's value is the encryption of the given value by re-encrypting it and comparing the result with the given ciphertext
*/
func CheckValue(api frontend.API, bj *babyjub.BjWrapper, receiver Receiver, value frontend.Variable) {
	reEncC1, reEncC2 := bj.ElGamalEncrypt(receiver.PublicKey.P, bj.MulWithBasePoint(value), receiver.ValueRandom.R)
	bj.AssertPoint(receiver.ValueEGCT.C1, reEncC1.X, reEncC1.Y)
	bj.AssertPoint(receiver.ValueEGCT.C2, reEncC2.X, reEncC2.Y)
}

/*
CheckPCTReceiver verifies if the given receiver's Poseidon ciphertext is well-formed by re-encryption
*/
func CheckPCTReceiver(api frontend.API, bj *babyjub.BjWrapper, receiver Receiver, value frontend.Variable) {
	poseidonAuthKey := bj.MulWithBasePoint(receiver.PCT.Random)
	bj.AssertPoint(poseidonAuthKey, receiver.PCT.AuthKey.X, receiver.PCT.AuthKey.Y)

	// r * pk
	poseidonEncryptionKey := bj.MulWithScalar(receiver.PublicKey.P.X, receiver.PublicKey.P.Y, receiver.PCT.Random)
	// Decrypt the ciphertext
	decrypted := poseidon.PoseidonDecryptSingle(api, [2]frontend.Variable{poseidonEncryptionKey.X, poseidonEncryptionKey.Y}, receiver.PCT.Nonce, receiver.PCT.Ciphertext)

	api.AssertIsEqual(decrypted[0], value)

}

/*
CheckPCTAuditor verifies if the given auditor's Poseidon ciphertext is well-formed by re-encryption
*/
func CheckPCTAuditor(api frontend.API, bj *babyjub.BjWrapper, auditor Auditor, value frontend.Variable) {
	poseidonAuthKey := bj.MulWithBasePoint(auditor.PCT.Random)
	bj.AssertPoint(poseidonAuthKey, auditor.PCT.AuthKey.X, auditor.PCT.AuthKey.Y)

	// r * pk
	poseidonEncryptionKey := bj.MulWithScalar(auditor.PublicKey.P.X, auditor.PublicKey.P.Y, auditor.PCT.Random)

	// Decrypt the ciphertext
	decrypted := poseidon.PoseidonDecryptSingle(api, [2]frontend.Variable{poseidonEncryptionKey.X, poseidonEncryptionKey.Y}, auditor.PCT.Nonce, auditor.PCT.Ciphertext)
	api.AssertIsEqual(decrypted[0], value)
}

/*
CheckPCTSender verifies if the given sender's Poseidon ciphertext is well-formed by re-encryption
*/
// func CheckPCTSender(api frontend.API, bj *babyjub.BjWrapper, sender Sender) {
// 	poseidonAuthKey := bj.MulWithBasePoint(sender.PCT.Random)
// 	bj.AssertPoint(poseidonAuthKey, sender.PCT.AuthKey[0], sender.PCT.AuthKey[1])

// 	// r * pk
// 	poseidonEncryptionKey := bj.MulWithScalar(sender.PublicKey.P.X, sender.PublicKey.P.Y, sender.PCT.Random)

// 	// Decrypt the ciphertext
// 	decrypted := poseidon.PoseidonDecryptSingle(api, [2]frontend.Variable{poseidonEncryptionKey.X, poseidonEncryptionKey.Y}, sender.PCT.Nonce, sender.PCT.Ciphertext)

// 	api.AssertIsEqual(decrypted[0], sender.Balance)

// }
