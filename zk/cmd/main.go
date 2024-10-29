package main

import (
	"flag"
	"log"

	"github.com/ava-labs/EncryptedERC/hardhat"
	"github.com/ava-labs/ac-etracrypto/helpers"
)

func contains(val *string, list []string) bool {
	for _, v := range list {
		if v == *val {
			return true
		}
	}
	return false
}

/*
	Input structure
	{
		privateInputs: [],
		publicInputs: [],
	}
*/

func main() {
	VALID_OPERATIONS := []string{"REGISTER", "MINT", "BURN", "TRANSFER"}

	operation := flag.String("operation", "", "Circuit Name [REGISTER,TRANSFER,BURN]")
	input := flag.String("input", "", "Stringified JSON input")
	output := flag.String("output", "", "Name of the circuit output file (output.json)")
	csPath := flag.String("cs", "", "Path to the circuit cs.r1cs")
	pkPath := flag.String("pk", "", "Path to the circuit pk.pk")
	isNew := flag.Bool("new", false, "Generate new circuit")
	shouldExtract := flag.Bool("extract", false, "Extract the circuit")

	flag.Parse()

	if !contains(operation, VALID_OPERATIONS) {
		log.Fatal("Provide a valid operations between [REGISTER,TRANSFER,BURN]")
		return
	}

	pp := helpers.TestingParams{Input: *input, Output: *output, CsPath: *csPath, PkPath: *pkPath, IsNew: *isNew, Extract: *shouldExtract}

	switch *operation {
	case "REGISTER":
		hardhat.Register(pp)
	case "MINT":
		hardhat.Mint(pp)
	}

	// switch *operation {
	// case "REGISTER":
	// 	hardhat.Register(pp)
	// case "BURN":
	// 	hardhat.Burn(pp)
	// case "TRANSFER":
	// 	hardhat.Transfer(pp)
	// case "MINT":
	// 	hardhat.Mint(pp)
	// default:
	// 	break
	// }
}
