# MPL MY Statistics Dashboard

A multi-season MPL MY statistics website built with vanilla HTML, CSS, and JavaScript. The app currently supports MPL MY Season 16 and Season 17, with Season 17 as the default experience.

## Live App

Deployed on Vercel with route rewrites for direct links such as `/schedule`, `/players`, `/hero-pool`, `/player-pool`, and `/h2h/*`.

## Current Features

### Season Support

- Season switcher for MPL MY Season 16 and Season 17
- Season-aware routing and direct-link support
- Shared hero data with season-specific roster, match, logo, and team-name datasets

### Schedule

- Match schedule view
- Next-match countdown card
- Week navigation
- Stage and team filters
- Match scorecards with per-game player rows, bans, and objectives

### Teams

- Team standings and core team stats
- Match wins, game wins, and objective totals
- Team roster modal
- Coaching staff support
- Season 17 player and coach profile modal data sourced from Liquipedia

### Players

- Searchable and sortable player table
- Team and role filtering
- Kills, deaths, assists, KDA, KP%, and per-game averages
- Top leader highlights
- Player stats modal
- Player profile modal

### Heroes

- Pick rate, ban rate, and win rate
- Hero stats modal
- Includes heroes with zero usage
- Search and sorting support

### Hero Pool

- Player-based hero usage view
- Shows heroes used by each player with games and win rate
- Clicking a player opens a hero selector popup
- Popup displays hero-specific stats for that player:
  games, winrate %, kills, average kills, deaths, average deaths, assists, average assists, kda, kp %

### Player Pool

- Hero-based player usage view
- Shows players who used each hero with games and win rate
- Toggle to exclude unused heroes
- Team and role filtering
- Clicking a hero opens a player selector popup
- Popup displays player-specific stats for that hero:
  games, winrate %, kills, average kills, deaths, average deaths, assists, average assists, kda, kp %

### H2H

- Team head-to-head comparison
- Player head-to-head comparison
- Hero head-to-head comparison
- Shared comparison popups for quick selection

## Data Sources

- Official MPL MY website for team and player assets
- Liquipedia for player and coach profile information

## Tech Stack

- HTML
- CSS
- Vanilla JavaScript
- JSON data files
- Vercel for deployment

## Project Structure

```text
index.html
style.css
README.md
LICENSE
vercel.json
js/
  app.js
  data-store.js
  stats.js
  views.js
data/
  heroes.json
  season16/
  season17/
scripts/
```

## Local Development

There is no build step. You can run the project with any simple static server.

Example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## License

This project is licensed under the GNU Affero General Public License v3.0.

If you run a modified version of this project over a network, AGPL-3.0 requires you to make the corresponding source code available to users of that running service.
