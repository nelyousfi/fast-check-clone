const arePositive = (a: number, b: number): boolean => {
    return a > 0 && b > 0
}

const assert = <T>(out: { failed: boolean }) => {
    if (out.failed) {
        throw new Error('Failed!')
    }
}

const property = <T>(
    arbitrary: T,
    predicate: (arbitraryValue: T) => boolean
) => {
    return {
        failed: !predicate(arbitrary),
    }
}

describe('initial', () => {
    it('should returns true', () => {
        assert(
            property(
                {
                    a: 1,
                    b: 2,
                },
                ({ a, b }) => {
                    return arePositive(a, b)
                }
            )
        )
    })

    it('should returns false', () => {
        assert(
            property(
                {
                    a: 1,
                    b: -2,
                },
                ({ a, b }) => {
                    return !arePositive(a, b)
                }
            )
        )
    })
})
