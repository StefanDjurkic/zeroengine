# Compiled demos — proving the JSPP pipeline

Everything in this folder shows the **actual** JSPP pipeline in action:

```
JSPP source (.jspp)  ->  jspp compiler (C++20)  ->  generated.cpp  ->  g++/clang  ->  native binary  ->  stdout
```

Each subfolder contains the three artifacts you need to verify the pipeline yourself:

| File           | What it is                                                       |
|----------------|------------------------------------------------------------------|
| `source.jspp`  | The original JSPP program (copied from the jspp repo).           |
| `generated.cpp`| The C++20 source emitted by the JSPP compiler for that program.  |
| `expected.txt` | The exact stdout of the compiled native binary.                  |

`generated.cpp` is committed so you can read it without building anything. CI re-runs the full pipeline on every push and fails if any of the three files drift.

## Reproduce one yourself

From the root of the [jspp repo](https://github.com/StefanDjurkic/jspp), after building the compiler:

```bash
# 1. JSPP -> C++
./build/jspp examples/fibonacci.jspp -o /tmp/fib.cpp

# 2. C++ -> native binary
g++ -std=c++20 -O2 /tmp/fib.cpp -o /tmp/fib

# 3. Run it
/tmp/fib
# Recursive fib(10): 55
# Iterative fib(10): 55
```

That is the whole pipeline. Nothing is simulated.

## The demos

| Demo                               | What it shows                                                                 |
|------------------------------------|-------------------------------------------------------------------------------|
| [`hello/`](./hello/)               | Shortest possible JSPP program. `function main(): int { console.log("Hello, World!"); return 0; }` round-trips through the compiler and runs.                                              |
| [`fibonacci/`](./fibonacci/)       | Two implementations (recursive and iterative) of Fibonacci with typed parameters and return types. Exercises: `int` types, `for` loops, recursion.                                        |
| [`classes/`](./classes/)           | Class declarations with typed fields, constructors, methods, `extends` inheritance, and `super(...)` calls. Instances allocated with `new`, methods called through `this`.                |
| [`demo/`](./demo/)                 | Grab-bag: arrays, strings, higher-order functions, closures, generics-ish helpers. A longer program that exercises many features at once.                                                 |

## Relationship to the browser playground

The [browser playground](https://stefandjurkic.github.io/zeroengine/jspp.html) is a **different** thing: it runs JSPP source through a JavaScript *reference interpreter* (`prototype/jspp.mjs`) so you can try the language without a toolchain. The interpreter and the compiler implement the same language spec — this folder is how we prove the compiler half also works.

## Not yet

- No WASM build. Compiling `generated.cpp` with Emscripten to run in the browser is the next step; until then, "JSPP runs natively" is proven but "JSPP runs in the engine's WASM client" is not.
- No ZeroEngine integration. Eventually the Rust client will embed either a JSPP VM or link compiled JSPP for gameplay scripting. Today that bridge does not exist; this folder is the foundation for it.
