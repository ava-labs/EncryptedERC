package hardhat

import (
	"encoding/json"

	"github.com/ava-labs/EncryptedERC/pkg/circuits"
	"github.com/ava-labs/EncryptedERC/pkg/helpers"
	"github.com/ava-labs/EncryptedERC/pkg/utils"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/frontend"
)

func Register(pp helpers.TestingParams) {
	inputString := pp.Input
	var inputs Inputs
	err := json.Unmarshal([]byte(inputString), &inputs)
	if err != nil {
		panic(err)
	}

	f := func() frontend.Circuit { return &circuits.RegistrationCircuit{} }

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

	a, b, c := utils.SetProof(proof)
	utils.WriteProof(pp.Output, &a, &b, &c)

	if pp.Extract {
		helpers.SaveCS(ccs, "REGISTER")
		helpers.SavePK(pk, "REGISTER")
		helpers.SaveVK(vk, "REGISTER")
	}
}
