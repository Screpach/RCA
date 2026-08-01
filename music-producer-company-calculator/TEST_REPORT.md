# Combined Application Test Report

## Unified shell

- JavaScript syntax validation: passed.
- Desktop dashboard browser smoke test: passed.
- Mobile navigation and responsive layout smoke test: passed.
- Company roll-up default and changed-input calculations: passed.
- Hash routing and module view switching: passed.
- Local asset path validation: passed.
- Duplicate HTML ID validation: passed.

## Audience & Meta advertising

- Browser rendering smoke test: passed.
- Five SVG charts rendered: passed.
- Large budget, duration and radius input test: passed.
- Built-in model tests: **10 passed, 0 failed**.

## Hall & ticketing

- Browser rendering smoke test: passed.
- Default revenue outputs populated: passed.
- Default five-zone configuration rendered: passed.
- No JavaScript page errors detected.

## Production economics

- Original automated suite: **39 passed, 0 failed**.
- Browser rendering smoke test: passed.
- KPI outputs populated: passed.
- All 25 analytical chart containers rendered: passed.
- No JavaScript page errors detected.

## Environment note

Browser tests were run in headless Chromium. The delivered app is a static site and should be served through HTTP/HTTPS as described in `README.md`.
