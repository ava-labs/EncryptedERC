package utils

import (
	"bytes"
	"encoding/json"
	"log"
	"math/big"
	"os"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/witness"
	"github.com/iden3/go-iden3-crypto/utils"
)

func NewBigArrayFromStrings(inputs []string) []*big.Int {
	bigInts := make([]*big.Int, len(inputs))
	for i, input := range inputs {
		bigInts[i] = utils.NewIntFromString(input)
	}
	return bigInts
}

func NewStringArrayFromBigInts(inputs []*big.Int) []string {
	strings := make([]string, len(inputs))
	for i, input := range inputs {
		strings[i] = input.String()
	}
	return strings
}

func Mapper[T any](s []T, f func(T, int) T) []T {
	result := make([]T, len(s))
	for i, v := range s {
		result[i] = f(v, i)
	}
	return result
}

func Reduce[T any](s []T, f func(int, T, T) T, initValue T) T {
	acc := initValue
	for i, v := range s {
		acc = f(i, acc, v)
	}
	return acc
}

func GenerateWitness(publicIns, privateIns []string) (witness.Witness, error) {
	ww, _ := witness.New(ecc.BN254.ScalarField())
	nbTotal := len(publicIns) + len(privateIns)
	values := make(chan any, nbTotal)
	go func() {
		for i := 0; i < len(publicIns); i++ {
			values <- publicIns[i]
		}
		for i := 0; i < len(privateIns); i++ {
			values <- privateIns[i]
		}
		close(values)
	}()

	err := ww.Fill(len(publicIns), len(privateIns), values)
	if err != nil {
		return nil, err
	}
	return ww, nil
}

// general helper function for writing the proof
func WriteProof(output string, a *[2]string, b *[2][2]string, c *[2]string) {
	proof := map[string]interface{}{
		"proof": []string{a[0], a[1], b[0][0], b[0][1], b[1][0], b[1][1], c[0], c[1]},
	}

	proofJSON, err := json.Marshal(proof)
	if err != nil {
		log.Fatal(err)
	}

	err = os.WriteFile(output, proofJSON, 0644)
	if err != nil {
		log.Fatal(err)
	}
}

// setProof function fills 'a', 'b', 'c' and public inputs for the generated proof
func setProofABC(proofBytes []byte, a *[2]string, b *[2][2]string, c *[2]string) {
	const fpSize = 4 * 8

	a[0] = new(big.Int).SetBytes(proofBytes[fpSize*0 : fpSize*1]).String()
	a[1] = new(big.Int).SetBytes(proofBytes[fpSize*1 : fpSize*2]).String()
	b[0][0] = new(big.Int).SetBytes(proofBytes[fpSize*2 : fpSize*3]).String()
	b[0][1] = new(big.Int).SetBytes(proofBytes[fpSize*3 : fpSize*4]).String()
	b[1][0] = new(big.Int).SetBytes(proofBytes[fpSize*4 : fpSize*5]).String()
	b[1][1] = new(big.Int).SetBytes(proofBytes[fpSize*5 : fpSize*6]).String()
	c[0] = new(big.Int).SetBytes(proofBytes[fpSize*6 : fpSize*7]).String()
	c[1] = new(big.Int).SetBytes(proofBytes[fpSize*7 : fpSize*8]).String()
}

// setProof function fills 'a', 'b', 'c' and public inputs for the generated proof
// and writes the proof to the output file
func SetProof(proof groth16.Proof) (a [2]string, b [2][2]string, c [2]string) {
	var buf bytes.Buffer
	_, err := proof.WriteRawTo(&buf)
	if err != nil {
		panic(err)
	}
	proofBytes := buf.Bytes()

	setProofABC(proofBytes, &a, &b, &c)
	return a, b, c
}
