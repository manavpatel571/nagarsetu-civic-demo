import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };

try {
  const env = await readFile(join(root, ".env"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {}

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*" });
  res.end(body);
}

async function bodyOf(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

async function gemini(req, res) {
  if (!process.env.GEMINI_API_KEY) return send(res, 503, "application/json", JSON.stringify({ error: "Gemini is not configured" }));
  const input = await bodyOf(req);
  const prompt = [
    "You classify civic complaints for a demo. Return JSON only with keys issue and area.",
    "issue must be one of pothole, garbage, streetlight, waterlogging.",
    `User supplied area: ${input.area || "unknown"}.`,
    `Image filename: ${input.filename || "unknown"}.`,
    "Infer conservatively; do not invent a precise address."
  ].join("\n");
  const parts = [{ text: prompt }];
  if (input.imageData && input.mimeType) {
    parts.push({ inline_data: { mime_type: input.mimeType, data: input.imageData.replace(/^data:[^;]+;base64,/, "") } });
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json" } })
  });
  const data = await response.json();
  if (!response.ok) return send(res, response.status, "application/json", JSON.stringify({ error: data.error?.message || "Gemini request failed" }));
  send(res, 200, "application/json", JSON.stringify({ text: data.candidates?.[0]?.content?.parts?.[0]?.text || "{}" }));
}

async function narrative(req, res) {
  if (!process.env.GEMINI_API_KEY) return send(res, 503, "application/json", JSON.stringify({ error: "Gemini is not configured" }));
  const input = await bodyOf(req);
  const prompt = [
    "Explain a civic complaint routing decision in 2 concise sentences for a resident.",
    "Mention the detected issue, selected place, nearest assigned ward, department, tracking ID, status, and ETA.",
    "Use only the supplied JSON. Do not claim a real municipal submission or invent facts.",
    JSON.stringify(input)
  ].join("\n");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await response.json();
  if (!response.ok) return send(res, response.status, "application/json", JSON.stringify({ error: data.error?.message || "Gemini narrative failed" }));
  send(res, 200, "application/json", JSON.stringify({ text: data.candidates?.[0]?.content?.parts?.[0]?.text || "" }));
}

async function speech(req, res) {
  if (!process.env.ELEVENLABS_API_KEY) return send(res, 503, "application/json", JSON.stringify({ error: "ElevenLabs is not configured" }));
  const input = await bodyOf(req);
  const voice = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: String(input.text || "").slice(0, 500), model_id: "eleven_multilingual_v2" })
  });
  if (!response.ok) return send(res, response.status, "application/json", JSON.stringify({ error: "ElevenLabs request failed" }));
  const audio = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, { "Content-Type": "audio/mpeg", "Access-Control-Allow-Origin": "*" });
  res.end(audio);
}

async function mapImage(req, res) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return send(res, 503, "application/json", JSON.stringify({ error: "Google Maps is not configured" }));
  const url = new URL(`http://localhost${req.url}`);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return send(res, 400, "application/json", JSON.stringify({ error: "Invalid map coordinates" }));
  }
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: "14",
    size: "800x360",
    scale: "2",
    maptype: "roadmap",
    markers: `color:0x07887d|${lat},${lng}`,
    key: process.env.GOOGLE_MAPS_API_KEY
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params}`);
  if (!response.ok) return send(res, response.status, "application/json", JSON.stringify({ error: "Google Maps image unavailable" }));
  res.writeHead(200, { "Content-Type": response.headers.get("content-type") || "image/png", "Cache-Control": "private, max-age=300", "Access-Control-Allow-Origin": "*" });
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function placesAutocomplete(req, res) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return send(res, 503, "application/json", JSON.stringify({ error: "Google Places is not configured" }));
  const url = new URL(`http://localhost${req.url}`);
  const input = (url.searchParams.get("input") || "").trim();
  if (input.length < 2) return send(res, 200, "application/json", JSON.stringify({ predictions: [] }));
  const params = new URLSearchParams({
    input,
    language: "en",
    key: process.env.GOOGLE_MAPS_API_KEY
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`);
  const data = await response.json();
  if (!response.ok || !["OK", "ZERO_RESULTS"].includes(data.status)) {
    return send(res, 502, "application/json", JSON.stringify({ error: "Google Places autocomplete unavailable" }));
  }
  const predictions = (data.predictions || []).slice(0, 5).map((prediction) => ({
    name: prediction.structured_formatting?.main_text || prediction.description,
    description: prediction.description,
    placeId: prediction.place_id
  }));
  send(res, 200, "application/json", JSON.stringify({ predictions }));
}

async function placeDetails(req, res) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return send(res, 503, "application/json", JSON.stringify({ error: "Google Places is not configured" }));
  const url = new URL(`http://localhost${req.url}`);
  const placeId = (url.searchParams.get("placeId") || "").trim();
  if (!placeId) return send(res, 400, "application/json", JSON.stringify({ error: "Missing place id" }));
  const params = new URLSearchParams({ place_id: placeId, fields: "name,formatted_address,geometry", key: process.env.GOOGLE_MAPS_API_KEY });
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
  const data = await response.json();
  if (!response.ok || data.status !== "OK" || !data.result?.geometry?.location) return send(res, 502, "application/json", JSON.stringify({ error: "Place details unavailable" }));
  send(res, 200, "application/json", JSON.stringify({
    name: data.result.name,
    address: data.result.formatted_address,
    coordinates: data.result.geometry.location
  }));
}

async function geocode(req, res) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return send(res, 503, "application/json", JSON.stringify({ error: "Google Geocoding is not configured" }));
  const url = new URL(`http://localhost${req.url}`);
  const address = (url.searchParams.get("address") || "").trim();
  if (!address) return send(res, 400, "application/json", JSON.stringify({ error: "Missing address" }));
  const params = new URLSearchParams({ address, language: "en", key: process.env.GOOGLE_MAPS_API_KEY });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  const data = await response.json();
  if (!response.ok || data.status !== "OK" || !data.results?.[0]?.geometry?.location) return send(res, 502, "application/json", JSON.stringify({ error: "Geocoding unavailable" }));
  send(res, 200, "application/json", JSON.stringify({
    name: data.results[0].formatted_address,
    coordinates: data.results[0].geometry.location
  }));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/config") {
      return send(res, 200, "application/json", JSON.stringify({
        googleMapsAvailable: Boolean(process.env.GOOGLE_MAPS_API_KEY),
        geminiAvailable: Boolean(process.env.GEMINI_API_KEY),
        elevenLabsAvailable: Boolean(process.env.ELEVENLABS_API_KEY)
      }));
    }
    if (req.method === "GET" && req.url.startsWith("/api/map-image")) return await mapImage(req, res);
    if (req.method === "GET" && req.url.startsWith("/api/places-autocomplete")) return await placesAutocomplete(req, res);
    if (req.method === "GET" && req.url.startsWith("/api/place-details")) return await placeDetails(req, res);
    if (req.method === "GET" && req.url.startsWith("/api/geocode")) return await geocode(req, res);
    if (req.method === "POST" && req.url === "/api/gemini") return await gemini(req, res);
    if (req.method === "POST" && req.url === "/api/narrative") return await narrative(req, res);
    if (req.method === "POST" && req.url === "/api/speech") return await speech(req, res);
    const requested = req.url === "/" ? "index.html" : normalize(req.url.replace(/^\/+/, ""));
    if (requested.startsWith("..")) return send(res, 403, "text/plain", "Forbidden");
    const file = await readFile(join(root, requested));
    send(res, 200, mime[extname(requested)] || "application/octet-stream", file);
  } catch {
    send(res, 404, "text/plain", "Not found");
  }
});

server.listen(port, () => console.log(`AMC demo running at http://localhost:${port}`));
