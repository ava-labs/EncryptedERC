package babyjub

import (
	"math/big"

	tedwards "github.com/consensys/gnark-crypto/ecc/twistededwards"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/std/algebra/native/twistededwards"
)

type BjWrapper struct {
	Curve twistededwards.Curve
	api   frontend.API
	base8 twistededwards.Point
}

// creates new wrapper for babyjub curve operations
func NewBjWrapper(api frontend.API, curveId tedwards.ID) *BjWrapper {
	curve, err := twistededwards.NewEdCurve(api, curveId)
	if err != nil {
		panic(err)
	}

	// Set the order of the babyjub curve
	order, _ := big.NewInt(0).SetString("21888242871839275222246405745257275088548364400416034343698204186575808495617", 10)

	// Set the x and y coordinates for the base point (base8) of the babyjub curve
	baseX, _ := big.NewInt(0).SetString("5299619240641551281634865583518297030282874472190772894086521144482721001553", 10)
	baseY, _ := big.NewInt(0).SetString("16950150798460657717958625567821834550301663161624707787222815936182638968203", 10)

	// Set the curve parameters for the babyjub curve being used
	curve.Params().A = big.NewInt(168700)
	curve.Params().D = big.NewInt(168696)
	curve.Params().Cofactor = big.NewInt(8)
	curve.Params().Order = order
	curve.Params().Base = [2]*big.Int{baseX, baseY}

	return &BjWrapper{
		Curve: curve,
		api:   api,
		base8: twistededwards.Point{X: frontend.Variable(baseX), Y: frontend.Variable(baseY)},
	}
}

// multiplies the base point with provided scalar value using scalar multiplication
// same operation as generating public key from secret key
func (bj *BjWrapper) MulWithBasePoint(s frontend.Variable) twistededwards.Point {
	var p twistededwards.Point
	points := bj.Curve.Params().Base
	p.X = points[0]
	p.Y = points[1]

	res := bj.Curve.ScalarMul(p, s)

	return res
}

// asserts that two points are equal and also in the curve
func (bj *BjWrapper) AssertPoint(p1 twistededwards.Point, x, y frontend.Variable) {
	bj.Curve.AssertIsOnCurve(p1)

	p2 := twistededwards.Point{X: x, Y: y}
	bj.Curve.AssertIsOnCurve(p2)

	bj.api.AssertIsEqual(p1.X, p2.X)
	bj.api.AssertIsEqual(p1.Y, p2.Y)
}

// multiplies the provided point with a scalar value
func (bj *BjWrapper) MulWithScalar(x, y, s frontend.Variable) twistededwards.Point {
	r := bj.Curve.ScalarMul(
		twistededwards.Point{X: x, Y: y},
		s,
	)
	bj.Curve.AssertIsOnCurve(r)
	return r
}

// el gamal decryption on the babyjub curve
func (bj *BjWrapper) ElGamalDecrypt(c1, c2 [2]frontend.Variable, secretKey frontend.Variable) twistededwards.Point {
	var c1x, c1xInverse, decrypted, c2Point twistededwards.Point

	c1x.X = c1[0]
	c1x.Y = c1[1]

	c2Point.X = c2[0]
	c2Point.Y = c2[1]

	c1x = bj.Curve.ScalarMul(c1x, secretKey)
	c1xInverse = bj.Curve.Neg(c1x)
	decrypted = bj.Curve.Add(c1xInverse, c2Point)

	bj.Curve.AssertIsOnCurve(c1x)
	bj.Curve.AssertIsOnCurve(decrypted)
	bj.Curve.AssertIsOnCurve(c1xInverse)

	return decrypted
}

// function encrypts message with El-Gamal encryption scheme
func (bj *BjWrapper) ElGamalEncrypt(publicKey, msg twistededwards.Point, random frontend.Variable) (c1 twistededwards.Point, c2 twistededwards.Point) {
	var tc2 twistededwards.Point

	c1 = bj.Curve.ScalarMul(bj.base8, random)
	tc2 = bj.Curve.ScalarMul(publicKey, random)
	c2 = bj.Curve.Add(tc2, msg)

	bj.Curve.AssertIsOnCurve(tc2)

	return c1, c2
}
