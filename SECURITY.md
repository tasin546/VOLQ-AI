# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in VOLQ AI, please report it responsibly. **Do NOT open a public GitHub issue.**

Please report security issues through one of the following channels:
1. **GitHub Security Advisory**: Submit a private advisory via the "Security" tab of this repository.
2. **Security Contact**: Email `fahimtasin226@gmail.com` with the subject line `[SECURITY] VOLQ AI Vulnerability Report`.

### What to Include
- Detailed description of the vulnerability and its potential impact.
- Step-by-step reproduction instructions or a minimal proof-of-concept.
- Any proposed remediation or patches if available.

### Response Time & Disclosure
- You will receive an initial response acknowledging your report within 48 hours.
- We will work diligently to validate, patch, and release a security update.
- Please allow a coordinated disclosure period before public discussion.

## Production Security Best Practices

When deploying VOLQ AI in production:
1. **Always use HTTPS**: When running behind a reverse proxy (Caddy, Nginx, Cloudflare), ensure `COOKIE_SECURE=true` and `APP_ORIGIN=https://your-domain.com`.
2. **Generate Strong Secrets**: Use `npm run setup:env` to generate cryptographically random 32-byte strings for `SESSION_SECRET` and `ENCRYPTION_KEY`.
3. **Database Access**: When using PostgreSQL with Docker Compose, keep the database within an internal Docker network; do not publish port 5432 to the public internet.
4. **Local Network / SSRF Protection**: VOLQ AI strictly validates connection URLs. Keep local LLM runtimes (such as Ollama or LocalAI) bound only to internal or private loopback addresses.
