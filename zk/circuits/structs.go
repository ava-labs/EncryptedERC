package circuits

import (
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/std/algebra/native/twistededwards"
)

type Sender struct {
	PrivateKey  frontend.Variable
	PublicKey   PublicKey
	Balance     frontend.Variable
	BalanceEGCT ElGamalCiphertext
	ValueEGCT   ElGamalCiphertext
}

type Receiver struct {
	PublicKey   PublicKey
	ValueEGCT   ElGamalCiphertext
	ValueRandom Randomness
	PCT         PoseidonCiphertext
}

type RegistrationSender struct {
	PrivateKey frontend.Variable
	PublicKey  PublicKey
}

type Auditor struct {
	PublicKey PublicKey
	PCT       PoseidonCiphertext
}

type Randomness struct {
	R frontend.Variable
}

type PublicKey struct {
	P twistededwards.Point `gnark:",public"`
}

type PoseidonCiphertext struct {
	Ciphertext [4]frontend.Variable `gnark:",public"`
	AuthKey    twistededwards.Point `gnark:",public"`
	Nonce      frontend.Variable    `gnark:",public"`
	Random     frontend.Variable
}

type ElGamalCiphertext struct {
	C1 twistededwards.Point `gnark:",public"`
	C2 twistededwards.Point `gnark:",public"`
}
