package circuits

import (
	"github.com/ava-labs/EncryptedERC/pkg/babyjub"
	tedwards "github.com/consensys/gnark-crypto/ecc/twistededwards"
	"github.com/consensys/gnark/frontend"
)

type TransferCircuit struct {
	Sender          Sender
	Receiver        Receiver
	Auditor         Auditor
	ValueToTransfer frontend.Variable
}

func (circuit *TransferCircuit) Define(api frontend.API) error {
	// Initialize babyjub wrapper
	babyjub := babyjub.NewBjWrapper(api, tedwards.BN254)

	// Verify the transfer amount is less than or equal to the sender's balance
	api.AssertIsLessOrEqual(circuit.ValueToTransfer, circuit.Sender.Balance)

	// Verify sender's public key is well-formed
	CheckPublicKey(api, babyjub, circuit.Sender)

	// Verify sender's encrypted balance is well-formed
	CheckBalance(api, babyjub, circuit.Sender)

	// Verify sender's encrypted value is the transfer amount
	CheckPositiveValue(api, babyjub, circuit.Sender, circuit.ValueToTransfer)

	// Verify receiver's encrypted value is the transfer amount
	CheckValue(api, babyjub, circuit.Receiver, circuit.ValueToTransfer)

	// Verify receiver's encrypted summary includes the transfer amount and is encrypted with the receiver's public key
	CheckPCTReceiver(api, babyjub, circuit.Receiver, circuit.ValueToTransfer)

	// Verify auditor's encrypted summary includes the transfer amount and is encrypted with the auditor's public key
	CheckPCTAuditor(api, babyjub, circuit.Auditor, circuit.ValueToTransfer)

	return nil
}
