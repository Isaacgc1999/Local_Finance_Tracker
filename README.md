# Fintrack

A desktop personal finance application for a single user. **Local and offline**: no accounts, no cloud, no telemetry. Data is stored in a SQLite file on your computer. The only network request the app can make is to Ollama at `localhost:11434` for the weekly report.

* Shell: [Tauri v2](https://v2.tauri.app) (system webview, binary only a few MB)
* UI: Angular 21 LTS, standalone, zoneless, signals
* Data: SQLite via `@tauri-apps/plugin-sql`
* Charts: ECharts (direct import, `echarts/core`)
* Design: custom. Inspired by fintech applications such as Trade Republic and Revolut

# ⚽ Playground (run without installing anything)
[https://stackblitz.com/~/github.com/Isaacgc1999/local_fincance_tracker](https://stackblitz.com/~/github.com/Isaacgc1999/Local_Finance_Tracker)

# Installation
## Requirements

| Tool                                                                                                                          | Version                | Purpose                     |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------- |
| Node.js                                                                                                                       | 22 or higher           | Angular build and Tauri CLI |
| npm                                                                                                                           | 10                     | dependencies                |
| Rust (rustup)                                                                                                                 | stable, 1.77 or higher | compile the Tauri shell     |
| Windows: Visual Studio Build Tools with "Desktop development with C++" and WebView2 (included with Windows 11)                |                        | MSVC linker                 |
| macOS: Xcode Command Line Tools (`xcode-select --install`)                                                                    |                        |                             |
| Linux: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` |                        |                             |
| Ollama (optional)                                                                                                             | recent                 | AI reports                  |

Rust installation: https://rustup.rs. Full Tauri prerequisites guide: https://v2.tauri.app/start/prerequisites/.

## Development

```bash
npm install
npm run dev        # tauri dev: starts ng serve on :4200 and opens the native window
```

If `npm run dev` returns `failed to run 'cargo metadata' … program not found`, Rust is missing:

install it from https://rustup.rs, **open a new terminal** (the installer adds `~/.cargo/bin` to the PATH), and run `cargo --version` to verify it.

The first compilation takes several minutes; subsequent ones are immediate.

### Browser-only mode

The web portion can also be run in a browser (**demo mode**: SQLite runs through WebAssembly, in memory; nothing is persisted after a reload). This is useful for reviewing the screens without Rust:

```bash
npm start          # http://localhost:4200
```

**There is no sample data in either mode.** Both the demo and the installed application start empty: only the default categories and settings exist, with no transactions or budgets, so everything displayed by the dashboard, analytics, and AI comes from what each user records.

In **Accounts**, users can create accounts (bank, cash, card, savings) with their opening balance, view today's balances, record transfers between them (which do not count as income or expenses), and reconcile each account against the balance shown on their bank statement.

Everything goes to **Main account** by default, which always exists: existing transactions were moved to it during the update, and the form selects it first. Statements imported by each user remain on their computer, just like the rest of the data.

**Category rules** ("if the description contains *mercadona*, the category is Food") can be created in Settings or from the transaction list. Using "Select", multiple transactions can be selected; "Change category" recategorizes them all at once; and the "Remember as rule" checkbox saves the common text for future transactions.

Rules are applied when importing a statement (the preview shows the category that each row will receive) and are suggested when entering the description of a new transaction. Without a rule, the form suggests the category that was last used for the same description.

"Apply to uncategorized transactions" applies the rules to transactions that have no category or are in "Other", without changing categories that were manually selected.

In **Settings**, users can configure budgets (total, fixed, variable, leisure, subscriptions, or per-category spending limits, as well as savings and investment goals) and the display currency (euro or dollar; amounts are not converted, only the symbol changes).

The **Budgets** card in Analytics shows how far each budget has progressed.

### Tests

Two approaches: components and utilities in jsdom; repositories against real SQLite in Node.

```bash
npm test           # Angular + Vitest (jsdom)
npm run test:node  # repositories and migrations using node:sqlite
npm run test:all
```

### Demo build

Test the real browser build in demo mode, without Rust:

```bash
npm run build:demo
npm run serve:demo   # http://localhost:4300
```

### Analytics benchmark

Benchmark analytics with 10,000 transactions (target: less than 16 ms per recalculation):

```bash
npm run bench
```

### Screenshots

Take a screenshot using a real viewport (useful for comparing against the handoff at 390 / 768 / 1440):

```bash
node tools/screenshot.mjs http://localhost:4200/events/new screenshot.png 390 900
```

Several clicks can be chained before taking the screenshot by separating them with `;;` (for example, opening the calculator and switching to the Financial tab).

### End-to-end tests

End-to-end tests against the demo build (real Chrome, without Rust or Ollama):

```bash
node tools/export-e2e.mjs      # downloads and validates the three export formats
node tools/accounts-e2e.mjs    # accounts, transfer, account expense and reconciliation
node tools/fake-ollama.mjs 11434 ok   # fake Ollama server, in another terminal
node tools/ai-e2e.mjs report.png     # records a transaction and generates the weekly report
node tools/calc-e2e.mjs calc.png      # Ctrl+K, handoff operation and "Use X in new event"
node tools/settings-e2e.mjs settings.png # categories, income, budget and date format
```

If port 11434 is already occupied by a real Ollama instance, start the fake server on another port and pass it to the test: the test changes the port from Settings before generating the report.

```bash
node tools/fake-ollama.mjs 11435 ok
node tools/ai-e2e.mjs report.png http://localhost:4300 http://127.0.0.1:11435
```

## Keyboard shortcuts

| Shortcut           | Action                                                                    |
| ------------------ | ------------------------------------------------------------------------- |
| `Ctrl/Cmd + K`     | Opens and closes the calculator over the current screen without losing it |
| `Esc`              | Closes the calculator, modals and dropdowns                               |
| `Ctrl/Cmd + Enter` | Saves the event form                                                      |

With the calculator open and focus outside a text field, the physical keyboard can be used to enter digits, `, . + - * /`, `Enter` (=), `Backspace`, and `Delete` (C).

## Building the executable

```bash
npm run build:desktop
```

Installers are generated in `src-tauri/target/release/bundle/`:

| OS      | Output                                                                      |
| ------- | --------------------------------------------------------------------------- |
| Windows | `nsis/Fintrack_0.1.0_x64-setup.exe` and `msi/Fintrack_0.1.0_x64_en-US.msi`  |
| macOS   | `dmg/Fintrack_0.1.0_aarch64.dmg` (or `x64`) and `macos/Fintrack.app`        |
| Linux   | `appimage/fintrack_0.1.0_amd64.AppImage` and `deb/fintrack_0.1.0_amd64.deb` |

Each system builds its own installer (there is no cross-compilation).

If Fintrack was already installed, close the application and run the new installer over the existing installation: it replaces the executable while preserving your `fintrack.db`.

To inspect the real application window from the inside (console errors, CSP, styles, Ollama connection, and screenshots of each screen), there is an inspection variant that is never distributed.

It uses its own identifier, so it does not touch your data or conflict with the installed application if it is open:

```bash
npx tauri build --no-bundle --config src-tauri/tauri.inspect.conf.json
node tools/tauri-inspect.mjs src-tauri/target/release/fintrack.exe screenshots dashboard,events,analytics,ai,settings
npm run build:desktop   # restores the distribution executable
```

## Data file location

`fintrack.db` is created in the application's data directory:

| OS      | Path                                                         |
| ------- | ------------------------------------------------------------ |
| Windows | `%APPDATA%\com.fintrack.app\fintrack.db`                     |
| macOS   | `~/Library/Application Support/com.fintrack.app/fintrack.db` |
| Linux   | `~/.local/share/com.fintrack.app/fintrack.db`                |

The data file location can be changed from Settings, where backups can also be created and restored. The file is a standard SQLite database and can be opened with any client.

## Backups and data file

Everything is managed from **Settings → Data file**, and all three operations require the Tauri window (`npm run dev` or the installed application). They are disabled in browser demo mode.

| Action                | What it does                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Create backup**     | Writes a consistent copy using `VACUUM INTO` without closing the database. The file is compacted and the WAL is already integrated.                                                       |
| **Restore from file** | Validates the selected file (integrity, Fintrack tables and schema version) and only then replaces your data. A backup from an older version is accepted: migrations bring it up to date. |
| **Change**            | Moves the data file to another folder and points the application there. The previous file is kept just in case.                                                                           |

The backup is a standard SQLite database: it can be opened with any client, stored in the cloud of your choice, or restored on another computer.

## Ollama (weekly AI report)

1. Install Ollama from https://ollama.com/download.

2. Download the default model:

   ```bash
   ollama pull llama3.1:8b
   ```

3. Start the service (`ollama serve`, or the Ollama desktop application) and verify that it responds at `http://127.0.0.1:11434`.

4. In Fintrack, go to Settings → Ollama → "Test connection". The model and endpoint are configurable.

To test the AI screen without installing Ollama, there is a server that mimics its API:

```bash
node tools/fake-ollama.mjs 11434 ok        # ok | invalid | nomodel | error500 | timeout
```

### How long does it take?

The report is generated on your computer, so the time depends on your hardware. Measured on CPU, without a graphics card:

| Model                   | Prompt processing | Generation | Total            |
| ----------------------- | ----------------- | ---------- | ---------------- |
| `llama3.1:8b` (default) | 22 s              | 84 s       | about 1 min 45 s |
| `llama3.2:3b`           | 20 s              | 46 s       | about 1 min 10 s |

The model is preloaded when opening the AI screen and remains in memory for 30 minutes, so the report does not pay the initial loading cost.

Most of the time is spent generating the response, which depends on the CPU. With a GPU it is much faster, and the 3B model is the faster option on a machine without a GPU.

To use it, download it with:

```bash
ollama pull llama3.2:3b
```

Then select it under Settings → Ollama.

### Other models

Settings → Ollama lists everything you have downloaded, so you can use whichever model you want.

Keep in mind how much memory some of the latest Meta models require: Llama 4 Scout (`llama4:scout`) uses 67 GB, Llama 3.3 only exists in 70B (26 to 43 GB), and Muse Glimmer 30B (`muse-glimmer`) uses 18 GB.

The model must fit entirely in RAM or GPU memory. With 16 GB, the latest Llama models that work are `llama3.1:8b` and `llama3.2:3b` (ADR-080).

Fintrack does not interrupt generation while the model is writing. It only cancels if the model remains silent for 30 seconds halfway through, takes more than 3 minutes to start, or exceeds 8 minutes overall.

To benchmark your own machine:

```bash
FT_AI_BENCH=1 npx vitest run --config vitest.node.config.ts scripts/ai-bench.spec.ts
FT_AI_BENCH=1 FT_AI_MODEL=llama3.2:3b npx vitest run --config vitest.node.config.ts scripts/ai-bench.spec.ts
```

Fintrack never sends raw transactions. It builds a compact weekly summary (totals by category, comparison with the previous 4 weeks, active subscriptions, savings rate, and deviations), and only that summary is sent to the model, which runs on your machine.

## What has been verified and what has not

### Verified

* Production build completes without warnings and both test suites pass.
* The four end-to-end tests in `tools/` run successfully against the build served in a real Chrome browser: export in all three formats, calculator, settings, and AI report.
* **AI report against real Ollama** using Llama 3.1 8B: the week is summarized, the model responds, the JSON validates, and the screen displays a coherent verdict, findings, recommendations, and potential savings.
* **`npm run build:desktop` on Windows** with Rust 1.98.1: compiles without warnings and produces `fintrack.exe` (8.6 MB), the MSI (4.8 MB), and the NSIS installer (3.9 MB).
* **Executable startup**: opens the window and creates `%APPDATA%\com.fintrack.app\fintrack.db` in WAL mode, with six tables, schema version 2, the 10 seed categories, 7 settings, and zero transactions.

### Not yet verified

These require manual interaction with the application window:

* the native save dialog when exporting;
* the three operations under **Settings → Data file** (backup, restore and changing the location), although their SQL layer is covered using real SQLite in `src/app/data/db/backup.node.spec.ts`;
* transaction attachments, which are written to disk;
* macOS and Linux installers, which each system must build independently.

## Technical decisions

The decisions for each phase are documented in [`docs/decisiones.md`](docs/decisiones.md), and the complete plan is in [`docs/FASE-0.md`](docs/FASE-0.md).

**Forms: Typed Reactive Forms instead of Signal Forms.** In Angular 21.2, the `@angular/forms/signals` package is still marked as experimental.

Following the project rule ("if Signal Forms are stable, use them; otherwise, use typed Reactive Forms"), the project uses typed `FormGroup`/`FormControl`, with their value exposed as a signal using `toSignal(form.valueChanges)` so that all derived state continues to use `computed()`.

## Structure

```text
src/app/core       types (Money, IsoDate, Result), es-ES formatting, errors
src/app/data       SQLite: initialization, migrations, repositories
src/app/domain     pure services (recurrences, analytics, AI, export)
src/app/infra      Tauri adapters (Ollama, files, breakpoints)
src/app/facades    signal-based state consumed by screens
src/app/layout     Shell, Sidebar, TabBar, FAB, PageHeader
src/app/shared     handoff components, [chart] directive, pipes
src/app/features   dashboard, events, analytics, ai, calculator, settings
src/styles         handoff design tokens as custom properties
src-tauri          desktop shell (Rust)
design             design handoff
```
