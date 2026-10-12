# Autonomous test and fix loop

The loop runs a test or build command and, when it fails, asks the active model for a corrected
version of a file named in the failure output, writes that file and runs the command again. It
changes files on disk without asking for approval, so only use it on code under version control.
The implementation is in `src/orchestrator/autonomousLoop.ts`.
