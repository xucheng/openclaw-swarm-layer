# Contributing

Thanks for your interest in contributing to openclaw-swarm-layer.

## Development Setup

```bash
git clone https://github.com/xucheng/openclaw-swarm-layer.git
cd openclaw-swarm-layer
npm install
npm run build
npm test
```

**Prerequisites:** Node.js >= 22, OpenClaw >= 2026.2.24

## Code Standards

- TypeScript with strict mode
- ESM modules — all local imports use `.js` extensions
- No `any` types unless absolutely necessary
- Vitest for testing with `globals: true` (no need to import `describe`/`it`/`expect`)

## Testing

All changes must pass the full test suite:

```bash
npm test          # unit + e2e
npm run test:unit # unit only
npm run test:e2e  # e2e only
```

Add tests for new features. Follow existing patterns in `test/unit/` and `test/e2e/`.

## Pull Requests

1. Fork the repo and create a feature branch
2. Make your changes with tests
3. Run `npm run build && npm test` to verify
4. Submit a PR with a clear description of what changed and why

## Reporting Issues

Open an issue at https://github.com/xucheng/openclaw-swarm-layer/issues with:

- Steps to reproduce
- Expected vs actual behavior
- OpenClaw version (`openclaw --version`)
- Node.js version (`node --version`)
- Output of `openclaw swarm doctor --json` if relevant
