"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { window: {} };
for (const file of ["architect.js", "generator.js", "testing.js", "sample-projects.js"]) {
  vm.runInNewContext(fs.readFileSync(require.resolve("./" + file), "utf8"), context);
}

test("provides four distinct, fully tested offline Discovery sample projects", () => {
  const samples = context.window.ForgeSampleProjects;
  assert.equal(samples.length, 4);
  assert.equal(new Set(samples.map((sample) => sample.id)).size, 4);
  assert.equal(new Set(samples.map((sample) => sample.business)).size, 4);
  const applicationTypes = new Set();
  for (const sample of samples) {
    const architecture = context.window.buildArchitecture(sample);
    const generated = context.window.ForgeGenerator.generate({
      id: sample.id,
      business: sample.business,
      industry: sample.industry,
      requirements: sample,
      architecture
    });
    applicationTypes.add(generated.project.applicationType);
    const results = context.window.ForgeTests.run(generated.files);
    assert.ok(results.length >= 8, sample.business);
    assert.ok(results.every((result) => result.passed), sample.business + ": " + JSON.stringify(results.filter((result) => !result.passed)));
    assert.equal(generated.project.name, sample.business);
    assert.ok(architecture.report.includes(sample.problem));
    assert.ok(architecture.report.includes(sample.workflow));
  }
  assert.ok(applicationTypes.has("inventory-manager"));
  assert.ok(applicationTypes.has("customer-manager"));
  assert.ok(applicationTypes.has("work-queue"));
});

test("keeps sample requirements specific to each business workflow", () => {
  const [inventory, plumbing, landscaping, catering] = context.window.ForgeSampleProjects;
  assert.match(inventory.features, /reorder thresholds/i);
  assert.match(plumbing.workflow, /technician/i);
  assert.match(landscaping.features, /crew ownership/i);
  assert.match(catering.workflow, /event inquiry/i);
});
