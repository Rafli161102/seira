# Seira Branching Strategy

## Permanent branches

| Branch | Purpose | Incoming work |
|---|---|---|
| `main` | Published/release baseline | Reviewed release promotion from `develop` |
| `develop` | Compiler and language integration | `feature/*`, `fix/*`, `docs/*` pull requests |
| `dev-infra` | CI, automation, developer tooling infrastructure | `infra/*` and infrastructure maintenance pull requests |

## Temporary branch naming

- `feature/pX.YY-short-description` for language/compiler milestones.
- `fix/short-description` for defects.
- `docs/short-description` for documentation-only work.
- `infra/short-description` for infrastructure changes based on `dev-infra`.

Temporary branches are automatically deleted by the Branch Governance workflow after a verified merge. For older merged branches, maintainers can dispatch the same workflow manually; it checks that the branch head is an ancestor of its permitted target before deleting it. A merged branch must not be reused for unrelated work.

## Promotion rules

1. Develop and validate compiler changes on a temporary branch based on current `develop`.
2. Open a pull request into `develop`; CI must pass before merge.
3. Keep `dev-infra` isolated. Promote infrastructure changes deliberately; never merge it over compiler history.
4. Open a separate `develop` → `main` release PR after checking diff, mergeability, documentation, version, changelog, and CI.
5. Never force-update permanent branches to make them appear synchronized. Preserve both histories through merge commits.

## Branch protection

GitHub branch protection/rulesets should require pull requests, successful CI, and prohibit force pushes on the three permanent branches. The repository PR workflow validates source/target policy and cleans up merged temporary branches, but cannot replace GitHub-hosted branch protection settings; maintainers must enable those settings in repository configuration.
