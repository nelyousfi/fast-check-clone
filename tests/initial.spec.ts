import {
    RandomGenerator,
    unsafeUniformIntDistribution,
    xorshift128plus,
} from 'pure-rand'

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

class Random {
    private readonly internalRandomGenerator: RandomGenerator

    constructor(randomGenerator: RandomGenerator) {
        this.internalRandomGenerator = randomGenerator
    }

    nextInt(min: number, max: number): number {
        return unsafeUniformIntDistribution(
            min,
            max,
            this.internalRandomGenerator
        )
    }
}

class NextValue<T> {
    readonly value: T

    constructor(value: T) {
        this.value = value
    }
}

abstract class NextArbitrary<T> {
    abstract generate(random: Random): NextValue<T>
}

class IntegerArbitrary extends NextArbitrary<number> {
    constructor(private readonly min: number, private readonly max: number) {
        super()
    }

    generate(random: Random): NextValue<number> {
        return new NextValue(random.nextInt(this.min, this.max))
    }
}

function nat(arg: number) {
    return new IntegerArbitrary(0, arg)
}

interface INextProperty<T> {
    generate(random: Random): NextValue<T>

    run(v: T): Error | string | null
}

class Property<T> implements INextProperty<T> {
    constructor(
        readonly arbitrary: NextArbitrary<T>,
        readonly predicate: (v: T) => void | boolean
    ) {}

    generate(random: Random): NextValue<T> {
        return this.arbitrary.generate(random)
    }

    run(v: T): string | null {
        const out = this.predicate(v)
        // TODO: add PreconditionFailure
        return out == null || out ? null : 'Property failed by returning false'
    }
}

function property<T>(
    arbitrary: NextArbitrary<T>,
    predicate: (x: T) => void | boolean
) {
    return new Property(arbitrary, (t) => predicate(t))
}

interface Parameters {
    maxRuns?: number
}

interface RunDetails {
    failed: boolean
}

function reportRunDetails(out: RunDetails) {
    if (!out.failed) return
    throw new Error('Property failed')
}

function* toss<T>(
    property: INextProperty<T>,
    seed: number,
    random: (seed: number) => RandomGenerator
) {
    const randomGenerator = random(seed)
    while (true) {
        yield () => property.generate(new Random(randomGenerator))
    }
}

class Stream<T> {
    constructor(private readonly g: IterableIterator<T>) {}

    [Symbol.iterator](): IterableIterator<T> {
        return this.g
    }

    next(): IteratorResult<T> {
        return this.g.next()
    }
}

function stream<T>(g: IterableIterator<T>) {
    return new Stream(g)
}

function buildInitialValues<T>(
    valueProducers: IterableIterator<() => NextValue<T>>
) {
    return stream(valueProducers)
}

class SourceValuesIterator<T> implements IterableIterator<T> {
    constructor(readonly initialValues: IterableIterator<() => T>) {}

    [Symbol.iterator](): IterableIterator<T> {
        return this
    }

    next(): IteratorResult<T> {
        const n = this.initialValues.next()
        return n.done
            ? { done: true, value: undefined }
            : { done: false, value: n.value() }
    }
}

class RunExecution<T> {
    private failed: boolean = false

    fail() {
        this.failed = true
    }

    toRunDetails(): RunDetails {
        return { failed: this.failed }
    }
}

class RunnerIterator<T> implements IterableIterator<T> {
    runExecution: RunExecution<T>

    constructor(readonly sourceValues: SourceValuesIterator<T>) {
        this.runExecution = new RunExecution()
    }

    [Symbol.iterator](): IterableIterator<T> {
        return this
    }

    next(): IteratorResult<T> {
        const nextValue = this.sourceValues.next()
        return nextValue.done
            ? { done: true, value: undefined }
            : { done: false, value: nextValue.value }
    }

    handleResult(result: string | null) {
        if (result != null) {
            this.runExecution.fail()
        }
    }
}

function runIt<T>(
    property: INextProperty<T>,
    sourceValues: SourceValuesIterator<NextValue<T>>
) {
    const runner = new RunnerIterator(sourceValues)
    for (const v of runner) {
        const out = property.run(v)
        runner.handleResult(out)
    }
    return runner.runExecution
}

function check<T>(property: INextProperty<T>, params: Parameters) {
    const generator = toss(
        property,
        Date.now() ^ (Math.random() * 0x100000000),
        xorshift128plus
    )
    const initialValues = buildInitialValues(generator)
    const sourceValues = new SourceValuesIterator(initialValues)
    return runIt(property, sourceValues).toRunDetails()
}

function assert<T>(property: INextProperty<T>, params: Parameters) {
    const out = check(property, params)
    reportRunDetails(out)
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
