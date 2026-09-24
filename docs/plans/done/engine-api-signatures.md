# engine-api catalog — show type-level signatures

Close the reference gap in the generated capability catalog
(`docs/agent/engine-api.md`): exports gain a type-level shape — a callable's
signature, a class's constructor, or a type alias's right-hand side — so a
consumer agent can see *how* to call a symbol, not only that it exists. This
stays **inside** the existing discovery-index decision recorded in
[`engine-api-index.md`](engine-api-index.md) — TypeDoc is
still rejected, the catalog is still hand-rolled/committed/drift-guarded, and
the per-module READMEs still own deep reference. Only the *density* of the one
line changes.

## Problem

The catalog renders `name — kind — JSDoc summary`. Discovery is solved; the
shape is not. `vec3Add — a + b, component-wise` does not tell an agent the
signature. In-repo consumers recover that from the type checker for free, but a
sibling repo (`Roguelike/`, `file:` install) or a human browsing GitHub does
not, and `docs/agent/engine-api.md` is the only one-read surface they have.

## Decisions (settled before building)

- **Stay hand-rolled, committed, one line per symbol.** TypeDoc `--json` could
  drive this, but the artifact is agent-critical: it must be deterministic,
  token-cheap and drift-guarded — not rich and rebuilt in CI. Reversing that
  is a separate decision, not a side effect of this one.
- **Render via `signatureToString` with `NoTruncation`, then apply our own cap.**
  TypeScript's default depth-truncation inserts `…` mid-type at unpredictable
  depths, which is both uglier and less predictable than one deterministic cap.
- **`UseAliasDefinedOutsideCurrentScope` is load-bearing.** Without it, types
  declared in a sibling file expand structurally and a one-line signature
  becomes a wall of inline object types.
- **Structural symbols get no shape.** A shape is emitted only for a type alias or
  a symbol with a call/construct signature; a plain interface, enum, or
  non-callable const therefore renders kind + summary only, and the summary
  remains the pointer to the module README.
- **Type aliases print their right-hand side.** The interesting aliases here are
  unions and function types (`Boundary`, `Easing`) where the RHS *is* the API.
  Printed from the declaration node, not `typeToString`, so the alias name is
  never echoed back instead of its expansion.
- **Rejected: capping the parameter list to preserve the return type.** For the
  handful of rows that overflow, the return type is arguably the more
  load-bearing half of a factory signature. Rescuing it needs a bespoke
  signature printer (drop the middle parameters, re-attach `typeToString` of
  `Signature.getReturnType()`) — more code and more risk than the readability
  gain is worth on 6 of 494 rows. The header prose names the cap and points at
  the source instead.
- **Format is additive.** `- **Name** _(kind)_ \`sig\` — summary`, signature
  inserted before the prose. A symbol with no signature renders byte-identical
  to today, so the drift test stays meaningful and the diff is small.

## Found while building

- **Generic type aliases need their parameter list.** Rendering only the
  right-hand side left `StoreDeleteHandler` as `(id: EntityId, oldValue: T) =>
  void` — a dangling `T`. 9 exported aliases were affected; `decl.typeParameters`
  is now prepended.
- **`TypeChecker` has no `getCallSignatures`.** That method is on `Type`; the
  checker-level equivalent is `checker.getSignaturesOfType(type, kind)`.
- **`Renderable`'s JSDoc was stranded on `RectAnchor`.** The union's doc comment
  in `src/modules/render-canvas2d/renderable.ts` sat directly above the
  `RectAnchor` alias, so TypeScript attributed it to the alias and `Renderable`
  rendered as a capped union carrying no summary. The comment now sits on the
  union; the two anchor aliases got one-line docs.
- **`anchor` is 2-axis, not horizontal.** Those one-line docs first read
  "horizontal anchor", which the union's own comment contradicts: `anchor` says
  which *point* of the shape the position refers to, on both axes. Reworded.

## Peer review → LGTM (3 passes)

Pass 1 found 2 should-fix items + 6 nits, all fixed:

- the plan's counts were wrong — the real figures are 6 capped of 494 rows; my
  "7 of ~570" had counted the header's prose `…` as a symbol row;
- "Interfaces are skipped" overstated the rule — there is no interface branch,
  and a *callable* interface would render, so it was reworded to the mechanism;
- `Renderable`'s union JSDoc was stranded on `RectAnchor`, leaving the catalog's
  `Renderable` row a capped blob with no summary — the comment was moved;
- `docs/README.md` never listed the catalog although `README.md` and `AGENTS.md`
  both call it the start-here doc — added;
- the generated header credited only `exports` + JSDoc, omitting the type
  checker, and hid the class-members limitation — both addressed;
- the cap can swallow a factory's return type. Rescue rejected (it needs a
  bespoke signature printer) and recorded above.

Pass 2 confirmed every fix, then caught the two new anchor one-liners claiming a
"horizontal" anchor that the union's own comment contradicts. Pass 3 verified the
reword against the union block and the renderer defaults
(`src/modules/render-canvas2d/canvas2d-renderer.ts:284,290`) plus every numeric
claim: LGTM.

## Checklist

- [x] `scripts/engine-api.ts` — add `signatureOf()` + `cap()`, render the
      signature in `renderSection`, extend the generated header prose.
- [x] Regenerate `docs/agent/engine-api.md` via `npm run docs:api` — 637 lines
      (was 623); 6 of 494 symbol rows hit the 120-char cap.
- [x] Update the prose describing the catalog: `AGENTS.md`,
      `docs/agent/README.md`, `README.md`, `docs/README.md`.
- [x] Update `/memories/repo/engine-capability-discovery.md`.
- [x] Gates: `npm run lint`, `npm run typecheck`, `npm test` (82 files / 1400
      tests green).
- [x] Peer review → LGTM (no edits, no `vscode_askQuestions`).
- [x] Move this plan to `docs/plans/done/` in the same commit.
