# Autonomous test and fix loop

The loop runs a test or build command and, when it fails, asks the active model for a corrected
version of a file named in the failure output, writes that file and runs the command again. It
changes files on disk without asking for approval, so only use it on code under version control.
The implementation is in `src/orchestrator/autonomousLoop.ts`.

## What the loop does

- Runs your command through a shell, in the first workspace folder.
- Treats exit code 0 as success and anything else as failure.
- On failure, picks one source file and sends the model the command, the last 2,000 characters of output and the full content of that file.
- Expects the whole corrected file back in a single code block, applies it to the file and saves it.
- Repeats for at most 3 iterations.

Each iteration changes at most one file. The loop does not create files and runs no command other
than the one you give it.

## Starting a run

Start a run in one of two ways:

- On the Nexus **Loop** tab, enter a command under **Test command** (an empty field means `npm test`) and press **Start**.
- Run **Lumina: Start Autonomous Test & Fix Loop** and enter a command in the input box, which is prefilled with `npm test`.

A folder must be open and a model must be active, and the command must exit non-zero when tests fail,
as `npm test`, `pytest`, `cargo test` and `tsc` do. Only one run can be active: starting another while
one is running is silently ignored. Progress is shown only on the Loop tab, so open it before
starting from the Command Palette.

## Step by step

Each iteration adds one entry to the Loop tab timeline, which is updated in place as it moves through
these steps:

1. **run_test**: runs the command. Exit code 0 ends the run with "All tests passed cleanly on iteration N!".
2. **diagnose**: the command failed. The entry shows the last 600 characters of output, and the model is asked for a fix through `/api/generate` with temperature 0.1.
3. **propose_fix**: the reply's first code block, or the whole reply, becomes a proposal for the chosen file. A reply shorter than 20 characters ends the run.
4. The diff view opens, and the proposal is applied at once through the same code path as **Accept all**, which saves the file.
5. **verify**: "Applied patch to <file>. Re-running verification...", and the next iteration starts.

When the run ends, a toast in the panel shows the summary.

## How the file to fix is chosen

`findCandidateFiles` (`src/orchestrator/traceParser.ts`) looks for paths in the output that end in
one of these extensions: `ts`, `tsx`, `js`, `jsx`, `mjs`, `cjs`, `py`, `go`, `rs`, `java`, `kt`, `c`,
`cc`, `cpp`, `h`, `hpp`, `cs`, `rb`, `php`, `swift`. It drops paths inside `node_modules`, `dist`,
`out`, `build`, `.git`, `site-packages` or `target`, and Node internals (`node:` and `internal/`).
Paths mentioned more often rank first; ties keep the order in which they first appeared.

The loop tries the first 10 candidates, resolved against the workspace folder, and uses the first
one that exists inside the workspace. If none does, it falls back to the file in the active editor,
then to the first open document that is not untitled. With no file at all, the run stops. Because the
most-mentioned file wins, the file it edits may be a test file rather than the code under test.

## Stopping a run

**Stop** on the Loop tab ends the run: it aborts a pending model request, sends a kill signal to the
shell process running the command, and reports "Loop stopped." Patches already applied stay applied.

The Stop button is only enabled after you press **Start** on the Loop tab. A run started from the
Command Palette leaves it disabled, and there is no stop command. To stop such a run, press **Start**
on the Loop tab, which clears the timeline and is ignored because a run is active but enables the
button, then press **Stop**. Reloading the window also ends the loop.
