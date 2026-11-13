# Changelog

All notable changes to VOLQ AI are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-13

### Initial Open-Source Release

#### Added
- **Dual Database Architecture**: Complete support for embedded SQLite (with WAL mode via `better-sqlite3`) and PostgreSQL with `pgvector` via Kysely query builder.
- **Cinematic Onboarding**: Full-screen welcome screen with mountain landscape backdrop, responsive layout, and first-run admin bootstrap flow.
- **Multi-Provider LLM Relay**: Connect Ollama, vLLM, OpenAI, and any OpenAI-compatible inference servers with real-time SSE streaming.
- **Multi-Model Comparison**: Side-by-side prompt benchmarking and simultaneous generation across multiple models.
- **Voice & Vision Features**:
  - Direct camera capture modal with front/rear camera toggling.
  - Speech-to-Text (STT) powered by browser Web Speech API.
  - Text-to-Speech (TTS) assistant read-aloud controls.
- **Custom Skills & System Prompts**: User-created and admin-managed skills injected into model context dynamically.
- **OAuth Multi-Provider Sign-In**: Built-in support for Google, Discord, GitHub, Microsoft, GitLab, LinkedIn, and standard OpenID Connect (OIDC).
- **Knowledge Base (RAG)**: Document parsing (PDF, Word, Text, Markdown), chunking, semantic embedding generation, and vector retrieval.
- **Usage Limits & Quotas**: Admin-configurable daily message and token limits with per-user overrides.
- **Themes & UI Polish**: Obsidian, AMOLED pure black, and Frost light themes with smooth glassmorphism.
- **Security Hardening**: Argon2id password hashing, CSRF double-submit token protection, IDOR barrier enforcement, constant-time secret comparison, and SSRF loopback filtering.
