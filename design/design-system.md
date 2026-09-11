# Best E Villas Front-end Design System

This specification translates the approved homepage mock-up and the 2026-09-10 client feedback into the shared front-end system. The three accepted visual references are in `design/concepts/`.

## Direction

- Image-first, calm, premium Barbados hospitality.
- Simple navigation, one dominant availability action, and no intrusive layers.
- Photography remains unobstructed except for concise hero copy positioned in safe image space.
- Main page backgrounds are true white. Pale sand is reserved for deliberate content bands and controls.
- Property and editorial imagery uses aligned, bordered frames; images never overlap.

## Tokens

- Deep teal: `#12343b`
- Deep teal hover: `#0a252b`
- Teal: `#2b7a78`
- Coral action: `#e98262`
- Coral hover: `#cf674a`
- Sand band: `#f5f0e7`
- White: `#ffffff`
- Ink: `#153036`
- Muted text: `#667478`
- Border: `rgba(18, 52, 59, 0.16)`
- Radius: `8px` for media and controls; pills only for the existing brand/action treatment.
- Shadow: none by default; one restrained booking-bar shadow is permitted for separation from hero media.
- Spacing: 8px base scale, with 16/24/32/48/64/96px section rhythm.

## Typography

- One code-native family across headings, body copy, controls, and navigation: `DM Sans`, with Arial/sans-serif fallbacks.
- Brand initials may remain a graphic-style mark, but no second body/display typeface is used.
- Heading weight: 600–700; body: 400; controls: 600.
- Buttons and form controls use explicit sizes and line heights rather than browser defaults.

## Shared components

- Quiet deep-teal header with brand, essential navigation, and one availability CTA.
- Mobile menu panel with the same route set and no phone widget.
- Image carousel with previous/next SVG controls, live slide count, keyboard support, and reduced-motion support.
- In-flow availability bar linking guests to the external booking platform; dates remain a front-end planning aid until final deep-link capability is confirmed.
- Bordered villa cards with image, location, facts, `View villa`, and `Check availability` actions.
- Page intro, breadcrumb, image gallery, facts row, editorial split, review quote, FAQ accordion, and shared footer.
- No favourites, quick-view modal, concept ribbon, floating reservation phone prompt, advertisements, or promotional pop-ups.

## Homepage copy lock

- Brand: `Best E Villas` / `Barbados`
- Navigation: `Villas`, `Locations`, `Our Story`, `Barbados Guide`, `Reviews`
- Primary action: `Check availability`
- Hero heading: `Beautiful Barbados villas.`
- Hero support: `Comfortable stays on the West and South Coasts, with warm local service.`
- Booking fields: `Location`, `Check in`, `Check out`, `Guests`
- First collection heading: `Featured villas`

## Responsive behavior

- Desktop: hero media fills most of the first viewport; booking bar sits at the hero’s lower edge without hiding key photography.
- Tablet: booking fields wrap into two rows; cards become two columns.
- Mobile: hero copy moves to a solid content panel below the image when necessary for legibility; booking fields stack; cards and galleries become single-column; the availability action remains easy to reach but never covers content.

## Known asset deviation

The visual concepts use representative luxury Barbados imagery. The implementation must use approved Best E Villas images. Current local images are sufficient for structure and QA, but the Pixieset collection must replace them after downloadable high-resolution files and usage approval are available.
