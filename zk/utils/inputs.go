package utils

import (
	"crypto/rand"
	"fmt"
	"math/big"

	"github.com/ava-labs/EncryptedERC/circuits"
	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"github.com/consensys/gnark/std/algebra/native/twistededwards"
	babyjub "github.com/iden3/go-iden3-crypto/babyjub"
)

func ECEG_Encrypt(pk *babyjub.PublicKey, value *big.Int) (c1 *babyjub.Point, c2 *babyjub.Point, r *big.Int) {
	r, _ = rand.Int(rand.Reader, babyjub.Order)
	c1 = babyjub.B8.Mul(r, babyjub.B8)
	t1 := babyjub.B8.Mul(r, pk.Point()).Projective()
	t2 := babyjub.B8.Mul(value, babyjub.B8).Projective()
	c2 = t1.Add(t1, t2).Affine()
	return c1, c2, r
}

func ECEG_Decrypt(sk *babyjub.PrivKeyScalar, c1 *babyjub.Point, c2 *babyjub.Point) *babyjub.Point {
	negSk := new(big.Int).Sub(babyjub.Order, sk.BigInt())
	t1 := c1.Mul(negSk, c1).Projective()
	t2 := t1.Add(t1, c2.Projective()).Affine()
	return t2
}

func Neg(x *big.Int) *big.Int {
	return new(big.Int).Sub(babyjub.Order, x)
}

func ECDH_PoseidonEncrypt(pk *babyjub.PublicKey, value *big.Int) ([]*big.Int, *big.Int, *babyjub.Point, *babyjub.Point, *big.Int, error) {
	r, _ := rand.Int(rand.Reader, babyjub.Order)
	pkr := babyjub.B8.Mul(r, pk.Point())

	br := babyjub.B8.Mul(r, babyjub.B8)

	key := []*big.Int{pkr.X, pkr.Y}
	nonce, _ := rand.Int(rand.Reader, new(big.Int).Exp(big.NewInt(2), big.NewInt(100), nil))
	msg := []*big.Int{value, big.NewInt(0)}
	cipherText, err := PoseidonEncrypt(msg, key, nonce)
	if err != nil {
		return nil, nil, nil, nil, nil, fmt.Errorf("error at Poseidon encryption: %w", err)
	}
	return cipherText, nonce, pkr, br, r, nil
}

func ECDH_PoseidonDecrypt(poseidonCiphertext []*big.Int, nonce *big.Int, pkr *babyjub.Point, br *babyjub.Point) []*big.Int {
	x := pkr.X
	y := pkr.Y
	key := []*big.Int{x, y}

	cipherText := poseidonCiphertext
	msg, _ := PoseidonDecrypt(cipherText, key, nonce, 2)
	return msg
}

func TestTransfer() {
	skpSender := babyjub.NewRandPrivKey()
	skSender := skpSender.Scalar()
	pkSender := skpSender.Public()

	skpReceiver := babyjub.NewRandPrivKey()
	skReceiver := skpReceiver.Scalar()
	pkReceiver := skpReceiver.Public()

	skpAuditor := babyjub.NewRandPrivKey()
	skAuditor := skpAuditor.Scalar()
	pkAuditor := skpAuditor.Public()

	fmt.Println("Private key sender:", skSender.BigInt())
	fmt.Println("Public key sender:", pkSender.X.String(), pkSender.Y.String())

	fmt.Println("Private key receiver:", skReceiver.BigInt())
	fmt.Println("Public key receiver:", pkReceiver.X.String(), pkReceiver.Y.String())
	fmt.Println("Private key auditor:", skAuditor.BigInt())
	fmt.Println("Public key auditor:", pkAuditor.X.String(), pkAuditor.Y.String())

	balance, _ := rand.Int(rand.Reader, big.NewInt(0).Exp(big.NewInt(2), big.NewInt(160), nil))
	fmt.Println("Balance:", balance)
	c1Balance, c2Balance, _ := ECEG_Encrypt(pkSender, balance)
	fmt.Println("Balance ciphertext:", c1Balance.X.String(), c1Balance.Y.String(), c2Balance.X.String(), c2Balance.Y.String())

	value, _ := rand.Int(rand.Reader, balance)
	fmt.Println("Value:", value)
	c1ValueSender, c2ValueSender, _ := ECEG_Encrypt(pkSender, Neg(value)) // sender's value is negative
	fmt.Println("Value sender ciphertext:", c1ValueSender.X.String(), c1ValueSender.Y.String(), c2ValueSender.X.String(), c2ValueSender.Y.String())
	c1ValueReceiver, c2ValueReceiver, recvRandom := ECEG_Encrypt(pkReceiver, value) // receiver's value is positive
	fmt.Println("Value receiver ciphertext:", c1ValueReceiver.X.String(), c1ValueReceiver.Y.String(), c2ValueReceiver.X.String(), c2ValueReceiver.Y.String(), "Random:", recvRandom)
	// senderPCT, senderNonce, senderAuthKey, senderR, err := ECDH_PoseidonEncrypt(pkSender, value)
	// if err != nil {
	// 	fmt.Println("Error at ECDH_PoseidonEncrypt:", err)
	// }

	receiverPCT, receiverNonce, _, receiverAuthKey, receiverR, err := ECDH_PoseidonEncrypt(pkReceiver, value)
	if err != nil {
		fmt.Println("Error at ECDH_PoseidonEncrypt:", err)
	}
	fmt.Println("Length of receiverPCT:", len(receiverPCT))
	fmt.Println("PCT receiver:", receiverPCT[0].String(), receiverPCT[1].String(), receiverPCT[2].String(), receiverPCT[3].String(), "Auth key:", receiverAuthKey.X.String(), receiverAuthKey.Y.String(), "Nonce:", receiverNonce.String(), "Random:", receiverR.String())
	auditorPCT, auditorNonce, _, auditorAuthKey, auditorR, err := ECDH_PoseidonEncrypt(pkAuditor, value)
	if err != nil {
		fmt.Println("Error at ECDH_PoseidonEncrypt:", err)
	}
	fmt.Println("PCT auditor:", auditorPCT[0].String(), auditorPCT[1].String(), auditorPCT[2].String(), auditorPCT[3].String(), "Auth key:", auditorAuthKey.X.String(), auditorAuthKey.Y.String(), "Nonce:", auditorNonce.String(), "Random:", auditorR.String())

	fmt.Println("--------------------------------")

	fmt.Println("Compiling transfer circuit")
	tcircuit := circuits.TransferCircuit{}
	tr1cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &tcircuit)
	if err != nil {
		panic(err)
	}
	nbConstraints := tr1cs.GetNbConstraints()
	fmt.Println("Number of constraints:", nbConstraints)

	assignment := circuits.TransferCircuit{
		Sender: circuits.Sender{
			PrivateKey:  skSender.BigInt(),
			PublicKey:   circuits.PublicKey{P: twistededwards.Point{X: pkSender.X, Y: pkSender.Y}},
			Balance:     balance,
			BalanceEGCT: circuits.ElGamalCiphertext{C1: twistededwards.Point{X: c1Balance.X, Y: c1Balance.Y}, C2: twistededwards.Point{X: c2Balance.X, Y: c2Balance.Y}},
			ValueEGCT:   circuits.ElGamalCiphertext{C1: twistededwards.Point{X: c1ValueSender.X, Y: c1ValueSender.Y}, C2: twistededwards.Point{X: c2ValueSender.X, Y: c2ValueSender.Y}},
		},

		Receiver: circuits.Receiver{
			PublicKey:   circuits.PublicKey{P: twistededwards.Point{X: pkReceiver.X, Y: pkReceiver.Y}},
			ValueEGCT:   circuits.ElGamalCiphertext{C1: twistededwards.Point{X: c1ValueReceiver.X, Y: c1ValueReceiver.Y}, C2: twistededwards.Point{X: c2ValueReceiver.X, Y: c2ValueReceiver.Y}},
			ValueRandom: circuits.Randomness{R: recvRandom},
			PCT:         circuits.PoseidonCiphertext{Ciphertext: [4]frontend.Variable{receiverPCT[0], receiverPCT[1], receiverPCT[2], receiverPCT[3]}, AuthKey: [2]frontend.Variable{receiverAuthKey.X, receiverAuthKey.Y}, Nonce: receiverNonce, Random: receiverR},
		},
		Auditor: circuits.Auditor{
			PublicKey: circuits.PublicKey{P: twistededwards.Point{X: pkAuditor.X, Y: pkAuditor.Y}},
			PCT:       circuits.PoseidonCiphertext{Ciphertext: [4]frontend.Variable{auditorPCT[0], auditorPCT[1], auditorPCT[2], auditorPCT[3]}, AuthKey: [2]frontend.Variable{auditorAuthKey.X, auditorAuthKey.Y}, Nonce: auditorNonce, Random: auditorR},
		},
		ValueToTransfer: value,
	}

	fmt.Println("Generating witness")

	witness, err := frontend.NewWitness(&assignment, ecc.BN254.ScalarField())
	if err != nil {
		panic(err)
	}

	provingKey, verificationKey, err := groth16.Setup(tr1cs)
	if err != nil {
		panic(err)
	}

	proof, err := groth16.Prove(tr1cs, provingKey, witness)
	if err != nil {
		panic(err)
	}
	fmt.Println("Proof:", proof)

	pWitness, err := witness.Public()
	if err != nil {
		panic(err)
	}
	err = groth16.Verify(proof, verificationKey, pWitness)
	if err != nil {
		panic(err)
	}
	fmt.Println("Proof is valid")

}
