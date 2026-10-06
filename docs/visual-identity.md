# IA-MNS Visual Identity

[Documentation index](README.md) · [Web identity assets](../apps/web/README.md#identity) · [Global styles](../apps/web/src/styles.css) · [Corporate agent](domains/corporate-agent.md)

IA-MNS is MNS's corporate AI agent, so its identity belongs to the MNS family: the MNS blue field, bold white letters, and the red wedge that fills the lower counter of the "N" in the MNS logo. IA-MNS has its own marks drawn from those elements; it does not reproduce the MNS corporate logo. This document owns the colors, logos, and usage rules. The [web guide](../apps/web/README.md#identity) owns where the files live and how the derived touch icon is regenerated.

## Brand colors

Sampled from the MNS logo. They are the same in both display themes and are exposed as `--brand-blue` and `--brand-red` in [`styles.css`](../apps/web/src/styles.css).

| Name      | Value     | Role                                                                      |
| --------- | --------- | ------------------------------------------------------------------------- |
| MNS blue  | `#2B3E84` | Logo field and lettering, light-theme accent (buttons, avatars, charts).  |
| MNS red   | `#EC1C24` | Signature only: the wedge in the logos and a few thin decorative details. |
| White     | `#FFFFFF` | Logo bubble, lettering on blue, text on accent surfaces.                  |

Red is a signature, not a state. It never fills buttons, links, text, or status messages; errors use the `--error-*` tokens, a deeper red on a pale background, so a failure is never confused with branding. Current red details are limited to the logos, the 3-pixel line under the documentation header, and the current-page indicator in the documentation navigation.

## Logos

All files are SVG in [`apps/web/src/assets`](../apps/web/src/assets/brand-mark.svg) except the derived touch icon.

![IA-MNS horizontal lockup](../apps/web/src/assets/brand-lockup.svg)

| File | Use | Minimum size |
| --- | --- | --- |
| [`brand-mark.svg`](../apps/web/src/assets/brand-mark.svg) | Symbol: "IA" in a white speech bubble on an MNS blue tile, with the red wedge as the bubble's tail. App icon, sidebar, chat welcome, loading screen, documentation header and navigation, source of the touch icon. | 28 px |
| [`brand-favicon.svg`](../apps/web/src/assets/brand-favicon.svg) | Small-size symbol: the same bubble and wedge without letters, drawn on a 32-unit grid. Browser favicon and the 20-pixel label on assistant replies. | 16 px, up to 24 px |
| [`brand-lockup.svg`](../apps/web/src/assets/brand-lockup.svg) | Horizontal lockup: symbol and the drawn `IA-MNS` wordmark in MNS blue, whose "N" keeps the red lower counter of the MNS logo. Light backgrounds; sign-in screen in the light theme. | 24 px high |
| [`brand-lockup-reverse.svg`](../apps/web/src/assets/brand-lockup-reverse.svg) | The same lockup with a white wordmark. MNS blue or dark backgrounds; sign-in screen in the dark theme. | 24 px high |
| [`brand-touch-icon.png`](../apps/web/src/assets/brand-touch-icon.png) | 180×180 raster of `brand-mark.svg` on MNS blue for Apple home screens. Derived; never edited by hand. | — |

Below 28 pixels the letters inside the symbol stop being legible, which is why the favicon variant exists. The lockups embed the symbol's drawing; keep them in step with `brand-mark.svg`.

### Construction

- **Tile**: square with a 28/128 corner radius and a subtle diagonal gradient (`#3349A0` to `#25387A`) that recalls the light sweep of the MNS background.
- **Bubble and wedge**: the tail is a right triangle with a vertical left edge and a diagonal hypotenuse, the MNS wedge turned to point down. It sits behind the bubble so only the part outside it shows.
- **Wordmark**: heavy grotesque letters drawn as paths (cap height 56 units, stems about 15 units), so the logo renders the same everywhere without a font dependency. Only the "N" carries red.

### Usage rules

- Keep clear space of at least a quarter of the symbol's height around every logo.
- Do not recolor, outline, rotate, stretch, add shadows to, or redraw the marks; do not typeset the wordmark in another font.
- Use `brand-lockup.svg` only on light backgrounds and `brand-lockup-reverse.svg` only on MNS blue or dark ones. The symbol carries its own blue tile and works on both.
- Where a screen shows a logo next to live text that names the product, the image is decorative (`alt=""`). A lockup that stands alone has `alt="IA-MNS"`.
- Artwork made for one theme uses the global `theme-light-only` and `theme-dark-only` classes so only the matching variant is displayed and exposed to assistive technology.

## Interface palette

The web application reads colors only from the custom properties in [`styles.css`](../apps/web/src/styles.css); feature styles must use these tokens rather than literal colors. The light theme is white and cool gray with MNS blue as the accent. The dark theme is a deep navy derived from MNS blue, with a light periwinkle accent and dark text on it, because MNS blue itself is too dark to carry text or focus on a dark surface.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--canvas` | `#F4F6FA` | `#0B1020` | Page background behind cards. |
| `--surface` | `#FFFFFF` | `#111830` | Main surfaces: chat, cards, dialogs. |
| `--surface-muted` | `#EEF1F7` | `#172039` | Sidebar, user message bubbles, table headers. |
| `--input` | `#FFFFFF` | `#1B2543` | Text fields and the composer. |
| `--ink` | `#172140` | `#E8EBF5` | Primary text. |
| `--muted` | `#4D5775` | `#A9B2CC` | Secondary text, placeholders. |
| `--border` | `#DADFEA` | `#2A3454` | Dividers and card outlines. |
| `--border-strong` | `#8A94AE` | `#66729A` | Field and button outlines (at least 3:1 against surfaces). |
| `--accent` | `#2B3E84` | `#9FB2F4` | Primary buttons, send button, avatars, chart bars, active tabs. |
| `--accent-hover` | `#22326A` | `#BCCBF8` | Hover state of accent buttons. |
| `--on-accent` | `#FFFFFF` | `#0F1733` | Text and icons on the accent. |
| `--selected` | `#E2E8F5` | `#222D50` | Hover and selected rows. |
| `--link` | `#2A4BB0` | `#A9BCF8` | Links and eyebrows. |
| `--focus` | `#3557C2` | `#A9BCF8` | Focus outlines. |
| `--header` | `#22326A` | `#0E1530` | Documentation header. |
| `--on-header` / `--on-header-muted` | `#FFFFFF` / `#C3CDEB` | `#FFFFFF` / `#B9C3E2` | Text on the documentation header. |
| `--shadow` | 8% navy | 35% black | Card and menu shadows. |
| `--error-ink` / `--error-bg` / `--error-border` | `#9B1C24` / `#FDEFEF` / `#EDB5B8` | `#FFB3B6` / `#3A1823` / `#8E3A47` | Errors and warnings that need attention. |

Every text pair above meets WCAG 2.2 AA (4.5:1) in both themes; the lowest is `--muted` on `--selected`, at 5.8:1 in the light theme. Keep that margin when changing a value, and recheck the automated accessibility journeys in [validation](validation.md).

## Typography

Interface text uses `Inter, ui-sans-serif, system-ui, sans-serif`; no web font is downloaded, so the operating system's interface font usually renders. Where the product name appears as live text next to the symbol, it is set at weight 800 to echo the heavy wordmark. The drawn wordmark in the lockups is artwork, not text.

## Changing the identity

1. Edit the SVG sources in `apps/web/src/assets`, keeping the lockups in step with the symbol.
2. Regenerate the touch icon as described in the [web guide](../apps/web/README.md#identity).
3. Change interface colors only through the tokens in `styles.css`, verify contrast in both themes, and review desktop and mobile screens in light and dark.
4. Update this document in the same change.
