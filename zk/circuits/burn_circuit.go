package circuits

import (
	"github.com/ava-labs/ac-etracrypto/crypto/babyjub"
	tedwards "github.com/consensys/gnark-crypto/ecc/twistededwards"
	"github.com/consensys/gnark/frontend"
)

type BurnCircuit struct {
	Sender      Sender
	Auditor     Auditor
	ValueToBurn frontend.Variable
}

func (circuit *BurnCircuit) Define(api frontend.API) error {
	// Initialize babyjub wrapper
	babyjub := babyjub.NewBjWrapper(api, tedwards.BN254)

	// Verify the transfer amount is less than or equal to the sender's balance
	api.AssertIsLessOrEqual(circuit.ValueToBurn, circuit.Sender.Balance)

	// Verify sender's public key is well-formed
	CheckPublicKey(api, babyjub, circuit.Sender)

	// Verify sender's encrypted balance is well-formed
	CheckBalance(api, babyjub, circuit.Sender)

	// Verify sender's encrypted value is the negated burn amount
	CheckPositiveValue(api, babyjub, circuit.Sender, circuit.ValueToBurn)

	// Verify auditor's encrypted summary includes the burn amount and is encrypted with the auditor's public key
	CheckPCTAuditor(api, babyjub, circuit.Auditor, circuit.ValueToBurn)
	return nil
}
