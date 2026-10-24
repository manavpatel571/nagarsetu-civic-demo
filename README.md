# NagarSetu civic complaint demo

This is a dependency-free local demo of an agent-assisted AMC complaint flow. It does not connect to an AMC portal or any other municipal system.

## Run

Requires Node.js 18+:

```sh
npm start
```

Open <http://localhost:4173>. Run the focused tests with `npm test`.

## Optional AI adapters

The demo works without credentials. If `GEMINI_API_KEY` is present, the server exposes a constrained `/api/gemini` adapter for optional issue/area extraction; the browser falls back to deterministic local classification when unavailable. If `ELEVENLABS_API_KEY` is present, `ELEVENLABS_VOICE_ID` can provide spoken status; browser speech synthesis remains the fallback. These adapters never create or fetch municipal records.

The location control currently uses browser geolocation and typed areas, so Google Maps is not required. When `GOOGLE_MAPS_API_KEY` is configured, the Track tab requests a server-rendered Google Static Maps image through `/api/map-image`; the key stays server-side and the UI falls back to a local ward map when unavailable.

The local area catalog includes Zundal, Chandkheda, Kudasan, Motera, Gota, SG Highway, Thaltej, Satellite, and Bopal, so those suggestions work offline. If `GOOGLE_MAPS_API_KEY` is configured, the Report tab also requests optional debounced **global** Google Places Autocomplete suggestions through the server-side `/api/places-autocomplete` route. Selecting any returned place calls `/api/place-details` to obtain its coordinates; a typed location can also use `/api/geocode`. The browser never receives the key, and local ward data remains authoritative for nearest-ward assignment. Places API/Places API (New) and Geocoding API must be enabled separately in Google Cloud; the demo does not require them.

Place selections and device pins carry coordinates into the local ticket. The demo assigns the nearest local ward using ward-center coordinates; exact boundary assignment would require official municipal ward polygons. Optional `/api/place-details` and `/api/geocode` routes require the corresponding Google Places and Geocoding APIs to be enabled, and degrade to typed/local area matching when unavailable.

After filing, the confirmation and Track tab can download a self-contained PDF report with the photo (when supplied), issue, place/coordinates, ward, department, tracking ID, creation time, status, ETA, agent explanation, and the local AMC disclaimer. The browser generates this PDF without adding a package dependency. The Agent activity card also shows a natural-language explanation; Gemini writes it when configured, otherwise the deterministic local explanation is used. The Track tab renders every coordinate-bearing ticket in the local session on a multi-marker map, fits markers to the full reported set, highlights the selected ticket, and lists the reported locations. This map is intentionally local and remains available without Google Maps; the empty state is shown when no ticket has coordinates.
