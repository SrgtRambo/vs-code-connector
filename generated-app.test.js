"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const scenarios = [
  { business: "Juniper Market", industry: "Retail", requirements: { problem: "Track inventory stock", goal: "Manage products and reorder supply", features: "Inventory and reorder thresholds" } },
  { business: "Summit Plumbing", industry: "Home Services", requirements: { problem: "Track customer inquiries", goal: "Manage customer follow-ups", features: "Customer and lead records" } },
  { business: "Cedar Grove Landscaping", industry: "Home Services", requirements: { problem: "Track service requests and crew jobs", goal: "Manage work orders", features: "Work queue and status tracking" } },
  { business: "Harborview Rentals", industry: "Real Estate", requirements: { problem: "Track rental customers and inquiries", goal: "Manage customer follow-ups", features: "Customer and lead records" } }
];
const inputIds = ["itemId", "title", "contact", "status", "dueDate", "notes", "quantity", "minimum"];
const generatorContext = {
  window: {}, URL, Blob, TextEncoder, TextDecoder, DataView, Uint8Array, ArrayBuffer, Date, setTimeout,
  document: { createElement: () => ({ style: {}, click() {}, remove() {} }), body: { appendChild() {} } }
};
vm.runInNewContext(fs.readFileSync(require.resolve("./generator.js"), "utf8"), generatorContext);

class Element {
  constructor(id) { this.id = id; this.value = ""; this.hidden = id === "storageNotice"; this.innerHTML = ""; this.textContent = ""; this.listeners = {}; this.open = false; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  reset() { for (const id of inputIds) this.document.getElementById(id).value = ""; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() {}
  dispatch(type, event = {}) { if (this.listeners[type]) this.listeners[type](event); }
}

function launchApp(project, storage, sampleData = []) {
  const files = project.files;
  const html = files["index.html"];
  const match = html.match(/window\.FORGE_APP=(\{.*?\});<\/script>/s);
  assert.ok(match, "generated app config exists");
  const elements = new Map();
  const document = { getElementById(id) { if (!elements.has(id)) { const element = new Element(id); element.document = document; elements.set(id, element); } return elements.get(id); } };
  document.getElementById("statusFilter").value = "all";
  const context = {
    document, window: { FORGE_APP: JSON.parse(match[1]), FORGE_SAMPLE_DATA: sampleData },
    localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value) },
    crypto: { randomUUID: () => "test-item-1" }, Date, console
  };
  vm.runInNewContext(files["js/app.js"], context);
  return { elements, context };
}

test("uses bundled examples and warns when browser storage is unavailable", () => {
  const project = generatorContext.window.ForgeGenerator.generate(scenarios[0]);
  const sampleData = [{ id: "sample-product", title: "Demo apples", contact: "Example supplier", status: "In stock", quantity: 12, minimum: 4, notes: "Fictional preview example" }];
  const app = launchApp(project, {
    getItem() { throw new Error("storage unavailable"); },
    setItem() { throw new Error("storage unavailable"); }
  }, sampleData);
  assert.match(app.elements.get("itemList").innerHTML, /Demo apples/);
  assert.equal(app.elements.get("storageNotice").hidden, false);
});

for (const scenario of scenarios) {
  test(`${scenario.business}: create, search, filter, edit, persist, reload, and delete`, () => {
    const project = generatorContext.window.ForgeGenerator.generate({ ...scenario, id: scenario.business.toLowerCase().replace(/\s+/g, "-") });
    const storage = new Map();
    let app = launchApp(project, storage);
    const e = app.elements;
    e.get("newItem").dispatch("click");
    assert.equal(e.get("itemDialog").open, true);
    e.get("title").value = "Test record <script>alert(1)</script>";
    e.get("contact").value = "Sample owner";
    e.get("status").value = app.context.window.FORGE_APP.customerApp ? "Contacted" : "In progress";
    e.get("dueDate").value = "2026-11-10";
    e.get("notes").value = "First version";
    if (app.context.window.FORGE_APP.inventoryApp) { e.get("quantity").value = "4"; e.get("minimum").value = "5"; }
    e.get("itemForm").dispatch("submit", { preventDefault() {} });
    const key = "forge-generated:" + app.context.window.FORGE_APP.id;
    let records = JSON.parse(storage.get(key));
    assert.equal(records.length, 1);
    if (app.context.window.FORGE_APP.inventoryApp) assert.equal(records[0].status, "Reorder");
    assert.match(e.get("itemList").innerHTML, /&lt;script&gt;/);
    assert.doesNotMatch(e.get("itemList").innerHTML, /<script>alert/);

    e.get("search").value = "Test record";
    e.get("search").dispatch("input");
    assert.match(e.get("itemList").innerHTML, /Test record/);
    e.get("statusFilter").value = "No such status";
    e.get("statusFilter").dispatch("change");
    assert.equal(e.get("itemList").innerHTML, "");
    e.get("statusFilter").value = "all";
    e.get("statusFilter").dispatch("change");

    const id = records[0].id;
    e.get("itemList").dispatch("click", { target: { closest: (selector) => selector === "[data-edit]" ? { dataset: { edit: id } } : null } });
    assert.equal(e.get("itemDialog").open, true);
    assert.equal(e.get("itemId").value, id);
    e.get("notes").value = "Edited and saved";
    e.get("itemForm").dispatch("submit", { preventDefault() {} });
    records = JSON.parse(storage.get(key));
    assert.equal(records.length, 1);
    assert.equal(records[0].notes, "Edited and saved");

    app = launchApp(project, storage);
    assert.match(app.elements.get("itemList").innerHTML, /Edited and saved/);
    app.elements.get("itemList").dispatch("click", { target: { closest: (selector) => selector === "[data-delete]" ? { dataset: { delete: id } } : null } });
    assert.deepEqual(JSON.parse(storage.get(key)), []);
    assert.equal(app.elements.get("emptyState").hidden, false);
  });
}
