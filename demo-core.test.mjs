import test from "node:test";
import assert from "node:assert/strict";
import { ISSUE_TYPES, WARDS, classifyLocally, createTicket, resolveNearestWard, resolveWard } from "./demo-core.js";

test("resolves supported area aliases to a ward", () => {
  assert.equal(resolveWard("near Navrangpura").ward, "West Zone · Ward 12");
  assert.equal(resolveWard("Mani Nagar").name, "Maninagar");
});

test("classifies deterministic issue keywords", () => {
  assert.equal(classifyLocally("broken_streetlight.jpg", "Bodakdev").issue, "streetlight");
  assert.equal(classifyLocally("flooded-road.jpg", "Paldi").issue, "waterlogging");
  assert.equal(classifyLocally("overflowing-bin.jpg", "Maninagar").issue, "garbage");
  assert.equal(classifyLocally("road-photo.jpg", "Bopal").issue, "pothole");
});

test("falls back to a known local area and issue", () => {
  const result = classifyLocally("", "");
  assert.equal(result.issue, "pothole");
  assert.equal(result.area, "Navrangpura");
  assert.equal(result.source, "Deterministic local fallback");
});

test("assigns the nearest ward from coordinates", () => {
  assert.equal(resolveNearestWard({ lat: 23.0375, lng: 72.5615 }).name, "Navrangpura");
  assert.equal(resolveNearestWard({ lat: 22.9958, lng: 72.6042 }).name, "Maninagar");
  assert.equal(resolveNearestWard(null).name, WARDS[0].name);
});

test("creates a local ticket with a tracking id", () => {
  const coordinates = { lat: 23.0122, lng: 72.5577 };
  const ticket = createTicket({ issue: "pothole", ward: resolveWard("Paldi"), area: "Paldi", coordinates });
  assert.match(ticket.id, /^AMC-\d{4}-\d{6}$/);
  assert.equal(ticket.department, "Roads & Infrastructure");
  assert.deepEqual(ticket.location.coordinates, coordinates);
  assert.equal(ticket.status, "Assigned to field team");
  assert.equal(ticket.eta, "Within 3 working days");
});

test("every supported issue has a department", () => {
  for (const issue of Object.keys(ISSUE_TYPES)) {
    const ticket = createTicket({ issue, ward: WARDS[0], area: WARDS[0].name });
    assert.equal(ticket.issue, issue);
    assert.ok(ticket.department);
  }
});
