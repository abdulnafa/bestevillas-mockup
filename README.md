# Best E Villas — Homepage Mock-up

A responsive, booking-first homepage concept for [Best E Villas](https://bestevillas.com/).

This prototype combines a premium editorial look with a clear villa-search journey. It uses the
current property's public photography and verified public-facing content, while replacing the
existing template placeholders with a focused hospitality experience.

## Included in the concept

- Responsive desktop, tablet, and mobile layouts
- Booking search with location, dates, and guest selection
- Filterable villa collection and quick-view dialogs
- Favourite/shortlist interactions
- West Coast and South Coast discovery sections
- Family-run brand story and genuine guest testimonial
- Amenities, booking journey, Barbados guide, and FAQ content
- Mobile navigation and a persistent mobile booking CTA
- Semantic page structure and example lodging structured data

## Preview locally

The site has no build step or dependencies. From this folder, run one of the following:

```powershell
node server.mjs
```

Then visit `http://localhost:4173`.

You can also open `index.html` directly in a browser, although a local server is recommended.

## Share with the client

The most professional option is a live preview URL:

1. Push this project to a private GitHub repository.
2. Import the repository into Netlify or Vercel, or enable GitHub Pages.
3. Send only the live preview URL to the client.

### GitHub Pages

In the repository, open **Settings → Pages**, choose **Deploy from a branch**, select the `main`
branch and `/ (root)`, then save. GitHub will provide a public preview URL.

## Production notes

- The demo intentionally includes `noindex, nofollow`; remove this only when the production site
  replaces the current website.
- Search results currently demonstrate the intended user experience. Real-time availability,
  pricing, checkout, and payment require integration with the final booking engine/API.
- Final production copy, policies, guest capacities, amenities, analytics, schema, and all booking
  details should be confirmed with the owner before launch.
- Property images remain the property of Best E Villas and are included for this client concept.
