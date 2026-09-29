# Models and hardware

Lumina uses one active Ollama model for chat, Prism, ghost text and the autonomous loop, and a
separate embedding model for workspace search. This page covers how calibration maps your hardware
to a recommended model, how to choose and benchmark a model, and what ghost text and indexing need.

## Hardware tiers

`ModelRecommender` first computes an effective VRAM figure: 75% of total RAM on Apple Silicon,
otherwise the larger of the detected VRAM and 40% of total RAM. It then picks the first tier that matches:

| Tier | Condition |
|---|---|
| Power | effective VRAM of at least 16 GB, or total RAM of at least 32 GB, or Apple Silicon with at least 24 GB |
| Balanced | total RAM of at least 12 GB, or effective VRAM of at least 6 GB, or Apple Silicon with at least 8 GB |
| Low | everything else |

In practice, Apple Silicon reaches the power tier from about 21.3 GB of RAM (75% of that is 16 GB)
and the balanced tier from 8 GB. Other machines need a GPU with 16 GB of VRAM or 32 GB of RAM for the
power tier. VRAM is only detected through `nvidia-smi` (NVIDIA) and `system_profiler` (Intel Macs).
On Windows without `nvidia-smi`, only the GPU name is read through `wmic`; on Linux without it, the
GPU is reported as "Standard Integrated Graphics" with 0 GB.

## Recommended models

| Tier | Recommended model | Fallback | Embedding | Context window |
|---|---|---|---|---|
| Power | `deepseek-coder-v2:latest` | `qwen2.5-coder:14b` | `nomic-embed-text:latest` | 16384 |
| Balanced | `qwen2.5-coder:7b` | `llama3.1:8b` | `nomic-embed-text:latest` | 8192 |
| Low | `qwen2.5-coder:1.5b` | `phi3:mini` | `all-minilm:latest` | 4096 |

Only the recommended model is used: it appears on the Models tab and in the calibration notification,
and it can be selected at startup if it is installed. The fallback, embedding and context window
values are part of the recommendation but are neither shown nor applied. Lumina never sends
`num_ctx`, so the model's context length is whatever Ollama is configured to use. To use
`all-minilm` on a small machine, pull it and set `lumina.embeddingModel` yourself.

## Choosing the active model

The active model is `lumina.selectedModel`. It can be set in four ways:

- the dropdown on the Models tab, which lists installed models with their size in GB;
- **Use <model>** in the notification from **Lumina: Run Hardware Calibration**;
- a pull on the Models tab, which activates the model when the download finishes;
- editing the setting directly.

The first three write the setting to your user settings. When it is empty, Lumina uses the first
installed model Ollama reports. A pull streams progress from `POST /api/pull` with a percentage and
ends with "Model <name> downloaded and activated!". Because a pulled model becomes the chat model,
pull embedding models with `ollama pull` in a terminal instead. There is no separate setting for a
completion model: chat, Prism, ghost text and the loop share the active model.

## Benchmarking a model

Press **Benchmark speed** on the Models tab or run **Lumina: Benchmark Active Model (TPS)**. Both
stream the same fixed prompt, asking for a memoized Fibonacci function in TypeScript, to
`/api/generate` with `temperature: 0.1` and `num_predict: 256`.

- Tokens per second come from Ollama's `eval_count` and `eval_duration` in the final chunk, which exclude model loading and prompt processing. Without them, Lumina estimates from streamed characters (four per token) over the time since the first token.
- Time to first token runs from sending the request to the first streamed text, so it includes loading the model on a cold start. Run the benchmark twice to see it without the load.
- The Models tab shows tokens per second, time to first token and the number of generated tokens. The command shows a notification and adds the figure to the status bar item.
- If the model streams no text, the benchmark fails with "<model> produced no output." rather than reporting a number. There is no timeout.

## Ghost text and fill-in-the-middle

Ghost text sends the text before the cursor as the prompt and the text after it as the `suffix`
field of `/api/generate`, so Ollama applies the model's own fill-in-the-middle template. Code models
whose Ollama template supports this, such as the Qwen2.5-Coder, DeepSeek Coder, CodeLlama and
StarCoder families, complete in place.

- Prompt: up to 60 lines before the cursor. Suffix: up to 20 lines after it.
- Options: `temperature: 0.1`, `num_predict: 64` (at most 64 tokens), stop on three newlines or a code fence.
- If Ollama answers with an error that mentions "does not support insert" or "suffix", the model is marked as lacking FIM support until the window reloads. It then gets a plain "continue this code" prompt with the prefix only.
- Code fences at the start or end of the result are stripped.

Completions are only requested at the end of a line, after `lumina.ghostTextDelay` ms (default 350).
Because ghost text uses the active model, a large chat model makes it slow. A smaller model such as
`qwen2.5-coder:1.5b` answers faster, but it is then used for chat as well.
