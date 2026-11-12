// Local, deterministic checks for a generated project. Each result describes
// code actually inspected or compiled by the browser's JavaScript engine.
(function () {
  "use strict";
  function hasPrefilledEntry(html) {
    for (const match of html.matchAll(/<input\b([^>]*)>/gi)) {
      const attrs = match[1];
      const type = (attrs.match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || []).slice(1).find(Boolean) || "";
      const value = (attrs.match(/\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || []).slice(1).find((item) => item !== undefined) || "";
      if (type.toLowerCase() !== "hidden" && value.trim()) return true;
    }
    return /<textarea\b[^>]*>\s*\S[\s\S]*?<\/textarea>/i.test(html);
  }
  function initializesSavedState(js) {
    const hydration = /\b(?:let|const|var)\s+[$\w]+\s*=\s*loadData\s*\(\s*\)/.exec(js);
    const firstListener = js.search(/addEventListener\s*\(/);
    return Boolean(hydration && firstListener >= 0 && hydration.index < firstListener);
  }
  function run(files, diskVerification) {
    const results = [];
    const check = (name, fn, advice) => {
      try { const detail = fn(); results.push({ name, passed: true, detail: detail || "Check passed." }); }
      catch (error) { results.push({ name, passed: false, detail: error.message || String(error), advice }); }
    };
    const required = ["index.html", "css/styles.css", "js/app.js", "data/sample-data.js", "README.md", "project.json"];
    check("Required project files", () => {
      const missing = required.filter((path) => typeof files[path] !== "string" || !files[path].length);
      if (missing.length) throw new Error("Missing or empty: " + missing.join(", "));
      return required.length + " files found and non-empty.";
    }, "Regenerate the project files, then run checks again.");
    check("HTML document structure", () => {
      const html = files["index.html"] || "";
      if (!/^<!doctype html>/i.test(html.trim())) throw new Error("HTML doctype is missing.");
      for (const tag of ["html", "head", "body", "main", "form"]) {
        if (!new RegExp("<" + tag + "\\b", "i").test(html) || !new RegExp("</" + tag + "\\s*>", "i").test(html)) throw new Error("Missing or unclosed <" + tag + "> element.");
      }
      return "Doctype and core document elements are present.";
    }, "Restore the missing document element and closing tag in index.html.");
    check("Internal asset references", () => {
      const html = files["index.html"] || "";
      const refs = Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)).map((match) => match[1]);
      const missing = refs.filter((path) => !/^(https?:|data:|#)/i.test(path) && typeof files[path] !== "string");
      if (missing.length) throw new Error("References not found in project: " + missing.join(", "));
      return refs.length + " local asset references resolve.";
    }, "Fix the missing path or restore the referenced project file.");
    check("Stylesheet structure", () => {
      if (!window.ForgeGenerator.stylesheetIsBalanced(files["css/styles.css"] || "")) throw new Error("css/styles.css has an incomplete or unbalanced rule.");
      return "Stylesheet rules and braces are complete.";
    }, "Complete or regenerate css/styles.css, then rerun the project checks.");
    check("Application JavaScript syntax", () => {
      // Compile only. Generated application code is not executed by this check.
      try { new Function(files["js/app.js"] || ""); }
      catch (error) { throw new Error("js/app.js: " + (error.message || String(error))); }
      try { new Function(files["data/sample-data.js"] || ""); }
      catch (error) { throw new Error("data/sample-data.js: " + (error.message || String(error))); }
      return "Both JavaScript files compile without a syntax error.";
    }, "Review the syntax error and fix js/app.js or data/sample-data.js.");
    const project = JSON.parse(files["project.json"] || "{}");
    if (project.applicationType === "custom-ai-generated") {
      check("Custom application interactions", () => {
        const js = files["js/app.js"] || "";
        const html = files["index.html"] || "";
        if (!/addEventListener\s*\(/.test(js)) throw new Error("No user interaction handlers were found.");
        for (const marker of ["localStorage.getItem", "localStorage.setItem"]) {
          if (!js.includes(marker)) throw new Error("Expected local persistence hook is missing: " + marker);
        }
        if (/\s+on[a-z]+\s*=/i.test(html) || /\bon[a-z]+\s*=/i.test(js)) throw new Error("Inline event handlers can break dynamically rendered controls; use addEventListener.");
        if (hasPrefilledEntry(html)) throw new Error("New-entry fields contain sample values; keep fields empty and use placeholders for examples.");
        if (!initializesSavedState(js)) throw new Error("Initialize the main domain state by calling loadData() before registering interaction handlers.");
        return "Event listeners are used, new-entry fields are empty, and saved domain data is loaded before interaction wiring.";
      }, "Initialize the app's main domain state by calling loadData() before rendering, use addEventListener for all controls, and leave new-entry fields empty.");
    } else {
      check("CRUD workflow hooks", () => {
        const js = files["js/app.js"] || "";
        if (!/addEventListener\(\s*(['"])submit\1/.test(js)) throw new Error("Expected form submit workflow hook is missing.");
        for (const marker of ["data-edit", "data-delete", "localStorage.setItem", "localStorage.getItem"]) {
          if (!js.includes(marker)) throw new Error("Expected workflow hook is missing: " + marker);
        }
        if (!/required/.test(files["index.html"] || "")) throw new Error("Required form validation is missing.");
        return "Create, edit, delete, local persistence, and required-field hooks are present.";
      }, "Restore the form validation or CRUD behavior in js/app.js.");
    }
    check("Custom application interface contract", () => {
      if (project.applicationType !== "custom-ai-generated") return "Not an AI-generated custom application.";
      const html = files["index.html"] || "", js = files["js/app.js"] || "";
      const normalize = (value) => String(value).replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/<[^>]*>/g, " ").replace(/&amp;/gi, " and ").replace(/[^a-z0-9]+/gi, " ")
        .toLowerCase().trim().replace(/\s+/g, " ");
      if (!/^<!doctype html>/i.test(html.trim()) || !/<main\b/i.test(html) || !/<h[1-6]\b/i.test(html)) throw new Error("The custom app needs a doctype, main region, and visible heading.");
      if (project.name && !normalize(html).includes(normalize(project.name))) throw new Error("The page does not identify " + project.name + ".");
      const genericFields = new Set(["id", "status", "title", "name", "notes", "created at", "updated at"]);
      const fields = (project.architecture && project.architecture.entities || []).flatMap((entity) => entity.fields || [])
        .map((field) => String(field).replace(/\s*\([^)]*\)\s*$/, ""))
        .map((field) => ({ field, normalized: normalize(field) }))
        .filter((entry) => entry.normalized && !genericFields.has(entry.normalized));
      if (fields.length && !fields.some((entry) => normalize(html).includes(entry.normalized))) throw new Error("The page does not expose a field from the approved business entities.");
      if (!/addEventListener\s*\(/.test(js) || !js.includes("localStorage.getItem") || !js.includes("localStorage.setItem")) throw new Error("The custom interface is not connected to interactive, persistent business behavior.");
      return "The page identifies the business and exposes an approved domain field connected to interactive, persistent behavior.";
    }, "Align the generated page and behavior with the approved business name, entity fields, and workflow.");
    check("Local-only generated runtime", () => {
      const html = files["index.html"] || "";
      const javascript = [files["js/app.js"] || "", files["data/sample-data.js"] || ""].join("\n");
      const css = files["css/styles.css"] || "";
      if (/<(?:script|link)\b[^>]+\b(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i.test(html) ||
        /<form\b[^>]+\baction\s*=\s*["']\s*(?:https?:)?\/\//i.test(html) ||
        /(?:@import\s+(?:url\()?["']?(?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\/)/i.test(css)) {
        throw new Error("The generated app references a remote runtime resource or form endpoint.");
      }
      if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b|new\s+Function\b|\beval\s*\(/.test(javascript)) {
        throw new Error("The generated app contains a network or dynamic-code API.");
      }
      return "No external runtime assets, network APIs, or dynamic code execution were found.";
    }, "Remove remote runtime dependencies and network/dynamic-code APIs from the generated app.");
    check("Business-specific form matches blueprint", () => {
      const project = JSON.parse(files["project.json"] || "{}");
      const html = files["index.html"] || "", js = files["js/app.js"] || "";
      if (project.applicationType === "custom-ai-generated") return "Custom AI apps are checked against their approved domain fields and workflows.";
      if (project.applicationType === "customer-manager" && (!html.includes("Customer name") || !html.includes("Phone or email"))) throw new Error("Customer blueprint is missing customer fields.");
      if (project.applicationType === "inventory-manager" && (!html.includes('id="quantity"') || !html.includes('id="minimum"') || !js.includes("item.quantity <= item.minimum"))) throw new Error("Inventory blueprint is missing quantity or reorder behavior.");
      return project.applicationType + " fields and logic match the selected starter template.";
    }, "Regenerate the project after reviewing its business-specific blueprint.");
    check("Architecture workflow matches the application", () => {
      const project = JSON.parse(files["project.json"] || "{}");
      const workflows = (project.architecture && project.architecture.workflows || []).join(" ").toLowerCase();
      if (project.applicationType === "custom-ai-generated") {
        if (!workflows.trim()) throw new Error("The approved custom architecture has no workflow.");
        return "The approved custom workflow is included in project metadata.";
      }
      if (project.applicationType === "customer-manager" && !workflows.includes("customer request")) throw new Error("Customer application is missing its inquiry workflow.");
      if (project.applicationType === "inventory-manager" && (!workflows.includes("incoming stock") || !workflows.includes("reorder thresholds"))) throw new Error("Inventory application is missing its stock replenishment workflow.");
      return "The approved architecture includes a workflow for the selected application type.";
    }, "Update Discovery requirements, rebuild the architecture, then regenerate the project.");
    if (diskVerification) results.push({ name: "Generated files on disk", passed: Boolean(diskVerification.passed), detail: diskVerification.detail, advice: "Choose the project folder again and regenerate or restore the missing or changed source files." });
    return results;
  }
  window.ForgeTests = { run };
})();
