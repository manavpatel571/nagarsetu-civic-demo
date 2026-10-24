import test from "node:test";
import assert from "node:assert/strict";
import { classifyLocally, createTicket, resolveWard } from "./demo-core.js";

test("resolves supported area aliases to a ward", () => {
  assert.equal(resolveWard("near Navrangpura").ward, "West Zone · Ward 12");
  assert.equal(resolveWard("Mani Nagar").name, "Maninagar");
});

test("classifies deterministic issue keywords", () => {
  assert.equal(classifyLocally("broken_streetlight.jpg", "Bodakdev").issue, "streetlight");
  assert.equal(classifyLocally("flooded-road.jpg", "Paldi").issue, "waterlogging");
});

test("creates a local ticket with a tracking id", () => {
  const ticket = createTicket({ issue: "pothole", ward: resolveWard("Paldi"), area: "Paldi" });
  assert.match(ticket.id, /^AMC-\d{4}-\d{6}$/);
  assert.equal(ticket.department, "Roads & Infrastructure");
});
