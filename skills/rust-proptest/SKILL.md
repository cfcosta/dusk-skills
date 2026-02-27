---
name: rust-proptest
description: Teaches the LLM how to do property tests correctly in rust
---

## 0. Purpose

This skill teaches an LLM how to design and implement **high-leverage, reproducible, shrink-friendly property-based tests (PBT)** in Rust using:

- `proptest` for strategies, shrinking, runner configuration.
- `test-strategy` for ergonomic `#[derive(Arbitrary)]` and `#[proptest]` tests.

The goal is not to generate “random tests”, but to encode **executable specifications** using:

- Differential testing (SUT vs reference)
- Model-based testing (stateful APIs)
- Metamorphic relations
- Algebraic laws
- Round-trip invariants
- Feature-aware coverage patterns

This document is repo-ready and intended to be versioned.

---

# 1. Non-Negotiable Quality Bar

A good PBT suite MUST:

1. Encode real behavioral laws — not tautologies.
2. Use an oracle (reference, model, metamorphic relation) whenever possible.
3. Generate valid inputs by construction (avoid rejection storms).
4. Shrink to human-interpretable counterexamples.
5. Be reproducible (persist failures).
6. Be deterministic in generation and test body.

---

# 2. Required Output Structure (When the LLM Generates Tests)

Whenever generating property tests, the LLM MUST output:

1. **Property Inventory**
   - Name
   - Oracle style
   - Why it matters

2. **Strategy Plan**
   - Input structure
   - How it avoids rejection
   - Shrink intent

3. **Rust Code**
   - Proper `#[cfg(test)]` or integration tests
   - `#[derive(Arbitrary)]` where useful
   - `#[proptest]` with reasonable `cases`
   - Comments explaining invariants

4. **CI Configuration Guidance**
   - Recommended `PROPTEST_*` env settings

---

# 3. Decision Tree: Choosing the Right Property Type

Use this order of preference:

### 1️⃣ Differential Testing (Highest Leverage)
Compare:
- Optimized vs naive implementation
- Your parser vs known correct parser
- Your data structure vs `Vec`, `BTreeMap`, etc.

This catches real bugs quickly.

---

### 2️⃣ Model-Based Testing (Stateful APIs)

If the API mutates state:
- Generate sequences of operations
- Execute both SUT and simple model
- Compare state after each step

---

### 3️⃣ Round-Trip Properties

Examples:
- `decode(encode(x)) == x`
- `parse(print(x))` idempotence

---

### 4️⃣ Metamorphic Testing

When no oracle exists:
- Define transformation `t(x)`
- Assert relationship between `f(x)` and `f(t(x))`

---

### 5️⃣ Algebraic Laws

Use when mathematically meaningful:
- Commutativity
- Associativity
- Idempotence
- Identity laws

Avoid inventing meaningless algebra.

---

# 4. Strategy Design Rules

## 4.1 Generate Valid Inputs by Construction

❌ Bad:

- Generate arbitrary input
- Reject unless valid

✅ Good:

- Encode invariants in the generator

Example:

```rust
fn sorted_unique_vec() -> impl Strategy<Value = Vec<u32>> {
    prop::collection::btree_set(any::<u32>(), 0..64)
        .prop_map(|set| set.into_iter().collect())
}
```

Shrinking preserves validity.

---

## 4.2 Avoid Rejection Storms

If you use:

- `#[filter]`
- `prop_filter`
- `prop_assume`

…then you must justify it.

If rejection count grows, redesign the generator.

---

## 4.3 Shrink Toward Semantic Simplicity

Shrinking should produce:

- Smaller inputs
- Simpler structures
- Fewer operations
- Lower numeric magnitudes

Design strategies so “smaller” = “easier to understand”.

---

## 4.4 Prefer Reusable Strategy Functions

Do not embed complex generators inline repeatedly.

Instead:

```rust
fn small_vec_u8() -> impl Strategy<Value = Vec<u8>> {
    prop::collection::vec(any::<u8>(), 0..64)
}
```

Reuse across tests.

---

# 5. `test-strategy` Usage Rules

## 5.1 Deriving Arbitrary

```rust
use test_strategy::Arbitrary;

#[derive(Arbitrary, Debug)]
struct Input {
    #[strategy(0u32..=10_000)]
    n: u32,

    #[strategy(prop::collection::vec(any::<u8>(), 0..128))]
    bytes: Vec<u8>,
}
```

---

## 5.2 Dependent Fields

```rust
#[derive(Arbitrary, Debug)]
struct RangeInput {
    lo: u32,

    #[strategy(#lo..=#lo + 100)]
    hi: u32,
}
```

Use `#field` references.

---

## 5.3 Weighting Variants

```rust
#[derive(Arbitrary)]
enum Mode {
    #[weight(5)]
    Fast,

    #[weight(1)]
    Slow,
}
```

---

## 5.4 Avoid Heavy Filtering

Only use:

```rust
#[filter(condition)]
```

If no structural alternative exists.

---

## 5.5 Async Tests

```rust
#[proptest(async = "tokio")]
async fn prop_async(...) {
    ...
}
```

---

# 6. Runner Configuration & CI Policy

## 6.1 Default Local Run

```bash
PROPTEST_CASES=256 cargo test
```

---

## 6.2 Extended Nightly

```bash
PROPTEST_CASES=5000 \
PROPTEST_MAX_SHRINK_TIME=30000 \
cargo test
```

---

## 6.3 Important Environment Variables

- `PROPTEST_CASES`
- `PROPTEST_MAX_LOCAL_REJECTS`
- `PROPTEST_MAX_GLOBAL_REJECTS`
- `PROPTEST_MAX_SHRINK_ITERS`
- `PROPTEST_MAX_SHRINK_TIME`
- `PROPTEST_MAX_DEFAULT_SIZE_RANGE`
- `PROPTEST_RNG_SEED`
- `PROPTEST_FORK`
- `PROPTEST_TIMEOUT`
- `PROPTEST_VERBOSE`

Failure persistence directory (`proptest-regressions/`) MUST be committed.

---

# 7. Model-Based Stateful Testing Pattern

```rust
#[derive(Clone, Debug)]
enum Op {
    Push(u8),
    Pop,
}

fn op_strategy() -> impl Strategy<Value = Vec<Op>> {
    prop::collection::vec(
        prop_oneof![
            any::<u8>().prop_map(Op::Push),
            Just(Op::Pop),
        ],
        0..64,
    )
}
```

Test pattern:

1. Create model (`Vec`)
2. Create SUT
3. Apply operations to both
4. Compare after each step

---

# 8. Feature-Aware Coverage Pattern

When inputs have discrete features:

Generate:

```rust
#[derive(Arbitrary, Debug, Clone, Copy, Hash, Eq, PartialEq)]
enum Mode { A, B, C }
```

Track coverage:

```rust
let mut seen = HashSet::new();
...
seen.insert((mode, flag));
prop_assert!(seen.len() >= MIN_EXPECTED);
```

Use in extended runs only.

---

# 9. Anti-Patterns

1. Tautological properties
2. Checking trivial invariants only
3. Massive rejection
4. Non-deterministic test body
5. Shrink producing invalid structures
6. Only testing “does not panic”

---

# 10. Golden Template: Differential Property

```rust
#[cfg(test)]
mod tests {
    use proptest::prelude::*;
    use test_strategy::{proptest, Arbitrary};

    #[derive(Arbitrary, Debug)]
    struct Input {
        #[strategy(0u32..=10_000)]
        n: u32,

        #[strategy(prop::collection::vec(any::<u8>(), 0..128))]
        bytes: Vec<u8>,
    }

    fn reference(n: u32, bytes: &[u8]) -> u32 {
        n.wrapping_add(bytes.iter().map(|&b| b as u32).sum::<u32>())
    }

    fn sut(n: u32, bytes: &[u8]) -> u32 {
        reference(n, bytes)
    }

    #[proptest(cases = 1000)]
    fn prop_matches_reference(i: Input) {
        prop_assert_eq!(sut(i.n, &i.bytes), reference(i.n, &i.bytes));
    }
}
```

---

# 11. Golden Template: Round-Trip Property

```rust
#[proptest]
fn prop_round_trip(data: Vec<u8>) {
    let encoded = encode(&data);
    let decoded = decode(&encoded).unwrap();
    prop_assert_eq!(decoded, data);
}
```

---

# 12. Golden Template: Algebraic Law

```rust
#[proptest]
fn prop_add_commutative(a: i32, b: i32) {
    prop_assert_eq!(a + b, b + a);
}
```

Only use when meaningful.

---

# 13. Engineering Checklist Before Merging

- [ ] Do properties encode real behavior?
- [ ] Are inputs valid by construction?
- [ ] Is rejection minimal?
- [ ] Does shrinking produce understandable counterexamples?
- [ ] Are regression files committed?
- [ ] Is CI configured with reasonable case counts?
- [ ] Is test body deterministic?

---

# 14. Philosophy

Property testing is not about randomness.

It is about:

- Encoding specifications
- Exploring structured input spaces
- Producing minimal, actionable counterexamples
- Catching bugs that example tests miss

Design properties like you design APIs:
- Carefully
- Explicitly
- With invariants first

---

# 15. Versioning

This skill assumes:

- `proptest` 1.x
- `test-strategy` 0.4.x

Revisit on major version changes.
