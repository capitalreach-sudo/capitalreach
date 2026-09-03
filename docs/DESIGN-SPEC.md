# CapitalReach design spec

The reference for every surface. A page conforms to this or it is not done.
Two registers exist (editorial default, business via `data-style`); both are
token-driven, so this spec speaks in tokens, never hex.

## The one-line brief

A private ledger you were given access to, not a SaaS template. Dense where
information lives, quiet where it doesn't, and typographically disciplined
everywhere.

## What "looks AI-generated", and is therefore banned

- Three-icon feature card rows; any icon+headline+blurb card grid on a
  marketing surface.
- Everything centered. Center is for moments (hero, closing CTA, empty
  states); working surfaces are left-aligned on a hard grid.
- Uniform 24px padding on every box. Rhythm must vary with importance.
- Gradient blobs, glassmorphism, floating 3D shapes, emoji in UI copy.
- Buttons that all look the same. One primary per view; everything else is
  quiet (text link or hairline outline).
- Skeleton screens with rounded-gray-bar soup. Prefer real layout with
  suppressed values ("—" is a number's absence, not a gray pill).
- Sentence-case marketing fluff ("Unlock your potential"). Copy states facts:
  what it is, who pays, what happens next.

## The motifs (use them; they are the identity)

1. **Ruled label**: the `.ruled-label` section opener (bar + mono uppercase).
   Every section on every surface opens with one. No naked `<h2>`s.
2. **Ledger lines**: hairline rules (`--cr-rule`) carry structure. Tables and
   lists separate rows with rules, not boxes-in-boxes.
3. **Numbered rails**: ordered content (steps, rows) gets `01`-style mono
   numbers in the accent color.
4. **The diamond** (✦ / DiamondDot): the only decorative glyph permitted.
5. **Mono for data**: every number the product renders is JetBrains Mono,
   tabular, weight 500-700. Prose never sets numbers.
6. **Band moments**: at most one `--cr-band-bg` slab per page (proof strip,
   pull quote, CTA) with `--cr-copper-br` top/bottom hairlines.

## Type scale (the only sizes that exist)

| Role            | Family                    | Size            | Weight |
|-----------------|---------------------------|-----------------|--------|
| Display         | serif (Playfair/flattens) | clamp 30-52px   | 700    |
| Section head    | serif                     | clamp 22-28px   | 700    |
| Card/row title  | DM Sans                   | 14-16px         | 600    |
| Body            | DM Sans                   | 13-15px / 1.65  | 300-400|
| Label (ruled)   | DM Sans or Mono, UPPER    | 9-11px, +0.07em | 500    |
| Data            | JetBrains Mono            | 11-15px         | 500-700|

No other sizes. If a design wants 17px, it wants 16px.

## Spacing scale

4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96. Section padding: 64-96 desktop,
48-64 mobile. Card internals: 16-24. Never 20, never 28.

## Color rules

- Tokens only. A hex literal in a component is a defect.
- Accent (`--cr-copper`) is for: data emphasis, the one primary action, active
  states, the motifs. Never for large fills except the primary button.
- Green/red (`--cr-up/down`) mean money direction, nothing else.

## Components

- **Primary button**: pill, `--cr-copper` fill, white text, 13px/600, one per
  view.
- **Secondary**: hairline `--cr-paper-4` outline pill, ink text.
- **Tertiary**: text + `→`, accent color.
- **Cards**: `--cr-paper` on `--cr-paper`/`-2` ground, 1px `--cr-rule`
  border, radius `--radius` (style decides), `--cr-card-shadow`. No nested
  cards: inside a card, structure is rules.
- **Tables/lists**: header row in Label style on `--cr-paper-2`; rows split
  by rules; row hover `--cr-paper-3`; whole row clickable, no per-row "View"
  button on mobile.
- **Badges**: 3px radius, hairline border, Label type. Underscores never
  render (`series_a` → "Series A").
- **Empty states**: one diamond, one sentence, one quiet action. Never
  illustrations.
- **Metrics strips**: render only metrics that HAVE values (absence is
  absence); hairline-divided single strip, Label + Data type.

## Mobile

- 375px is a first-class layout, not a squeeze. Tables become stacked rows
  keeping Company/Stage/Raising only; filters collapse behind one "Filters"
  control; touch targets ≥40px; nothing glued (min 12px between tap targets).
- The page never scrolls horizontally. Wide content scrolls inside its own
  container.

## Both styles, both themes

Every change is verified in editorial×light, editorial×dark, business×light,
business×dark. A surface that only works in one register is not done.

## Copy register

Plain, factual, unhedged. Numbers carry the argument. "2% at close — paid by
the startup, never by investors" is the house voice: subject, fact, full stop.
