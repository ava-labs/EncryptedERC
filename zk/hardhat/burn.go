package hardhat

import (
	"encoding/json"

	"github.com/ava-labs/EncryptedERC/circuits"
	"github.com/ava-labs/EncryptedERC/utils"
	"github.com/ava-labs/ac-etracrypto/helpers"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/frontend"
)

func Burn(pp helpers.TestingParams) {
	inputString := pp.Input
	var inputs Inputs
	err := json.Unmarshal([]byte(inputString), &inputs)
	if err != nil {
		panic(err)
	}

	f := func() frontend.Circuit { return &circuits.BurnCircuit{} }

	ccs, pk, vk, err := helpers.LoadCircuit(pp, f)
	if err != nil {
		panic(err)
	}

	witness, err := utils.GenerateWitness(inputs.PubIns, inputs.PrivIns)
	if err != nil {
		panic(err)
	}

	proof, err := groth16.Prove(ccs, pk, witness)
	if err != nil {
		panic(err)
	}

	a, b, c := helpers.SetProof(proof)
	utils.WriteProof(pp.Output, &a, &b, &c)

	if pp.Extract {
		helpers.SaveCS(ccs, "BURN")
		helpers.SavePK(pk, "BURN")
		helpers.SaveVK(vk, "BURN")
	}
}
