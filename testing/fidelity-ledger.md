# Visual Fidelity Ledger — 2026-09-10

Accepted references:

- `design/concepts/homepage-v2-concept.png`
- `design/concepts/villas-listing-concept.png`
- `design/concepts/villa-detail-concept.png`

Rendered evidence:

- `testing/evidence/home-desktop.png`
- `testing/evidence/home-mobile.png`
- `testing/evidence/home-mobile-menu.png`
- `testing/evidence/villas-desktop.png`
- `testing/evidence/villas-filtered-desktop.png`
- `testing/evidence/villas-mobile.png`
- `testing/evidence/villa-detail-desktop.png`
- `testing/evidence/villa-gallery-desktop.png`
- `testing/evidence/faq-desktop.png`

## Comparison points

| Area | Concept intent | Rendered result | Status |
| --- | --- | --- | --- |
| Header | Restrained deep-teal header, compact brand, simple navigation, white availability CTA | Same hierarchy, palette, spacing pattern, five primary links, and CTA | Match |
| Hero | Large image is the first visual and carries the main message | Authentic Best E Villas balcony image fills the hero; image carousel is keyboard operable | Match with authentic-image substitution |
| Hero copy | “Beautiful Barbados villas.” plus the West/South Coast service line | Headline and supporting sentence are exact matches | Match |
| Copy treatment | White copy directly over an idealized bright image | Stable deep-teal copy panel with coral rule protects contrast on the supplied photography | Intentional accessibility deviation |
| Availability placement | Availability controls sit across the bottom edge of the hero | Desktop bar overlaps the hero edge; mobile uses a clear single CTA immediately below the hero copy | Match, responsively adapted |
| Availability fields | Location, dates, guests, CTA | Location and dates are shown on desktop; the guest field is omitted because property capacities are not publicly confirmed | Intentional content-integrity deviation |
| Carousel controls | Circular arrows and compact position count | Circular arrows and `01 / 03` counter; click and arrow-key tests pass | Match; three approved photos rather than four |
| Typography | One modern, cohesive sans family | Self-hosted DM Sans is used across all pages and weights | Match |
| Colour and shape | Deep teal, coral, warm white, restrained 8px corners | Shared tokens use the same palette, borders, and corner treatment | Match |
| Villa content | Image-led cards and clear route to live availability | Four verified villas use property-specific images, facts, detail pages, and stable Direct-book links | Match with real content |
| Intrusive UI | No pop-ups, ads, floating phone prompt, favourites, or image-obscuring clutter | Automated selector check and visual review confirm all are absent | Match |
| Mobile behaviour | Image-first hierarchy with accessible navigation and a visible booking action | 390px capture shows image, copy and availability CTA within the first viewport; menu opens and closes without overflow | Match |

## Above-fold copy diff

- Concept headline: `Beautiful Barbados villas.`
- Rendered headline: `Beautiful Barbados villas.`
- Difference: none.
- Concept supporting line: `Comfortable stays on the West and South Coasts, with warm local service.`
- Rendered supporting line: `Comfortable stays on the West and South Coasts, with warm local service.`
- Difference: none.
- The generated concept included a guest selector. It was deliberately removed from the implementation because maximum occupancy has not been confirmed by the client or current public site.

## Visual review result

The accepted concept and final desktop/mobile browser captures were inspected together. No material mismatch remains in hierarchy, booking emphasis, typography, palette, navigation clarity, or removal of rejected overlay patterns. The primary remaining production asset difference is image resolution: the Pixieset selections are 1600px preview renditions and should be replaced with downloaded originals before launch.
