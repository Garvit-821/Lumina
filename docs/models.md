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
