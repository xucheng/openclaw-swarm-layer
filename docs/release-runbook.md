# Release Runbook

This runbook covers the full `openclaw-swarm-layer` publication flow for npm, GitHub releases, the ClawHub code plugin, and the ClawHub skill.

## Release Target

- Package: `openclaw-swarm-layer`
- Runtime ID: `openclaw-swarm-layer`
- Skill slug: `swarm-layer`
- Current release line: `0.5.0`

## Preflight

Verify credentials before cutting a release:

```bash
gh auth status
clawhub whoami
npm whoami
```

Expected posture for a publish-capable environment:

- GitHub authenticated with `repo` scope
- ClawHub authenticated as the package and skill owner
- npm authenticated to the target publisher account

## Release Validation

Run the full local release gate:

```bash
npm run release:check
```

That covers:

- `npm run build`
- `npm test`
- `npm pack --dry-run`
- `npm run prepare:clawhub:package`

The ClawHub package staging output is written to:

```text
.clawhub-package/openclaw-swarm-layer/
```

## npm Publish

From the repository root:

```bash
npm publish --access public
```

Post-publish verification:

```bash
npm view openclaw-swarm-layer version
```

## GitHub Release

After the release commit is on the target branch:

```bash
git tag v0.5.0
git push origin v0.5.0
gh release create v0.5.0 --title "v0.5.0" --notes-file /tmp/openclaw-swarm-layer-v0.5.0-notes.md
```

Recommended release notes source:

- copy the `0.5.0` section from [CHANGELOG.md](../CHANGELOG.md)
- keep the title aligned with the tag

## ClawHub Code Plugin Publish

Stage the package first:

```bash
npm run prepare:clawhub:package
```

Publish the staged package:

```bash
clawhub package publish .clawhub-package/openclaw-swarm-layer \
  --family code-plugin \
  --name openclaw-swarm-layer \
  --display-name "OpenClaw Swarm Layer" \
  --version 0.5.0 \
  --source-repo xucheng/openclaw-swarm-layer \
  --source-ref v0.5.0 \
  --source-commit <git-sha> \
  --changelog "M6 Autopilot Control Plane and M7 Subagent Removal."
```

Optional tags to keep aligned with the current listing:

- `latest`
- `swarm`
- `workflow`
- `orchestration`
- `harness`

## ClawHub Skill Publish

Publish the repository skill directly from `skills/swarm-layer`:

```bash
clawhub publish skills/swarm-layer \
  --slug swarm-layer \
  --name "Swarm Layer" \
  --version 0.5.0 \
  --changelog "Refresh skill docs for the autopilot control plane and the manual+ACP runtime surface."
```

Optional tags to keep aligned with the current listing:

- `latest`
- `openclaw`
- `swarm`
- `workflow`
- `orchestration`

## Post-Publish Checks

Verify the published artifacts resolve correctly:

```bash
clawhub package inspect openclaw-swarm-layer
clawhub inspect swarm-layer
openclaw --profile release-smoke plugins install clawhub:openclaw-swarm-layer
openclaw --profile release-smoke skills install swarm-layer
```

If npm was published, also verify:

```bash
npm view openclaw-swarm-layer version
```

## Release Notes Checklist

- package version updated in `package.json`, `package-lock.json`, and `openclaw.plugin.json`
- README install commands reflect current ClawHub and OpenClaw CLI syntax
- changelog entry summarizes milestone scope and verification
- skill description matches the published runtime surface (`manual + acp`, optional autopilot)
- tested-against OpenClaw version is current
