# Workspace search and context

Lumina adds workspace code to prompts in two ways: retrieval from an index of the workspace, and
context chips that attach whole files to chat. This page explains how the index is built and
searched, where it is stored, and how chips behave. The code is in `src/rag/`.
