package helpers

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/constraint"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

type TestingParams struct {
	Input   string
	Output  string
	CsPath  string
	PkPath  string
	IsNew   bool
	Extract bool
}

// function loads the contents of the circuit and the keys
// if isNew, it compiles and generates the keys for the first time
// otherwise, it reads the circuit and the keys from the given pathsß
func LoadCircuit(
	params TestingParams,
	f func() frontend.Circuit,
) (constraint.ConstraintSystem, groth16.ProvingKey, groth16.VerifyingKey, error) {
	var err error
	var ccs constraint.ConstraintSystem
	var pk groth16.ProvingKey
	var vk groth16.VerifyingKey

	if params.IsNew {
		if ccs, err = frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, f()); err != nil {
			return nil, nil, nil, err
		}

		if pk, vk, err = groth16.Setup(ccs); err != nil {
			return nil, nil, nil, err
		}

	} else {
		if len(params.CsPath) == 0 || len(params.PkPath) == 0 {
			return nil, nil, nil, errors.New("r1cs and pk paths are required for existing circuit")
		}

		ccs, err = ReadCS(params.CsPath)
		if err != nil {
			return nil, nil, nil, err
		}
		pk, err = ReadPK(params.PkPath)
		if err != nil {
			return nil, nil, nil, err
		}
	}

	return ccs, pk, vk, nil
}

// reads the constraint system from the provided path
func ReadCS(filename string) (constraint.ConstraintSystem, error) {
	ccs := groth16.NewCS(ecc.BN254)
	// Read the proving key
	csFile, err := os.ReadFile(filename)
	if err != nil {
		return ccs, err
	}

	pkCs := bytes.NewBuffer(csFile)
	_, err = ccs.ReadFrom(pkCs)
	if err != nil {
		panic(err)
	}

	return ccs, err
}

// reads the proving key from the provided path
func ReadPK(filename string) (groth16.ProvingKey, error) {
	pk := groth16.NewProvingKey(ecc.BN254)

	// Read the verifying key
	pkFile, err := os.ReadFile(filename)
	if err != nil {
		fmt.Println("Error:", err)
		return pk, err
	}

	pkBuff := bytes.NewBuffer(pkFile)
	_, err = pk.ReadFrom(pkBuff)
	if err != nil {
		panic(err)
	}

	return pk, err
}

// saves proving key to the provided path
func SavePK(pk groth16.ProvingKey, filename string) {
	var bufPK bytes.Buffer
	_, err := pk.WriteTo(&bufPK)
	if err != nil {
		panic(err)
	}

	file, err := os.Create(filename + ".pk")
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	defer file.Close()

	_, err = io.Copy(file, &bufPK)

	if err != nil {
		fmt.Println("Error:", err)
		return
	}
}

// saves constraint system to the provided path
func SaveCS(cs constraint.ConstraintSystem, filename string) {
	// Open the output file for writing
	var bufCS bytes.Buffer
	_, err := cs.WriteTo(&bufCS)
	if err != nil {
		panic(err)
	}

	// Open the output file for writing
	file, err := os.Create(filename + ".r1cs")
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	defer file.Close()

	// Write the buffer contents to the file
	_, err = io.Copy(file, &bufCS)

	if err != nil {
		fmt.Println("Error:", err)
		return
	}
}

// saves verifying key to the provided path
func SaveVK(vk groth16.VerifyingKey, filename string) {
	fileVK, err := os.Create(filename + ".sol")
	if err != nil {
		panic(err)
	}
	err = vk.ExportSolidity(fileVK)
	if err != nil {
		panic(err)
	}
}
