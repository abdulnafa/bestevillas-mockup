# Best E Villas production scope and delivery plan

Status date: 2026-09-18

This document is the scope and delivery baseline for moving the approved Best E Villas preview to the live domain. The public review build is available at:

https://abdulnafa.github.io/bestevillas-mockup/

## Included production scope

- Responsive Home, Villas, four individual Villa pages, Locations, About, Reviews, Barbados Guide, FAQs, Policies, and Contact pages.
- Image-led Best E Villas visual system using the supplied logo, one self-hosted font family, a sticky responsive header, smooth scrolling, and restrained accessible motion.
- Curated responsive property galleries, with the approved Prospect source photography already integrated and Providence/St. Silas photography to follow when supplied.
- Property discovery filters and villa-specific links to the existing external booking platform.
- Git-backed Pages CMS editing for site settings, villas, fixed pages, media, and Barbados Guide posts.
- Technical SEO, AEO, and GEO foundations: canonical/social metadata, structured data, sitemap, robots controls, accessible semantic content, and performance safeguards.
- GA4-ready analytics loading, subject to the client's Measurement ID and consent decision.
- One-time reservation-data migration preparation, subject to authorized access, agreed record scope, duplicate checks, and accommodation mapping approval.
- Reservation-platform configuration for the approved property structure, inventory, accepted-payment display, operating rules, cancellation terms, and seasonal rates after the date boundaries are confirmed.
- Production build, launch verification, and handover after every go-live dependency in `docs/PRODUCTION_LAUNCH_HANDOVER.md` is cleared.

## Explicit exclusions

- No booking checkout or payment processing on the Best E Villas website.
- No replacement booking engine; guests continue to the existing external platform.
- No booking-enquiry email or WhatsApp notification workflow.
- No ongoing calendar or channel synchronization; the approved migration is a one-time import.
- No unapproved third-party subscription, payment processor, channel connection, publication action, or account upgrade.
- No invented occupancy, bed configuration, policy text, rate dates, analytics identifiers, or reservation data.
- Material new pages, custom integrations, new languages, or later redesign requests are change requests and require separate approval.

## Acceptance criteria

Production is ready for client sign-off when all of the following are true:

1. Every approved route works at the production domain on desktop and mobile.
2. Navigation, sticky header, menus, galleries, forms, and external booking links work without clipping, overlap, broken resources, or console errors.
3. Final villa names, occupancy, beds, amenities, imagery, policies, rates, and season dates match approved client information.
4. The one-time reservation import has been reviewed for status scope, room mapping, dates, duplicates, and totals before any import action.
5. Canonicals, sitemap, robots directives, schema, GA4/consent, and Search Console use production values; preview URLs remain excluded from indexing.
6. Pages CMS is authorized and a harmless test edit has been confirmed through the production workflow.
7. The client approves the final staging build and the production cutover.

## Dependency-based delivery sequence

The following target starts only after the launch dependencies are supplied and the project is approved to proceed. Client review time or third-party access delays move the target by the same amount.

| Target | Work |
| --- | --- |
| Business days 1-2 | Reconcile final content, accommodation facts, production photography, policy copy, rate seasons, and reservation-export scope. |
| Business days 2-3 | Review the reservation export and accommodation mapping; complete the approved reservation-platform configuration without publishing prematurely. |
| Business days 3-4 | Prepare the production domain/build, authorize CMS access, configure approved analytics/consent, and run the full pre-launch audit. |
| Business days 5-6 | Client staging review and one consolidated correction pass; re-run affected QA. |
| Business day 7 | Obtain written go-live approval, deploy, verify the live domain, submit indexing properties, and complete handover. |

This is a seven-business-day implementation target after complete inputs and approval to proceed, not a fixed launch promise before access and approvals are available. Commercial terms are managed outside this public repository.
