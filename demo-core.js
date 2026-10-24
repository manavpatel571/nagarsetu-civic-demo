export const ISSUE_TYPES = {
  pothole: { label: "Pothole", department: "Roads & Infrastructure", icon: "●" },
  garbage: { label: "Garbage overflow", department: "Solid Waste Management", icon: "▣" },
  streetlight: { label: "Broken streetlight", department: "Electrical Services", icon: "✦" },
  waterlogging: { label: "Water logging", department: "Storm Water Drainage", icon: "≈" }
};

export const WARDS = [
  { name: "Navrangpura", aliases: ["navrangpura", "navrang"], ward: "West Zone · Ward 12", coordinates: { lat: 23.0375, lng: 72.5615 } },
  { name: "Maninagar", aliases: ["maninagar", "mani nagar"], ward: "South Zone · Ward 34", coordinates: { lat: 22.9958, lng: 72.6042 } },
  { name: "Bodakdev", aliases: ["bodakdev", "bodak dev"], ward: "West Zone · Ward 11", coordinates: { lat: 23.0395, lng: 72.5117 } },
  { name: "Vastrapur", aliases: ["vastrapur"], ward: "West Zone · Ward 13", coordinates: { lat: 23.0397, lng: 72.5301 } },
  { name: "Paldi", aliases: ["paldi"], ward: "Central Zone · Ward 21", coordinates: { lat: 23.0122, lng: 72.5577 } },
  { name: "Zundal", aliases: ["zundal", "zundal circle"], ward: "North West Zone · Ward 7", coordinates: { lat: 23.1278, lng: 72.5472 } },
  { name: "Chandkheda", aliases: ["chandkheda"], ward: "North Zone · Ward 6", coordinates: { lat: 23.1093, lng: 72.5856 } },
  { name: "Kudasan", aliases: ["kudasan"], ward: "Gandhinagar Edge · Ward 8", coordinates: { lat: 23.185, lng: 72.6256 } },
  { name: "Motera", aliases: ["motera"], ward: "North West Zone · Ward 5", coordinates: { lat: 23.0932, lng: 72.5978 } },
  { name: "Gota", aliases: ["gota"], ward: "North West Zone · Ward 9", coordinates: { lat: 23.1015, lng: 72.5422 } },
  { name: "SG Highway", aliases: ["sg highway", "s g highway", "s.g. highway"], ward: "West Zone · Ward 10", coordinates: { lat: 23.045, lng: 72.516 } },
  { name: "Thaltej", aliases: ["thaltej"], ward: "West Zone · Ward 10", coordinates: { lat: 23.0502, lng: 72.5117 } },
  { name: "Satellite", aliases: ["satellite"], ward: "West Zone · Ward 15", coordinates: { lat: 23.0247, lng: 72.5125 } },
  { name: "Bopal", aliases: ["bopal"], ward: "South West Zone · Ward 16", coordinates: { lat: 23.0322, lng: 72.4652 } }
];

export function classifyLocally(filename = "", area = "") {
  const text = `${filename} ${area}`.toLowerCase();
  const issue = Object.keys(ISSUE_TYPES).find((key) => text.includes(key)) ||
    (text.includes("trash") || text.includes("bin") ? "garbage" :
      text.includes("light") || text.includes("lamp") ? "streetlight" :
        text.includes("water") || text.includes("flood") ? "waterlogging" : "pothole");
  return { issue, area: resolveWard(area || text)?.name || area || "Navrangpura", source: "Deterministic local fallback" };
}

export function resolveWard(area = "") {
  const text = area.toLowerCase();
  return WARDS.find((entry) => entry.aliases.some((alias) => text.includes(alias))) || WARDS[0];
}

export function resolveNearestWard(coordinates) {
  if (!coordinates || !Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) return WARDS[0];
  return WARDS.reduce((nearest, ward) => {
    const distance = (ward.coordinates.lat - coordinates.lat) ** 2 + (ward.coordinates.lng - coordinates.lng) ** 2;
    const nearestDistance = (nearest.coordinates.lat - coordinates.lat) ** 2 + (nearest.coordinates.lng - coordinates.lng) ** 2;
    return distance < nearestDistance ? ward : nearest;
  });
}

export function createTicket({ issue, ward, area, coordinates, placeName }) {
  const id = `AMC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  return { id, issue, ward: ward.ward, area, location: { name: placeName || area || ward.name, coordinates: coordinates || ward.coordinates }, department: ISSUE_TYPES[issue].department, status: "Assigned to field team", eta: "Within 3 working days", createdAt: new Date().toISOString() };
}
