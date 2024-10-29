package utils

import (
	// "ac-jpm-client/helpers"
	"errors"
	"math/big"

	"github.com/iden3/go-iden3-crypto/babyjub"
	"github.com/iden3/go-iden3-crypto/ff"
	"github.com/iden3/go-iden3-crypto/utils"
)

var (
	TWO_128 = utils.NewIntFromString("340282366920938463463374607431768211456")
)

type Poseidon struct{}

func (p *Poseidon) Encrypt(
	publicKey []*big.Int,
	inputs []*big.Int,
	nonce *big.Int,
	encryptionRandom *big.Int,
) ([]*big.Int, []*big.Int, error) {
	if len(publicKey) != 2 {
		return nil, nil, errors.New("publicKey must be 2 elements")
	}
	pubKey := babyjub.NewPoint()
	pubKey.X = publicKey[0]
	pubKey.Y = publicKey[1]

	poseidonAuthKey := babyjub.NewPoint().Mul(encryptionRandom, babyjub.B8)
	encryptionKey := babyjub.NewPoint().Mul(encryptionRandom, pubKey)

	sharedKey := []*ff.Element{
		ff.NewElement().SetBigInt(encryptionKey.X),
		ff.NewElement().SetBigInt(encryptionKey.Y),
	}

	if nonce.Cmp(TWO_128) == 1 {
		return nil, nil, errors.New("nonce must be less than 2^128")
	}

	msg := utils.BigIntArrayToElementArray(inputs)
	for len(msg)%3 != 0 {
		msg = append(msg, ff.NewElement().SetZero())
	}

	state := []*ff.Element{
		ff.NewElement().SetZero(),
		sharedKey[0],
		sharedKey[1],
		ff.NewElement().Add(
			ff.NewElement().SetBigInt(nonce),
			ff.NewElement().Mul(
				ff.NewElement().SetUint64(uint64(len(inputs))),
				ff.NewElement().SetBigInt(TWO_128),
			),
		),
	}
	cipherText := []*ff.Element{}

	length := len(msg)

	for i := 0; i < length/3; i++ {
		state = p.poseidonStrategy(state)

		state[1] = ff.NewElement().Add(state[1], msg[i*3])
		state[2] = ff.NewElement().Add(state[2], msg[i*3+1])
		state[3] = ff.NewElement().Add(state[3], msg[i*3+2])

		cipherText = append(cipherText, state[1])
		cipherText = append(cipherText, state[2])
		cipherText = append(cipherText, state[3])
	}

	state = p.poseidonStrategy(state)
	cipherText = append(cipherText, state[1])

	return utils.ElementArrayToBigIntArray(cipherText), []*big.Int{
		poseidonAuthKey.X,
		poseidonAuthKey.Y,
	}, nil
}

func (p *Poseidon) Decrypt(
	key []*big.Int,
	cipherText []*big.Int,
	secretKey *big.Int,
	nonce *big.Int,
	length int,
) ([]*big.Int, error) {

	if len(key) != 2 {
		return nil, errors.New("authKey must be 2 elements")
	}

	authKey := babyjub.NewPoint()
	authKey.X = key[0]
	authKey.Y = key[1]

	sharedKey := babyjub.NewPoint().Mul(secretKey, authKey)

	if nonce.Cmp(TWO_128) == 1 {
		return nil, errors.New("nonce must be less than 2^128")
	}

	ct := utils.BigIntArrayToElementArray(cipherText)
	msg := []*ff.Element{}

	state := []*ff.Element{
		ff.NewElement().SetZero(),
		ff.NewElement().SetBigInt(sharedKey.X),
		ff.NewElement().SetBigInt(sharedKey.Y),
		ff.NewElement().Add(
			ff.NewElement().SetBigInt(nonce),
			ff.NewElement().Mul(
				ff.NewElement().SetUint64(uint64(length)),
				ff.NewElement().SetBigInt(TWO_128),
			),
		),
	}

	n := len(cipherText) / 3

	for i := 0; i < n; i++ {
		state = p.poseidonStrategy(state)

		msg = append(msg, ff.NewElement().Sub(ct[i*3], state[1]))
		msg = append(msg, ff.NewElement().Sub(ct[i*3+1], state[2]))
		msg = append(msg, ff.NewElement().Sub(ct[i*3+2], state[3]))

		state[1] = ct[i*3]
		state[2] = ct[i*3+1]
		state[3] = ct[i*3+2]
	}

	state = p.poseidonStrategy(state)

	if state[1].Cmp(ct[len(ct)-1]) != 0 {
		return nil, errors.New("decryption failed")
	}

	resultInBig := utils.ElementArrayToBigIntArray(msg)

	return resultInBig[:length], nil
}

func (p *Poseidon) poseidonStrategy(state []*ff.Element) []*ff.Element {
	N_ROUNDS_P := []int{56, 57, 56, 60, 60, 63, 64, 63}
	N_ROUNDS_F := 8

	t := len(state)
	nRoundsF := N_ROUNDS_F
	nRoundsP := N_ROUNDS_P[t-2]

	for r := 0; r < nRoundsF+nRoundsP; r++ {
		state = Mapper(state, func(a *ff.Element, i int) *ff.Element {
			return ff.NewElement().Add(a, ff.NewElement().SetBigInt(utils.NewIntFromString(C()[t-2][r*t+i])))
		})

		if r < nRoundsF/2 || r >= nRoundsF/2+nRoundsP {
			state = Mapper(state, func(a *ff.Element, i int) *ff.Element {
				return ff.NewElement().Exp(*a, big.NewInt(5))
			})
		} else {
			state[0] = ff.NewElement().Exp(*state[0], big.NewInt(5))
		}

		state = Mapper(state, func(b *ff.Element, i int) *ff.Element {
			acc := Reduce(state, func(j int, acc, a *ff.Element) *ff.Element {
				return ff.NewElement().Add(acc, ff.NewElement().Mul(ff.NewElement().SetBigInt(utils.NewIntFromString(M()[t-2][i][j])), a))
			}, ff.NewElement().SetUint64(0))
			return acc
		})
	}

	return state
}
