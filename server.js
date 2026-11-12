// Local Forge AI web server and same-origin, loopback-only Ollama proxy.
// It serves a fixed file allowlist and never runs generated project code.
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const HOST = "127.0.0.1";
const PORT = Number(process.env.FORGE_PORT || 8765);
const ROOT = __dirname;
const OLLAMA = "http://127.0.0.1:11434";
const MAX_REQUEST = 512 * 1024;
const MAX_RESPONSE = 2 * 1024 * 1024;
const OLLAMA_REQUEST_TIMEOUT = 660000;
const chatRate = new Map();
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/architect.js", ["architect.js", "text/javascript; charset=utf-8"]],
  ["/ai-provider.js", ["ai-provider.js", "text/javascript; charset=utf-8"]],
  ["/generator.js", ["generator.js", "text/javascript; charset=utf-8"]],
  ["/testing.js", ["testing.js", "text/javascript; charset=utf-8"]],
  ["/sample-projects.js", ["sample-projects.js", "text/javascript; charset=utf-8"]]
]);

function json(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    request.on("data", (chunk) => {
      if (length > MAX_REQUEST) return;
      length += chunk.length;
      if (length > MAX_REQUEST) {
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (length > MAX_REQUEST) return reject(Object.assign(new Error("Request is too large."), { statusCode: 413 }));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (_) { reject(Object.assign(new Error("Request body must be valid JSON."), { statusCode: 400 })); }
    });
    request.on("error", reject);
  });
}

function validOrigin(request, port) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return false;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

function allowChat(request) {
  const now = Date.now();
  const key = request.socket.remoteAddress || "local";
  let entry = chatRate.get(key);
  if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + 60_000 };
  entry.count++;
  chatRate.set(key, entry);
  if (chatRate.size > 50) for (const [address, value] of chatRate) if (value.resetAt <= now) chatRate.delete(address);
  return entry.count <= 20;
}

function validateChat(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw Object.assign(new Error("Invalid model request."), { statusCode: 400 });
  const model = String(payload.model || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,100}$/.test(model) || /(?:^|[:.-])cloud(?:$|[-/])/i.test(model)) throw Object.assign(new Error("Choose a locally installed Ollama model. Cloud models are disabled."), { statusCode: 400 });
  if (!Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > 4) throw Object.assign(new Error("The model request has an invalid message list."), { statusCode: 400 });
  const messages = payload.messages.map((message) => {
    if (!message || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string" || message.content.length > 24000) throw Object.assign(new Error("A model message is invalid or too long."), { statusCode: 400 });
    return { role: message.role, content: message.content };
  });
  let format = payload.format;
  if (format !== "json" && (!format || typeof format !== "object" || Array.isArray(format))) throw Object.assign(new Error("A structured JSON response format is required."), { statusCode: 400 });
  if (JSON.stringify(format).length > 32000) throw Object.assign(new Error("The response schema is too large."), { statusCode: 400 });
  const maxOutputTokens = payload.maxOutputTokens === undefined ? 2048 : payload.maxOutputTokens;
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 128 || maxOutputTokens > 4096) throw Object.assign(new Error("The model output limit must be between 128 and 4096 tokens."), { statusCode: 400 });
  return {
    model,
    think: false,
    stream: false,
    format,
    messages,
    options: { num_ctx: 8192, temperature: 0.2, num_predict: maxOutputTokens }
  };
}

function requestOllama(method, route, payload, port = 11434, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(Object.assign(new Error("The local model request was cancelled."), { code: "ABORT_ERR" }));
    let settled = false;
    let request;
    const cleanup = () => { if (signal) signal.removeEventListener("abort", abort); };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const succeed = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const abort = () => request.destroy(Object.assign(new Error("The local model request was cancelled."), { code: "ABORT_ERR" }));
    request = http.request({
      hostname: "127.0.0.1",
      port,
      path: route,
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      timeout: OLLAMA_REQUEST_TIMEOUT
    }, (upstream) => {
      const chunks = [];
      let size = 0;
      upstream.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE) {
          request.destroy(Object.assign(new Error("The local model response exceeded Forge's response limit."), { statusCode: 502 }));
          return;
        }
        chunks.push(chunk);
      });
      upstream.on("end", () => succeed({ status: upstream.statusCode || 502, bytes: Buffer.concat(chunks) }));
      upstream.on("error", fail);
    });
    request.on("timeout", () => request.destroy(Object.assign(new Error("The local model request timed out."), { statusCode: 504 })));
    request.on("error", fail);
    if (signal) {
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    }
    if (payload) request.write(JSON.stringify(payload));
    request.end();
  });
}

async function proxyOllama(request, response, route, port, forward = requestOllama) {
  const upstreamPath = route === "/api/ollama/tags" ? "/api/tags" : "/api/chat";
  const method = route.endsWith("/tags") ? "GET" : "POST";
  if (request.method !== method) return json(response, 405, { error: "Method not allowed." });
  if (method === "POST" && !validOrigin(request, port)) return json(response, 403, { error: "Forge accepts model requests from its own local page only." });
  if (method === "POST" && !allowChat(request)) return json(response, 429, { error: "Too many local model requests. Wait a minute and try again." });
  const controller = new AbortController();
  response.once("close", () => {
    if (!response.writableEnded) controller.abort();
  });
  try {
    const payload = method === "POST" ? validateChat(await readJson(request)) : undefined;
    const upstream = await forward(method, upstreamPath, payload, controller.signal);
    if (response.destroyed) return;
    response.writeHead(upstream.status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": upstream.bytes.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    });
    response.end(upstream.bytes);
  } catch (error) {
    if (response.destroyed) return;
    const status = error.statusCode || 502;
    const detail = status === 504 ? "The local model request took too long. Try a smaller request or a faster local model." :
      status === 502 ? (error.message.includes("response limit") ? error.message : "Ollama is not responding on this device. Start Ollama and confirm a local model is installed.") : error.message;
    json(response, status, { error: detail });
  }
}

function handler(request, response, port = PORT, forward = requestOllama) {
  let parsed;
  try { parsed = new URL(request.url, `http://${request.headers.host || HOST}`); }
  catch (_) { return json(response, 400, { error: "Invalid request URL." }); }
  const route = parsed.pathname;
  if (route === "/api/ollama/tags" || route === "/api/ollama/chat") return void proxyOllama(request, response, route, port, forward);
  if (request.method !== "GET" && request.method !== "HEAD") return json(response, 405, { error: "Method not allowed." });
  const file = staticFiles.get(route);
  if (!file) return json(response, 404, { error: "Not found." });
  const absolute = path.resolve(ROOT, file[0]);
  if (!absolute.startsWith(ROOT + path.sep)) return json(response, 404, { error: "Not found." });
  fs.readFile(absolute, (error, body) => {
    if (error) return json(response, 404, { error: "Forge file not found." });
    response.writeHead(200, {
      "Content-Type": file[1],
      "Content-Length": body.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "SAMEORIGIN"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  });
}

function startServer(port = PORT, options = {}) {
  const forward = options.ollamaRequest || ((method, route, payload, signal) => requestOllama(method, route, payload, options.ollamaPort || 11434, signal));
  const server = http.createServer((request, response) => handler(request, response, server.address().port, forward));
  server.listen(port, HOST, () => console.log(`Forge AI is available at http://${HOST}:${server.address().port}/`));
  return server;
}

if (require.main === module) {
  const server = startServer();
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") console.error(`Port ${PORT} is already in use. Close the existing Forge preview server, then retry.`);
    else console.error("Forge server failed:", error.message);
    process.exitCode = 1;
  });
  process.on("SIGINT", () => server.close(() => process.exit(0)));
  process.on("SIGTERM", () => server.close(() => process.exit(0)));
}

module.exports = { handler, requestOllama, startServer, validateChat };
