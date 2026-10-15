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
