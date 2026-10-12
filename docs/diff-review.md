# Reviewing diffs

Chat and Prism do not write model output to a file on their own. A reply becomes a proposal, you
see it as a diff, and it is applied only when you accept it. The **Insert** button on a chat code
block is a direct edit that you trigger yourself, and the autonomous loop applies its own proposals
without asking. The code is in `src/diff/`.

## Where suggestions come from

| Source | Proposed text | Review controls |
|---|---|---|
| Chat | The reply's first fenced code block, put in place of the selection, or replacing the whole file when it looks like a full rewrite | **Accept all**, **Review diff** and **Reject** under the reply |
| Prism | The reply's first code block, or the whole reply if it has no fences, put in place of the selection or the whole file | The diff view opens by itself; **Accept All Changes** and **Reject** in a notification |
| Autonomous loop | The model's corrected version of the whole file | None: the diff opens and the change is applied at once |

Each proposal stores the full original text and the full proposed text of one file, plus the hunks
between them. Proposals live in memory and are lost when the window reloads.

## How hunks are computed

`DiffEngine.computeHunks` compares the two texts line by line:

1. Lines that match at the start and at the end of both texts are set aside.
2. The remaining middle parts are diffed with a longest-common-subsequence table, which gives a minimal set of changed lines.
3. If the table would exceed 4,000,000 cells (old lines plus one, times new lines plus one), the whole middle becomes one replacement hunk instead.
4. Each run of consecutive changed lines becomes one hunk, numbered from 1, with old and new start lines and line counts.

A pure insertion has an old line count of 0, and its old start line points at the line it goes
before. A pure deletion has a new line count of 0. Hunks carry no unchanged context lines.

## The comparison view

**Review diff** in chat, and Prism automatically, open VS Code's diff editor with the file on the
left and the proposal on the right, titled "Lumina AI Proposal" followed by the file name. The right
side is a read-only virtual document under the `lumina-diff` scheme, so the proposal cannot be
edited there.

- The left side is the file as it is now, including unsaved edits, not the snapshot the proposal was computed from.
- The diff opens as a preview tab and takes focus.
- Closing the diff neither accepts nor rejects the proposal; the chat buttons stay available.

## Reviewing and applying

- **Accept all** (chat) and **Accept All Changes** (Prism) replace the whole file content with the proposed text and save the file, then show "Lumina: All changes applied to <file>".
- **Reject** marks the proposal as rejected and shows "Lumina: Diff suggestion discarded." The file is not changed.
- In chat, the proposal box then shows "Applied" or "Rejected" and disables its buttons except **Review diff**.
- A proposal that is applied or rejected cannot be accepted again.
- The extension can also accept a single hunk (`accept_diff` with a `hunkIndex`), which applies that hunk, shifts later hunks and marks the proposal "Partially applied". The current panel has no per-hunk button.
- **Insert** on a code block is not part of this flow: it puts the block into the active editor at the cursor or over the selection, with no diff and no save.

An applied proposal is a normal workspace edit, so it can usually be reverted with Undo in that
file's editor, followed by a save.

## When the file changed in the meantime

Each proposal keeps the text it was computed from: for Prism, the file when you picked the action;
for chat, the file when the reply finished. Before applying a pending proposal, Lumina compares the
current document, including unsaved edits, with that snapshot. If they differ, a modal warning says
"<file> has changed since Lumina proposed this edit. Applying it will overwrite your newer changes."

- **Apply anyway** writes the full proposed text, discarding every change made after the snapshot.
- Cancelling leaves the file alone and the proposal pending. Ask again to get a proposal based on the current text.

The check only runs while the proposal is pending. Once a single hunk has been accepted (status
"partial"), later accepts skip it.

## When chat does not offer a diff

Chat only attaches a proposal when it can place the code safely. No proposal appears when:

- no editor was active when you sent the message, or it showed an untitled document;
- that document was closed before the reply finished;
- the reply has no fenced code block, or its first block is shorter than 10 characters after trimming;
- nothing was selected and the block does not look like the whole file;
- the result would be identical to the current file.

Without a selection, a block counts as the whole file when the file is empty or has 5 lines or fewer,
or when the block has at least 60% as many lines as the file and contains at least a quarter of the
file's non-trivial lines (trimmed lines longer than 3 characters). To get a proposal, select the code
to change before sending, ask for the complete file, or use Prism. Only the first code block is used.
