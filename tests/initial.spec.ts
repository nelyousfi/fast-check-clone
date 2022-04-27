const sum = (a: number, b: number): number => {
    if (a > 0 && b > 0) {
        return a + b
    }
    return -1
}

const assert = <T>(property: T, predicate: (args: T) => boolean) => {
    const run1 = predicate(property)
    const out = {
        failed: !run1,
    }
    if (out.failed) {
        throw new Error('Failed!')
    }
}

describe('initial', () => {
    it('should sum two numbers', () => {
        assert(
            {
                a: 1,
                b: 2,
            },
            ({ a, b }) => {
                const received = sum(a, b)
                const expected = a + b
                return received === expected
            }
        )
    })
})
