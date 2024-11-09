package main

import (
	"fmt"
	"math/big"

	"github.com/ava-labs/EncryptedERC/circuits"
	"github.com/ava-labs/EncryptedERC/utils"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"github.com/consensys/gnark/std/algebra/native/twistededwards"
)

func main() {

	fmt.Println("Compiling transfer circuit")
	tcircuit := circuits.TransferCircuit{}
	tr1cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &tcircuit)
	if err != nil {
		panic(err)
	}
	nbConstraints := tr1cs.GetNbConstraints()
	fmt.Println("Number of constraints:", nbConstraints)

	fmt.Println("Compiling mint circuit")
	mcircuit := circuits.MintCircuit{}
	mr1cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &mcircuit)
	if err != nil {
		panic(err)
	}
	nbConstraints = mr1cs.GetNbConstraints()
	fmt.Println("Number of constraints:", nbConstraints)

	fmt.Println("Compiling burn circuit")
	bcircuit := circuits.WithdrawCircuit{}
	br1cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &bcircuit)
	if err != nil {
		panic(err)
	}
	nbConstraints = br1cs.GetNbConstraints()
	fmt.Println("Number of constraints:", nbConstraints)
	TestTransfer()

}

func TestRegistration() {

	fmt.Println("Compiling registration circuit")
	rcircuit := circuits.RegistrationCircuit{}
	rr1cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &rcircuit)
	if err != nil {
		panic(err)
	}
	nbConstraints := rr1cs.GetNbConstraints()
	fmt.Println("Number of constraints:", nbConstraints)

	sk, _ := new(big.Int).SetString("5740379625339755798800204250072470033252660053090522577595307571693826259968", 10)
	pk1, _ := new(big.Int).SetString("12331190023552052561963550519369304572930277494921843945776382908510600125542", 10)
	pk2, _ := new(big.Int).SetString("595243501900493769085221010613800404304889256298454265763117064368652824502", 10)

	// pk := [2]big.Int{*pk1, *pk2}
	pk := twistededwards.Point{X: pk1, Y: pk2}

	// Generate a proof for the registration circuit

	assignment := circuits.RegistrationCircuit{
		Sender: circuits.RegistrationSender{
			PrivateKey: sk,
			PublicKey:  circuits.PublicKey{P: pk},
		},
	}

	witness, err := frontend.NewWitness(&assignment, ecc.BN254.ScalarField())
	if err != nil {
		panic(err)
	}

	provingKey, verificationKey, err := groth16.Setup(rr1cs)
	if err != nil {
		panic(err)
	}

	proof, err := groth16.Prove(rr1cs, provingKey, witness)
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

func TestTransfer() {

	utils.TestTransfer()
	// Generate a proof for the registration circuit

	// assignment := circuits.TransferCircuit{
	// 	Sender: circuits.Sender{
	// 		PrivateKey: sk,
	// 		PublicKey:  circuits.PublicKey{P: pk},
	// 	},
	// }

	// 	witness, err := frontend.NewWitness(&assignment, ecc.BN254.ScalarField())
	// 	if err != nil {
	// 		panic(err)
	// 	}

	// 	provingKey, verificationKey, err := groth16.Setup(rr1cs)
	// 	if err != nil {
	// 		panic(err)
	// 	}

	// 	proof, err := groth16.Prove(rr1cs, provingKey, witness)
	// 	if err != nil {
	// 		panic(err)
	// 	}
	// 	fmt.Println("Proof:", proof)

	// pWitness, err := witness.Public()
	//
	//	if err != nil {
	//		panic(err)
	//	}
	//
	// err = groth16.Verify(proof, verificationKey, pWitness)
	//
	//	if err != nil {
	//		panic(err)
	//	}
	//
	// fmt.Println("Proof is valid")
}
