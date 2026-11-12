"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { requestOllama, startServer } = require("./server.js");
const http = require("node:http");

const realFetch = global.fetch;
let server;
let base;
let calls;

test.before(async () => {
  server = startServer(0, {
    ollamaRequest: async (method, route, payload) => {
      const url = "http://127.0.0.1:11434" + route;
      const options = { method, body: payload ? JSON.stringify(payload) : undefined, redirect: "error" };
      calls.push({ url, options });
      if (route === "/api/tags") return { status: 200, bytes: Buffer.from(JSON.stringify({ models: [{ name: "qwen3.5:4b" }] })) };
      return { status: 200, bytes: Buffer.from(JSON.stringify({ message: { role: "assistant", content: "{}" }, done: true })) };
    }
  });
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});

test.beforeEach(() => { calls = []; });
test.after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); });

test("serves only allowlisted Forge files with safety headers", async () => {
  const page = await realFetch(base + "/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.match(await page.text(), /Forge AI/);
  const samples = await realFetch(base + "/sample-projects.js");
  assert.equal(samples.status, 200);
  assert.match(await samples.text(), /Pinecone Catering/);
  assert.equal((await realFetch(base + "/server.js")).status, 404);
  assert.equal((await realFetch(base + "/%2e%2e/server.js")).status, 404);
});

test("proxies the local Ollama model list through same origin", async () => {
  const response = await realFetch(base + "/api/ollama/tags");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { models: [{ name: "qwen3.5:4b" }] });
  assert.equal(calls[0].url, "http://127.0.0.1:11434/api/tags");
});

test("keeps local model requests open until the Ollama response arrives", async () => {
  const ollama = http.createServer((request, response) => {
    setTimeout(() => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ models: [] }));
    }, 100);
  });
  ollama.listen(0, "127.0.0.1");
  await once(ollama, "listening");
  try {
    const result = await requestOllama("GET", "/api/tags", undefined, ollama.address().port);
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.bytes.toString("utf8")), { models: [] });
  } finally {
    await new Promise((resolve) => ollama.close(resolve));
  }
});

test("aborts an in-flight Ollama request when its signal is cancelled", async () => {
  let markStarted;
  let markClosed;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const closed = new Promise((resolve) => { markClosed = resolve; });
  const ollama = http.createServer((request, response) => {
    response.once("close", markClosed);
    markStarted();
  });
  ollama.listen(0, "127.0.0.1");
  await once(ollama, "listening");
  const controller = new AbortController();
  try {
    const pending = requestOllama("GET", "/api/tags", undefined, ollama.address().port, controller.signal);
    await started;
    controller.abort();
    await assert.rejects(pending, { code: "ABORT_ERR" });
    await closed;
  } finally {
    await new Promise((resolve) => ollama.close(resolve));
  }
});

test("cancels the Ollama request when Forge's caller disconnects", async () => {
  let markStarted;
  let markAborted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const aborted = new Promise((resolve) => { markAborted = resolve; });
  const cancelServer = startServer(0, {
    ollamaRequest: (method, route, payload, signal) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => {
        markAborted();
        reject(new Error("The local model request was cancelled."));
      }, { once: true });
      markStarted();
    })
  });
  await once(cancelServer, "listening");
  const controller = new AbortController();
  try {
    const pending = realFetch(`http://127.0.0.1:${cancelServer.address().port}/api/ollama/chat`, {
      method: "POST",
      headers: { origin: `http://127.0.0.1:${cancelServer.address().port}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "qwen3.5:4b", format: "json", messages: [{ role: "user", content: "Test" }] }),
      signal: controller.signal
    });
    await started;
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    await aborted;
  } finally {
    await new Promise((resolve) => cancelServer.close(resolve));
  }
});

test("accepts structured local chat and strips unsupported options", async () => {
  const schema = { type: "object", required: ["answer"] };
  const response = await realFetch(base + "/api/ollama/chat", {
    method: "POST", headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ model: "qwen3.5:4b", stream: true, format: schema, tools: [{ name: "shell" }], options: { num_ctx: 999999 }, messages: [{ role: "user", content: "Test" }] })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message.content, "{}");
  const forwarded = JSON.parse(calls[0].options.body);
  assert.equal(forwarded.think, false);
  assert.equal(forwarded.stream, false);
  assert.deepEqual(forwarded.options, { num_ctx: 8192, temperature: 0.2, num_predict: 2048 });
  assert.equal("tools" in forwarded, false);
  assert.equal(calls[0].url, "http://127.0.0.1:11434/api/chat");
  assert.equal(calls[0].options.redirect, "error");
});

test("enforces a bounded, validated model output-token limit", async () => {
  const valid = await realFetch(base + "/api/ollama/chat", {
    method: "POST", headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ model: "qwen3.5:4b", format: "json", maxOutputTokens: 512, messages: [{ role: "user", content: "Test" }] })
  });
  assert.equal(valid.status, 200);
  assert.equal(JSON.parse(calls[0].options.body).options.num_predict, 512);
  for (const maxOutputTokens of [0, 127, 4097, 1.5, "512"]) {
    const invalid = await realFetch(base + "/api/ollama/chat", {
      method: "POST", headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({ model: "qwen3.5:4b", format: "json", maxOutputTokens, messages: [{ role: "user", content: "Test" }] })
    });
    assert.equal(invalid.status, 400);
  }
});

test("rejects cross-site or cloud-model requests", async () => {
  const payload = { model: "qwen3.5:4b", format: "json", messages: [{ role: "user", content: "Test" }] };
  const crossSite = await realFetch(base + "/api/ollama/chat", { method: "POST", headers: { origin: "https://example.com", "content-type": "application/json" }, body: JSON.stringify(payload) });
  assert.equal(crossSite.status, 403);
  const cloud = await realFetch(base + "/api/ollama/chat", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ ...payload, model: "qwen3.5:4b-cloud" }) });
  assert.equal(cloud.status, 400);
  assert.equal(calls.length, 0);
});

test("rejects unsupported methods and malformed chat messages", async () => {
  assert.equal((await realFetch(base + "/api/ollama/tags", { method: "POST" })).status, 405);
  const bad = await realFetch(base + "/api/ollama/chat", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ model: "qwen3.5:4b", format: "json", messages: [{ role: "system", content: "x".repeat(24001) }] }) });
  assert.equal(bad.status, 400);
});

test("caps request size before forwarding it to Ollama", async () => {
  const oversized = await realFetch(base + "/api/ollama/chat", {
    method: "POST", headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ model: "qwen3.5:4b", format: "json", messages: [{ role: "user", content: "x".repeat(530000) }] })
  });
  assert.equal(oversized.status, 413);
  assert.equal(calls.length, 0);
});

test("limits local model request bursts", async () => {
  let limited = false;
  const payload = { model: "qwen3.5:4b", format: "json", messages: [{ role: "user", content: "test" }] };
  for (let index = 0; index < 25; index++) {
    const response = await realFetch(base + "/api/ollama/chat", {
      method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify(payload)
    });
    if (response.status === 429) { limited = true; break; }
    assert.equal(response.status, 200);
  }
  assert.equal(limited, true);
});
