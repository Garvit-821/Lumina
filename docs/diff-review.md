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
