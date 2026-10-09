# Reviewing diffs

Chat and Prism do not write model output to a file on their own. A reply becomes a proposal, you
see it as a diff, and it is applied only when you accept it. The **Insert** button on a chat code
block is a direct edit that you trigger yourself, and the autonomous loop applies its own proposals
without asking. The code is in `src/diff/`.
