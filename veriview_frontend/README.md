# VeriView — Landing Page

Zero-Trust Visual Firewall for AI Agents. Built with Next.js 14 App Router.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **CSS Modules** — zero runtime CSS-in-JS
- **JetBrains Mono + DM Serif Display + Inter** via Google Fonts
- No Tailwind, no UI libraries — pure custom CSS

## Project Structure

```
veriview/
├── app/
│   ├── layout.tsx          # Root layout, metadata
│   ├── page.tsx            # Assembles all sections
│   ├── globals.css         # Design tokens, animations, utilities
│   └── api/
│       └── scan/
│           └── route.ts    # Proxy to VeriView backend (rate-limited)
├── components/
│   ├── CursorGlow.tsx      # Follows cursor with purple radial gradient
│   ├── Nav.tsx             # Sticky nav with backdrop blur
│   ├── Hero.tsx            # Hero + live scan animation window
│   ├── Stats.tsx           # 6 / <100ms / 3× / 0 strip
│   ├── SixLayers.tsx       # Interactive graph — 6 axis nodes, Clean/Attack toggle
│   ├── HowItWorks.tsx      # Editorial 4-step pipeline walkthrough
│   ├── Playground.tsx      # Full live scan: logs, score, findings, curl snippet
│   ├── CodeSection.tsx     # SDK code block with language tabs + live stream
│   ├── BentoGrid.tsx       # 8-card feature grid with mouse-tracking gradient
│   ├── Pricing.tsx         # 3-tier pricing with hover effects
│   ├── CtaSection.tsx      # Final CTA with gradient headline
│   └── Footer.tsx          # Big "VeriView" wordmark footer (Resend-style)
└── .env.local.example
```

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill env vars
cp .env.local.example .env.local

# 3. Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable                | Description                              | Required |
|-------------------------|------------------------------------------|----------|
| `VERIVIEW_BACKEND_URL`  | Your backend base URL                    | Yes      |
| `VERIVIEW_API_KEY`      | Server-side API key (never sent to browser) | Yes   |

The `/api/scan` route acts as a secure proxy:
- Injects your API key server-side
- Rate limits to 5 requests/hour/IP (in-memory, swap for Upstash Redis in prod)
- Pipes SSE streams back to the browser
- Your backend URL is never exposed to the client

## Connecting to Your Backend

The playground calls `POST /api/scan` with `{ url, axes }`.
Your backend at `VERIVIEW_BACKEND_URL/v1/scan` should:
- Accept `Authorization: Bearer <key>`
- Return JSON **or** stream Server-Sent Events
- Each SSE event: `data: { timestamp, level, message }\n\n`

## Design System

All tokens are CSS custom properties in `globals.css`:

```css
--bg, --s1, --s2, --s3          /* Backgrounds */
--b1, --b2, --b3                /* Borders */
--t1, --t2, --t3, --t4          /* Text */
--p, --p2, --p3, --p4           /* Purple brand */
--red, --amber, --green, --blue /* Semantic */
--sans, --serif, --mono         /* Fonts */
```

## Production Build

```bash
npm run build
npm start
```

Or deploy directly to Vercel — zero config required.
