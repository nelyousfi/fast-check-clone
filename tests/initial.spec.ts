export const decompPrime = (n: number): number[] => {
    // Quick implementation: the maximal number supported is 2**31-1
    let done = false
    const factors: number[] = []
    while (!done) {
        done = true
        const stop = Math.sqrt(n)
        for (let i = 2; i <= stop; ++i) {
            if (n % i === 0) {
                factors.push(i)
                n = Math.floor(n / i)
                done = false
                break
            }
        }
    }
    return [...factors, n]
}

abstract class Arbitrary<T> {
    abstract generate(): T
}

class ArbitraryNumber extends Arbitrary<number> {
    constructor(readonly max: number) {
        super()
    }

    generate(): number {
        return Math.floor(Math.random() * this.max)
    }
}

class Property<T> {
    constructor(
        readonly arbitrary: Arbitrary<T>,
        readonly predicate: (arbitraryValue: T) => boolean | void
    ) {}

    run(maxRuns: number): RunDetails {
        for (let i = 0; i < maxRuns; ++i) {
            const arbitraryValue = this.arbitrary.generate()
            const result = this.predicate(arbitraryValue)
            if (result === false) {
                return { failed: true }
            }
        }
        return { failed: false }
    }
}

const property = <T>(
    arbitrary: Arbitrary<T>,
    predicate: (arbitraryValue: T) => boolean | void
) => {
    return new Property(arbitrary, predicate)
}

type RunDetails = { failed: boolean }

const check = <T>(
    property: Property<T>,
    { maxRuns }: Parameters
): RunDetails => {
    return property.run(maxRuns)
}

interface Parameters {
    readonly maxRuns: number
}

const assert = <T>(property: Property<T>, params: Parameters) => {
    const out = check(property, params)
    if (out.failed) {
        throw new Error('Failed!')
    }
}

function nat(max: number): Arbitrary<number> {
    return new ArbitraryNumber(max)
}

describe('decampPrime', () => {
    it('should produce an array such that the product equals the input', () => {
        assert(
            property(nat(1000), (n) => {
                console.log({ n })
                const factors = decompPrime(n)
                const productOfFactors = factors.reduce((a, b) => a * b, 1)
                return productOfFactors === n
            }),
            {
                maxRuns: 10,
            }
        )
    })

    // it('should be able to decompose a product of two numbers', () => {
    //     assert(
    //         property(
    //             {
    //                 a: 4,
    //                 b: 5,
    //             },
    //             ({ a, b }) => {
    //                 const n = a * b
    //                 const factors = decompPrime(n)
    //                 return factors.length >= 2
    //             }
    //         )
    //     )
    // })
    //
    // it('should compute the same factors as to the concatenation of the one of a and b for a times b', () => {
    //     assert(
    //         property(
    //             {
    //                 a: 4,
    //                 b: 5,
    //             },
    //             ({ a, b }) => {
    //                 const factorsA = decompPrime(a)
    //                 const factorsB = decompPrime(b)
    //                 const factorsAB = decompPrime(a * b)
    //                 const reorder = (arr: number[]) =>
    //                     [...arr].sort((a, b) => a - b)
    //                 expect(reorder(factorsAB)).toEqual(
    //                     reorder([...factorsA, ...factorsB])
    //                 )
    //             }
    //         )
    //     )
    // })
})
