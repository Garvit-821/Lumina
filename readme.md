# 🌌 Lumina: Extension for AI Coding Agents
**Subtitle:** *Illuminating the Path from Idea to Implementation through Local Intelligence.*

---

## 1. Executive Summary
**Lumina** is a professional-grade VS Code extension designed to transform the IDE into an autonomous AI coding environment. Unlike traditional AI assistants that act as simple chat-bots, Lumina functions as an **AI Coding Agent**. It possesses the ability to analyze system hardware, select the optimal local Large Language Model (LLM) via **Ollama**, index entire local codebases for deep context, and execute precise modifications directly within the source files.

Lumina is built on the principle of **Data Sovereignty**: ensuring that professional-grade AI capabilities are available without a single line of code ever leaving the developer's local machine.

---

## 2. Core Value Propositions
*   **Hardware-Aware Intelligence:** Automatically calibrates the AI model to the user's GPU/RAM to prevent system crashes and maximize inference speed.
*   **Agentic Autonomy:** Moves beyond "chatting" to "doing"—reading folders, analyzing project structures, and applying code changes.
*   **Zero-Leak Privacy:** 100% local execution via Ollama, eliminating security risks associated with cloud-based LLMs.
*   **Contextual Fluidity:** Seamlessly blends into the developer's workflow via a non-intrusive, high-end UI.

---

## 3. System Architecture

### 3.1 High-Level Pipeline
`User Request` $\rightarrow$ `Context Engine (RAG)` $\rightarrow$ `Sovereign Orchestrator` $\rightarrow$ `Ollama API` $\rightarrow$ `Local LLM` $\rightarrow$ `Diff Engine` $\rightarrow$ `Editor Modification`.

### 3.2 Component Breakdown
*   **The Calibration Engine:** A system-level utility that queries the OS for VRAM, RAM, and CPU instructions to map the user's hardware to the most efficient model size (e.g., 3B, 7B, 34B parameters).
*   **The Context Engine (RAG):** A Retrieval-Augmented Generation system. It scans the workspace, creates embeddings of the files, and stores them in a local vector database (e.g., LanceDB), allowing the agent to "remember" functions across different files.
*   **The Sovereign Orchestrator:** The central logic hub that manages the conversation history, system prompts, and the routing of requests to the Ollama endpoint.
*   **The Diff Engine:** A specialized module that compares the AI's output with the existing code and generates a VS Code `TextEdit` or a side-by-side comparison view.

---

## 4. Detailed Feature Specification

### 4.1 The "Lumina Calibration" (Hardware Test)
Upon initialization, Lumina performs a **System Telemetry Scan**.
*   **VRAM Detection:** Identifies dedicated GPU memory (NVIDIA CUDA, AMD ROCm, Apple Metal).
*   **Memory Pressure Analysis:** Checks available system RAM.
*   **Recommendation Logic:** 
    *   *Low Profile:* $\rightarrow$ Recommends `Phi-3` or `TinyLlama` (Fast, lightweight).
    *   *Balanced Profile:* $\rightarrow$ Recommends `Llama-3 8B` or `Mistral` (Versatile).
    *   *Power Profile:* $\rightarrow$ Recommends `DeepSeek-Coder-V2` or `CodeQwen` (Complex reasoning).
*   **Performance Benchmarking:** A quick "token-per-second" test to ensure the chosen model runs smoothly.

### 4.2 The Agentic Interface (UI/UX)
Lumina utilizes a **layered UI approach** to minimize cognitive load:
*   **The Aura (Ghost Layer):** Inline, grayed-out code suggestions that appear as the user types. Acceptable via `Tab`.
*   **The Prism (Floating Command Bar):** A sleek, centered modal triggered by `Cmd+K` / `Ctrl+K`. This is used for targeted instructions (e.g., *"Refactor this loop to use a map function"*).
*   **The Nexus (Glassmorphic Sidebar):** A high-transparency sidebar for complex architectural discussions, featuring:
    *   **Context Chips:** Draggable tags representing files or folders that are currently "active" in the AI's memory.
    *   **Model Switcher:** A dynamic dropdown showing the currently active model and its "Health Status" (Resource usage).

### 4.3 Codebase Modification Workflow
1.  **Scanning:** Lumina reads the selected code and relevant context from the vector database.
2.  **Proposal:** The AI generates a solution.
3.  **Visualization:** Instead of overwriting, Lumina opens a **Comparison View**.
4.  **Approval:** The user can:
    *   `Accept All`: Merge all changes.
    *   `Selective Accept`: Click individual lines to merge.
    *   `Reject`: Discard the suggestion.

--- 

## 5. Technical Requirements & Stack

| Layer | Technology | Specification |
| :--- | :--- | :--- |
| **Language** | TypeScript | Strict Typing for stability |
| **Environment** | Node.js / VS Code Extension API | v1.80+ |
| **AI Engine** | Ollama | Local Inference Server |
| **API Protocol** | REST / JSON | `http://localhost:11434` |
| **Vector Store** | LanceDB / ChromaDB | Local file-based vector storage |
| **Styling** | CSS / VS Code Webview UI Toolkit | Glassmorphism / Adaptive Themes |

---

## 6. Development Roadmap

### Phase 1: The Genesis (Foundation)
*   Development of the **Calibration Engine** (Hardware Test).
*   Establishment of the **Ollama API Bridge**.
*   Implementation of the **Prism (Floating Command Bar)**.

### Phase 2: The Expansion (Context)
*   Integration of **Local Embeddings** for folder-level awareness.
*   Development of the **Nexus (Glassmorphic Sidebar)**.
*   Implementation of the **Context Chips** system.

### Phase 3: The Evolution (Agentic Ability)
*   Building the **Diff Engine** for precise code modifications.
*   Implementation of **Ghost Text (Aura)** autocomplete.
*   Adding **Autonomous Loop** (Run tests $\rightarrow$ Analyze Error $\rightarrow$ Propose Fix).

---

## 7. Security, Privacy, and Ethics
*   **Air-Gapped Capability:** Lumina is designed to function without an internet connection once models are downloaded.
*   **No Telemetry:** No usage data, code snippets, or prompt history are transmitted to external servers.
*   **User-Controlled Agency:** The AI cannot modify files on the disk without an explicit user trigger or "Accept" action.

---

## 8. Conclusion
**Lumina** is more than an extension; it is a paradigm shift in how developers interact with AI. By combining hardware-aware optimization, local vector search, and a professional-grade interface, Lumina empowers the developer to maintain absolute control over their intellectual property while leveraging the cutting edge of Generative AI.