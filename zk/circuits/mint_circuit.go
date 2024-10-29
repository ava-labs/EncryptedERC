package circuits

import (
	"github.com/ava-labs/ac-etracrypto/crypto/babyjub"
	tedwards "github.com/consensys/gnark-crypto/ecc/twistededwards"
	"github.com/consensys/gnark/frontend"
)

type MintCircuit struct {
	Sender      Sender
	Auditor     Auditor
	ValueToMint frontend.Variable
}

func (circuit *MintCircuit) Define(api frontend.API) error {
	// Initialize babyjub wrapper
	babyjub := babyjub.NewBjWrapper(api, tedwards.BN254)

	// Verify sender's public key is well-formed
	CheckPublicKey(api, babyjub, circuit.Sender)

	// Verify sender's encrypted balance is well-formed
	CheckBalance(api, babyjub, circuit.Sender)

	// Verify sender's encrypted value is the mint amount
	CheckPositiveValue(api, babyjub, circuit.Sender, circuit.ValueToMint)

	// Verify auditor's encrypted summary includes the mint amount and is encrypted with the auditor's public key
	CheckPCTAuditor(api, babyjub, circuit.Auditor, circuit.ValueToMint)
	return nil
}
