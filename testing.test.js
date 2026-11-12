"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve("./generator.js"), "utf8"), context);
vm.runInNewContext(fs.readFileSync(require.resolve("./testing.js"), "utf8"), context);

test("passes local runtime checks for the offline template application", () => {
  const project = context.window.ForgeGenerator.generate({
    business: "Test Project",
    requirements: { problem: "Track work", goal: "Complete jobs" },
    architecture: { workflows: ["Create work item → complete"] }
  });
  const results = context.window.ForgeTests.run(project.files);
  const runtime = results.find((result) => result.name === "Local-only generated runtime");
  assert.equal(runtime.passed, true);
});

test("accepts either quote style for a generated form submit handler", () => {
  const project = context.window.ForgeGenerator.generate({
    business: "Test Project",
    requirements: { problem: "Track work", goal: "Complete jobs" },
    architecture: { workflows: ["Create work item → complete"] }
  });
  project.files["js/app.js"] = project.files["js/app.js"].replace('addEventListener("submit"', "addEventListener('submit'");
  const result = context.window.ForgeTests.run(project.files).find((item) => item.name === "CRUD workflow hooks");
  assert.equal(result.passed, true);
});

test("flags incomplete generated stylesheets instead of passing them silently", () => {
  const project = context.window.ForgeGenerator.generate({
    business: "Broken Styles",
    requirements: { problem: "Track work", goal: "Complete jobs" },
    architecture: { workflows: ["Create work item → complete"] }
  });
  project.files["css/styles.css"] = "body { color: #123;";
  const result = context.window.ForgeTests.run(project.files).find((item) => item.name === "Stylesheet structure");
  assert.equal(result.passed, false);
  assert.match(result.detail, /incomplete or unbalanced/);
});

test("reports parser details for invalid generated application JavaScript", () => {
  const project = context.window.ForgeGenerator.generate({
    business: "Broken Script",
    requirements: { problem: "Track work", goal: "Complete jobs" },
    architecture: { workflows: ["Create work item → complete"] }
  });
  project.files["js/app.js"] += "\nfunction unfinished(";
  const result = context.window.ForgeTests.run(project.files).find((item) => item.name === "Application JavaScript syntax");
  assert.equal(result.passed, false);
  assert.match(result.detail, /js\/app\.js:.*(?:Unexpected|end of input)/i);
});

test("requires generated AI pages and behavior to share the documented interface contract", () => {
  const project = context.window.ForgeGenerator.fromAI({
    "index.html": '<!doctype html><html><head></head><body><main><h1>Scheduling</h1><form data-app-form><input name="batchLabel" required><select name="firingStage" data-status-filter></select><input data-search><button data-new-record></button><section data-record-list></section></form></main></body></html>',
    "css/styles.css": "body { color: #123; }",
    "js/app.js": 'function loadData(){return JSON.parse(localStorage.getItem("items")||"[]")} const records=loadData(); const form = document.querySelector("[data-app-form]"); const list = document.querySelector("[data-record-list]"); const search = document.querySelector("[data-search]"); const filter = document.querySelector("[data-status-filter]"); const add = document.querySelector("[data-new-record]"); form.addEventListener("submit", save); localStorage.setItem("items", "[]"); list.innerHTML = "<button data-edit=\\"1\\"></button><button data-delete=\\"1\\"></button>";',
    "data/sample-data.js": "window.FORGE_SAMPLE_DATA = [];",
    "README.md": "# Custom app"
  }, { business: "Scheduling", architecture: { workflows: ["Create and update appointments"] } });
  const contract = context.window.ForgeTests.run(project.files).find((result) => result.name === "Custom application interface contract");
  assert.equal(contract.passed, true);
});

test("flags broken custom app startup and sample-filled entry fields", () => {
  const project = context.window.ForgeGenerator.fromAI({
    "index.html": '<!doctype html><html><head></head><body><main><h1>Kiln Studio</h1><form><input value="SJ-2023-Azure" onclick="save()"><textarea>sample note</textarea></form></main></body></html>',
    "css/styles.css": "body { color: #123; }",
    "js/app.js": 'function loadData(){return JSON.parse(localStorage.getItem("items")||"[]")} function App(){let items=[];document.querySelector("form").addEventListener("submit", save);localStorage.setItem("items","[]")}',
    "data/sample-data.js": "window.FORGE_SAMPLE_DATA = [];",
    "README.md": "# Custom app"
  }, { business: "Kiln Studio", architecture: { workflows: ["Intake → schedule firing → pickup"] } });
  const interactions = context.window.ForgeTests.run(project.files).find((result) => result.name === "Custom application interactions");
  assert.equal(interactions.passed, false);
  assert.match(interactions.detail, /Inline event handlers/);
});

test("does not require generic title and status fields in a custom AI app", () => {
  const project = context.window.ForgeGenerator.fromAI({
    "index.html": '<!doctype html><html><head></head><body><main><h1>Kiln Studio</h1><form data-app-form><input name="kilnLoadName" required><select name="firingPhase" data-status-filter></select><input data-search><button data-new-record></button><section data-record-list></section></form></main></body></html>',
    "css/styles.css": "body { color: #123; }",
    "js/app.js": 'function loadData(){return JSON.parse(localStorage.getItem("loads")||"[]")} let loads=loadData(); const form=document.querySelector("[data-app-form]"),list=document.querySelector("[data-record-list]"),search=document.querySelector("[data-search]"),filter=document.querySelector("[data-status-filter]"),add=document.querySelector("[data-new-record]");form.addEventListener("submit",save);localStorage.setItem("loads","[]");list.innerHTML="<button data-edit=\\"1\\"></button><button data-delete=\\"1\\"></button>";',
    "data/sample-data.js": "window.FORGE_SAMPLE_DATA = [];",
    "README.md": "# Custom app"
  }, { business: "Kiln Studio", architecture: { workflows: ["Intake → schedule firing → pickup"] } });
  const contract = context.window.ForgeTests.run(project.files).find((result) => result.name === "Custom application interface contract");
  assert.equal(contract.passed, true);
});

test("flags remote assets, network APIs, dynamic code, and remote form actions", () => {
  const project = context.window.ForgeGenerator.generate({
    business: "Test Project",
    requirements: { problem: "Track work", goal: "Complete jobs" },
    architecture: { workflows: ["Create work item → complete"] }
  });
  const cases = [
    { path: "index.html", source: '<script src="https://example.test/app.js"></script>' },
    { path: "index.html", source: '<form action="//example.test/submit">' },
    { path: "css/styles.css", source: '@import url("https://example.test/style.css");' },
    { path: "js/app.js", source: "fetch('https://example.test');" },
    { path: "js/app.js", source: "new Function('return 1');" }
  ];
  for (const item of cases) {
    const files = { ...project.files, [item.path]: project.files[item.path] + "\n" + item.source };
    const result = context.window.ForgeTests.run(files).find((entry) => entry.name === "Local-only generated runtime");
    assert.equal(result.passed, false, item.source);
  }
});
