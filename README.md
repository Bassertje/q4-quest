# Q4 Quest

A calm but addictive game around your electric car, packaged as a Home Assistant add-on.
Driven kilometres become XP, milestones and badges; charging sessions get their own stats.

- Runs as a Home Assistant add-on and opens in the sidebar via Ingress.
- Read-only towards Home Assistant: it only reads states and history.
- All sensors are configured through the add-on options; nothing is hard-coded.
- Works offline; no external services or analytics.

## Installation

1. In Home Assistant, go to **Settings → Add-ons → Add-on Store**.
2. Open the menu (⋮) → **Repositories** and add the URL of this repository.
3. Install **Q4 Quest**, fill in the options (at least the odometer sensor) and start it.

See [`q4-quest/DOCS.md`](q4-quest/DOCS.md) for the full documentation.

## Development

```bash
cd q4-quest
npm install
npm run build      # build the web frontend
npm run mock       # start the server with generated demo data (no Home Assistant needed)
npm test           # run the unit tests
```

Then open <http://localhost:8099>.

To develop against a real Home Assistant instance, copy `.env.example` to `.env`
(it is git-ignored), fill in `HA_URL` and `HA_TOKEN` and run `npm start`.
