"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve("./architect.js"), "utf8"), context);
const cases = [
  ["Stock intake for Juniper Market", "Retail", "Products are recorded as stock arrives", "Avoid running out of supplies", "Inventory and reorder thresholds", "inventory"],
  ["Northstar Foods", "Food and Hospitality", "Count products and compare low stock", "Prepare weekly replenishment", "Product quantity and supplier", "inventory"],
  ["Mile High Outfitters", "Retail", "Track product stock levels", "Flag items below minimum supply", "Stock and supply alerts", "inventory"],
  ["Riverbend Hardware", "Retail", "Track supplier deliveries and item quantities", "Reorder supplies on time", "Product inventory", "inventory"],
  ["Summit Plumbing", "Home Services", "Follow up with customer inquiries", "Track customers from new lead to appointment", "Customer pipeline", "customer"],
  ["BrightPath Therapy", "Healthcare", "Remember client follow-ups", "Manage client appointment requests", "Client records and lead status", "customer"],
  ["Harborview Rentals", "Real Estate", "Manage renter inquiries", "Track each rental lead and next contact", "Customer and inquiry list", "customer"],
  ["Pinecone Catering", "Food and Hospitality", "Track bookings from new customer requests", "Follow up on customer events", "Booking pipeline", "customer"],
  ["Cedar Grove Landscaping", "Home Services", "Track crew work orders", "Manage service requests from assignment to completion", "Job queue and progress status", "work"],
  ["Peak Home Repair", "Home Services", "Coordinate repair jobs", "Keep work moving to completion", "Assigned job queue", "work"],
  ["Studio North", "Professional Services", "Track internal tasks", "Organize projects and due dates", "Team work queue", "work"],
  ["Valley Fleet Service", "Professional Services", "Schedule equipment maintenance", "Track work orders and completion", "Maintenance queue", "work"]
];

test("tailors 12 business blueprints to inventory, customer, and work-queue needs", () => {
  for (const [business, industry, problem, goal, features, expected] of cases) {
    const blueprint = context.window.buildArchitecture({ business, industry, problem, goal, features });
    const entities = blueprint.entities.map((item) => item.name);
    if (expected === "inventory") {
      assert.ok(blueprint.workflows.some((workflow) => /incoming stock|reorder threshold/i.test(workflow)), business);
      assert.ok(entities.includes("InventoryItem"), business);
    } else if (expected === "customer") {
      assert.ok(blueprint.workflows.some((workflow) => /customer request/i.test(workflow)), business);
      assert.ok(entities.includes("Customer"), business);
    } else {
      assert.ok(blueprint.workflows.some((workflow) => /work item/i.test(workflow)), business);
      assert.ok(!entities.includes("Customer") && !entities.includes("InventoryItem"), business);
    }
  }
});

test("does not treat ordinary service requests as customer management", () => {
  const blueprint = context.window.buildArchitecture({ business: "Cedar Grove", problem: "Track landscaping service requests", goal: "Assign jobs to crews", features: "Work queue" });
  assert.ok(blueprint.workflows[0].includes("work item"));
  assert.ok(!blueprint.entities.some((item) => item.name === "Customer"));
});

test("does not misclassify scheduled maintenance as customer follow-up", () => {
  const blueprint = context.window.buildArchitecture({ business: "Valley Fleet", problem: "Schedule equipment maintenance", goal: "Track work orders and completion", features: "Maintenance queue" });
  assert.ok(blueprint.workflows.some((workflow) => workflow.includes("work item")));
  assert.ok(!blueprint.workflows.some((workflow) => workflow.includes("follow-up")));
  assert.ok(!blueprint.features.includes("Follow-up tracking with due dates"));
});

test("keeps approved AI screens, entities, and workflows instead of adding generic work-queue defaults", () => {
  const custom = {
    overview: "Coordinate community theater productions.",
    features: ["Cast availability calendar", "Conflict detection", "Rehearsal planning"],
    modules: ["Production planning", "Cast scheduling"],
    screens: [{ name: "Production Calendar", purpose: "Resolve cast and venue availability." }],
    navigation: ["Calendar", "Productions"],
    workflows: ["Select a production → assign cast → identify conflicts → publish rehearsal times."],
    entities: [{ name: "Rehearsal", fields: ["production", "performer", "venue", "startsAt"], relations: "A production has many rehearsals." }],
    validation: ["A rehearsal must have a production, performer, venue, and start time."],
    visualDirection: {
      style: "Playful editorial theater calendar.", palette: ["#f5eee4", "#293b35", "#db754e", "#d9b866"],
      typography: "Expressive system serif headings with clear sans-serif labels.",
      composition: "A rehearsal week grid with conflict markers at center.",
      signature: "Curtain-like color bands distinguish productions."
    },
    questions: []
  };
  const blueprint = context.window.buildArchitecture({
    business: "Redwood Theater", problem: "Avoid rehearsal conflicts", goal: "Coordinate schedules",
    aiArchitecture: custom
  });
  assert.deepEqual(Array.from(blueprint.screens.map((screen) => screen.name)), ["Production Calendar"]);
  assert.deepEqual(Array.from(blueprint.entities.map((entity) => entity.name)), ["Rehearsal"]);
  assert.deepEqual(Array.from(blueprint.workflows), custom.workflows);
  assert.equal(blueprint.visualDirection.signature, custom.visualDirection.signature);
  assert.ok(blueprint.report.includes("VISUAL DIRECTION"));
  assert.ok(!blueprint.features.includes("Create and edit work items"));
  assert.ok(!blueprint.modules.includes("Work item management"));
});
