# Seira RFC (Request for Comments) System

The Seira RFC process provides a consistent, open path for major language features, architectural pivots, and specification changes.

---

## When is an RFC Required?

An RFC is required for:
- New language syntax or alterations to existing syntax/keywords.
- Changes to type system rules, trait behavior, or inference logic.
- Resource lifecycle, ownership, borrowing, or `with` mechanics.
- Effect tracking primitives (`!`) or concurrency models.
- ABI, runtime memory model, or calling convention changes.
- Standard library contracts or additions of major core modules.
- Project manifest (`Seira.toml`) schema extensions.
- Any breaking change.

An RFC is **NOT** required for:
- Routine bug fixes.
- Internal compiler refactoring that does not change observable semantics.
- Non-semantic performance optimizations.
- Typos, docs, and test additions.

---

## RFC Lifecycle

1. **Drafting**: Copy [`template.md`](template.md) to `docs/rfcs/0000-my-feature.md`.
2. **Pull Request**: Open a PR with the title `RFC: <Feature Name>` targeting the `develop` branch.
3. **Discussion**: The community and maintainers review the design, trade-offs, syntax interactions, and implementation feasibility.
4. **Adjudication**:
   - **Accepted**: Merged into `docs/rfcs/` with an assigned number.
   - **Postponed**: Marked for future reconsideration.
   - **Rejected**: Closed with clear reasoning documented.
5. **Implementation**: Once accepted, code implementation may begin on a `feature/*` branch.
