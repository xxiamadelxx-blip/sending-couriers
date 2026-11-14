# Code quality tools

The official Crapper, Dryer and Mutator repositories are pinned here as Git
submodules. Initialize them after cloning with:

```sh
git submodule update --init --recursive
sh tools/quality/bootstrap.sh
```

Python 3.11+ and pip access to PyPI are required. The bootstrap pins
`tree-sitter-language-pack` to 0.13.0 because that wheel bundles grammars;
newer releases fetch grammars from GitHub Releases, which is blocked in some
execution environments. A small `sitecustomize.py` adapter supplies the
newer `download()` call as a no-op for those already bundled grammars.

Run commands from the project root:

```sh
tools/quality/crapper/crapper --no-coverage web/core.mjs android/src/ru/courier/finance/NativeCountModel.java
tools/quality/dryer/dryer android/src/ru/courier/finance
tools/quality/mutator/mutator --scan web/core.mjs android/src/ru/courier/finance/NativeCountModel.java
```

Crapper analyzes Java and JavaScript, including `.mjs`. Dryer supports Java
and TypeScript but does not list plain JavaScript. Mutator supports Java and
JavaScript. Use Mutator's `--scan` before running selected mutations; a full
mutation run executes the test command for each covered mutation site.

### Mutation gate

- The mutation-score gate targets the pure financial formula `calculateScenario` in `web/core.mjs`; source line numbers are resolved dynamically by `mutation_lines.py` so refactoring above the function does not stale the gate.
- The dedicated `tests/forecast-finance-mutation.test.mjs` suite checks ceiling targets, exact hourly base, premium eligibility, zero and fractional hours, unknown inputs, and forecast aggregation.
- The predeclared minimum kill score is **85%** for mutations inside `calculateScenario`. The larger `forecastFinances` aggregator remains covered by integration assertions and the full mutation-site scan; it is not included in this narrow score gate.
