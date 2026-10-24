# NagarSetu civic complaint demo

> **NagarSetu turns a citizen's photo and location into an actionable, trackable civic service request in under one minute.**

[Live demo](https://nagarsetu-civic-demo.onrender.com) · [GitHub repository](https://github.com/manavpatel571/nagarsetu-civic-demo)

## Why this matters

Citizens often know that a civic problem needs attention but do not know which department or ward should receive it. NagarSetu removes that routing friction with a photo-first, multilingual complaint flow:

1. A citizen selects an issue, uploads a photo, or uses a one-click sample.
2. The agent identifies the issue using Gemini when configured, with a deterministic local fallback when it is not.
3. The app resolves the location to the nearest demo ward and routes it to a department.
4. The citizen receives a tracking ID, explanation, ETA, downloadable report, and local map.

This is a safe prototype: it never creates or fetches a real municipal record.

## Hack2Skill judge flow

The deployed demo works without API keys:

1. Open the [live demo](https://nagarsetu-civic-demo.onrender.com).
2. Choose **Road damage**, **Garbage overflow**, or **Water logging** under **Judge quick demos**.
3. Click **Identify & file complaint**.
4. Watch the agent activity trace: image analysis, ward lookup, department routing, and complaint creation.
5. Review the tracking ID, plain-language explanation, ETA, PDF report, and map.
6. Switch between English, Hindi, and Gujarati from the language selector.

## Product capabilities

- Photo upload with JPG, PNG, and WebP validation.
- Offline-friendly local classification for potholes, garbage, streetlights, and water logging.
- Optional Gemini image/issue extraction with an explicit local fallback.
- Local area catalog and nearest-ward assignment using coordinates.
- Optional Google Places, geocoding, and Static Maps adapters; all keys remain server-side.
- Natural-language agent explanation with deterministic fallback.
- Tracking IDs, status lookup, downloadable self-contained PDF reports, and browser speech.
- Multi-marker local complaint map for all coordinate-bearing session tickets.
- English, Hindi, and Gujarati labels for the citizen-facing flow.
- Keyboard-accessible controls, live status regions, and clear privacy disclaimers.

## Architecture

```text
Browser (index.html, app.js, styles.css)
        |
        | local classification, ward matching, tickets, PDF, map fallback
        v
Node.js HTTP server (server.mjs)
        |
        +--> optional Gemini / Google / ElevenLabs adapters
        |
        +--> static local AMC mock data (data/amc-mock.json)
```

The browser remains useful when every optional adapter is unavailable. API keys are read only from environment variables on the server and are never committed.

## Run locally

Requires Node.js 18+:

```sh
npm start
```

Open <http://localhost:4173>. Run tests with:

```sh
npm test
```

PowerShell users whose execution policy blocks `npm.ps1` can use `npm.cmd start` and `npm.cmd test`.

## Optional environment variables

Copy `.env.example` to `.env` and fill only the integrations you need. Never commit `.env`.

- `GEMINI_API_KEY`: optional constrained issue/area extraction.
- `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`: optional spoken status.
- `GOOGLE_MAPS_API_KEY`: optional Places, geocoding, and Static Maps adapters.

## Privacy and limitations

- Photos and tickets stay in the current browser demo session.
- No real AMC or municipal portal is contacted.
- Local ward centers are used for nearest-ward matching; official boundary polygons are not included.
- Free Render instances can sleep after inactivity, so the first request may take longer.
- Optional cloud adapters are deliberately non-essential and fail back to local behavior.

## Future impact opportunities

- Duplicate complaint detection and merge suggestions.
- Gujarati/Hindi voice intake and assisted accessibility.
- An authenticated municipal operations dashboard with SLA analytics.
- Official ward polygons and verified department connectors.
- Human review feedback to measure and improve routing accuracy.
