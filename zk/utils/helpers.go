package utils

import (
	"math/big"

	"github.com/iden3/go-iden3-crypto/utils"
)

func NewBigArrayFromStrings(inputs []string) []*big.Int {
	bigInts := make([]*big.Int, len(inputs))
	for i, input := range inputs {
		bigInts[i] = utils.NewIntFromString(input)
	}
	return bigInts
}

func NewStringArrayFromBigInts(inputs []*big.Int) []string {
	strings := make([]string, len(inputs))
	for i, input := range inputs {
		strings[i] = input.String()
	}
	return strings
}

func Mapper[T any](s []T, f func(T, int) T) []T {
	result := make([]T, len(s))
	for i, v := range s {
		result[i] = f(v, i)
	}
	return result
}

func Reduce[T any](s []T, f func(int, T, T) T, initValue T) T {
	acc := initValue
	for i, v := range s {
		acc = f(i, acc, v)
	}
	return acc
}
