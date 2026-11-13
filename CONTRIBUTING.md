# Contributing to VOLQ AI

Thank you for your interest in contributing to VOLQ AI! We welcome contributions from the community.

## Development Setup

### Prerequisites
- **Node.js**: `>= 20.0.0`
- **npm**: `>= 9.0.0`
- **Optional**: Docker & Docker Compose (for PostgreSQL/pgvector testing)

### Monorepo Structure
- `apps/server`: Fastify REST API, Kysely dual-database driver (SQLite + PostgreSQL), Argon2id auth, SSE streaming relay, RAG pipeline.
- `apps/web`: React 18 frontend with Vite, Tailwind CSS v4, Framer Motion, and Radix UI primitives.

### Getting Started

1. **Clone the repository**:
   ```bash
   git clone https://github.com/REPLACE_ME/volq-ai.git
   cd volq-ai
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Initialize environment**:
   ```bash
   npm run setup:env
   ```
   This generates a secure `.env` file with random session and encryption secrets.

4. **Start the development servers**:
   ```bash
   npm run dev
   ```
   The web UI will be accessible at `http://localhost:3000` and the API at `http://localhost:3001`.

## Quality Checks & Testing

Before submitting a pull request, ensure all quality gates pass:

```bash
# 1. Typecheck both workspaces
npm run typecheck

# 2. Lint check
npm run lint

# 3. Run automated tests
npm run test

# 4. Verify production build
npm run build
```

## Pull Request Guidelines

1. **Focused PRs**: Keep changes scoped to a single feature, bugfix, or improvement.
2. **Dual Database Awareness**: If adding or altering database queries, ensure compatibility with both SQLite and PostgreSQL.
3. **No Sensitive Data**: Never commit personal credentials, session tokens, or local database files.
4. **Clean Code**: Follow established patterns: strict TypeScript, minimal dependencies, and purposeful styling.
