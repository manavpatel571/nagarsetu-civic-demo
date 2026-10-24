import { ISSUE_TYPES, WARDS, classifyLocally, createTicket, resolveNearestWard, resolveWard } from "./demo-core.js";

const $ = (id) => document.getElementById(id);
const state = { selectedIssue: "", file: null, photoDataUrl: "", ticket: null, tickets: new Map(), selectedArea: null, highlightedArea: -1, areaRequest: 0, areaTimer: null, narrative: "" };
const trace = $("trace");
const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageBytes = 10 * 1024 * 1024;

function activateView(view) {
  const report = view !== "track";
  $("reportView").classList.toggle("hidden", !report);
  $("trackView").classList.toggle("hidden", report);
  document.querySelectorAll(".report-only").forEach((element) => element.classList.toggle("hidden", !report));
  $("reportTab").classList.toggle("active", report);
  $("trackTab").classList.toggle("active", !report);
  $("reportTab").setAttribute("aria-selected", report ? "true" : "false");
  $("trackTab").setAttribute("aria-selected", report ? "false" : "true");
  document.title = report ? "NagarSetu · Report an issue" : "NagarSetu · Track complaint";
}
function fallbackNarrative(ticket) {
  return `I identified a ${ISSUE_TYPES[ticket.issue].label.toLowerCase()} and matched ${ticket.area} to the nearest demo ward, ${ticket.ward}. It was routed to ${ticket.department}; local ticket ${ticket.id} is ${ticket.status.toLowerCase()} with an ETA of ${ticket.eta.toLowerCase()}.`;
}
async function loadNarrative(ticket) {
  const panel = $("agentExplanation");
  panel.classList.add("loading");
  $("explanationText").textContent = "The agent is turning its tool calls into a plain-language explanation…";
  const fallback = fallbackNarrative(ticket);
  try {
    const response = await fetch("/api/narrative", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issue: ISSUE_TYPES[ticket.issue].label,
        place: ticket.area,
        ward: ticket.ward,
        department: ticket.department,
        trackingId: ticket.id,
        status: ticket.status,
        eta: ticket.eta
      })
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    state.narrative = data.text?.trim() || fallback;
  } catch {
    state.narrative = fallback;
  }
  $("explanationText").textContent = state.narrative;
  panel.classList.remove("loading");
}
function wrapPdfText(text, maxLength = 76) {
  const words = String(text).replace(/[^\x20-\x7E]/g, "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > maxLength) {
      if (line) lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines;
}
function pdfString(value) {
  return String(value).replace(/[^\x20-\x7E]/g, "").replace(/\\/g, "\\\\").replace(/[()]/g, "\\$&");
}
async function createPdfBlob(ticket) {
  let imageBytes = null;
  let imageWidth = 0;
  let imageHeight = 0;
  if (state.photoDataUrl) {
    try {
      const image = new Image();
      image.src = state.photoDataUrl;
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
      const canvas = document.createElement("canvas");
      imageWidth = Math.min(image.naturalWidth, 900);
      imageHeight = Math.round(image.naturalHeight * (imageWidth / image.naturalWidth));
      canvas.width = imageWidth;
      canvas.height = imageHeight;
      canvas.getContext("2d").drawImage(image, 0, 0, imageWidth, imageHeight);
      const jpeg = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
      const binary = atob(jpeg);
      imageBytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } catch {}
  }
  const lines = [
    "NagarSetu civic complaint report",
    `Tracking ID: ${ticket.id}`,
    `Issue: ${ISSUE_TYPES[ticket.issue].label}`,
    `Place: ${ticket.area}`,
    `Coordinates: ${ticket.location?.coordinates ? `${ticket.location.coordinates.lat}, ${ticket.location.coordinates.lng}` : "Not available"}`,
    `Assigned ward: ${ticket.ward}`,
    `Department: ${ticket.department}`,
    `Created: ${new Date(ticket.createdAt).toLocaleString()}`,
    `Status: ${ticket.status}`,
    `ETA: ${ticket.eta}`,
    "",
    "Agent explanation:",
    ...wrapPdfText(state.narrative || fallbackNarrative(ticket)),
    "",
    "Disclaimer: This report was created by a local AMC mock system.",
    "No real municipal portal was contacted."
  ];
  const contentLines = [];
  let y = imageBytes ? 470 : 735;
  if (imageBytes) contentLines.push("q 500 0 0 220 50 500 cm /Im1 Do Q");
  contentLines.push("BT /F1 16 Tf 50 " + y + " Td (" + pdfString(lines.shift()) + ") Tj");
  y -= 25;
  for (const line of lines) {
    contentLines.push(`0 -${line ? 17 : 9} Td (${pdfString(line)}) Tj`);
    y -= line ? 17 : 9;
  }
  contentLines.push("ET");
  const content = contentLines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >>${imageBytes ? " /XObject << /Im1 5 0 R >>" : ""} >> /Contents ${imageBytes ? 6 : 5} 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  if (imageBytes) objects.push({ prefix: `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`, bytes: imageBytes, suffix: "\nendstream" });
  objects.push({ prefix: `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n`, bytes: new TextEncoder().encode(content), suffix: "\nendstream" });
  const chunks = [new TextEncoder().encode("%PDF-1.4\n")];
  const offsets = [0];
  let byteLength = chunks[0].length;
  objects.forEach((object, index) => {
    offsets[index + 1] = byteLength;
    const bytes = typeof object === "string" ? new TextEncoder().encode(`${index + 1} 0 obj\n${object}\nendobj\n`) : new Uint8Array([...new TextEncoder().encode(`${index + 1} 0 obj\n${object.prefix}`), ...object.bytes, ...new TextEncoder().encode(`${object.suffix}\nendobj\n`)]);
    chunks.push(bytes);
    byteLength += bytes.length;
  });
  const xrefOffset = byteLength;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { xref += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(new TextEncoder().encode(xref));
  return new Blob(chunks, { type: "application/pdf" });
}
async function downloadReport(ticket = state.ticket) {
  if (!ticket) return;
  const button = $("downloadReport");
  if (button) button.disabled = true;
  try {
    const blob = await createPdfBlob(ticket);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${ticket.id}-civic-report.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    showAlert("The report could not be generated. Please try again.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}
function syncViewFromHash() {
  activateView(location.hash === "#status" || location.hash === "#track" ? "track" : "report");
}

function addTrace(title, detail, payload = "") {
  if (trace.querySelector(".empty-trace")) trace.innerHTML = "";
  const row = document.createElement("div");
  row.className = "trace-step";
  row.innerHTML = `<span class="trace-icon">✓</span><div><strong>${title}</strong><small>${detail}</small>${payload ? `<code>${payload}</code>` : ""}</div>`;
  trace.append(row);
  $("traceStatus").textContent = "Running";
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}
function setIssue(issue) {
  state.selectedIssue = issue;
  document.querySelectorAll("#issueChips button").forEach((button) => {
    button.classList.toggle("selected", button.dataset.issue === issue);
    button.setAttribute("aria-pressed", button.dataset.issue === issue ? "true" : "false");
  });
}
function showAlert(message, kind = "error") {
  const alert = $("formAlert");
  alert.textContent = message;
  alert.className = `form-alert ${kind}`;
  alert.classList.remove("hidden");
}
function clearAlert() {
  $("formAlert").classList.add("hidden");
}
function areaMatches(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return WARDS;
  return WARDS.filter((entry) => `${entry.name} ${entry.aliases.join(" ")} ${entry.ward}`.toLowerCase().includes(normalized));
}
function closeAreaSuggestions() {
  const menu = $("areaSuggestions");
  menu.classList.add("hidden");
  menu.innerHTML = "";
  $("area").setAttribute("aria-expanded", "false");
  state.highlightedArea = -1;
}
function renderAreaSuggestions(query = $("area").value, remoteMatches = []) {
  const menu = $("areaSuggestions");
  const matches = areaMatches(query);
  menu.innerHTML = "";
  if (!matches.length && !remoteMatches.length) {
    menu.innerHTML = '<div class="autocomplete-empty">No local areas match that search.</div>';
    menu.classList.remove("hidden");
    $("area").setAttribute("aria-expanded", "true");
    state.highlightedArea = -1;
    return;
  }
  [...matches.map((entry) => ({ ...entry, source: "local" })), ...remoteMatches].forEach((entry, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "autocomplete-option";
    option.setAttribute("role", "option");
    option.dataset.index = String(index);
    option.innerHTML = `<span class="suggestion-pin">⌖</span><span><strong>${entry.name}</strong><small>${entry.ward || entry.description} ${entry.source === "places" ? "· Google Places" : ""}</small></span>`;
    option.addEventListener("mousedown", (event) => event.preventDefault());
    option.addEventListener("click", () => entry.source === "places" ? selectPlaceSuggestion(entry) : selectArea(entry));
    menu.append(option);
  });
  menu.classList.remove("hidden");
  $("area").setAttribute("aria-expanded", "true");
  state.highlightedArea = -1;
}
async function fetchPlaceSuggestions(query) {
  if (query.trim().length < 2) return [];
  const requestId = ++state.areaRequest;
  try {
    const response = await fetch(`/api/places-autocomplete?input=${encodeURIComponent(query.trim())}`);
    if (requestId !== state.areaRequest || !response.ok) return [];
    const data = await response.json();
    return (data.predictions || []).map((item) => ({ ...item, source: "places", ward: item.description }));
  } catch {
    return [];
  }
}
function selectArea(entry) {
  state.selectedArea = entry;
  $("area").value = entry.name;
  closeAreaSuggestions();
  clearAlert();
  $("locationHint").textContent = `${entry.name} selected · ${entry.ward}`;
}
async function selectPlaceSuggestion(entry) {
  closeAreaSuggestions();
  $("area").value = entry.name;
  $("locationHint").textContent = "Resolving place coordinates…";
  try {
    const response = await fetch(`/api/place-details?placeId=${encodeURIComponent(entry.placeId)}`);
    if (!response.ok) throw new Error();
    const place = await response.json();
    const ward = resolveNearestWard(place.coordinates);
    selectArea({ name: place.name, aliases: [place.name.toLowerCase()], ward: ward.ward, coordinates: place.coordinates, placeName: place.name });
    $("locationHint").textContent = `${place.name} · nearest demo ward: ${ward.ward}`;
  } catch {
    state.selectedArea = null;
    $("locationHint").textContent = "Place selected; ward will use local fallback if Google lookup is unavailable.";
  }
}
async function resolveTypedLocation() {
  if (state.selectedArea?.coordinates) return state.selectedArea;
  const local = WARDS.find((entry) => entry.name.toLowerCase() === $("area").value.trim().toLowerCase());
  if (local) return local;
  try {
    const response = await fetch(`/api/geocode?address=${encodeURIComponent($("area").value.trim())}`);
    if (!response.ok) return null;
    const place = await response.json();
    const ward = resolveNearestWard(place.coordinates);
    state.selectedArea = { name: place.name, aliases: [place.name.toLowerCase()], ward: ward.ward, coordinates: place.coordinates, placeName: place.name };
    $("locationHint").textContent = `${place.name} · nearest demo ward: ${ward.ward}`;
    return state.selectedArea;
  } catch {
    return null;
  }
}
function moveAreaHighlight(direction) {
  const options = [...document.querySelectorAll(".autocomplete-option")];
  if (!options.length) return;
  state.highlightedArea = (state.highlightedArea + direction + options.length) % options.length;
  options.forEach((option, index) => {
    const active = index === state.highlightedArea;
    option.classList.toggle("highlighted", active);
    option.setAttribute("aria-selected", active ? "true" : "false");
  });
  options[state.highlightedArea].scrollIntoView({ block: "nearest" });
}
function selectHighlightedArea() {
  const option = document.querySelector(`.autocomplete-option[data-index="${state.highlightedArea}"]`);
  if (option) option.click();
}
function renderMap(selectedTicket = state.ticket) {
  const card = $("mapCard");
  const tickets = [...state.tickets.values()];
  const mapped = tickets.filter((entry) => Number.isFinite(entry.location?.coordinates?.lat) && Number.isFinite(entry.location?.coordinates?.lng));
  if (!tickets.length) { card.classList.add("hidden"); return; }
  card.classList.remove("hidden");
  $("mapTitle").textContent = selectedTicket?.location?.name || "Reported complaint map";
  $("mapWard").textContent = selectedTicket ? `${selectedTicket.ward} · ${selectedTicket.area}` : "Select a report to see its ward and place.";
  $("mapBadge").textContent = "Local multi-report map";
  $("mapCount").textContent = `${mapped.length} reported location${mapped.length === 1 ? "" : "s"}`;
  const frame = $("mapFrame");
  const list = $("locationList");
  if (!mapped.length) {
    frame.innerHTML = '<div class="map-fallback"><span>⌖</span><strong>No mapped reports yet</strong><small>Reports with coordinates will appear here.</small></div>';
    list.innerHTML = '<div class="autocomplete-empty">No reported complaints have coordinates yet.</div>';
    return;
  }
  const lats = mapped.map((entry) => entry.location.coordinates.lat);
  const lngs = mapped.map((entry) => entry.location.coordinates.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.004);
  const lngSpan = Math.max(maxLng - minLng, 0.004);
  frame.innerHTML = "";
  mapped.forEach((entry) => {
    const { lat, lng } = entry.location.coordinates;
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `map-marker${entry.id === selectedTicket?.id ? " selected" : ""}`;
    marker.style.left = `${8 + ((lng - minLng) / lngSpan) * 84}%`;
    marker.style.top = `${92 - ((lat - minLat) / latSpan) * 84}%`;
    marker.setAttribute("aria-label", `${ISSUE_TYPES[entry.issue].label} at ${entry.area}`);
    marker.innerHTML = `<span><b>${ISSUE_TYPES[entry.issue].icon}</b></span><small>${escapeHtml(entry.area)}</small>`;
    marker.addEventListener("click", () => {
      $("statusId").value = entry.id;
      $("statusOutput").innerHTML = `<span>${escapeHtml(entry.id)} · ${escapeHtml(entry.status)} · ${escapeHtml(entry.department)} · ETA ${escapeHtml(entry.eta)}</span><br><a href="#" class="download-link" id="trackDownload">↓ Download full complaint report</a>`;
      $("statusOutput").classList.remove("hidden");
      $("trackDownload")?.addEventListener("click", (event) => { event.preventDefault(); downloadReport(entry); });
      renderMap(entry);
    });
    frame.append(marker);
  });
  list.innerHTML = mapped.map((entry) => `<button type="button" class="location-item${entry.id === selectedTicket?.id ? " selected" : ""}" data-ticket-id="${escapeHtml(entry.id)}"><span><strong>${escapeHtml(entry.area)}</strong><small>${escapeHtml(entry.ward)} · ${escapeHtml(ISSUE_TYPES[entry.issue].label)}</small></span><em>${escapeHtml(entry.status)}</em></button>`).join("");
  list.querySelectorAll("[data-ticket-id]").forEach((button) => button.addEventListener("click", () => {
    const entry = state.tickets.get(button.dataset.ticketId);
    if (entry) { $("statusId").value = entry.id; renderMap(entry); }
  }));
}
function showPreview(file) {
  if (!file) return;
  if (!acceptedTypes.includes(file.type)) {
    showAlert("Please choose a JPG, PNG, or WebP image.", "error");
    $("dropZone").classList.add("upload-error");
    return;
  }
  if (file.size > maxImageBytes) {
    showAlert("That image is larger than 10 MB. Choose a smaller photo.", "error");
    $("dropZone").classList.add("upload-error");
    return;
  }
  clearAlert();
  $("dropZone").classList.remove("upload-error");
  state.file = file;
  const reader = new FileReader();
  reader.onload = () => {
    state.photoDataUrl = reader.result;
    $("preview").src = reader.result;
    $("previewWrap").classList.remove("hidden");
    $("uploadContent").classList.add("hidden");
    $("dropZone").classList.add("has-file");
  };
  reader.readAsDataURL(file);
}
async function optionalGemini() {
  if (!state.file) return null;
  try {
    const imageData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(state.file);
    });
    const response = await fetch("/api/gemini", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: state.file.name, area: $("area").value, imageData, mimeType: state.file.type }) });
    if (!response.ok) return null;
    const data = JSON.parse((await response.json()).text || "{}");
    if (!ISSUE_TYPES[data.issue]) return null;
    return { issue: data.issue, area: data.area || $("area").value, source: "Gemini image analysis" };
  } catch { return null; }
}
async function fileComplaint() {
  clearAlert();
  if (!state.selectedIssue && !state.file) {
    showAlert("Choose an issue category or upload a photo to get started.");
    $("issueChips").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!$("area").value.trim()) {
    showAlert("Add an area or landmark so we can route this to the right ward.");
    $("area").focus();
    return;
  }
  $("reportBtn").disabled = true;
  $("reportBtn").querySelector(".button-label").textContent = "Working through the report…";
  $("traceStatus").textContent = "Running";
  trace.innerHTML = "";
  addTrace("Image analysis", "Reading the photo and looking for a civic issue…");
  const gemini = await optionalGemini();
  const result = gemini || classifyLocally(state.file?.name || state.selectedIssue, $("area").value);
  setIssue(result.issue);
  await wait(350);
  addTrace("Issue identified", `${ISSUE_TYPES[result.issue].label} · ${result.source}`, JSON.stringify({ issue: result.issue }));
  await wait(300);
  const selectedLocation = await resolveTypedLocation();
  const ward = selectedLocation || resolveWard(result.area || $("area").value);
  addTrace("Ward lookup", `${ward.name} matched to ${ward.ward}`, JSON.stringify({ area: result.area || ward.name }));
  await wait(300);
  addTrace("Department routing", `${ISSUE_TYPES[result.issue].department}`, JSON.stringify({ department: ISSUE_TYPES[result.issue].department }));
  await wait(300);
  const ticket = createTicket({
    issue: result.issue,
    ward,
    area: selectedLocation?.name || result.area || ward.name,
    coordinates: selectedLocation?.coordinates,
    placeName: selectedLocation?.placeName || selectedLocation?.name
  });
  state.ticket = ticket;
  state.tickets.set(ticket.id, ticket);
  addTrace("AMC complaint created", `Local mock record ${ticket.id}`, JSON.stringify({ trackingId: ticket.id }));
  $("resultTitle").textContent = `${ISSUE_TYPES[ticket.issue].label} report filed.`;
  $("resultCopy").textContent = `${ticket.ward} · ${ticket.department} · ${ticket.status}`;
  $("ticketId").textContent = ticket.id;
  $("result").classList.remove("hidden");
  $("statusId").value = ticket.id;
  renderMap(ticket);
  $("reportBtn").disabled = false;
  $("reportBtn").querySelector(".button-label").textContent = "Identify & file complaint";
  $("traceStatus").textContent = "Complete";
  loadNarrative(ticket);
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
$("photo").addEventListener("change", (event) => showPreview(event.target.files[0]));
$("dropZone").addEventListener("click", (event) => {
  if (event.target.closest("#removePhoto")) return;
  $("photo").click();
});
["dragenter", "dragover"].forEach((eventName) => $("dropZone").addEventListener(eventName, (event) => { event.preventDefault(); $("dropZone").classList.add("has-file"); }));
["dragleave", "drop"].forEach((eventName) => $("dropZone").addEventListener(eventName, (event) => { event.preventDefault(); if (eventName === "drop") showPreview(event.dataTransfer.files[0]); else if (!state.file) $("dropZone").classList.remove("has-file"); }));
$("dropZone").addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); $("photo").click(); } });
$("removePhoto").addEventListener("click", (event) => {
  event.stopPropagation();
  state.file = null;
  state.photoDataUrl = "";
  $("photo").value = "";
  $("preview").src = "";
  $("previewWrap").classList.add("hidden");
  $("uploadContent").classList.remove("hidden");
  $("dropZone").classList.remove("has-file");
  $("dropZone").classList.remove("upload-error");
});
document.querySelectorAll("#issueChips button").forEach((button) => button.addEventListener("click", () => { setIssue(button.dataset.issue); clearAlert(); }));
document.querySelectorAll("[data-area]").forEach((button) => button.addEventListener("click", () => {
  const entry = WARDS.find((ward) => ward.name === button.dataset.area);
  if (entry) selectArea(entry);
}));
$("area").addEventListener("input", () => {
  state.selectedArea = null;
  $("locationHint").textContent = "Local areas work offline. You can also search a place or pin your current location.";
  const query = $("area").value;
  renderAreaSuggestions(query);
  clearTimeout(state.areaTimer);
  state.areaTimer = setTimeout(async () => {
    const remoteMatches = await fetchPlaceSuggestions(query);
    if ($("area").value === query && remoteMatches.length) renderAreaSuggestions(query, remoteMatches);
  }, 280);
});
$("area").addEventListener("focus", () => renderAreaSuggestions());
$("area").addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") { event.preventDefault(); moveAreaHighlight(1); }
  else if (event.key === "ArrowUp") { event.preventDefault(); moveAreaHighlight(-1); }
  else if (event.key === "Enter" && !$("areaSuggestions").classList.contains("hidden")) { event.preventDefault(); selectHighlightedArea(); }
  else if (event.key === "Escape") closeAreaSuggestions();
});
$("area").addEventListener("blur", () => setTimeout(closeAreaSuggestions, 120));
$("locateBtn").addEventListener("click", () => {
  if (!navigator.geolocation) { showAlert("Location access is not available here. Type an area instead.", "info"); return; }
  $("locateBtn").textContent = "Locating…";
  navigator.geolocation.getCurrentPosition((position) => {
    const coordinates = { lat: position.coords.latitude, lng: position.coords.longitude };
    const ward = resolveNearestWard(coordinates);
    selectArea({ ...ward, name: "Pinned location", placeName: "Pinned location", coordinates });
    $("locateBtn").textContent = "Location pinned";
    $("locationHint").textContent = `Pinned location · nearest demo ward: ${ward.ward}`;
    showAlert("Your device location was pinned for this demo.", "info");
  }, () => {
    $("locateBtn").textContent = "Use location";
    showAlert("We could not read your location. Type an area instead.", "info");
  }, { timeout: 5000 });
});
$("reportBtn").addEventListener("click", fileComplaint);
$("copyId").addEventListener("click", async () => { await navigator.clipboard?.writeText(state.ticket.id); $("copyId").textContent = "Copied"; });
$("downloadReport").addEventListener("click", () => downloadReport());
$("newReport").addEventListener("click", () => {
  $("result").classList.add("hidden");
  $("photo").value = "";
  $("area").value = "";
  state.file = null;
  state.photoDataUrl = "";
  state.selectedIssue = "";
  state.selectedArea = null;
  state.narrative = "";
  $("explanationText").textContent = "Once your report is processed, you’ll see a plain-language explanation here.";
  $("preview").src = "";
  $("previewWrap").classList.add("hidden");
  $("uploadContent").classList.remove("hidden");
  $("dropZone").classList.remove("has-file");
  $("dropZone").classList.remove("upload-error");
  document.querySelectorAll("#issueChips button").forEach((button) => button.classList.remove("selected"));
  trace.innerHTML = '<div class="trace-empty"><div class="trace-orbit">✦</div><strong>Your report will come to life here</strong><p>We’ll show each lookup and tool call as it happens.</p></div>';
  $("traceStatus").textContent = "Waiting";
  clearAlert();
  $("report").scrollIntoView({ behavior: "smooth" });
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".autocomplete-field")) closeAreaSuggestions();
});
$("statusBtn").addEventListener("click", () => {
  const ticket = state.tickets.get($("statusId").value.trim());
  $("statusOutput").innerHTML = ticket
    ? `<span>${escapeHtml(ticket.id)} · ${escapeHtml(ticket.status)} · ${escapeHtml(ticket.department)} · ETA ${escapeHtml(ticket.eta)}</span><br><a href="#" class="download-link" id="trackDownload">↓ Download full complaint report</a>`
    : "No local complaint found. Use the tracking ID from a filed report.";
  $("statusOutput").classList.remove("hidden");
  $("trackDownload")?.addEventListener("click", (event) => { event.preventDefault(); downloadReport(ticket); });
  renderMap(ticket || state.ticket);
});
function handleHashChange() {
  syncViewFromHash();
  if (location.hash === "#status") renderMap(state.ticket);
}
document.querySelectorAll(".nav-link").forEach((tab) => tab.addEventListener("click", () => requestAnimationFrame(handleHashChange)));
window.addEventListener("hashchange", handleHashChange);
syncViewFromHash();
$("speakBtn").addEventListener("click", async () => {
  if (!state.ticket) return;
  try {
    const response = await fetch("/api/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `Your ${ISSUE_TYPES[state.ticket.issue].label} complaint ${state.ticket.id} is ${state.ticket.status}.` }) });
    if (!response.ok) throw new Error();
    const audio = new Audio(URL.createObjectURL(await response.blob()));
    audio.play();
  } catch {
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(`Your complaint ${state.ticket.id} is ${state.ticket.status}.`));
  }
});
