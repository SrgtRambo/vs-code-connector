"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function createProvider(reply) {
  const values = new Map();
  const calls = [];
  const timeouts = [];
  const localStorage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const context = {
    window: { location: { protocol: "http:", hostname: "127.0.0.1", origin: "http://127.0.0.1:8765" } },
    localStorage, URL, AbortController,
    setTimeout: (callback, timeout) => { timeouts.push(timeout); return setTimeout(callback, timeout); },
    clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options });
      const currentReply = Array.isArray(reply) ? reply[Math.min(calls.length - 1, reply.length - 1)] : reply;
      const body = currentReply && Object.prototype.hasOwnProperty.call(currentReply, "rawContent")
        ? { message: { content: currentReply.rawContent } }
        : currentReply && currentReply.doneReason
          ? { done_reason: currentReply.doneReason, message: { content: JSON.stringify(currentReply.content) } }
          : { message: { content: JSON.stringify(currentReply) } };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("./ai-provider.js"), "utf8"), context);
  return { provider: context.window.ForgeAIProvider, calls, timeouts };
}

const architecture = {
  overview: "A tailored first version.", features: ["Search"], modules: ["Records"],
  screens: [{ name: "Queue", purpose: "Track work." }], navigation: ["Queue"],
  workflows: ["Create → update → finish."], entities: [{ name: "WorkItem", fields: ["id", "title"], relations: "None" }],
  validation: ["The primary business field is required."],
  visualDirection: {
    style: "Warm editorial workshop.", palette: ["#f5f1e8", "#274c3b", "#d18b45", "#202923"],
    typography: "System serif headings and sans-serif controls.", composition: "A focused intake-to-pickup workspace.",
    signature: "A kiln-temperature dial motif."
  },
  report: "DO NOT SEND THIS REDUNDANT REPORT",
  questions: []
};
const generatedFiles = [
  { path: "index.html", content: '<!doctype html><html><head><link rel="stylesheet" href="css/styles.css"><script src="data/sample-data.js"></script></head><body><main><h1>Test Co</h1><form><label>Batch label<input name="batchLabel" required></label><button type="submit">Add batch</button></form><section aria-label="Firing stages"></section></main><script src="js/app.js"></script></body></html>' },
  { path: "css/styles.css", content: ':root { --forge-brand: #274c3b; --forge-accent: #d18b45; --forge-surface: #f5f1e8; --forge-ink: #202923; } body { color: #202923; background: #f5f1e8; border-color: #274c3b; accent-color: #d18b45; }' },
  { path: "js/app.js", content: 'function loadData(){return JSON.parse(localStorage.getItem("records")||"[]")} let records=loadData(); const form=document.querySelector("[data-app-form]"); localStorage.setItem("records","[]"); form.addEventListener("submit",save);' },
  { path: "data/sample-data.js", content: "window.FORGE_SAMPLE_DATA = [];" },
  { path: "README.md", content: "# Custom application" }
];
const generatedCoreReplies = generatedFiles.slice(0, 3).map((file) => ({ content: file.content }));

test("sends structured architecture requests through Forge's local proxy", async () => {
  const { provider, calls, timeouts } = createProvider(architecture);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  const result = await provider.requestArchitecture({ business: "Test Co", problem: "Missed work" });
  assert.equal(result.overview, architecture.overview);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8765/api/ollama/chat");
  const request = JSON.parse(calls[0].options.body);
  assert.equal(request.stream, false);
  assert.equal(request.model, "qwen3.5:4b");
  assert.equal(typeof request.format, "object");
  assert.equal(request.maxOutputTokens, 2048);
  assert.ok(request.format.required.includes("visualDirection"));
  assert.match(request.messages[0].content, /distinctive visual direction/);
  assert.equal(timeouts[0], 300000);
});

test("rejects AI architecture without a complete project-specific visual direction", async () => {
  const { provider } = createProvider({ ...architecture, visualDirection: { ...architecture.visualDirection, palette: ["warm", "#fff"] } });
  provider.configure({ enabled: true });
  await assert.rejects(provider.requestArchitecture({ business: "Bad palette" }), /invalid visual direction/i);
  const duplicatePalette = ["#f5f1e8", "#F5F1E8", "#d18b45", "#202923"];
  const repeated = createProvider({ ...architecture, visualDirection: { ...architecture.visualDirection, palette: duplicatePalette } });
  repeated.provider.configure({ enabled: true });
  await assert.rejects(repeated.provider.requestArchitecture({ business: "Repeated palette" }), /invalid visual direction/i);
});

test("keeps the rule-based fallback available when AI is disabled", async () => {
  const { provider, calls } = createProvider(architecture);
  assert.equal(await provider.requestArchitecture({ business: "Offline" }), null);
  assert.equal(calls.length, 0);
});

test("rejects malformed local model architecture output", async () => {
  const { provider } = createProvider({ features: [], modules: [] });
  provider.configure({ enabled: true });
  await assert.rejects(provider.requestArchitecture({ business: "Bad Model" }), /invalid architecture overview|invalid screens|invalid navigation/i);
});

test("retries truncated structured architecture once within the local proxy token cap", async () => {
  const { provider, calls } = createProvider([{ doneReason: "length", content: architecture }, architecture]);
  provider.configure({ enabled: true });
  const result = await provider.requestArchitecture({ business: "Test Co" });
  assert.equal(result.overview, architecture.overview);
  assert.deepEqual(calls.map(({ options }) => JSON.parse(options.body).maxOutputTokens), [2048, 4096]);
  assert.match(JSON.parse(calls[1].options.body).messages[0].content, /previous response was incomplete or invalid/i);
});

test("retries incomplete architecture JSON once and reports a useful final error", async () => {
  const { provider, calls } = createProvider([{ rawContent: '{"overview":' }, { rawContent: '{"overview":' }]);
  provider.configure({ enabled: true });
  await assert.rejects(provider.requestArchitecture({ business: "Test Co" }), /incomplete architecture JSON/i);
  assert.equal(calls.length, 2);
});

test("generates and validates custom source in bounded, resumable file stages", async () => {
  const { provider, calls, timeouts } = createProvider(generatedCoreReplies);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  const progress = [];
  const files = await provider.requestProjectFiles({ business: "Test Co" }, architecture, undefined, (event) => progress.push(event));
  assert.deepEqual(Object.keys(files).sort(), generatedFiles.map((file) => file.path).sort());
  assert.equal(files["index.html"], generatedFiles[0].content);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(({ options }) => JSON.parse(options.body).maxOutputTokens), [2048, 2048, 3072]);
  assert.match(JSON.parse(calls[2].options.body).messages[0].content, /genuinely custom/);
  const jsPrompt = JSON.parse(calls[2].options.body).messages[1].content;
  assert.match(jsPrompt, /HTML to implement exactly/);
  assert.equal((jsPrompt.match(/<!doctype html>/gi) || []).length, 1);
  assert.match(JSON.parse(calls[1].options.body).messages[0].content, /approved visualDirection/);
  assert.ok(calls.every(({ options }) => !options.body.includes("DO NOT SEND THIS REDUNDANT REPORT")));
  assert.ok(calls.every(({ options }) => JSON.parse(options.body).messages.every((message) => message.content.length <= 22000)));
  assert.equal(progress.filter((event) => event.status === "completed").length, 3);
  assert.equal(timeouts.length, 3);
  assert.ok(timeouts[0] <= 600000 && timeouts[0] > 599000);
});

test("resumes source generation from saved, completed files", async () => {
  const { provider, calls } = createProvider([generatedCoreReplies[2]]);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  const files = await provider.requestProjectFiles({ business: "Test Co" }, architecture, undefined, undefined, {
    "index.html": generatedFiles[0].content,
    "css/styles.css": generatedFiles[1].content
  });
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].options.body).messages[0].content.includes("js/app.js"), true);
  assert.equal(files["index.html"], generatedFiles[0].content);
  assert.equal(files["js/app.js"], generatedFiles[2].content);
});

test("preserves completed file stages when the next model response fails", async () => {
  const { provider, calls } = createProvider([...generatedCoreReplies.slice(0, 2), { content: "" }]);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  let savedFiles = {};
  await assert.rejects(provider.requestProjectFiles({ business: "Test Co" }, architecture, undefined, (event) => {
    if (event.status === "completed") savedFiles = event.files;
  }), /Could not create js\/app\.js/);
  assert.equal(calls.length, 3);
  assert.equal(savedFiles["index.html"], generatedFiles[0].content);
  assert.equal(savedFiles["css/styles.css"], generatedFiles[1].content);
  assert.equal(typeof savedFiles["js/app.js"], "undefined");
});

test("explains truncated structured output and preserves earlier generated files", async () => {
  const { provider } = createProvider([generatedCoreReplies[0], { rawContent: '{"content":"unfinished' }]);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  let savedFiles = {};
  await assert.rejects(provider.requestProjectFiles({ business: "Test Co" }, architecture, undefined, (event) => {
    if (event.status === "completed") savedFiles = event.files;
  }), /incomplete JSON for css\/styles\.css/);
  assert.equal(savedFiles["index.html"], generatedFiles[0].content);
});

test("reports when Ollama stops at a configured generation token limit", async () => {
  const { provider } = createProvider([{ doneReason: "length", content: { content: "partial" } }]);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  await assert.rejects(provider.requestProjectFiles({ business: "Test Co" }, architecture), /reached the output limit for index\.html/);
});

test("retries a truncated file once with a larger output limit", async () => {
  const replies = [generatedCoreReplies[0], { doneReason: "length", content: { content: "partial" } }, generatedCoreReplies[1], generatedCoreReplies[2]];
  const { provider, calls } = createProvider(replies);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  const progress = [];
  const files = await provider.requestProjectFiles({ business: "Test Co" }, architecture, undefined, (event) => progress.push(event));
  assert.deepEqual(calls.map(({ options }) => JSON.parse(options.body).maxOutputTokens), [2048, 2048, 4096, 3072]);
  const retry = progress.find((event) => event.status === "retrying" && event.path === "css/styles.css");
  assert.equal(retry.strategy, "concise");
  assert.match(JSON.parse(calls[2].options.body).messages[0].content, /under 3000 characters/);
  assert.match(JSON.parse(calls[2].options.body).messages[1].content, /Firing stages/);
  assert.equal(files["css/styles.css"], generatedFiles[1].content);
});

test("retries structurally incomplete CSS even when Ollama returns valid JSON", async () => {
  const replies = [
    generatedCoreReplies[0],
    { content: "body { color: #123;" },
    generatedCoreReplies[1],
    generatedCoreReplies[2]
  ];
  const { provider, calls } = createProvider(replies);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  const files = await provider.requestProjectFiles({ business: "Test Co" }, architecture);
  assert.equal(files["css/styles.css"], generatedFiles[1].content);
  assert.deepEqual(calls.map(({ options }) => JSON.parse(options.body).maxOutputTokens), [2048, 2048, 4096, 3072]);
  assert.match(JSON.parse(calls[2].options.body).messages[0].content, /balance every brace/i);
});

test("retries custom HTML that does not identify the approved business", async () => {
  const replies = [
    { content: "<!doctype html><html><head></head><body><main><h1>Other Demo</h1></main></body></html>" },
    generatedCoreReplies[0],
    generatedCoreReplies[1],
    generatedCoreReplies[2]
  ];
  const { provider, calls } = createProvider(replies);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  const files = await provider.requestProjectFiles({ business: "Test Co" }, architecture);
  assert.equal(files["index.html"], generatedFiles[0].content);
  assert.equal(calls.length, 4);
  assert.match(JSON.parse(calls[1].options.body).messages[0].content, /does not identify the approved business application/i);
});

test("retries custom HTML that pre-fills a new-entry field", async () => {
  const prefilledHTML = generatedFiles[0].content.replace(
    '<input name="batchLabel" required>',
    '<input name="batchLabel" required value="SJ-2023-Azure">'
  );
  const { provider, calls } = createProvider([{ content: prefilledHTML }, ...generatedCoreReplies]);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  const files = await provider.requestProjectFiles({ business: "Test Co" }, architecture);
  assert.equal(files["index.html"], generatedFiles[0].content);
  assert.equal(calls.length, 4);
  assert.match(JSON.parse(calls[1].options.body).messages[0].content, /new user-entry fields must start empty/i);
  assert.match(JSON.parse(calls[1].options.body).messages[0].content, /examples in placeholders/i);
});

test("retries custom HTML that pre-fills a textarea", async () => {
  const prefilledHTML = generatedFiles[0].content.replace("</form>", "<textarea>Example repair notes</textarea></form>");
  const { provider, calls } = createProvider([{ content: prefilledHTML }, ...generatedCoreReplies]);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  const files = await provider.requestProjectFiles({ business: "Test Co" }, architecture);
  assert.equal(files["index.html"], generatedFiles[0].content);
  assert.equal(calls.length, 4);
  assert.match(JSON.parse(calls[1].options.body).messages[0].content, /remove all text between each <textarea>/i);
  assert.match(JSON.parse(calls[0].options.body).messages[0].content, /Every textarea must be exactly empty/i);
});

test("retries custom JavaScript that does not hydrate state before listeners", async () => {
  const unhydratedJS = generatedFiles[2].content.replace("let records=loadData();", "let records=[];");
  const { provider, calls } = createProvider([...generatedCoreReplies.slice(0, 2), { content: unhydratedJS }, generatedCoreReplies[2]]);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  const files = await provider.requestProjectFiles({ business: "Test Co" }, architecture);
  assert.equal(files["js/app.js"], generatedFiles[2].content);
  assert.equal(calls.length, 4);
  assert.match(JSON.parse(calls[3].options.body).messages[0].content, /top-level `let records = loadData\(\)`/i);
  assert.match(JSON.parse(calls[3].options.body).messages[0].content, /primary domain state/i);
});

test("retries custom JavaScript that uses inline event handlers", async () => {
  const inlineJS = generatedFiles[2].content + '\nbutton.onclick = save;';
  const { provider, calls } = createProvider([...generatedCoreReplies.slice(0, 2), { content: inlineJS }, generatedCoreReplies[2]]);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  const files = await provider.requestProjectFiles({ business: "Test Co" }, architecture);
  assert.equal(files["js/app.js"], generatedFiles[2].content);
  assert.equal(calls.length, 4);
  assert.match(JSON.parse(calls[3].options.body).messages[0].content, /use addeventlistener instead of inline event handlers/i);
});

test("includes the parser detail when retrying malformed custom JavaScript", async () => {
  const invalidJS = generatedFiles[2].content + "\nfunction unfinished(";
  const { provider, calls } = createProvider([...generatedCoreReplies.slice(0, 2), { content: invalidJS }, generatedCoreReplies[2]]);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  const files = await provider.requestProjectFiles({ business: "Test Co" }, architecture);
  assert.equal(files["js/app.js"], generatedFiles[2].content);
  assert.equal(calls.length, 4);
  assert.match(JSON.parse(calls[3].options.body).messages[0].content, /JavaScript contains a syntax error:/i);
  assert.match(JSON.parse(calls[3].options.body).messages[0].content, /Unexpected|end of input/i);
});

test("replaces an invalid saved source stage while retaining valid completed files", async () => {
  const { provider, calls } = createProvider([generatedCoreReplies[1]]);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  let savedFiles = {};
  const files = await provider.requestProjectFiles({ business: "Test Co" }, architecture, undefined, (event) => {
    if (event.status === "completed") savedFiles = event.files;
  }, {
    "index.html": generatedFiles[0].content,
    "css/styles.css": "body { color: #123;",
    "js/app.js": generatedFiles[2].content
  });
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].options.body).messages[0].content.includes("css/styles.css"), true);
  assert.equal(files["index.html"], generatedFiles[0].content);
  assert.equal(files["css/styles.css"], generatedFiles[1].content);
  assert.equal(files["js/app.js"], generatedFiles[2].content);
  assert.equal(savedFiles["css/styles.css"], generatedFiles[1].content);
});

test("asks only focused AI discovery follow-up questions", async () => {
  const { provider, calls, timeouts } = createProvider({ questions: ["Which roles can approve a completed job?"] });
  provider.configure({ enabled: true });
  const questions = await provider.requestFollowUp({ business: "Test Co", workflow: "Staff complete jobs" });
  assert.deepEqual(Array.from(questions), ["Which roles can approve a completed job?"]);
  const request = JSON.parse(calls[0].options.body);
  assert.equal(request.format.properties.questions.maxItems, 5);
  assert.equal(request.maxOutputTokens, 768);
  assert.match(request.messages[0].content, /Do not repeat answered questions/);
  assert.equal(timeouts[0], 180000);
});

test("rejects malformed or excessive discovery follow-up questions", async () => {
  for (const reply of [
    { questions: "What happens next?" },
    { questions: [" "] },
    { questions: ["x".repeat(301)] },
    { questions: ["1", "2", "3", "4", "5", "6"] }
  ]) {
    const { provider } = createProvider(reply);
    provider.configure({ enabled: true });
    await assert.rejects(provider.requestFollowUp({ business: "Bad Model" }, 1000), /invalid discovery questions/i);
  }
});

test("rejects incomplete, duplicate, unsupported, empty, and oversized AI source output", async () => {
  for (const firstFile of ["", "  ", "x".repeat(300001)]) {
    const { provider } = createProvider([{ content: firstFile }, ...generatedCoreReplies.slice(1)]);
    provider.configure({ enabled: true });
    await assert.rejects(provider.requestProjectFiles({ business: "Bad Model" }, architecture), /empty, invalid, or oversized source/);
  }
});

test("does not request AI source when the local provider is disabled", async () => {
  const { provider, calls } = createProvider(generatedCoreReplies);
  await assert.rejects(provider.requestProjectFiles({}, architecture), /Enable the local Ollama model/);
  assert.equal(calls.length, 0);
});

test("reports oversized custom generation context before making a model request", async () => {
  const { provider, calls } = createProvider(generatedCoreReplies);
  provider.configure({ enabled: true, model: "qwen3.5:4b" });
  await assert.rejects(
    provider.requestProjectFiles({ business: "Large scope", problem: "x".repeat(22000) }, architecture),
    /exceed Forge's safe local-model prompt limit/
  );
  assert.equal(calls.length, 0);
});

test("returns a single-file fix proposal without applying it", async () => {
  const { provider, calls, timeouts } = createProvider({ content: "document.addEventListener('DOMContentLoaded', start);" });
  provider.configure({ enabled: true });
  const proposal = await provider.requestFixProposal("js/app.js", "start();", { business: "Test Co" }, architecture, [{ name: "Syntax", passed: false, detail: "Unexpected token", advice: "Fix the parser error." }]);
  assert.equal(proposal, "document.addEventListener('DOMContentLoaded', start);");
  assert.match(calls[0].options.body, /Unexpected token/);
  assert.match(calls[0].options.body, /named file only/);
  assert.equal(timeouts[0], 180000);
});

test("rejects unsupported, oversized, and disabled fix requests", async () => {
  const { provider, calls } = createProvider({ content: "fix" });
  await assert.rejects(provider.requestFixProposal("project.json", "{}", {}, {}, []), /Enable the local Ollama model/);
  provider.configure({ enabled: true });
  await assert.rejects(provider.requestFixProposal("project.json", "{}", {}, {}, []), /supported application source/);
  await assert.rejects(provider.requestFixProposal("js/app.js", "x".repeat(12001), {}, {}, []), /too large/);
  assert.equal(calls.length, 0);
});

test("requests a reviewable single-file fix proposal with failed-check context", async () => {
  const { provider, calls, timeouts } = createProvider({ content: "document.addEventListener('DOMContentLoaded', start);" });
  provider.configure({ enabled: true });
  const proposal = await provider.requestFixProposal("js/app.js", "start();", { business: "Test Co" }, architecture, [{ name: "JavaScript syntax", passed: false, detail: "Unexpected token", advice: "Review the parse error." }]);
  assert.equal(proposal, "document.addEventListener('DOMContentLoaded', start);");
  const request = JSON.parse(calls[0].options.body);
  assert.match(request.messages[1].content, /Unexpected token/);
  assert.match(request.messages[0].content, /proposal for human review/);
  assert.deepEqual(request.format.required, ["content"]);
  assert.equal(timeouts[0], 180000);
});

test("provides related source context and rejects broken JavaScript fix proposals", async () => {
  const relatedFiles = { "index.html": '<main><section id="batch-list-container"></section><section id="ready-list-container"></section></main>' };
  const invalid = createProvider({ content: 'function loadData(){return JSON.parse(localStorage.getItem("items")||"[]")} let items=loadData(); document.addEventListener("DOMContentLoaded",start); localStorage.setItem("items","[]"); button.onclick=start;' });
  invalid.provider.configure({ enabled: true });
  await assert.rejects(
    invalid.provider.requestFixProposal("js/app.js", "start();", { business: "Test Co" }, architecture, [], undefined, relatedFiles),
    /still uses inline event handlers/
  );
  const request = JSON.parse(invalid.calls[0].options.body);
  assert.match(request.messages[1].content, /batch-list-container/);
  assert.match(request.messages[0].content, /preserve their actual selectors and structure/i);

  const valid = createProvider({ content: 'function loadData(){return JSON.parse(localStorage.getItem("items")||"[]")} let items=loadData(); document.addEventListener("DOMContentLoaded",start); localStorage.setItem("items","[]");' });
  valid.provider.configure({ enabled: true });
  const proposal = await valid.provider.requestFixProposal("js/app.js", "start();", { business: "Test Co" }, architecture, [], undefined, relatedFiles);
  assert.match(proposal, /loadData/);
});

test("refuses non-local endpoints and non-loopback page origins", async () => {
  const { provider, calls } = createProvider(architecture);
  assert.throws(() => provider.configure({ endpoint: "https://example.com" }), /localhost/);
  provider.configure({ enabled: true });
  provider.settings();
  // A page served from another origin is blocked before fetch, even if settings are enabled.
  const evilContext = {
    window: { location: { protocol: "https:", hostname: "forge.example", origin: "https://forge.example" } },
    localStorage: { getItem: () => JSON.stringify({ enabled: true }), setItem() {} },
    URL, AbortController, setTimeout, clearTimeout, fetch: async () => { throw new Error("must not fetch"); }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("./ai-provider.js"), "utf8"), evilContext);
  await assert.rejects(evilContext.window.ForgeAIProvider.requestArchitecture({ business: "Remote" }), /local server/);
  assert.equal(calls.length, 0);
});
