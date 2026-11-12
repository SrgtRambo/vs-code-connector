// Optional local Ollama adapter. Rule-based architecture remains available offline.
(function () {
  "use strict";
  const STORAGE_KEY = "forge-ai-provider-settings-v1";
  const defaults = { enabled: false, endpoint: "http://127.0.0.1:11434", model: "qwen3.5:4b" };
  function settings() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
    catch (_) { return { ...defaults }; }
  }
  function assertLocalEndpoint(endpoint) {
    let parsed;
    try { parsed = new URL(endpoint); } catch (_) { throw new Error("Enter a valid local Ollama address."); }
    if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("Forge only sends business requirements to an Ollama service on this device (localhost).");
  }
  function configure(patch) {
    const next = { ...settings(), ...(patch || {}) };
    next.endpoint = String(next.endpoint || defaults.endpoint).trim().replace(/\/$/, "");
    next.model = String(next.model || defaults.model).trim();
    assertLocalEndpoint(next.endpoint);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }
  function localApi(path) {
    const host = window.location && window.location.hostname;
    if (!window.location || window.location.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(host)) throw new Error("Open Forge with its local server at http://127.0.0.1:8765 before using Ollama.");
    return new URL(path, window.location.origin).href;
  }
  const schema = {
    type: "object", required: ["overview", "features", "modules", "screens", "navigation", "workflows", "entities", "validation", "visualDirection", "questions"],
    properties: {
      overview: { type: "string" },
      features: { type: "array", items: { type: "string" } },
      modules: { type: "array", items: { type: "string" } },
      screens: { type: "array", minItems: 1, maxItems: 6, items: { type: "object", required: ["name", "purpose"], properties: { name: { type: "string" }, purpose: { type: "string" } } } },
      navigation: { type: "array", items: { type: "string" } },
      workflows: { type: "array", items: { type: "string" } },
      entities: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", required: ["name", "fields", "relations"], properties: { name: { type: "string" }, fields: { type: "array", maxItems: 20, items: { type: "string" } }, relations: { type: "string" } } } },
      validation: { type: "array", items: { type: "string" } },
      visualDirection: {
        type: "object", required: ["style", "palette", "typography", "composition", "signature"],
        properties: {
          style: { type: "string" }, palette: { type: "array", minItems: 4, maxItems: 6, items: { type: "string" } },
          typography: { type: "string" }, composition: { type: "string" }, signature: { type: "string" }
        }
      },
      questions: { type: "array", items: { type: "string" } }
    }
  };
  const projectFiles = ["index.html", "css/styles.css", "js/app.js", "data/sample-data.js", "README.md"];
  const projectSchema = {
    type: "object",
    required: ["files"],
    properties: {
      files: {
        type: "array",
        minItems: projectFiles.length,
        maxItems: projectFiles.length,
        items: {
          type: "object",
          required: ["path", "content"],
          properties: {
            path: { type: "string", enum: projectFiles },
            content: { type: "string" }
          }
        }
      }
    }
  };
  const fileContentSchema = {
    type: "object",
    required: ["content"],
    properties: { content: { type: "string" } }
  };
  const followUpSchema = {
    type: "object",
    required: ["questions"],
    properties: {
      questions: { type: "array", maxItems: 5, items: { type: "string" } }
    }
  };
  const fileProposalSchema = {
    type: "object",
    required: ["content"],
    properties: { content: { type: "string" } }
  };
  const sourcePaths = projectFiles.filter((path) => ["index.html", "css/styles.css", "js/app.js"].includes(path));
  function validate(result) {
    if (!result || typeof result !== "object") throw new Error("The model returned an empty architecture.");
    if (typeof result.overview !== "string" || !result.overview.trim() || result.overview.length > 2000) throw new Error("The model returned an invalid architecture overview.");
    for (const key of ["features", "modules", "navigation", "workflows", "validation", "questions"]) {
      if (!Array.isArray(result[key]) || (key !== "questions" && result[key].length < 1) || result[key].length > 30 || result[key].some((item) => typeof item !== "string" || !item.trim() || item.length > 500)) throw new Error("The model returned an invalid " + key + " list.");
    }
    if (!Array.isArray(result.screens) || result.screens.length < 1 || result.screens.length > 6 || result.screens.some((item) => !item || typeof item.name !== "string" || !item.name.trim() || item.name.length > 120 || typeof item.purpose !== "string" || !item.purpose.trim() || item.purpose.length > 500)) throw new Error("The model returned an invalid screen definition.");
    if (!Array.isArray(result.entities) || result.entities.length < 1 || result.entities.length > 8 || result.entities.some((item) => !item || typeof item.name !== "string" || !item.name.trim() || item.name.length > 120 || !Array.isArray(item.fields) || item.fields.length < 1 || item.fields.length > 20 || item.fields.some((field) => typeof field !== "string" || !field.trim() || field.length > 120) || typeof item.relations !== "string" || item.relations.length > 500)) throw new Error("The model returned an invalid data entity.");
    const visual = result.visualDirection;
    if (!visual || ["style", "typography", "composition", "signature"].some((key) => typeof visual[key] !== "string" || !visual[key].trim() || visual[key].length > 500) ||
      !Array.isArray(visual.palette) || visual.palette.length < 4 || visual.palette.length > 6 ||
      visual.palette.some((color) => typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) ||
      new Set(visual.palette.map((color) => color.toLowerCase())).size !== visual.palette.length) throw new Error("The model returned an invalid visual direction.");
    return result;
  }
  function validateProjectFiles(result) {
    if (!result || typeof result !== "object" || !Array.isArray(result.files) || result.files.length !== projectFiles.length) throw new Error("The model returned an incomplete project file set.");
    const files = {};
    for (const entry of result.files) {
      if (!entry || !projectFiles.includes(entry.path) || Object.prototype.hasOwnProperty.call(files, entry.path)) throw new Error("The model returned an unsupported or duplicate project file path.");
      if (typeof entry.content !== "string" || !entry.content.trim() || entry.content.length > 300000) throw new Error("The model returned an empty or oversized project file: " + entry.path);
      files[entry.path] = entry.content;
    }
    if (projectFiles.some((path) => typeof files[path] !== "string")) throw new Error("The model did not return every required project file.");
    if (projectFiles.reduce((total, path) => total + files[path].length, 0) > 1024 * 1024) throw new Error("The generated project exceeds Forge's 1 MB source limit.");
    return files;
  }
  function validateFollowUp(result) {
    if (!result || typeof result !== "object" || !Array.isArray(result.questions) || result.questions.length > 5 ||
      result.questions.some((question) => typeof question !== "string" || !question.trim() || question.length > 300)) {
      throw new Error("The model returned invalid discovery questions.");
    }
    return result.questions;
  }
  async function requestArchitecture(requirements, timeoutMs) {
    const config = settings();
    assertLocalEndpoint(config.endpoint);
    if (!config.enabled) return null;
    if (!config.model) throw new Error("Choose a local Ollama model first.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 300000);
    try {
      let outputError = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetch(localApi("/api/ollama/chat"), {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ model: config.model, stream: false, format: schema, maxOutputTokens: attempt === 0 ? 2048 : 4096, options: { num_ctx: 8192, temperature: 0.2 }, messages: [
            { role: "system", content: "You are a careful software product architect and product designer. Return only the requested JSON architecture. Design a genuinely business-specific first version: name concrete screens, domain entities, fields, metrics, and end-to-end workflows derived from the requirements. Keep it small enough to implement reliably as a local browser app; use at most six screens and combine closely related tasks. Define a distinctive visual direction for this particular business and workflow, including a deliberate style, 4–6 concrete color values, typography using available system fonts, composition, and one signature visual detail. Avoid the same generic dashboard, sidebar, card grid, or work queue across businesses. Do not default to a generic work queue, CRM, inventory app, or generic CRUD dashboard unless that is actually the requested product. Do not invent numeric business limits, compatibility rules, temperatures, authentication, privacy guarantees, or notifications; mark unknown domain values as configurable or ask about them. Do not imply browser localStorage provides accounts or access control. Keep scope runnable with browser HTML/CSS/JavaScript and localStorage. Do not claim integrations or capabilities not requested. Identify assumptions as questions." +
              (attempt === 1 ? " The previous response was incomplete or invalid (" + outputError.message + "). Return a complete response that satisfies every required field and limit; do not truncate the JSON." : "") },
            { role: "user", content: "Create a first-version architecture for this business. Requirements JSON:\n" + JSON.stringify(requirements) }
          ] })
        });
        if (!response.ok) {
          if (response.status === 404) throw new Error("Forge's local API is unavailable. Start Forge with Start Forge AI.command and refresh this page, then check Ollama.");
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail.error || "Ollama returned HTTP " + response.status + ". Check that the local service and model are available.");
        }
        const payload = await response.json();
        if (payload && payload.done_reason === "length") {
          outputError = new Error("The local model reached the architecture output limit.");
          continue;
        }
        let content = payload && payload.message && payload.message.content;
        if (typeof content === "string") {
          try { content = JSON.parse(content); }
          catch (_) {
            outputError = new Error("The local model returned incomplete architecture JSON.");
            continue;
          }
        }
        try { return validate(content); }
        catch (error) {
          outputError = error;
          if (attempt === 1) throw error;
        }
      }
      throw new Error(outputError && outputError.message || "The local model returned an incomplete architecture response.");
    } catch (error) {
      if (error.name === "AbortError") throw new Error("The local model timed out. Check Ollama and try again.");
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function requestFollowUp(requirements, timeoutMs) {
    const config = settings();
    assertLocalEndpoint(config.endpoint);
    if (!config.enabled) return null;
    if (!config.model) throw new Error("Choose a local Ollama model first.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 180000);
    try {
      const response = await fetch(localApi("/api/ollama/chat"), {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ model: config.model, stream: false, format: followUpSchema, maxOutputTokens: 768, options: { num_ctx: 8192, temperature: 0.2 }, messages: [
          { role: "system", content: "You are conducting business software discovery. Review the answers and ask up to five short, high-value follow-up questions only when their answers would materially change the application workflow, data, user access, or constraints. Do not repeat answered questions. Return an empty questions array if the information is sufficient. Return only the requested JSON." },
          { role: "user", content: "Identify the most important missing details before designing this application. Requirements JSON:\n" + JSON.stringify(requirements) }
        ] })
      });
      if (!response.ok) {
        if (response.status === 404) throw new Error("Forge's local API is unavailable. Start Forge with Start Forge AI.command and refresh this page, then check Ollama.");
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "Ollama returned HTTP " + response.status + ".");
      }
      const payload = await response.json();
      let content = payload && payload.message && payload.message.content;
      if (typeof content === "string") content = JSON.parse(content);
      return validateFollowUp(content);
    } catch (error) {
      if (error.name === "AbortError") throw new Error("The local model timed out while reviewing discovery answers.");
      throw error;
    } finally { clearTimeout(timer); }
  }
  function makeProjectSupportFiles(requirements, architecture) {
    const business = String(requirements && requirements.business || "Custom business");
    const overview = String(architecture && architecture.overview || "A custom browser application.");
    const workflows = Array.isArray(architecture && architecture.workflows) ? architecture.workflows : [];
    return {
      "data/sample-data.js": "window.FORGE_SAMPLE_DATA = [];\n",
      "README.md": "# " + business + "\n\n" + overview + "\n\n## Run\nOpen `index.html` in a modern browser. No installation or external service is required. Application records are stored in this browser on this device.\n\n## Approved workflows\n" + (workflows.length ? workflows.map((workflow) => "- " + String(workflow)).join("\n") : "- See the approved architecture in `project.json`.") + "\n\n## Files\n- `index.html` — custom application structure\n- `css/styles.css` — custom responsive styling\n- `js/app.js` — custom application behavior\n- `data/sample-data.js` — optional sample records (empty by default)\n- `project.json` — Forge project and architecture metadata\n"
    };
  }
  async function requestProjectFiles(requirements, architecture, timeoutMs, onProgress, existingFiles) {
    const config = settings();
    assertLocalEndpoint(config.endpoint);
    if (!config.enabled) throw new Error("Enable the local Ollama model in Settings before requesting AI-generated source.");
    if (!config.model) throw new Error("Choose a local Ollama model first.");
    const files = { ...makeProjectSupportFiles(requirements, architecture) };
    for (const [path, content] of Object.entries(existingFiles || {})) {
      if (!projectFiles.includes(path) || typeof content !== "string" || !content.trim()) throw new Error("Saved AI generation progress contains an invalid project file.");
      files[path] = content;
    }
    const sourceRequirements = Object.fromEntries(["business", "industry", "problem", "workflow", "goal", "features", "users", "constraints", "success", "followUpAnswers"]
      .filter((key) => requirements && requirements[key] !== undefined)
      .map((key) => [key, requirements[key]]));
    const sourceArchitecture = Object.fromEntries(["overview", "features", "modules", "screens", "navigation", "workflows", "entities", "validation", "visualDirection"]
      .filter((key) => architecture && architecture[key] !== undefined)
      .map((key) => [key, architecture[key]]));
    const requestContext = JSON.stringify({ requirements: sourceRequirements, architecture: sourceArchitecture });
    const deadline = Date.now() + (timeoutMs || 1200000);
    function htmlValidationError(content) {
      if (!/^<!doctype html>/i.test(content.trim())) return "The HTML doctype is missing.";
      if (!/<main\b/i.test(content)) return "The HTML needs a main content region.";
      if (!/<h[1-6]\b/i.test(content)) return "The HTML needs a visible heading that identifies the application.";
      const business = String(requirements && requirements.business || "").trim();
      const normalizedHTML = content.replace(/&amp;/gi, "&").toLowerCase();
      if (business && !normalizedHTML.includes(business.toLowerCase())) return "The HTML does not identify the approved business application.";
      if (/\s+on[a-z]+\s*=/i.test(content)) return "Use JavaScript event listeners instead of inline HTML event handlers.";
      for (const match of content.matchAll(/<input\b([^>]*)>/gi)) {
        const attrs = match[1];
        const type = (attrs.match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || []).slice(1).find(Boolean) || "";
        const value = (attrs.match(/\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || []).slice(1).find((item) => item !== undefined) || "";
        if (type.toLowerCase() !== "hidden" && value.trim()) return "New user-entry fields must start empty; put examples in placeholders instead of prefilled values.";
      }
      if (/<textarea\b[^>]*>\s*\S[\s\S]*?<\/textarea>/i.test(content)) return "Remove all text between each <textarea> and </textarea>; new text-entry fields must start empty, and examples belong only in the placeholder attribute.";
      return "";
    }
    function stylesheetIsBalanced(css) {
      let depth = 0, quote = "", comment = false, hasRule = false;
      for (let index = 0; index < css.length; index++) {
        const char = css[index], next = css[index + 1];
        if (comment) {
          if (char === "*" && next === "/") { comment = false; index++; }
          continue;
        }
        if (quote) {
          if (char === "\\") index++;
          else if (char === quote) quote = "";
          continue;
        }
        if (char === "/" && next === "*") { comment = true; index++; }
        else if (char === "'" || char === "\"") quote = char;
        else if (char === "{") { depth++; hasRule = true; }
        else if (char === "}" && --depth < 0) return false;
      }
      return hasRule && depth === 0 && !quote && !comment;
    }
    function stylesheetUsesApprovedTheme(css) {
      const palette = architecture && architecture.visualDirection && architecture.visualDirection.palette;
      return stylesheetIsBalanced(css) && Array.isArray(palette) &&
        ["--forge-brand", "--forge-accent", "--forge-surface", "--forge-ink"].every((token) => css.includes(token)) &&
        palette.every((color) => css.toLowerCase().includes(String(color).toLowerCase()));
    }
    function stylesheetValidationError(css) {
      if (!stylesheetIsBalanced(css)) return "The stylesheet has incomplete or unbalanced rules.";
      if (!stylesheetUsesApprovedTheme(css)) return "The stylesheet is missing one or more approved theme tokens or palette colors.";
      return "";
    }
    const stageValidationErrors = {
      "index.html": htmlValidationError,
      "css/styles.css": stylesheetValidationError,
      "js/app.js": (content) => {
        try { new Function(content); } catch (error) { return "The JavaScript contains a syntax error: " + (error.message || String(error)); }
        if (/\bon[a-z]+\s*=/i.test(content)) return "Use addEventListener instead of inline event handlers.";
        if (!/addEventListener\s*\(/.test(content)) return "The JavaScript does not wire any user interactions.";
        const missingBehavior = ["localStorage.getItem", "localStorage.setItem"].find((hook) => !content.includes(hook));
        if (missingBehavior) return "The JavaScript is missing required behavior hook " + missingBehavior + ".";
        const hydration = /\b(?:let|const|var)\s+[$\w]+\s*=\s*loadData\s*\(\s*\)/.exec(content);
        const firstListener = content.search(/addEventListener\s*\(/);
        if (!hydration) return "Initialize the main domain state with a top-level `let records = loadData()` (use a domain-specific variable) before any event listener; declaring loadData() alone does not restore saved data.";
        if (hydration.index > firstListener) return "Move the main domain state's loadData() initialization before the first event listener.";
        return "";
      }
    };
    const stageValidators = Object.fromEntries(Object.entries(stageValidationErrors).map(([path, getError]) => [path, (content) => !getError(content)]));
    const stages = [
      {
        path: "index.html",
        tokens: 2048,
        instructions: "Design a bespoke, achievable single-page application for the approved product, not a generic dashboard, CRM, inventory table, or work queue unless that is the actual product. Implement its business-specific screens and workflow with the right controls for this product; do not force a shared form/list/search/status-filter CRUD layout. Implement only features and fields grounded in approved requirements, and omit unapproved assumptions. Use simple, reliable browser interactions. Make the primary screen immediately useful and visually distinctive; the approved visual direction and business workflow must dominate. Include complete semantic HTML, accessible labels, and a visible heading using the approved business name. All new-entry inputs must have no non-empty value attribute. Every textarea must be exactly empty between its opening and closing tags; put examples in its placeholder attribute only. Link exactly css/styles.css, data/sample-data.js, and js/app.js. No inline JavaScript or event-handler attributes, remote assets, or placeholder template copy.",
        retryInstructions: "Return a complete, semantically valid application page for the approved business and workflow. Ensure it has a doctype, main region, and visible heading containing the business name. Keep the product-specific layout and controls; do not add generic CRUD/search/status controls just to satisfy a shared template. Do not include any non-empty input value or any text between <textarea> and </textarea>; examples go only in placeholder attributes. Use no inline event-handler attributes. Include all three local asset links."
      },
      {
        path: "css/styles.css",
        tokens: 2048,
        instructions: "Style this exact bespoke business interface using the approved visualDirection in the architecture. Make this project's palette, typography, composition, and signature detail unmistakable; do not reuse a generic dashboard/card-grid style. In :root define --forge-brand, --forge-accent, --forge-surface, and --forge-ink, and include every exact color from the approved palette. Match actual HTML selectors and style its domain-specific workflow screens, metrics, and actions. Include responsive mobile layout, readable contrast, visible keyboard focus, and reduced-motion support for any animation. Return a complete stylesheet under 6000 characters. No repeated rules, remote fonts, imports, or assets.",
        retryInstructions: "The stylesheet must be syntactically complete, use the approved visualDirection, and include :root tokens --forge-brand, --forge-accent, --forge-surface, and --forge-ink plus every exact approved palette color. Keep it under 3000 characters; balance every brace and finish every rule. Style the actual custom workflow selectors, mobile layout, and keyboard focus. Omit decorative extras."
      },
      {
        path: "js/app.js",
        tokens: 3072,
        instructions: "Implement this bespoke application's actual approved business workflow, screens, domain entities, fields, actions, and state transitions. Do not substitute generic work-item CRUD behavior or assume a shared interface contract. Match the generated HTML's controls exactly. Define loadData() and initialize the primary domain state at top level with `let records = loadData()` (use an appropriate domain variable) before registering the first event listener or rendering; declaring loadData() without calling it does not restore saved data. Persist every successful state change and re-render every affected screen. Keep workflow stages separate: each screen must show only records that belong there, and actions must perform valid, visible transitions between the approved stages. Make every visible button, navigation item, and filter functional, using addEventListener (including for dynamically rendered controls), never inline event handlers. Implement approved domain-specific validations and visible storage-error handling. Render user text safely using textContent or explicit HTML escaping. No network, external libraries, eval, or dynamic code. Keep the implementation focused and complete.",
        retryInstructions: "Return complete, syntax-valid JavaScript that implements this product's approved business workflow and every visible interaction in the provided HTML. Include a top-level initialization such as `let repairTickets = loadData();` before any addEventListener call; a loadData() declaration without this state assignment is not enough. Persist and re-render after every successful state change, keep stage views correctly filtered and distinct, and use addEventListener rather than inline handlers. Do not require generic selectors or generic title/status/edit/delete controls. Include localStorage get/set with visible storage-error handling; match the generated domain fields and actions."
      }
    ];
    for (const stage of stages) {
      if (typeof files[stage.path] === "string" && !stageValidators[stage.path](files[stage.path])) {
        delete files[stage.path];
        if (stage.path === "index.html") {
          delete files["css/styles.css"];
          delete files["js/app.js"];
        }
      }
      stage.validate = stageValidators[stage.path];
      stage.getValidationError = stageValidationErrors[stage.path];
    }
    const contextFor = (path) => path === "index.html" ? requestContext :
      JSON.stringify({ requirements: sourceRequirements, architecture: sourceArchitecture, html: files["index.html"] });
    for (let index = 0; index < stages.length; index++) {
        const stage = stages[index];
        if (typeof files[stage.path] === "string") {
          if (onProgress) await onProgress({ status: "completed", path: stage.path, completed: index + 1, total: stages.length, files: { ...files } });
          continue;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("AI generation ran out of time before creating " + stage.path + ".");
        const stageDeadline = Math.min(deadline, Date.now() + 600000);
        if (onProgress) await onProgress({ status: "started", path: stage.path, completed: index, total: stages.length, files: { ...files } });
        let generatedContent = null, stageValidationFailure = "";
        for (let attempt = 0; attempt < 2 && generatedContent === null; attempt++) {
          const outputLimit = attempt === 0 ? stage.tokens : 4096;
          if (attempt === 1 && onProgress) await onProgress({ status: "retrying", path: stage.path, completed: index, total: stages.length, files: { ...files }, strategy: stage.retryInstructions ? "concise" : "larger-limit" });
          const attemptRemaining = stageDeadline - Date.now();
          if (attemptRemaining <= 0) throw new Error("AI generation ran out of time before creating " + stage.path + ".");
          const userPrompt = "Create " + stage.path + " for the approved business application. " +
            (stage.path === "js/app.js" ? "Requirements, architecture, and HTML to implement exactly:\n" : "Requirements and architecture:\n") + contextFor(stage.path);
          if (userPrompt.length > 22000) throw new Error("The approved requirements and generated interface exceed Forge's safe local-model prompt limit. Simplify the requested scope and retry this file.");
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), attemptRemaining);
          try {
            const response = await fetch(localApi("/api/ollama/chat"), {
              method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
              body: JSON.stringify({
                model: config.model, stream: false, format: fileContentSchema, maxOutputTokens: outputLimit,
                options: { num_ctx: 8192, temperature: 0.2 },
                messages: [
                  { role: "system", content: "You are building a genuinely custom, local-first business application, not adapting a generic template. " + stage.instructions + (attempt === 1 && stage.retryInstructions ? " " + stage.retryInstructions + (stageValidationFailure ? " The exact validation failure was: " + stageValidationFailure : "") : "") + " Return only JSON with a non-empty content string containing the complete source for " + stage.path + ". No markdown fences or explanation." },
                  { role: "user", content: userPrompt }
                ]
              })
            });
            if (!response.ok) {
              if (response.status === 404) throw new Error("Forge's local API is unavailable. Start Forge with Start Forge AI.command and refresh this page, then check Ollama.");
              const detail = await response.json().catch(() => ({}));
              throw new Error(detail.error || "Ollama returned HTTP " + response.status + " while creating " + stage.path + ".");
            }
            const payload = await response.json();
            if (payload && payload.done_reason === "length") {
              const error = new Error("The model reached the output limit for " + stage.path + ".");
              error.retryable = attempt === 0;
              throw error;
            }
            let content = payload && payload.message && payload.message.content;
            if (typeof content === "string") {
              try { content = JSON.parse(content); }
              catch (_) {
                const error = new Error("The model returned incomplete JSON for " + stage.path + ".");
                error.retryable = attempt === 0;
                throw error;
              }
            }
            if (!content || typeof content.content !== "string" || !content.content.trim() || content.content.length > (stage.path === "css/styles.css" ? 12000 : 300000)) throw new Error("The model returned empty, invalid, or oversized source for " + stage.path + ".");
            if (!stage.validate(content.content)) {
              const error = new Error(stage.path === "css/styles.css" ? "The stylesheet is unbalanced or does not include every approved theme token and color." : stage.getValidationError(content.content) || "The model source did not satisfy the required " + stage.path + " structure and custom-app interface.");
              error.retryable = attempt === 0;
              stageValidationFailure = error.message;
              throw error;
            }
            generatedContent = content.content;
          } catch (error) {
            if (error.name === "AbortError") throw new Error("AI generation timed out while creating " + stage.path + ". Completed files are saved; choose Generate again to resume.");
            if (error.retryable && attempt === 0) continue;
            if (error.message.includes("Forge's local API is unavailable") || error.message.includes("Ollama returned HTTP")) throw error;
            throw new Error("Could not create " + stage.path + ": " + (error.message || String(error)) + ". Completed files are saved; choose Generate again to resume.");
          } finally { clearTimeout(timer); }
        }
        files[stage.path] = generatedContent;
        if (onProgress) await onProgress({ status: "completed", path: stage.path, completed: index + 1, total: stages.length, files: { ...files } });
    }
    return validateProjectFiles({ files: projectFiles.map((path) => ({ path, content: files[path] })) });
  }
  async function requestFixProposal(path, currentContent, requirements, architecture, failures, timeoutMs, relatedFiles) {
    const config = settings();
    assertLocalEndpoint(config.endpoint);
    if (!config.enabled) throw new Error("Enable the local Ollama model in Settings before requesting AI fix proposals.");
    if (!config.model) throw new Error("Choose a local Ollama model first.");
    if (!sourcePaths.includes(path)) throw new Error("Choose a supported application source file to fix.");
    if (typeof currentContent !== "string" || currentContent.length > 12000) throw new Error("This file is too large to include in a single fix request. Review it manually or select a smaller source file.");
    const requirementsContext = Object.fromEntries(["business", "industry", "problem", "workflow", "goal", "features", "users", "constraints"].map((key) => [key, String(requirements && requirements[key] || "").slice(0, 400)]));
    const architectureContext = Object.fromEntries(["overview", "features", "workflows", "validation"].map((key) => [key, key === "overview" ? String(architecture && architecture[key] || "").slice(0, 800) : (Array.isArray(architecture && architecture[key]) ? architecture[key].slice(0, 8).map((value) => String(value).slice(0, 250)) : [])]));
    const failureContext = (Array.isArray(failures) ? failures : []).filter((item) => item && !item.passed).slice(0, 6).map((item) => ({ name: String(item.name || "").slice(0, 120), detail: String(item.detail || "").slice(0, 500), advice: String(item.advice || "").slice(0, 500) }));
    const relatedSource = {};
    let relatedBudget = 6000;
    const contextPaths = path === "js/app.js" || path === "css/styles.css" ? ["index.html"] : ["js/app.js"];
    for (const relatedPath of contextPaths) {
      const source = relatedFiles && relatedFiles[relatedPath];
      if (typeof source !== "string" || !source.trim() || relatedBudget <= 0) continue;
      relatedSource[relatedPath] = source.slice(0, relatedBudget);
      relatedBudget -= relatedSource[relatedPath].length;
    }
    const userContent = JSON.stringify({ file: path, currentSource: currentContent, relatedSource, requirements: requirementsContext, architecture: architectureContext, failedChecks: failureContext });
    if (userContent.length > 22000) throw new Error("The fix context is too large. Select a smaller source file or review the suggested fix manually.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 180000);
    try {
      const response = await fetch(localApi("/api/ollama/chat"), {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ model: config.model, stream: false, format: fileProposalSchema, maxOutputTokens: 4096, options: { num_ctx: 8192, temperature: 0.2 }, messages: [
          { role: "system", content: "Propose a complete replacement for only the requested application source file that addresses the reported failed checks while preserving valid existing behavior. Related files are context only: preserve their actual selectors and structure, do not invent elements or claim another file was changed. Do not edit Forge itself. Keep the app local: no network requests, external dependencies, eval, or dynamic code execution. Return only JSON with a non-empty content string. This is a proposal for human review, not an instruction to apply it." },
          { role: "user", content: "Review the selected source, related project source, requirements, and each actual failed check. Return a proposed full replacement for the named file only:\n" + userContent }
        ] })
      });
      if (!response.ok) {
        if (response.status === 404) throw new Error("Forge's local API is unavailable. Start Forge with Start Forge AI.command and refresh this page, then check Ollama.");
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "Ollama returned HTTP " + response.status + ".");
      }
      const payload = await response.json();
      let content = payload && payload.message && payload.message.content;
      if (typeof content === "string") content = JSON.parse(content);
      if (!content || typeof content.content !== "string" || !content.content.trim() || content.content.length > 300000) throw new Error("The model returned an empty or oversized fix proposal.");
      if (path === "js/app.js" && Object.keys(relatedSource).length) {
        try { new Function(content.content); } catch (error) { throw new Error("The fix proposal contains a JavaScript syntax error: " + (error.message || String(error))); }
        if (/\bon[a-z]+\s*=/i.test(content.content)) throw new Error("The fix proposal still uses inline event handlers.");
        if (!/addEventListener\s*\(/.test(content.content)) throw new Error("The fix proposal does not wire interactions with event listeners.");
        if (!content.content.includes("localStorage.getItem") || !content.content.includes("localStorage.setItem")) throw new Error("The fix proposal is missing local data persistence.");
        const hydration = /\b(?:let|const|var)\s+[$\w]+\s*=\s*loadData\s*\(\s*\)/.exec(content.content);
        const firstListener = content.content.search(/addEventListener\s*\(/);
        if (!hydration) throw new Error("The fix proposal does not initialize domain state by calling loadData() before wiring interactions.");
        if (hydration.index > firstListener) throw new Error("The fix proposal initializes saved data after wiring interactions.");
      }
      return content.content;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("The local model timed out while proposing a fix.");
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function checkConnection() {
    const config = settings();
    assertLocalEndpoint(config.endpoint);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(localApi("/api/ollama/tags"), { method: "GET", signal: controller.signal });
      if (!response.ok) {
        if (response.status === 404) throw new Error("Forge's local API is unavailable. Start Forge with Start Forge AI.command and refresh this page.");
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "Ollama returned HTTP " + response.status + ".");
      }
      const data = await response.json();
      return Array.isArray(data.models) ? data.models.map((item) => item.name).filter(Boolean) : [];
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Ollama did not respond within five seconds.");
      throw error;
    } finally { clearTimeout(timer); }
  }
  window.ForgeAIProvider = { defaults, settings, configure, requestArchitecture, requestFollowUp, requestProjectFiles, requestFixProposal, checkConnection };
})();
