"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
let archiveBlob;
let archiveId = 0;
const context = {
  window: {}, Blob, TextEncoder, TextDecoder, DataView, Uint8Array, ArrayBuffer, Date, DecompressionStream, Response,
  setTimeout: () => 0,
  URL: { createObjectURL(blob) { archiveBlob = blob; return "blob:test-" + (++archiveId); }, revokeObjectURL() {} },
  document: { createElement: () => ({ style: {}, click() {}, remove() {} }), body: { appendChild() {} } }
};
vm.runInNewContext(fs.readFileSync(require.resolve("./generator.js"), "utf8"), context);
const generator = context.window.ForgeGenerator;
const generated = generator.generate({
  id: "test-project", business: "Test Project", industry: "Other",
  requirements: { problem: "Track work", goal: "Complete tasks", features: "Work queue" },
  architecture: { features: ["Search"] }
});
function zipFile(blob = archiveBlob) { return { arrayBuffer: () => blob.arrayBuffer() }; }

class FakeFileHandle {
  constructor() { this.content = ""; }
  async createWritable() {
    return {
      write: async (content) => { this.content = content; },
      close: async () => {}
    };
  }
  async getFile() { return { text: async () => this.content }; }
}

class FakeDirectoryHandle {
  constructor(name = "") { this.name = name; this.directories = new Map(); this.files = new Map(); }
  async getDirectoryHandle(name, options = {}) {
    if (!this.directories.has(name)) {
      if (!options.create) throw Object.assign(new Error("Not found"), { name: "NotFoundError" });
      this.directories.set(name, new FakeDirectoryHandle(name));
    }
    return this.directories.get(name);
  }
  async getFileHandle(name, options = {}) {
    if (!this.files.has(name)) {
      if (!options.create) throw Object.assign(new Error("Not found"), { name: "NotFoundError" });
      this.files.set(name, new FakeFileHandle());
    }
    return this.files.get(name);
  }
}

test("saves generated project files after a separate folder-picker action", async () => {
  const selectedFolder = new FakeDirectoryHandle("Outputs");
  let pickerCalls = 0;
  context.window.showDirectoryPicker = async () => {
    pickerCalls++;
    return selectedFolder;
  };
  const folder = await generator.createFolder(generated.project);
  await generator.writeProject(folder, generated.files);
  const manifest = JSON.parse(generated.files["project.json"]);
  const snapshotPath = ".forge-history/v1";
  manifest.versions[0].snapshotPath = snapshotPath;
  manifest.version = 1;
  const files = { ...generated.files, "project.json": JSON.stringify(manifest) };
  await generator.writeProject(folder, { "project.json": files["project.json"] });
  await generator.writeSnapshot(folder, snapshotPath, files);
  const verified = await generator.verifyProject(folder, files);
  assert.equal(pickerCalls, 1);
  assert.equal(folder.name, generated.project.slug);
  assert.equal(verified.passed, true);
  assert.match(verified.detail, /project files and 1 version snapshots/);
});

test("builds a project manifest around actual AI source files", () => {
  const sourceFiles = {
    "index.html": "<!doctype html><html></html>",
    "css/styles.css": "body{}",
    "js/app.js": "render();",
    "data/sample-data.js": "window.FORGE_SAMPLE_DATA = [];",
    "README.md": "# Custom app"
  };
  const result = generator.fromAI(sourceFiles, {
    id: "custom-project",
    business: "Custom Business",
    requirements: { problem: "Track jobs" },
    architecture: { overview: "A custom app" }
  });
  assert.equal(result.project.applicationType, "custom-ai-generated");
  assert.match(result.project.generator, /local model-generated source/);
  assert.deepEqual(Array.from(Object.keys(result.files)).sort(), Array.from(generator.paths).sort());
  assert.equal(result.files["js/app.js"], sourceFiles["js/app.js"]);
  assert.deepEqual(JSON.parse(result.files["project.json"]).requirements, { problem: "Track jobs" });
});

test("rejects incomplete or unsupported AI source file maps", () => {
  assert.throws(() => generator.fromAI({ "index.html": "<html></html>" }, {}), /exactly the five supported/);
  assert.throws(() => generator.fromAI({
    "index.html": "<html></html>",
    "css/styles.css": "body{}",
    "js/app.js": "run();",
    "data/sample-data.js": "[]",
    "README.md": "# App",
    "project.json": "{}"
  }, {}), /exactly the five supported/);
});

test("exports and imports a complete Forge project and its restorable snapshot", async () => {
  const archiveFiles = { ...generated.files };
  for (const path of generator.paths) archiveFiles[".forge-history/v1/" + path] = generated.files[path];
  generator.downloadProjectZip(archiveFiles, generated.project.name);
  const reopened = await generator.readProjectZip(zipFile());
  assert.equal(reopened.project.name, "Test Project");
  assert.deepEqual(Array.from(Object.keys(reopened.files)).sort(), Array.from(generator.paths).sort());
  assert.deepEqual(Array.from(Object.keys(reopened.snapshots)).sort(), Array.from(generator.paths, (path) => ".forge-history/v1/" + path).sort());
});

test("adds clearly labeled fictional records to empty app previews only", () => {
  const project = generator.generate({
    id: "preview-demo",
    business: "Preview Demo",
    industry: "Retail",
    requirements: { problem: "Track product inventory", goal: "Manage product stock", features: "Inventory and reorder levels" }
  });
  const preview = generator.previewDocument(project.files);
  assert.match(preview, /Fictional preview example/);
  assert.match(preview, /Example low-stock product/);
  assert.match(preview, /Preview-only fictional examples are shown/);
  assert.match(project.files["data/sample-data.js"], /window\.FORGE_SAMPLE_DATA = \[\];/);
});

test("provides isolated browser storage and recovery styling for incomplete AI previews", () => {
  const project = generator.fromAI({
    "index.html": '<!doctype html><html><head><link rel="stylesheet" href="css/styles.css"><script src="data/sample-data.js"></script></head><body><main><h1>Preview</h1></main><script src="js/app.js"></script></body></html>',
    "css/styles.css": "body { font-family: system-ui;",
    "js/app.js": 'document.addEventListener("DOMContentLoaded",()=>localStorage.getItem("items"));',
    "data/sample-data.js": "window.FORGE_SAMPLE_DATA = [];",
    "README.md": "# Preview"
  }, { business: "Preview Test" });
  const preview = generator.previewDocument(project.files);
  assert.match(preview, /Object\.defineProperty\(window,"localStorage"/);
  assert.match(preview, /Preview recovery mode: the generated stylesheet is incomplete/);
  assert.match(preview, /background:#f8fafc/);
  assert.doesNotMatch(preview, /<link rel="stylesheet" href="css\/styles\.css">/);
  assert.match(preview, /localStorage\.getItem/);
  assert.equal(generator.stylesheetIsBalanced("body { color: #123; }"), true);
  assert.equal(generator.stylesheetIsBalanced("body { color: #123;"), false);
});

test("rejects a ZIP with a changed file checksum", async () => {
  generator.downloadProjectZip(generated.files, generated.project.name);
  const bytes = new Uint8Array(await archiveBlob.arrayBuffer());
  const marker = new TextEncoder().encode("A working local work queue generated by Forge AI.");
  let start = -1;
  outer: for (let offset = 0; offset <= bytes.length - marker.length; offset++) {
    for (let index = 0; index < marker.length; index++) if (bytes[offset + index] !== marker[index]) continue outer;
    start = offset; break;
  }
  assert.notEqual(start, -1);
  bytes[start] ^= 1;
  await assert.rejects(generator.readProjectZip(zipFile(new Blob([bytes]))), /integrity check/);
});

test("rejects unsafe ZIP paths before opening project contents", async () => {
  generator.downloadProjectZip(generated.files, generated.project.name);
  const bytes = new Uint8Array(await archiveBlob.arrayBuffer());
  const original = new TextEncoder().encode("generated-projects/test-project/");
  const traversal = new TextEncoder().encode("generated-projects/../........./");
  assert.equal(original.length, traversal.length);
  let replacements = 0;
  for (let offset = 0; offset <= bytes.length - original.length; offset++) {
    let match = true;
    for (let index = 0; index < original.length; index++) if (bytes[offset + index] !== original[index]) { match = false; break; }
    if (match) { bytes.set(traversal, offset); replacements++; offset += original.length - 1; }
  }
  assert.ok(replacements >= generator.paths.length * 2);
  await assert.rejects(generator.readProjectZip(zipFile(new Blob([bytes]))), /unsafe file path/);
});
