package utils

import (
	"fmt"
	"math/big"

	"github.com/iden3/go-iden3-crypto/ff"
	"github.com/iden3/go-iden3-crypto/poseidon"
)

var two128 big.Int

func init() {
	two128.SetString("340282366920938463463374607431768211456", 10)
}

// Implements the encryption and decryption functions using Poseidon hash
// as described: https://drive.google.com/file/d/1EVrP3DzoGbmzkRmYnyEDcIQcXVU7GlOd/view
func PoseidonEncrypt(msg []*big.Int, key []*big.Int, nonce *big.Int) ([]*big.Int, error) {
	if len(key) != 2 {
		return nil, fmt.Errorf("the key must have 2 elements, but got %d", len(key))
	}
	if nonce.Cmp(&two128) >= 0 {
		return nil, fmt.Errorf("the nonce must be less than 2^128, but got %s", nonce.String())
	}

	// the size of the message array must be a multiple of 3
	// pad with 0 if necessary
	length := len(msg)
	if length%3 > 0 {
		length += 3 - (length % 3)
	}
	message := make([]*big.Int, length)
	copy(message, msg)
	for idx := len(msg); idx < length; idx++ {
		message[idx] = big.NewInt(0)
	}

	// Create the initial state
	// S = (0, kS[0], kS[1], N + l * 2^128)
	l := big.NewInt(int64(len(msg)))
	state := []*big.Int{big.NewInt(0), key[0], key[1], new(big.Int).Add(nonce, new(big.Int).Mul(l, &two128))}

	cipherText := make([]*big.Int, length+1)
	var err error

	n := length / 3
	i := 0
	for ; i < n; i++ {
		// Iterate Poseidon on the state
		state, err = poseidon.HashEx(state, 4)
		if err != nil {
			return nil, err
		}

		// Modify the state for the next round
		// state[1] = addMod(message[i * 3], state[1]);
		state[1] = ff.NewElement().Add(ff.NewElement().SetBigInt(message[i*3]), ff.NewElement().SetBigInt(state[1])).ToBigIntRegular(state[1])
		// state[2] = addMod(message[i * 3 + 1], state[2]);
		state[2] = ff.NewElement().Add(ff.NewElement().SetBigInt(message[i*3+1]), ff.NewElement().SetBigInt(state[2])).ToBigIntRegular(state[2])
		// state[3] = addMod(message[i * 3 + 2], state[3]);
		state[3] = ff.NewElement().Add(ff.NewElement().SetBigInt(message[i*3+2]), ff.NewElement().SetBigInt(state[3])).ToBigIntRegular(state[3])

		// Record the three elements of the encrypted message
		cipherText[i*3] = state[1]
		cipherText[i*3+1] = state[2]
		cipherText[i*3+2] = state[3]
	}

	// Iterate Poseidon on the state one last time
	state, err = poseidon.HashEx(state, 4)
	if err != nil {
		return nil, err
	}

	// Record the last ciphertext element
	cipherText[i*3] = state[1]

	return cipherText, nil
}

// the "cipherText" parameter must be the output of the PoseidonEncrypt function, with potentially
// extra elements due to the padding of the plain text messages with 0s to make the length to be 3n.
//
// the "length" parameter must be the length of the original message
func PoseidonDecrypt(cipherText []*big.Int, key []*big.Int, nonce *big.Int, length int) ([]*big.Int, error) {
	if len(key) != 2 {
		return nil, fmt.Errorf("the key must have 2 elements, but got %d", len(key))
	}
	// length of the cipher text must be 3n+1
	if len(cipherText)%3 != 1 {
		return nil, fmt.Errorf("the length of the cipher text must be 3n+1, but got %d", len(cipherText))
	}
	if nonce.Cmp(&two128) >= 0 {
		return nil, fmt.Errorf("the nonce must be less than 2^128, but got %s", nonce.String())
	}
	if length < 1 || length > len(cipherText)-1 {
		return nil, fmt.Errorf("the length must be between 1 and %d (length of cipher text array - 1), but got %d", len(cipherText)-1, length)
	}

	// Create the initial state
	// S = (0, kS[0], kS[1], N + l * 2^128)
	l := big.NewInt(int64(length))
	state := []*big.Int{big.NewInt(0), key[0], key[1], new(big.Int).Add(nonce, new(big.Int).Mul(l, &two128))}

	message := make([]*big.Int, len(cipherText)-1)

	// Decrypt the message
	n := len(cipherText) - 1
	var err error
	i := 0
	for ; i < n/3; i++ {
		// Iterate Poseidon on the state
		state, err = poseidon.HashEx(state, 4)
		if err != nil {
			return nil, err
		}

		// Modify the state for the next round
		// message[1] = subMod(cipherText[i * 3], state[1]);
		message[i*3] = ff.NewElement().Sub(ff.NewElement().SetBigInt(cipherText[i*3]), ff.NewElement().SetBigInt(state[1])).ToBigIntRegular(state[1])
		// state[2] = subMod(cipherText[i * 3 + 1], state[2]);
		message[i*3+1] = ff.NewElement().Sub(ff.NewElement().SetBigInt(cipherText[i*3+1]), ff.NewElement().SetBigInt(state[2])).ToBigIntRegular(state[2])
		// state[3] = subMod(cipherText[i * 3 + 2], state[3]);
		message[i*3+2] = ff.NewElement().Sub(ff.NewElement().SetBigInt(cipherText[i*3+2]), ff.NewElement().SetBigInt(state[3])).ToBigIntRegular(state[3])

		state[1] = cipherText[i*3]
		state[2] = cipherText[i*3+1]
		state[3] = cipherText[i*3+2]
	}

	// If length > 3, check if the last (3 - (l mod 3)) elements of the message are 0
	// this is a safty check because the message would have been padded with 0s
	if length > 3 {
		if length%3 == 2 {
			if message[len(message)-1].Cmp(big.NewInt(0)) != 0 {
				return nil, fmt.Errorf("the last element of the decrypted text must be 0")
			}
		} else if length%3 == 1 {
			if message[len(message)-2].Cmp(big.NewInt(0)) != 0 || message[len(message)-1].Cmp(big.NewInt(0)) != 0 {
				return nil, fmt.Errorf("the last two elements of the decrypted text must be 0")
			}
		}
	}

	// Iterate Poseidon on the state one last time
	state, err = poseidon.HashEx(state, 4)
	if err != nil {
		return nil, err
	}

	// another satety check. The last element of the cipher text
	// must match the 2nd element of the state from the last round
	if state[1].Cmp(cipherText[len(cipherText)-1]) != 0 {
		return nil, fmt.Errorf("the last element of the cipher text does not match the 2nd element of the state from the last round")
	}

	return message[:length], nil
}
