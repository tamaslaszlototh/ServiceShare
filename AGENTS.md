# AGENTS.md

## Repo layout

- Workspace root (`.../Devs/ServiceShare`) **is** the repository. `origin` = `https://github.com/tamaslaszlototh/ServiceShare.git`; default branch `main`. Run `git` from here.

## Current state

- Fresh scaffold: the only tracked source file is `README.md` (contents: `# ServiceShare`).
- No source code, package manifest, build/test/lint config, or CI exists yet.

## Once tooling is added

- Record the exact build/test/lint commands and any required setup here; nothing exists to document today.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (use the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
