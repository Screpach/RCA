# Producer OS — All-in-One Music Producer Company Calculator

This package combines three standalone calculators into one local-first web application:

1. **Audience & Meta advertising** — Instagram campaign reach, impressions, visits, fees, IVA and saturation.
2. **Hall & ticketing** — venue zones, capacity, occupancy, ticket pricing, commissions and projected revenue.
3. **Production economics** — venue, artists, rehearsals, marketing, commissions, break-even and scenario analytics.
4. **Company overview** — a new executive roll-up for revenue, costs, contingency, tax reserve, profit, margin, return on cost and break-even tickets.

## Run locally

The application should be served through a local HTTP server so all embedded modules work consistently.

```bash
cd music-producer-company-calculator
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Deployment

Upload the entire folder to any static web host. No build process or server-side runtime is required.

## Data and isolation

Each calculator runs in its own embedded module, preventing CSS and JavaScript collisions. Existing local storage, import/export and calculation features are preserved. The company roll-up uses its own local-storage key.

## Folder structure

- `index.html`, `styles.css`, `app.js` — unified shell and company roll-up.
- `calculators/meta-ads/` — original advertising calculator.
- `calculators/hall-tickets/` — original hall and ticket calculator.
- `calculators/stage-economics/` — original stage economics calculator.
