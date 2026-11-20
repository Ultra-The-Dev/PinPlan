<!-- Palette: Blueprint Ink (chosen Nov 2026): ink navy + electric blue, teal for approved. -->
# Brand and design system

The public site (`/welcome`, `/pricing`, the site footer) and the app both use Blueprint Ink. The site has its own
`.mk` tokens and Archivo everywhere; the app maps the same colours onto its Tailwind tokens in `src/app/globals.css`
(see "In the app" below) and keeps Geist for body text.

The product name always comes from `PRODUCT_NAME` in `src/lib/plans.ts`, including the wordmark. Never type it.

## Idea

The site looks like the thing contractors work from: a plan sheet. Black linework on white drawing paper, device
symbols with letters like a drawing legend, a title block, a scale bar, and the blue highlighter estimators use to
mark what they've counted. One bold thing per page (the hero plan filling in with pins, its count and the approved
quote); everything around it stays quiet.

## Colour

All tokens live under the `.mk` wrapper (`src/components/marketing/marketing.css`). Tailwind utilities
`bg-mk-*`, `text-mk-*`, `border-mk-*` map to them (`@theme inline` in `globals.css`) and do nothing outside `.mk`.

| Token | Hex | Use |
|---|---|---|
| Paper | `#F2F6FA` | Page background. Cool blueprint paper, never cream. |
| Sheet | `#FFFFFF` | Plan sheets, documents, panels that hold product content. |
| Ink (graphite token) | `#0F2340` | Text, linework, the dark band and footer, secondary buttons. Ink navy. |
| Pencil | `#526580` | Secondary text (5.6:1 on paper). |
| Rule | `#C9D6E5` | Hairlines, sheet borders, table rules. Never text. |
| Action blue (marker token) | `#0B6FE0` | Primary action and the final call band. Text on it is always white (4.8:1). |
| Electric | `#33A9FF` | Bright accent on ink: the logo pin, step numbers, focus ring on dark (6.2:1 on ink). Never text on white. |
| Highlight | `#CFE6FF` | The takeoff highlighter behind counted figures; ink text on it. |
| Action deep | `#0958B5` | Primary button hover. |
| Redline | `#C73A2C` | Mark-up on photos and plans only. Not for errors or decoration. |
| Approved teal | `#0B7F72` | Approved and paid states (white text 4.9:1). |
| On dark | `#A9BCD4` | Secondary text on ink. |

Device symbol colours are not brand colours: they come from the trade packs (`src/lib/trades.ts`) so the site
shows what the app shows. Trade colours appear only as the 2px rule above each trade in the trades section.

In the app (`src/app/globals.css`) the same colours are Tailwind tokens, so existing class names (`bg-brand-600`,
`text-slate-500`, …) pick them up with no renames. Contrast values are checked in `tests/statusStyle.test.ts`.

| App token | Hex | Brand colour / use |
|---|---|---|
| `brand-50` … `brand-300` | `#EEF6FF` `#DDEDFF` `#B9DAFF` `#84BFFF` | Action-blue tints: selected states, `.btn-on`, focus ring on inputs |
| `brand-400` | `#33A9FF` | Electric (logo pin, focus on dark). Not for text on white |
| `brand-500` | `#1A86F0` | Small accents |
| `brand-600` | `#0B6FE0` | Action blue: `.btn-brand`, links, focus outline, input focus border. White text 4.8:1 |
| `brand-700` / `brand-800` | `#0958B5` / `#0A4690` | Action deep (hover), text on blue tints (6.3:1 on brand-50) |
| `ink` | `#0F2340` | `.btn-primary`, page titles, theme colour (14.5:1 on paper) |
| `slate-50` | `#F2F6FA` | Paper: page background |
| `slate-100` … `slate-300` | `#E6EDF5` `#D5DFEB` `#BBC8D8` | Fills, rules, borders. Never text |
| `slate-400` | `#5F718B` | Faint text, icons (5.0:1 on white, 4.6:1 on paper) |
| `slate-500` | `#526580` | Pencil: secondary text, labels, placeholders (6.0:1 white, 5.5:1 paper) |
| `slate-600` … `slate-950` | `#3E506A` … `#08162A` | Body text and dark surfaces (`slate-900` = ink) |
| `ok-*` | 50 `#E7F6F3`, 600 `#0B7F72`, 700 `#096B60` | Approved teal: approved, accepted, paid, installed, answered |
| `info-*` | 50 `#EEF6FF`, 600 `#0B6FE0`, 700 `#0958B5` | Sent, viewed, open |
| `warn-*` | 50 `#FFF6E0`, 600 `#B7791F`, 700 `#7F5300` | Quoting (jobs), ready to send, partly paid, expired, due today |
| `bad-*` | 50 `#FDEEEC`, 600 `#C73A2C`, 700 `#A32D21` | Declined, overdue, errors |

Status chips all come from `src/lib/statusStyle.ts` (`statusChip(status)`): 50 ground, 200 ring, 700 text. Draft and
closed are neutral grey; void is grey and struck through. The jobs map uses `PROJECT_STATUS_HEX` (quoting amber,
approved teal, installed deep teal).

Job stages are shown with `projectStatusLabel()` / `PROJECT_STATUS_LABEL` from the same file: the stored value
`estimate` reads **Quoting**, then Approved and Installed. Never print a raw status value or rely on `capitalize`.

Customer documents (quotes, invoices, PDFs, share pages) use the company's own colours from Settings; when those are
blank or not a hex colour they fall back to `DOC_DEFAULT_BRAND` (ink) and `DOC_DEFAULT_ACCENT` (action blue) in
`src/lib/brandDefaults.ts`. Never hard-code a fallback colour in a component.

Rules: one marker element per view where possible (button or highlighted figure, not both fighting). No gradients,
no tinted washes. Light only for now (`color-scheme: light`); a dark scheme should invert to graphite paper with
white linework and keep marker as the action colour.

## Type

One family: **Archivo** (Google Fonts, variable, `wdth` 62–125 and `wght` 100–900), loaded with `next/font` in
`src/components/marketing/fonts.ts` as `--font-mk`.

- Headlines: width 75% (`font-stretch: 75%`), weight 750, slight negative tracking. Condensed and heavy like the
  lettering on panels and equipment labels.
- Text and UI: width 100%, weight 400 / 600.
- Figures: tabular lining numerals (`.mk-num`, `.mk-figure`). No monospace anywhere.
- In the app, Archivo (75% width, weight 700, ink) is used only for `.page-title` and the auth pages' wordmark; the
  font variable is loaded once in `src/app/layout.tsx`. Everything else in the app stays Geist.

| Role | Class | Size | Line height |
|---|---|---|---|
| Display (h1) | `.mk-display` | clamp(44px → 84px) | 0.92 |
| Section (h2) | `.mk-h2` | clamp(32px → 52px) | 0.98 |
| Step / item (h3) | `.mk-h3` | clamp(24px → 30px) | 1.05 |
| Lede | `.mk-lede` | clamp(17px → 20px), pencil | 1.55, max 36em |
| Body | `.mk-body` | 17px, pencil | 1.6, max 34em |
| UI / lists | — | 15px | 1.5 |
| Small / table | — | 13–14px | 1.4 |

Sentence case everywhere. No all-caps labels or eyebrows above headings; the only capitals are room names inside
plan drawings, because that's how plans are lettered. Don't colour or italicise one word of a headline.

## Layout and spacing

- Content width 1240px, 16px side gutter on phones, 24px from `sm`.
- Two-column sections use a 5 : 6 (or 7 : 5 in the hero) split with 64px between, left-aligned. Nothing centred
  except single buttons on phones.
- Section padding 80px on phones, 96–112px on desktop. Sections are separated by a 1px rule or a change of ground
  (paper → sheet → graphite → marker), not by cards.
- Spacing steps: 4, 8, 12, 16, 20, 24, 32, 48, 64, 80, 112.
- The workflow is numbered because it is a sequence; its steps hang off one dashed "wire run" rail. Don't number
  things that aren't steps.

## Shape and depth

Radii follow what the object is, not one value for everything:

| Object | Radius |
|---|---|
| Paper (sheets, panels, tables) | 4px |
| Buttons | 10px (8px small) |
| Status pills | full |
| Phone bezel / screen | 30px / 23px |

Paper gets a 1px rule border and a long, soft shadow like a sheet lying on a desk
(`0 18px 40px -24px rgb(28 42 48 / .35)`). Buttons are flat; the primary has a 2px inset bottom edge.

## Components

- `.mk-btn` + `.mk-btn-primary` (marker), `.mk-btn-line` (graphite outline), `.mk-btn-ink` (graphite fill, used on
  the marker band), `.mk-btn-sm`. Labels say what happens ("Start free trial"); no arrows appended.
- `.mk-sheet` paper surface, `.mk-phone` > `.mk-screen` device frame.
- `.mk-hl` highlighter swipe behind a counted figure. Only on counts and totals.
- `.mk-faq` hairline FAQ with a plus that turns to minus.
- `Symbol` / `SymbolMark` (`src/components/marketing/Symbol.tsx`) draw device badges in the trade pack's shape,
  colour and letters.

## Motion

- One orchestrated moment per page: on `/welcome`, pins drop onto the hero plan in sequence, circuits draw, the
  count rises, the quote arrives and the Approved stamp lands (about 3s, once, CSS only).
- Everything else moves only in answer to the person: button press (1px), FAQ open/close, hover colour.
- No scroll-triggered entrances, no parallax.
- `prefers-reduced-motion: reduce` shows the final state with no animation and turns off transitions and smooth
  scrolling.

## Focus and accessibility

- Site: `:focus-visible` is a 3px ink outline, 3px offset; on ink grounds it's electric blue.
- App: every focusable element gets a 2px action-blue outline with 2px offset (`:focus-visible` in `globals.css`);
  inputs draw their own blue ring instead.
- Touch screens (`pointer: coarse`): `.btn` and `.tab` keep their drawn size but get a 44px hit area.
- Pages can always be pinch-zoomed (no `maximum-scale` / `user-scalable=no` in the viewport).
- `prefers-reduced-motion: reduce` turns off the app's entrance animation, button press scale, pulse/ping and
  control transitions.
- AA contrast for all text (checked values above). Device badges are graphics with a text label beside them.
- Drawings are `aria-hidden` with a written `figcaption`/`aria-label` describing what they show.
- Works from 360px wide with no horizontal scroll.

## Logo

`LogoMark` + `Wordmark` in `src/components/marketing/Wordmark.tsx`: an ink rounded tile (7/32 radius) with the
corner of a floor plan in white linework and an electric-blue (`#33A9FF`) pin. On ink grounds the tile flips to
electric with ink linework. The wordmark is `PRODUCT_NAME` in Archivo 75% width, weight 750, 23px in the header.
The app header (`AppHeader` `Logo`) uses `LogoMark` + the name; sign-in, sign-up and reset use the `Wordmark` on paper.

- Keep clear space of half the tile's width around the lockup. Minimum tile size 20px.
- Don't recolour the pin, add effects, or set the name in another face.
- App icons are drawn from `LogoMark`: `public/icon.svg` (tile), `icon-192.png` / `icon-512.png` (tile, transparent
  corners), `icon-maskable-512.png` (full-bleed ink, mark scaled to 80% for the safe zone) and `apple-touch-icon.png`
  (180px, full bleed; iOS rounds it). Theme colour `#0F2340`, manifest background `#F2F6FA`. Regenerate all five
  together if the mark changes.
- Share card: `src/app/opengraph-image.tsx` renders the 1200 × 630 link preview (Open Graph and Twitter) at build
  time: the on-dark mark and the name on ink, the tagline in on-dark grey, an electric rule, and a corner of a plan
  with lettered devices. It uses the default font (no external font fetch). `SHARE_IMAGE` in
  `src/components/marketing/seo.ts` points every page at it; never use the square app icon as a share image.

## Voice

- Write like a foreman explaining the tool to another contractor: plain verbs, short sentences, the trade's own
  words (plans, floors, devices, wire runs, panel, rough-in, punch list).
- Use the app's glossary (`docs/ux-audit.md`): job, plan/floor, device, wire run, count (takeoff), quote, approve,
  invoice, price list, technician / office.
- Say what it does, not how good it is. No testimonials, logos, statistics or "trusted by" claims unless they are
  real and sourced.
- Only claim what ships. AI features are off: don't mention them. Billdu is an optional connected app, not a feature.
- Example content (job names, people, prices) is clearly sample data and comes from the trade packs' starting prices.
