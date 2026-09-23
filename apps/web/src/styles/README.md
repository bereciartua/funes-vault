# Styles

`app/globals.css` loads brand values, design tokens, browser defaults and shared
primitives. Feature entry components import their own stylesheet. Larger features
compose sheets for their components with CSS imports; responsive rules live next
to the rules they change. Do not add a separate responsive override sheet.

Use a readable block-element name such as `memory-row-title`. Reserve `ui-` for
reusable primitives. Use `data-*` attributes for state, such as `data-selected` or
`data-tone`, and ARIA attributes where they already express that state. A feature
must not depend on another feature's class. Shared layout patterns belong to the
primitive sheets (`form-stack`, `section-heading`, `detail-actions`).

Use the spacing, radius, text and shadow scales in `tokens.css`. Keep dimensions
that describe layout or an icon explicit. The palette comes from `lib/brand.ts`;
`pnpm icons:generate` synchronizes the generated brand sheet and icons.

There are two width breakpoints: 640px for compact layouts and 980px for the
single-column workspace. The complementary desktop query begins at 981px.
Motion preferences remain independent of width. The pre-paint theme script and
`ThemeManager` track the system theme; forced light/dark preferences override it.
Dark values are declared once for both system-dark and forced-dark selectors.

Prefer scoped selectors and source order over `!important`. `pnpm lint:css`
rejects duplicate selectors, duplicate properties, empty blocks, invalid hex
colors and important declarations. Check light/dark and desktop/mobile views
after changing layout or specificity.
