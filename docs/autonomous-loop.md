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
