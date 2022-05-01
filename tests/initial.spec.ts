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

const MAX_INPUT = 65536

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

    map<U>(mapper: (t: T) => U): NextArbitrary<U> {
        return new MapArbitrary(this, mapper)
    }
}

class MapArbitrary<T, U> extends NextArbitrary<U> {
    constructor(readonly arb: NextArbitrary<T>, readonly mapper: (t: T) => U) {
        super()
    }

    generate(random: Random): NextValue<U> {
        const g = this.arb.generate(random)
        return this.valueMapper(g)
    }

    private valueMapper(v: NextValue<T>): NextValue<U> {
        const value = this.mapper(v.value)
        return new NextValue(value)
    }
}

class IntegerArbitrary extends NextArbitrary<number> {
    constructor(private readonly min: number, private readonly max: number) {
        super()
    }

    generate(random: Random): NextValue<number> {
        return new NextValue(random.nextInt(this.min, this.max))
    }
}

type ArbsArray<T extends unknown[]> = { [K in keyof T]: NextArbitrary<T[K]> }

class TupleArbitrary<T extends unknown[]> extends NextArbitrary<T> {
    constructor(readonly arbs: ArbsArray<T>) {
        super()
    }

    generate(random: Random): NextValue<T> {
        const vs = [] as unknown as T & unknown[]
        for (const arb of this.arbs) {
            vs.push(arb.generate(random).value)
        }
        return new NextValue(vs)
    }
}

function nat(max: number) {
    return new IntegerArbitrary(0, max)
}

function integer(min: number, max: number) {
    return new IntegerArbitrary(min, max)
}

function char() {
    return new IntegerArbitrary(0x20, 0x7e).map((n) => String.fromCharCode(n))
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
        return out == null || out === true
            ? null
            : 'Property failed by returning false'
    }
}

interface Parameters {
    numRuns?: number
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
    constructor(
        readonly initialValues: IterableIterator<() => T>,
        private maxInitialIterations: number
    ) {}

    [Symbol.iterator](): IterableIterator<T> {
        return this
    }

    next(): IteratorResult<T> {
        if (--this.maxInitialIterations !== -1) {
            const n = this.initialValues.next()
            if (!n.done) {
                return { done: false, value: n.value() }
            }
        }
        return { done: true, value: undefined }
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

    constructor(readonly sourceValues: SourceValuesIterator<NextValue<T>>) {
        this.runExecution = new RunExecution()
    }

    [Symbol.iterator](): IterableIterator<T> {
        return this
    }

    next(): IteratorResult<T> {
        const nextValue = this.sourceValues.next()
        const something = nextValue.value
        if (nextValue.done) {
            return { done: true, value: undefined }
        }
        return { done: false, value: nextValue.value.value }
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
    // RunnerIterator will just generate the next value from the SourceValuesIterator
    const runner = new RunnerIterator(sourceValues)
    for (const v of runner) {
        const out = property.run(v) as string | null
        runner.handleResult(out)
    }
    return runner.runExecution
}

function check<T>(property: INextProperty<T>, params: Parameters) {
    // calls `generate` on the property by passing the random generator.
    // this `generate` property will also call generate on the arbitrary by passing the same random generator.
    // this will return a generated NextValue depending on the type of the arbitrary
    const generator = toss(
        property,
        Date.now() ^ (Math.random() * 0x100000000),
        xorshift128plus
    )
    const initialValues = buildInitialValues(generator)
    // this SourceValuesIterator is controlling when to stop the generation of values
    const sourceValues = new SourceValuesIterator(
        initialValues,
        params.numRuns || 100
    )
    return runIt(property, sourceValues).toRunDetails()
}

function property<T0>(
    arb0: NextArbitrary<T0>,
    predicate: (t0: T0) => void | boolean
): INextProperty<[T0]>

function property<T0, T1>(
    arb0: NextArbitrary<T0>,
    arb1: NextArbitrary<T1>,
    predicate: (t0: T0, t1: T1) => void | boolean
): INextProperty<[T0, T1]>

function property<T>(...args: any): any {
    const arbs = args.slice(0, args.length - 1)
    const p = args[args.length - 1]
    const tuple = new TupleArbitrary(arbs)
    return new Property(tuple, (t) => p(...t))
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
                numRuns: 10,
            }
        )
    })

    it('should be able to decompose a product of two numbers', () => {
        assert(
            property(integer(2, MAX_INPUT), integer(2, MAX_INPUT), (a, b) => {
                console.log({ a, b })
                const n = a * b
                const factors = decompPrime(n)
                return factors.length >= 2
            }),
            {
                numRuns: 4,
            }
        )
    })

    it('should return one single char', () => {
        assert(
            property(char(), (s) => {
                console.log(s)
                return typeof s === 'string'
            }),
            {
                numRuns: 4,
            }
        )
    })
})
