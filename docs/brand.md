# Brand and design system

The public site (`/welcome`, `/pricing`, the site footer) uses this system today. The app still uses its own look
(Geist, stone neutrals, safety orange in `src/app/globals.css`); adopt this when the app is redesigned.

The product name always comes from `PRODUCT_NAME` in `src/lib/plans.ts`, including the wordmark. Never type it.

## Idea

The site looks like the thing contractors work from: a plan sheet. Black linework on white drawing paper, device
symbols with letters like a drawing legend, a title block, a scale bar, and the yellow highlighter estimators use to
mark what they've counted. One bold thing per page (the hero plan filling in with pins, its count and the approved
quote); everything around it stays quiet.

## Colour

All tokens live under the `.mk` wrapper (`src/components/marketing/marketing.css`). Tailwind utilities
`bg-mk-*`, `text-mk-*`, `border-mk-*` map to them (`@theme inline` in `globals.css`) and do nothing outside `.mk`.

| Token | Hex | Use |
|---|---|---|
| Paper | `#F2F4F3` | Page background. Cool drafting paper, never cream. |
| Sheet | `#FFFFFF` | Plan sheets, documents, panels that hold product content. |
| Graphite | `#1C2A30` | Text, linework, the dark band and footer, secondary buttons. |
| Pencil | `#56656B` | Secondary text (5.4:1 on paper, 6:1 on sheet). |
| Rule | `#C9D1D3` | Hairlines, sheet borders, table rules. Never text. |
| Marker | `#FFC933` | Primary action, the final call band, highlighted counts. Text on it is always graphite (9.6:1). |
| Marker deep | `#F0B400` | Primary button hover. |
| Redline | `#C73A2C` | Mark-up on photos and plans only. Not for errors or decoration. |
| OK green | `#1F7A4D` | Approved and paid states. |
| On dark | `#A9B6BA` | Secondary text on graphite (7.4:1). |

Device symbol colours are not brand colours: they come from the trade packs (`src/lib/trades.ts`) so the site
shows what the app shows. Trade colours appear only as the 2px rule above each trade in the trades section.

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

- `:focus-visible` is a 3px graphite outline, 3px offset; on graphite grounds it's marker yellow.
- AA contrast for all text (checked values above). Device badges are graphics with a text label beside them.
- Drawings are `aria-hidden` with a written `figcaption`/`aria-label` describing what they show.
- Works from 360px wide with no horizontal scroll.

## Logo

`LogoMark` + `Wordmark` in `src/components/marketing/Wordmark.tsx`: a graphite rounded tile (7/32 radius) with the
corner of a floor plan in white linework and a marker-yellow pin. On graphite grounds the tile flips to marker with
graphite linework. The wordmark is `PRODUCT_NAME` in Archivo 75% width, weight 750, 23px in the header.

- Keep clear space of half the tile's width around the lockup. Minimum tile size 20px.
- Don't recolour the pin, add effects, or set the name in another face.
- `public/icon.svg` (app icon) still uses the older navy/amber mark; update it with the app redesign.

## Voice

- Write like a foreman explaining the tool to another contractor: plain verbs, short sentences, the trade's own
  words (plans, floors, devices, wire runs, panel, rough-in, punch list).
- Use the app's glossary (`docs/ux-audit.md`): job, plan/floor, device, wire run, count (takeoff), quote, approve,
  invoice, price list, technician / office.
- Say what it does, not how good it is. No testimonials, logos, statistics or "trusted by" claims unless they are
  real and sourced.
- Only claim what ships. AI features are off: don't mention them. Billdu is an optional connected app, not a feature.
- Example content (job names, people, prices) is clearly sample data and comes from the trade packs' starting prices.
