# Meridian — Life Command Dashboard

A personal life management dashboard built around split-focus peak windows (7–11 AM and 9 PM–12 AM HKT), tuned to HK + US market cycles.

## Features

- **Peak window timeline** — 24-hour ribbon with live "now" indicator, peak/market/restore blocks
- **Task tracks** — Trading prep, Online learning, Health, Reading, LinkedIn, Networking with priorities (P1–P4) and due dates
- **Eisenhower matrix** — drag tasks into Do / Schedule / Delegate / Eliminate quadrants, or auto-sort
- **Weekly habit tracker** — tap-to-log with streak counts and weekly totals
- **Reminders & alerts** — pre-loaded for HK + US market cycle, native browser notifications
- **Life KPIs + distribution chart** — see where your time actually goes
- **Daily journal** — wins, lessons, tomorrow's first move (auto-saved per date)
- **Trade log** — symbol, side, P/L, note → auto-calculates W/L, hit rate, running P/L
- **Dark / light themes** — toggle in the top-right
- **Auto-save** — uses browser localStorage, plus JSON export/import for backup or cross-device transfer

## How to use

### Option 1 — Live URL (GitHub Pages)

Once Pages is enabled, the dashboard is live at the URL shown in the repo settings. Just bookmark it.

### Option 2 — Run locally

```bash
git clone <this-repo>
cd meridian-dashboard
# Just open index.html in any modern browser
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

### Backing up your data

The dashboard auto-saves to your browser's localStorage. To back up or move to another device:

1. Click **Export JSON** in the Data & sync section → saves a `meridian-YYYY-MM-DD.json` file
2. On another device or browser, open the dashboard and click **Import JSON** → pick the file

## Tech

- Pure HTML / CSS / vanilla JS — zero dependencies, no build step
- Persists via `localStorage`
- Works offline once loaded
- Single-page, ~80KB total

## File structure

```
meridian-dashboard/
├── index.html   # Markup
├── style.css    # Design system + components
├── app.js       # State, rendering, interactivity
└── README.md    # This file
```

## Customizing your schedule

Open `app.js` and find the `SCHEDULE` array near the top of the daily schedule section. Adjust `start` / `end` (decimal hours, 0–24), `label`, `type` (`peak` / `market` / `rest`), and `desc` to match your own rhythm.

## License

Personal use. Built with Perplexity Computer.
