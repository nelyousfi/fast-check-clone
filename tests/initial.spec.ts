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

const assert = <T>(out: { failed: boolean }) => {
    if (out.failed) {
        throw new Error('Failed!')
    }
}

const property = <T>(
    arbitrary: T,
    predicate: (arbitraryValue: T) => boolean | void
) => {
    const out = predicate(arbitrary)
    return {
        failed: out === false,
    }
}

describe('decompPrime', () => {
    it('should produce an array such that the product equals the input', () => {
        assert(
            property(1, (n) => {
                const factors = decompPrime(n)
                const productOfFactors = factors.reduce((a, b) => a * b, 1)
                return productOfFactors === n
            })
        )
    })

    it('should be able to decompose a product of two numbers', () => {
        assert(
            property(
                {
                    a: 4,
                    b: 5,
                },
                ({ a, b }) => {
                    const n = a * b
                    const factors = decompPrime(n)
                    return factors.length >= 2
                }
            )
        )
    })

    it('should compute the same factors as to the concatenation of the one of a and b for a times b', () => {
        assert(
            property(
                {
                    a: 4,
                    b: 5,
                },
                ({ a, b }) => {
                    const factorsA = decompPrime(a)
                    const factorsB = decompPrime(b)
                    const factorsAB = decompPrime(a * b)
                    const reorder = (arr: number[]) =>
                        [...arr].sort((a, b) => a - b)
                    expect(reorder(factorsAB)).toEqual(
                        reorder([...factorsA, ...factorsB])
                    )
                }
            )
        )
    })
})
