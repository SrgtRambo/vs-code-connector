// Forge AI workspace controller. UI state is separate from discovery,
// architecture, file generation, and testing modules.
(function () {
  "use strict";
  const STORE = "forge-ai-projects-v1";
  const $ = (id) => document.getElementById(id);
  const views = ["overview", "discovery", "architect", "generator", "testing", "projects", "settings"];
  let projects = readProjects();
  let current = null;
  let currentFiles = null;
  let currentFolder = null;
  let lastTestResults = [];
  let newProjectDraft = false;
  let pendingRequirements = null;
  let pendingSourceFix = null;
  let aiFixButton = null;
  let aiFixPanel = null;
  let aiFixPath = null;
  let aiFixCurrent = null;
  let aiFixProposed = null;
  let aiFixSummary = null;
  let aiFixBusy = false;
  let toastTimer;
  let previewTimer;

  function readProjects() { try { const data = JSON.parse(localStorage.getItem(STORE) || "[]"); return Array.isArray(data) ? data : []; } catch (_) { return []; } }
  function persist() { try { localStorage.setItem(STORE, JSON.stringify(projects)); updateOverview(); renderProjects(); return true; } catch (error) { showNotice("settingsNotice", "Could not save project metadata in browser storage: " + error.message, true); return false; } }
  function showToast(message) { const node = $("toast"); node.textContent = message; node.classList.remove("hidden"); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.add("hidden"), 3600); }
  function showNotice(id, message, isError) { const node = $(id); if (!node) return; node.textContent = message; node.classList.remove("hidden", "error", "success"); node.classList.add(isError ? "error" : "success"); }
  function clearNotice(id) { const node = $(id); if (node) node.classList.add("hidden"); }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c])); }
  function navigate(view) { if (!views.includes(view)) return; if (view === "discovery" && current && !newProjectDraft) hydrateDiscovery(current.requirements); document.querySelectorAll(".view").forEach((node) => node.classList.toggle("active", node.id === "view-" + view)); document.querySelectorAll(".nav[data-view]").forEach((node) => node.classList.toggle("active", node.dataset.view === view)); if (view === "projects") renderProjects(); if (view === "overview") updateOverview(); }
  function setStage(stage) { if (!current) return; current.stage = stage; current.updatedAt = new Date().toISOString(); const steps = { "Requirements drafted": 1, "Architecture approved": 2, "Files generated": 3, "Tests complete": 4, "Tests need fixes": 4 }; document.querySelectorAll("[data-step]").forEach((node) => node.classList.toggle("done", (steps[stage] || 0) >= ({ discovery: 1, architect: 2, generator: 3, testing: 4 }[node.dataset.step]))); }
  function renderDashboardProjects() {
    const host = $("dashboardProjectList");
    if (!host) return;
    host.replaceChildren();
    const recent = projects.slice().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 3);
    if (!recent.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Your saved projects will appear here.";
      host.appendChild(empty);
      return;
    }
    recent.forEach((project) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "dashboard-project";
      const info = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = project.name || "Untitled project";
      const detail = document.createElement("span");
      detail.textContent = (project.industry || "Project") + " · " + (project.stage || "Not started") + " · " + (project.fileCount || Object.keys(project.files || {}).length) + " files";
      info.append(name, detail);
      const open = document.createElement("span");
      open.className = "project-open";
      open.textContent = "Open →";
      row.append(info, open);
      row.addEventListener("click", () => openSavedProject(project.id));
      host.appendChild(row);
    });
  }
  function updateOverview() {
    $("statProjects").textContent = String(projects.length);
    $("statStage").textContent = current ? current.stage : "Start";
    $("statProjectName").textContent = current ? current.name : "No project selected";
    const sourceStages = ["index.html", "css/styles.css", "js/app.js"];
    const savedCount = currentFiles ? Object.keys(currentFiles).length : current && current.aiDraftFiles ? sourceStages.filter((path) => typeof current.aiDraftFiles[path] === "string").length : 0;
    $("statFiles").textContent = String(savedCount);
    $("statFilesNote").textContent = current && current.aiDraftFiles && !currentFiles ? "AI source files saved; generation can resume" : "Files saved for the selected project";
    const title = $("dashboardNextTitle");
    const description = $("dashboardNextDescription");
    const button = $("dashboardContinue");
    if (current) {
      title.textContent = current.name;
      if (current.aiDraftFiles && !currentFiles) {
        description.textContent = "AI source is partly saved. Continue generation to resume from the completed files.";
        button.textContent = "Resume AI generation →";
      } else if (!current.approved) {
        description.textContent = "Review and approve the architecture before generating this project.";
        button.textContent = current.requirements ? "Review project architecture →" : "Continue discovery →";
      } else if (!currentFiles) {
        description.textContent = "Your architecture is approved. Generate the app, then explore it in the live preview.";
        button.textContent = "Generate this app →";
      } else if (current.stage === "Tests need fixes") {
        description.textContent = "Some project checks need attention. Review the results, then inspect the app in its preview.";
        button.textContent = "Review project checks →";
      } else {
        description.textContent = "Your project is ready to explore. Continue to the generator to use its live preview and project tools.";
        button.textContent = "Preview this app →";
      }
    } else {
      title.textContent = "Start with a business idea";
      description.textContent = "Describe what the software should help with. Forge will guide you through requirements, architecture, generation, and testing.";
      button.textContent = "Start business discovery →";
    }
    renderDashboardProjects();
  }
  function continueFromDashboard() {
    if (!current) return startNewProject();
    if (!current.requirements) return navigate("discovery");
    if (!current.approved) return navigate("architect");
    if (currentFiles && current.stage === "Tests need fixes") return navigate("testing");
    navigate("generator");
  }
  function requirementsFromForm() {
    return {
      business: $("business").value.trim(), industry: $("industry").value,
      size: $("size").value, employees: $("employees").value.trim(),
      activities: $("activities").value.trim(), tools: $("tools").value.trim(),
      problem: $("problem").value.trim(), workflow: $("workflow").value.trim(),
      goal: $("goal").value.trim(), features: $("features").value.trim(),
      users: $("users").value.trim(), success: $("success").value.trim(), constraints: $("constraints").value.trim()
    };
  }
  function hydrateDiscovery(req) {
    if (!req) return;
    for (const id of ["business", "industry", "size", "employees", "activities", "tools", "problem", "workflow", "goal", "features", "users", "success", "constraints"]) {
      const field = $(id); if (field) field.value = req[id] || "";
    }
  }
  function startNewProject() { newProjectDraft = true; pendingRequirements = null; $("discoveryForm").reset(); $("followupPanel").classList.add("hidden"); $("followupQuestions").replaceChildren(); clearNotice("discoveryNotice"); navigate("discovery"); }
  function renderRequirements(req) {
    const sections = [
      ["BUSINESS OVERVIEW", `${req.business} · ${req.industry} · ${req.size}${req.employees ? " · " + req.employees + " employees" : ""}`],
      ["ACTIVITIES & TOOLS", [req.activities, req.tools && "Current tools: " + req.tools].filter(Boolean).join("\n") || "Not provided"],
      ["PROBLEM", req.problem], ["PROPOSED OUTCOME", req.goal], ["CURRENT WORKFLOW", req.workflow || "Follow-up needed"],
      ["REQUIRED FEATURES", req.features || "Derive a first pass from the stated problem and outcome"],
      ["USER ROLES", req.users || "Follow-up needed"], ["SUCCESS MEASURE", req.success || "Follow-up needed"],
      ["CONSTRAINTS", req.constraints || "None provided"],
      ...(req.followUpAnswers && req.followUpAnswers.length ? [["FOLLOW-UP ANSWERS", req.followUpAnswers.map((item) => `${item.question}\n${item.answer}`).join("\n\n")]] : [])
    ];
    return sections.map(([title, value]) => title + "\n" + value).join("\n\n");
  }
  function updateApprovalControls() {
    $("approveArchitecture").disabled = !current || !$("approveCheck").checked || current.approved;
    $("generateProject").disabled = !current || !current.approved;
    $("generatorStatus").textContent = current && current.approved ? "ARCHITECTURE APPROVED" : "APPROVAL REQUIRED";
    $("architectureStatus").textContent = current ? (current.approved ? "APPROVED FOR GENERATION" : "READY FOR REVIEW") : "WAITING FOR DISCOVERY";
  }
  function showCurrentProject() {
    if (!current) return;
    $("requirementsSummary").textContent = renderRequirements(current.requirements);
    $("architectureReport").textContent = current.architecture && current.architecture.report || "Architecture data is missing. Recreate the blueprint from Discovery.";
    $("generatorProject").textContent = current.name;
    $("approveCheck").checked = Boolean(current.approved);
    updateApprovalControls();
    renderVersionHistory();
    if (currentFiles) installFiles(currentFiles, false); else clearGeneratedUI();
    updateOverview();
  }
  function clearGeneratedUI() {
    currentFiles = null; currentFolder = null;
    clearNotice("generatorNotice"); clearNotice("architectNotice");
    $("downloadProjectZip").classList.add("hidden"); $("downloadProjectZip").disabled = true;
    $("saveProjectFolder").classList.add("hidden"); $("saveProjectFolder").disabled = true;
    const picker = $("filePicker"); picker.innerHTML = ""; const option = document.createElement("option"); option.value = ""; option.textContent = "Select a project first"; picker.appendChild(option); picker.disabled = true;
    $("sourceEditor").value = ""; $("sourceEditor").readOnly = true; $("saveSource").disabled = true; $("runTests").disabled = true; $("showPreview").disabled = true; $("refreshPreview").disabled = true;
    $("editorStatus").textContent = ""; $("preview").srcdoc = ""; $("preview").classList.add("hidden"); $("previewEmpty").classList.remove("hidden"); $("previewStatus").textContent = "Generate or open a project to explore it here."; renderFileList(); showTests([]);
  }
  function installFiles(files, loadEditor) {
    currentFiles = files;
    const select = $("filePicker"); select.innerHTML = "";
    Object.keys(files).sort((a, b) => a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)).forEach((path) => { const option = document.createElement("option"); option.value = path; option.textContent = path; select.appendChild(option); });
    const zipButton = $("downloadProjectZip"), zipFallback = Boolean(current && current.zipFallback); zipButton.classList.toggle("hidden", !zipFallback); zipButton.disabled = !zipFallback;
    const folderButton = $("saveProjectFolder"), needsFolderSave = Boolean(currentFiles && !currentFolder);
    folderButton.classList.toggle("hidden", !needsFolderSave); folderButton.disabled = !needsFolderSave;
    const canEdit = Boolean(currentFolder || (current && current.zipFallback));
    select.disabled = false; $("saveSource").disabled = !canEdit; $("sourceEditor").readOnly = !canEdit; $("runTests").disabled = false; $("showPreview").disabled = false; $("refreshPreview").disabled = false;
    renderFileList(); if (loadEditor || !select.value) loadSelectedFile(); refreshPreview(files); updateOverview();
  }
  function renderFileList() { const host = $("generatedFiles"); if (!currentFiles) { host.className = "file-list empty"; host.textContent = "Approve an architecture, then generate a project."; return; } host.className = "file-list"; host.replaceChildren(); Object.keys(currentFiles).forEach((path) => { const row = document.createElement("div"); row.className = "file-row"; const code = document.createElement("code"); code.textContent = path; const state = document.createElement("span"); state.className = "tiny muted"; state.textContent = "Generated"; row.append(code, state); host.appendChild(row); }); }
  function loadSelectedFile() { if (!currentFiles) return; const path = $("filePicker").value, canEdit = Boolean(currentFolder || (current && current.zipFallback)); $("sourceEditor").value = currentFiles[path] || ""; $("sourceEditor").readOnly = !canEdit; $("saveSource").disabled = !canEdit; $("editorStatus").textContent = currentFolder ? "Folder connected · edits can be saved to disk" : current && current.zipFallback ? "Browser copy · save edits here, then download the updated ZIP" : "Read-only copy · open a project to edit and save"; }
  function refreshPreview(files, draft) {
    if (!files || !files["index.html"]) {
      $("preview").classList.add("hidden");
      $("previewEmpty").classList.remove("hidden");
      $("previewStatus").textContent = "Generate or open a project to explore it here.";
      return;
    }
    $("preview").srcdoc = window.ForgeGenerator.previewDocument(files);
    $("preview").classList.remove("hidden");
    $("previewEmpty").classList.add("hidden");
    $("previewStatus").textContent = (current && current.name ? current.name + " · " : "") + (draft ? "Showing unsaved source edits" : "Interactive preview · changes to preview data stay in this browser session");
  }
  function keepGeneratedInBrowser(generated) {
    currentFolder = null; currentFiles = generated.files; current.files = currentFiles;
    current.fileCount = Object.keys(currentFiles).length; current.version = (Number(current.version) || 0) + 1;
    current.versions = Array.isArray(current.versions) ? current.versions : [];
    let version = current.versions.find((entry) => Number(entry.number) === Number(current.version));
    if (!version) { version = { number: current.version, note: "Generated for ZIP download" }; current.versions.push(version); }
    version.snapshotPath = ".forge-history/v" + current.version;
    current.generatedAt = new Date().toISOString(); current.zipFallback = true;
    let results = window.ForgeTests.run(currentFiles);
    setStage(results.every((result) => result.passed) ? "Tests complete" : "Tests need fixes");
    const manifest = JSON.parse(currentFiles["project.json"] || "{}");
    manifest.stage = current.stage; manifest.version = current.version; manifest.versions = current.versions;
    manifest.testResults = results; manifest.outstandingTasks = current.architecture.questions || [];
    currentFiles["project.json"] = JSON.stringify(manifest, null, 2); current.files = currentFiles; current.testResults = results;
    current.zipEntries = {};
    for (const path of window.ForgeGenerator.paths) current.zipEntries[version.snapshotPath + "/" + path] = currentFiles[path];
    addOrUpdateCurrent(); installFiles(currentFiles, true); showTests(results); renderVersionHistory(); updateOverview();
    $("downloadProjectZip").classList.remove("hidden"); $("downloadProjectZip").disabled = false;
    return results;
  }
  function saveZipProjectFile(path, newContent) {
    if (!window.ForgeGenerator.paths.includes(path)) throw new Error("That file is not part of this Forge project.");
    current.zipEntries = current.zipEntries || {};
    current.versions = Array.isArray(current.versions) ? current.versions : [];
    const oldVersion = Number(current.version) || 1;
    let oldEntry = current.versions.find((entry) => Number(entry.number) === oldVersion);
    if (!oldEntry) { oldEntry = { number: oldVersion, note: "Version before update" }; current.versions.push(oldEntry); }
    oldEntry.snapshotPath = oldEntry.snapshotPath || ".forge-history/v" + oldVersion;
    const previousFiles = { ...currentFiles }, previousManifest = JSON.parse(previousFiles["project.json"] || "{}");
    previousManifest.version = oldVersion; previousManifest.versions = current.versions; previousManifest.stage = current.stage; previousManifest.testResults = current.testResults;
    previousFiles["project.json"] = JSON.stringify(previousManifest, null, 2);
    for (const projectPath of window.ForgeGenerator.paths) current.zipEntries[oldEntry.snapshotPath + "/" + projectPath] = previousFiles[projectPath];
    currentFiles[path] = newContent; current.version = oldVersion + 1; current.updatedAt = new Date().toISOString();
    const newEntry = { number: current.version, date: current.updatedAt, note: "Updated " + path, snapshotPath: ".forge-history/v" + current.version };
    current.versions.push(newEntry); setStage("Files generated"); current.testResults = null;
    let manifest = JSON.parse(currentFiles["project.json"] || "{}");
    manifest.version = current.version; manifest.updatedAt = current.updatedAt; manifest.stage = current.stage; manifest.versions = current.versions; manifest.testResults = null;
    currentFiles["project.json"] = JSON.stringify(manifest, null, 2);
    let results = window.ForgeTests.run(currentFiles);
    setStage(results.every((result) => result.passed) ? "Tests complete" : "Tests need fixes");
    manifest = JSON.parse(currentFiles["project.json"] || "{}"); manifest.stage = current.stage; manifest.testResults = results;
    currentFiles["project.json"] = JSON.stringify(manifest, null, 2); current.files = currentFiles; current.fileCount = Object.keys(currentFiles).length; current.testResults = results;
    for (const projectPath of window.ForgeGenerator.paths) current.zipEntries[newEntry.snapshotPath + "/" + projectPath] = currentFiles[projectPath];
    addOrUpdateCurrent(); installFiles(currentFiles, true); showTests(results); renderVersionHistory(); updateOverview();
    showNotice("generatorNotice", "Saved this edit in the browser and recorded version " + current.version + ". Download the updated project ZIP to keep the change outside this browser.", false);
  }
  function renderProjects() {
    const host = $("projectList"); host.replaceChildren();
    if (!projects.length) { const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "No saved projects yet."; host.appendChild(empty); return; }
    projects.slice().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).forEach((project) => {
      const row = document.createElement("button"); row.className = "project-row"; row.type = "button";
      const sampleLabel = project.isSample ? " · SAMPLE PROJECT" : "";
      const info = document.createElement("span"); info.innerHTML = "<strong>" + esc(project.name) + "</strong><br><span class=\"tiny muted\">" + esc(project.industry) + " · " + esc(project.stage) + " · v" + (project.version || 1) + " · " + (project.fileCount || Object.keys(project.files || {}).length) + " files" + sampleLabel + "</span>";
      const open = document.createElement("span"); open.className = "tiny"; open.textContent = "Open →"; row.append(info, open); row.addEventListener("click", () => openSavedProject(project.id)); host.appendChild(row);
    });
    updateSampleProjectStatus();
  }
  function updateSampleProjectStatus() {
    const status = $("sampleProjectStatus");
    if (!status || !window.ForgeSampleProjects) return;
    const loaded = window.ForgeSampleProjects.filter((sample) => projects.some((project) => project.id === sample.id)).length;
    status.textContent = loaded === window.ForgeSampleProjects.length ? "All 4 sample projects are ready" : loaded ? loaded + " of 4 sample projects loaded" : "Not added yet";
  }
  function buildSampleProjects() {
    return window.ForgeSampleProjects.map((sample) => {
      const createdAt = new Date().toISOString();
      const architecture = window.buildArchitecture(sample);
      const generated = window.ForgeGenerator.generate({
        id: sample.id,
        business: sample.business,
        industry: sample.industry,
        createdAt,
        requirements: sample,
        architecture
      });
      generated.project.isSample = true;
      generated.project.generator = "Forge AI built-in offline sample template v1";
      generated.project.stage = "Tests complete";
      const results = window.ForgeTests.run(generated.files);
      if (results.some((result) => !result.passed)) throw new Error("Sample project checks failed for " + sample.business + ".");
      const manifest = JSON.parse(generated.files["project.json"]);
      manifest.isSample = true;
      manifest.generator = generated.project.generator;
      manifest.stage = generated.project.stage;
      manifest.testResults = results;
      manifest.outstandingTasks = architecture.questions || [];
      generated.files["project.json"] = JSON.stringify(manifest, null, 2);
      const snapshotPath = ".forge-history/v1";
      const project = {
        ...generated.project,
        createdAt,
        updatedAt: createdAt,
        stage: "Tests complete",
        approved: true,
        requirements: sample,
        architecture,
        files: generated.files,
        fileCount: Object.keys(generated.files).length,
        version: 1,
        versions: [{ number: 1, note: "Built-in offline sample", snapshotPath }],
        testResults: results,
        outstandingTasks: architecture.questions || [],
        isSample: true,
        zipFallback: true,
        zipEntries: Object.fromEntries(window.ForgeGenerator.paths.map((path) => [snapshotPath + "/" + path, generated.files[path]]))
      };
      return project;
    });
  }
  $("loadSampleProjects").addEventListener("click", () => {
    try {
      const existing = new Set(projects.map((project) => project.id));
      const missing = buildSampleProjects().filter((project) => !existing.has(project.id));
      if (missing.length) {
        projects = [...missing, ...projects];
        persist();
      }
      updateSampleProjectStatus();
      const added = missing.length;
      $("sampleProjectStatus").textContent = added ? "Added " + added + " tested sample " + (added === 1 ? "project" : "projects") + ". Open any project below." : "All 4 sample projects are already loaded.";
    } catch (error) {
      showNotice("settingsNotice", "Could not load sample projects: " + (error.message || String(error)), true);
    }
  });
  function renderVersionHistory() {
    const host = $("versionHistory"); if (!host) return;
    host.replaceChildren();
    const versions = current && Array.isArray(current.versions) ? current.versions.slice().sort((a, b) => b.number - a.number) : [];
    if (!versions.length) { const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "No project versions yet."; host.appendChild(empty); return; }
    versions.forEach((version) => {
      const row = document.createElement("div"); row.className = "test-row";
      const detail = document.createElement("span"); detail.textContent = `v${version.number}${Number(version.number) === Number(current.version) ? " · current" : ""} · ${version.note || "Saved version"}${version.date ? " · " + new Date(version.date).toLocaleString() : ""}`;
      row.appendChild(detail);
      if (version.snapshotPath) {
        const restore = document.createElement("button"); restore.type = "button"; restore.className = "btn"; restore.textContent = "Restore";
        restore.dataset.restoreVersion = String(version.number);
        const snapshotAvailable = currentFolder || (current && current.zipFallback && window.ForgeGenerator.paths.every((path) => typeof current.zipEntries?.[version.snapshotPath + "/" + path] === "string"));
        restore.disabled = !snapshotAvailable || Number(version.number) === Number(current.version); if (!snapshotAvailable) restore.title = "This copy does not include the snapshot files."; row.appendChild(restore);
      } else {
        const unavailable = document.createElement("span"); unavailable.className = "tiny muted"; unavailable.textContent = "No saved snapshot"; row.appendChild(unavailable);
      }
      host.appendChild(row);
    });
  }
  function openSavedProject(id) { const project = projects.find((item) => item.id === id); if (!project) return; newProjectDraft = false; current = project; currentFiles = project.files || null; currentFolder = null; lastTestResults = project.testResults || []; showCurrentProject(); if (currentFiles) { installFiles(currentFiles, true); if (project.testResults) showTests(project.testResults); } else { $("generatorProject").textContent = project.name; } navigate("generator"); showToast("Opened " + project.name + " from local project history."); }
  function addOrUpdateCurrent() { const index = projects.findIndex((project) => project.id === current.id); if (index < 0) projects.unshift(current); else projects[index] = current; return persist(); }

  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => { if (button.dataset.go === "discovery" && current) newProjectDraft = false; navigate(button.dataset.go); }));
  document.querySelectorAll("[data-new-project]").forEach((button) => button.addEventListener("click", startNewProject));
  $("dashboardContinue").addEventListener("click", continueFromDashboard);
  function renderFollowUpQuestions(questions) {
    const host = $("followupQuestions");
    host.replaceChildren();
    questions.forEach((question, index) => {
      const field = document.createElement("div");
      field.className = "field";
      const label = document.createElement("label");
      const answer = document.createElement("textarea");
      answer.id = "followupAnswer" + index;
      answer.dataset.question = question;
      label.htmlFor = answer.id;
      label.textContent = question;
      answer.placeholder = "Your answer (optional)";
      field.append(label, answer);
      host.appendChild(field);
    });
    $("followupPanel").classList.remove("hidden");
  }
  async function finishDiscovery(req, discoveryError) {
    pendingRequirements = null;
    $("followupPanel").classList.add("hidden");
    $("followupQuestions").replaceChildren();
    let aiArchitecture = null, aiError = discoveryError || null;
    if (!aiError) {
      try { aiArchitecture = await window.ForgeAIProvider.requestArchitecture(req); }
      catch (error) { aiError = error.message || String(error); }
    }
    const architecture = window.buildArchitecture(aiArchitecture ? { ...req, aiArchitecture } : req);
    current = { id: (crypto.randomUUID ? crypto.randomUUID() : "project-" + Date.now()), name: req.business, industry: req.industry, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stage: "Requirements drafted", approved: false, requirements: req, architecture, outstandingTasks: architecture.questions, files: null, fileCount: 0, version: 0, versions: [], testResults: null };
    currentFiles = null; currentFolder = null; lastTestResults = []; addOrUpdateCurrent(); setStage("Requirements drafted"); showCurrentProject();
    showNotice("discoveryNotice", aiArchitecture ? "Local AI architecture saved after discovery. Review its assumptions before generation." : aiError ? "Local AI was unavailable; Forge used the clearly labeled rule-based architecture fallback. " + aiError : "Requirements saved. Review the tailored rule-based architecture before generation.", Boolean(aiError)); navigate("architect");
  }
  $("discoveryForm").addEventListener("submit", async (event) => {
    event.preventDefault(); clearNotice("discoveryNotice");
    newProjectDraft = false;
    const req = requirementsFromForm();
    const submit = $("discoveryForm").querySelector('[type="submit"]');
    if (submit) { submit.disabled = true; submit.textContent = "Reviewing discovery answers…"; }
    let questions = null, aiError = null;
    try { questions = await window.ForgeAIProvider.requestFollowUp(req); }
    catch (error) { aiError = error.message || String(error); }
    finally { if (submit) { submit.disabled = false; submit.textContent = "Create requirements & draft architecture →"; } }
    if (questions && questions.length) {
      pendingRequirements = req;
      renderFollowUpQuestions(questions);
      showNotice("discoveryNotice", "The local model identified details that could improve the design. Answer what you can, or continue without answers.", false);
      return;
    }
    await finishDiscovery(req, aiError);
  });
  $("followupForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pendingRequirements) return;
    const button = $("submitFollowup");
    button.disabled = true;
    button.textContent = "Drafting architecture…";
    const answers = Array.from($("followupQuestions").querySelectorAll("textarea[data-question]"))
      .map((field) => ({ question: field.dataset.question, answer: field.value.trim() }))
      .filter((item) => item.answer);
    await finishDiscovery({ ...pendingRequirements, followUpAnswers: answers });
    button.disabled = false;
    button.textContent = "Use answers & draft architecture";
  });
  $("skipFollowup").addEventListener("click", async () => {
    if (pendingRequirements) await finishDiscovery(pendingRequirements);
  });
  $("resetDiscovery").addEventListener("click", () => { $("discoveryForm").reset(); clearNotice("discoveryNotice"); });
  $("approveCheck").addEventListener("change", updateApprovalControls);
  $("approveArchitecture").addEventListener("click", () => {
    if (!current || !$("approveCheck").checked) return;
    current.approved = true; setStage("Architecture approved"); addOrUpdateCurrent(); updateApprovalControls();
    showNotice("architectNotice", "Architecture approved. The generator can now create the project files.", false); showToast("Architecture approved for " + current.name + "."); navigate("generator");
  });
  $("generateProject").addEventListener("click", async () => {
    if (!current || !current.approved) return;
    clearNotice("generatorNotice"); const button = $("generateProject"); button.disabled = true;
    let generated = null;
    try {
      const config = { id: current.id, business: current.name, industry: current.industry, createdAt: current.createdAt, requirements: current.requirements, architecture: current.architecture };
      if (window.ForgeAIProvider.settings().enabled) {
        const draftContext = JSON.stringify({ requirements: current.requirements, architecture: current.architecture });
        const existingDrafts = current.aiDraftContext === draftContext ? current.aiDraftFiles : {};
        button.textContent = "Preparing custom AI source…";
        showNotice("generatorNotice", "Forge will create the custom page, styling, and application behavior in separate steps. Each finished step is saved so you can resume if one fails. AI errors never switch to a template.", false);
        const sourceFiles = await window.ForgeAIProvider.requestProjectFiles(current.requirements, current.architecture, undefined, (progress) => {
          const label = { "index.html": "custom page", "css/styles.css": "custom styling", "js/app.js": "application behavior" }[progress.path];
          if (progress.status === "retrying") {
            button.textContent = progress.strategy === "concise" ? "Retrying " + label + " with a shorter prompt…" : "Retrying " + label + " with a larger response limit…";
            showNotice("generatorNotice", progress.strategy === "concise" ? "The model response for " + label + " was cut off. Forge is retrying just this file with a more compact output request; completed files stay saved." : "The model response for " + label + " was cut off. Forge is retrying just this file with a larger response limit; completed files stay saved.", false);
          } else {
            button.textContent = progress.status === "started" ? "Creating " + label + "…" : "Saved " + progress.completed + " of " + progress.total + " AI source steps";
            showNotice("generatorNotice", progress.status === "started" ? "AI source step " + (progress.completed + 1) + " of " + progress.total + ": creating " + label + ". Keep this page open; completed steps are saved." : "AI source step " + progress.completed + " of " + progress.total + " saved: " + label + ".", false);
          }
          if (progress.status === "completed") {
            current.aiDraftFiles = progress.files;
            current.aiDraftContext = draftContext;
            if (!addOrUpdateCurrent()) throw new Error("Could not save completed AI source progress in browser storage. Keep this page open before retrying.");
          }
        }, existingDrafts);
        generated = window.ForgeGenerator.fromAI(sourceFiles, config);
        delete current.aiDraftFiles;
        delete current.aiDraftContext;
      } else {
        button.textContent = "Preparing labeled template app…";
        generated = window.ForgeGenerator.generate(config);
      }
      const results = keepGeneratedInBrowser(generated);
      const passed = results.filter((result) => result.passed).length;
      const generatorLabel = generated.project.generator || "Forge generator";
      showNotice("generatorNotice", "Generated " + current.fileCount + " project files with " + generatorLabel + ". " + passed + "/" + results.length + " source checks passed. Your app is available in the live preview. Choose Save project to a folder or Download project ZIP when you are ready.", passed !== results.length);
      showToast("Project generated and checks completed.");
      updateOverview();
    } catch (error) {
      if (!generated) {
        const drafts = current && current.aiDraftFiles || {};
        const savedCount = ["index.html", "css/styles.css", "js/app.js"].filter((path) => typeof drafts[path] === "string").length;
        const resume = savedCount ? " " + savedCount + " of 3 completed AI source steps are saved; choose Generate again to resume." : "";
        const detail = error.message || String(error);
        const apiHelp = /Forge's local API is unavailable|Ollama returned HTTP|Ollama is not responding/.test(detail) ? " Check that Ollama and Start Forge AI.command are running, then refresh this page." : "";
        showNotice("generatorNotice", (window.ForgeAIProvider.settings().enabled ? "AI generation did not complete; no template was substituted. " : "") + detail + apiHelp + resume, true);
      } else showNotice("generatorNotice", "The app was generated, but Forge could not prepare it in the browser: " + (error.message || String(error)), true);
    } finally { button.textContent = window.ForgeAIProvider.settings().enabled ? "Generate custom app with local AI" : "Generate offline template app"; button.disabled = !current || !current.approved; }
  });
  $("saveProjectFolder").addEventListener("click", async () => {
    if (!current || !currentFiles || currentFolder) return;
    const button = $("saveProjectFolder");
    button.disabled = true;
    button.textContent = "Choose a folder…";
    try {
      const project = JSON.parse(currentFiles["project.json"] || "{}");
      const folder = await window.ForgeGenerator.createFolder(project);
      button.textContent = "Saving project files…";
      await window.ForgeGenerator.writeProject(folder, currentFiles);
      const version = current.versions.find((entry) => Number(entry.number) === Number(current.version));
      if (version && version.snapshotPath) await window.ForgeGenerator.writeSnapshot(folder, version.snapshotPath, currentFiles);
      const verification = await window.ForgeGenerator.verifyProject(folder, currentFiles);
      if (!verification.passed) throw new Error(verification.detail || "Forge could not verify the saved project files.");
      currentFolder = folder;
      current.zipFallback = false;
      current.folderName = folder.name;
      current.files = currentFiles;
      addOrUpdateCurrent();
      installFiles(currentFiles, true);
      showNotice("generatorNotice", "Saved and verified the project in generated-projects/" + folder.name + ". Future edits can be saved directly to this folder.", false);
      showToast("Project saved to the selected folder.");
    } catch (error) {
      button.disabled = false;
      button.textContent = "Save project to a folder…";
      const canceled = error && error.name === "AbortError";
      showNotice("generatorNotice", canceled ? "Folder selection was canceled. Your generated app is still available in Forge; you can choose Save project to a folder again or download its ZIP." : "Could not save the project to that folder: " + (error.message || String(error)) + ". Your generated app remains available in Forge, and the ZIP download is still available.", !canceled);
    }
  });
  $("downloadProjectZip").addEventListener("click", () => {
    if (!current || !currentFiles || !current.zipFallback) return;
    try {
      const archiveFiles = { ...(current.zipEntries || {}), ...currentFiles };
      const version = current.versions.find((entry) => Number(entry.number) === Number(current.version));
      const snapshotPath = version && version.snapshotPath || ".forge-history/v" + current.version;
      for (const path of window.ForgeGenerator.paths) if (typeof currentFiles[path] === "string") archiveFiles[snapshotPath + "/" + path] = currentFiles[path];
      const result = window.ForgeGenerator.downloadProjectZip(archiveFiles, current.name);
      const slug = (JSON.parse(currentFiles["project.json"] || "{}").slug || current.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
      showNotice("generatorNotice", "Started downloading " + result.filename + ". Check your browser downloads, then extract it into Outputs to create generated-projects/" + slug + " with the app files and its first version snapshot. Then choose Open existing project folder to edit and save directly.", false);
    } catch (error) { showNotice("generatorNotice", error.message || String(error), true); }
  });
  $("filePicker").addEventListener("change", loadSelectedFile);
  $("sourceEditor").addEventListener("input", () => {
    const path = $("filePicker").value;
    if (!currentFiles || typeof currentFiles[path] !== "string") return;
    const content = $("sourceEditor").value;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      refreshPreview({ ...currentFiles, [path]: content }, true);
      $("editorStatus").textContent = "Unsaved edit shown in preview · save the file to keep it";
    }, 350);
  });
  $("saveSource").addEventListener("click", async () => {
    if (!current || !currentFiles) return;
    const path = $("filePicker").value;
    const newContent = $("sourceEditor").value;
    if (!currentFolder && current.zipFallback) {
      try { saveZipProjectFile(path, newContent); }
      catch (error) { showNotice("generatorNotice", error.message || String(error), true); }
      return;
    }
    const previousContent = currentFiles[path];
    const previousManifest = currentFiles["project.json"];
    const previousVersion = current.version;
    const previousUpdatedAt = current.updatedAt;
    const previousStage = current.stage;
    const previousTestResults = current.testResults;
    const previousVersions = Array.isArray(current.versions) ? current.versions.map((version) => ({ ...version })) : current.versions;
    try {
      if (!currentFolder) throw new Error("This browser session has no connected project folder. Choose Open existing project folder and select this project's folder, then save again.");
      current.versions = current.versions || [];
      const oldVersion = current.version || 1;
      let oldVersionEntry = current.versions.find((version) => Number(version.number) === Number(oldVersion));
      if (!oldVersionEntry) { oldVersionEntry = { number: oldVersion, note: "Version before update" }; current.versions.push(oldVersionEntry); }
      oldVersionEntry.snapshotPath = oldVersionEntry.snapshotPath || ".forge-history/v" + oldVersion;
      const snapshotManifest = JSON.parse(previousManifest || "{}"); snapshotManifest.versions = current.versions;
      const previousSnapshot = { ...currentFiles, "project.json": JSON.stringify(snapshotManifest, null, 2) };
      await window.ForgeGenerator.writeSnapshot(currentFolder, oldVersionEntry.snapshotPath, previousSnapshot);
      currentFiles["project.json"] = previousSnapshot["project.json"];
      currentFiles[path] = newContent;
      current.version = oldVersion + 1; current.updatedAt = new Date().toISOString();
      const newVersionEntry = { number: current.version, date: current.updatedAt, note: "Updated " + path, snapshotPath: ".forge-history/v" + current.version };
      current.versions.push(newVersionEntry);
      setStage("Files generated");
      current.testResults = null;
      showTests([]);
      const manifest = JSON.parse(currentFiles["project.json"] || "{}");
      manifest.version = current.version; manifest.updatedAt = current.updatedAt; manifest.stage = current.stage; manifest.versions = current.versions; manifest.testResults = null;
      currentFiles["project.json"] = JSON.stringify(manifest, null, 2);
      const writes = { [path]: currentFiles[path], "project.json": currentFiles["project.json"] };
      await window.ForgeGenerator.writeProject(currentFolder, writes);
      await window.ForgeGenerator.writeSnapshot(currentFolder, newVersionEntry.snapshotPath, currentFiles);
      current.files = currentFiles; addOrUpdateCurrent();
      if (pendingSourceFix && pendingSourceFix.path === path) { pendingSourceFix = null; aiFixPanel.classList.add("hidden"); }
      $("editorStatus").textContent = "Saved to " + path + " · version " + current.version; renderFileList(); renderVersionHistory(); showToast("Saved " + path + " to the project folder.");
    } catch (error) {
      let diskRestoreError = null;
      if (currentFolder) {
        try {
          await window.ForgeGenerator.writeProject(currentFolder, { [path]: previousContent, "project.json": previousManifest });
        } catch (restoreError) { diskRestoreError = restoreError; }
      }
      currentFiles[path] = previousContent;
      currentFiles["project.json"] = previousManifest;
      current.version = previousVersion;
      current.updatedAt = previousUpdatedAt;
      setStage(previousStage);
      current.updatedAt = previousUpdatedAt;
      current.testResults = previousTestResults;
      current.versions = previousVersions;
      current.files = currentFiles;
      addOrUpdateCurrent();
      loadSelectedFile();
      showTests(previousTestResults || []);
      renderVersionHistory();
      const recovery = diskRestoreError
        ? " The disk rollback also failed: " + diskRestoreError.message + ". Reopen the project folder and inspect its files before continuing."
        : currentFolder ? " The previous source and manifest were restored on disk." : " No connected project folder was changed.";
      const message = error.message + recovery;
      $("editorStatus").textContent = message;
      showNotice("generatorNotice", message, true);
    }
  });
  async function restoreVersion(number) {
    if (!current || (!currentFolder && !current.zipFallback) || !currentFiles) return;
    const version = current.versions.find((item) => Number(item.number) === Number(number));
    if (!version || !version.snapshotPath || Number(number) === Number(current.version)) return;
    const before = { files: { ...currentFiles }, version: current.version, updatedAt: current.updatedAt, stage: current.stage, testResults: current.testResults, versions: current.versions.map((item) => ({ ...item })), zipEntries: { ...(current.zipEntries || {}) } };
    try {
      let restoredFiles;
      if (currentFolder) restoredFiles = await window.ForgeGenerator.readSnapshot(currentFolder, version.snapshotPath);
      else {
        restoredFiles = {};
        for (const path of window.ForgeGenerator.paths) {
          const content = current.zipEntries && current.zipEntries[version.snapshotPath + "/" + path];
          if (typeof content !== "string") throw new Error("The ZIP does not contain snapshot " + version.snapshotPath + ". Reopen the original project ZIP.");
          restoredFiles[path] = content;
        }
      }
      const currentNumber = current.version || 1;
      let currentEntry = current.versions.find((item) => Number(item.number) === Number(currentNumber));
      if (!currentEntry) { currentEntry = { number: currentNumber, note: "Version before restore" }; current.versions.push(currentEntry); }
      currentEntry.snapshotPath = currentEntry.snapshotPath || ".forge-history/v" + currentNumber;
      const currentManifest = JSON.parse(before.files["project.json"] || "{}"); currentManifest.versions = current.versions;
      const previousSnapshot = { ...before.files, "project.json": JSON.stringify(currentManifest, null, 2) };
      if (currentFolder) await window.ForgeGenerator.writeSnapshot(currentFolder, currentEntry.snapshotPath, previousSnapshot);
      else for (const path of window.ForgeGenerator.paths) current.zipEntries[currentEntry.snapshotPath + "/" + path] = previousSnapshot[path];
      current.version = Math.max(currentNumber, ...current.versions.map((item) => Number(item.number) || 0)) + 1;
      current.updatedAt = new Date().toISOString(); current.stage = "Files generated"; current.testResults = null;
      const restoredManifest = JSON.parse(restoredFiles["project.json"] || "{}");
      const newEntry = { number: current.version, date: current.updatedAt, note: "Restored v" + number, snapshotPath: ".forge-history/v" + current.version };
      current.versions.push(newEntry);
      restoredManifest.version = current.version; restoredManifest.updatedAt = current.updatedAt; restoredManifest.stage = current.stage; restoredManifest.versions = current.versions; restoredManifest.testResults = null;
      restoredFiles["project.json"] = JSON.stringify(restoredManifest, null, 2);
      if (currentFolder) {
        await window.ForgeGenerator.writeProject(currentFolder, restoredFiles);
        await window.ForgeGenerator.writeSnapshot(currentFolder, newEntry.snapshotPath, restoredFiles);
      } else {
        let results = window.ForgeTests.run(restoredFiles);
        setStage(results.every((result) => result.passed) ? "Tests complete" : "Tests need fixes");
        const restoredMetadata = JSON.parse(restoredFiles["project.json"] || "{}"); restoredMetadata.stage = current.stage; restoredMetadata.testResults = results;
        restoredFiles["project.json"] = JSON.stringify(restoredMetadata, null, 2);
        for (const path of window.ForgeGenerator.paths) current.zipEntries[newEntry.snapshotPath + "/" + path] = restoredFiles[path];
        current.testResults = results;
      }
      currentFiles = restoredFiles; current.files = restoredFiles; current.fileCount = Object.keys(restoredFiles).length;
      setStage("Files generated"); showTests([]); installFiles(currentFiles, true); addOrUpdateCurrent(); renderVersionHistory();
      showNotice("generatorNotice", current.zipFallback ? "Restored version " + number + " as new version " + current.version + " in the browser. Run the tests, then download the updated ZIP to keep the restore." : "Restored project version " + number + " as new version " + current.version + ". Run tests before relying on the restored code.", false);
    } catch (error) {
      let diskError = null;
      if (currentFolder) { try { await window.ForgeGenerator.writeProject(currentFolder, before.files); } catch (restoreError) { diskError = restoreError; } }
      currentFiles = before.files; current.files = before.files; current.version = before.version; current.updatedAt = before.updatedAt; current.stage = before.stage; current.testResults = before.testResults; current.versions = before.versions; current.zipEntries = before.zipEntries;
      showCurrentProject(); installFiles(currentFiles, true); showTests(before.testResults || []); addOrUpdateCurrent(); renderVersionHistory();
      const detail = diskError ? error.message + " The restore rollback failed: " + diskError.message + ". Inspect the project folder before continuing." : error.message;
      showNotice("generatorNotice", detail, true);
    }
  }
  $("versionHistory").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-restore-version]");
    if (button) await restoreVersion(Number(button.dataset.restoreVersion));
  });
  function openDiskProject() {
    clearNotice("generatorNotice");
    $("projectFolderInput").value = "";
    $("projectFolderInput").click();
  }
  async function openUploadedProjectFolder(fileList) {
    try {
      const opened = await window.ForgeGenerator.readProjectFolderFiles(fileList);
      newProjectDraft = false;
      currentFolder = null; currentFiles = opened.files;
      const config = opened.project;
      current = { id: config.id || "folder-" + Date.now(), name: config.name || "Opened project", industry: config.industry || "Other", createdAt: config.createdAt || config.generatedAt || new Date().toISOString(), updatedAt: config.updatedAt || new Date().toISOString(), stage: config.stage || "Files generated", approved: true, requirements: config.requirements || {}, architecture: config.architecture || { report: "Architecture metadata was not included in this project." }, files: currentFiles, fileCount: Object.keys(currentFiles).length, version: Number(config.version) || 1, versions: config.versions || [], testResults: config.testResults || null, outstandingTasks: config.outstandingTasks || (config.architecture && config.architecture.questions) || [], folderName: config.name, zipFallback: true, zipEntries: opened.snapshots };
      const results = window.ForgeTests.run(currentFiles);
      setStage(results.every((result) => result.passed) ? "Tests complete" : "Tests need fixes");
      const manifest = JSON.parse(currentFiles["project.json"]); manifest.stage = current.stage; manifest.testResults = results;
      currentFiles["project.json"] = JSON.stringify(manifest, null, 2); current.files = currentFiles; current.testResults = results;
      addOrUpdateCurrent(); showCurrentProject(); installFiles(currentFiles, true); updateApprovalControls(); navigate("generator");
      showTests(results); renderVersionHistory();
      showNotice("generatorNotice", "Opened “" + (config.name || "project") + "” from the selected folder and ran " + results.filter((result) => result.passed).length + "/" + results.length + " source checks. Edit or restore here, then download an updated ZIP.", false); showToast("Project opened from the selected folder.");
    } catch (error) {
      showNotice("generatorNotice", error.message || String(error), true);
    }
  }
  $("openProjectFolderAlt").addEventListener("click", openDiskProject);
  $("projectFolderInput").addEventListener("change", (event) => { if (event.target.files && event.target.files.length) void openUploadedProjectFolder(event.target.files); });
  $("projectFolderInput").addEventListener("cancel", () => showNotice("generatorNotice", "Folder selection was canceled. Choose the project folder, or open a project ZIP.", false));
  async function openProjectZipFile(file) {
    if (!file) return;
    try {
      clearNotice("generatorNotice");
      const opened = await window.ForgeGenerator.readProjectZip(file), config = opened.project;
      currentFolder = null; currentFiles = opened.files; newProjectDraft = false;
      current = { id: config.id || "zip-" + Date.now(), name: config.name || "Opened project", industry: config.industry || "Other", createdAt: config.createdAt || config.generatedAt || new Date().toISOString(), updatedAt: config.updatedAt || new Date().toISOString(), stage: config.stage || "Files generated", approved: true, requirements: config.requirements || {}, architecture: config.architecture || { report: "Architecture metadata was not included in this project." }, files: currentFiles, fileCount: Object.keys(currentFiles).length, version: Number(config.version) || 1, versions: Array.isArray(config.versions) ? config.versions : [], testResults: null, outstandingTasks: config.outstandingTasks || (config.architecture && config.architecture.questions) || [], zipFallback: true, zipEntries: opened.snapshots };
      let results = window.ForgeTests.run(currentFiles);
      setStage(results.every((result) => result.passed) ? "Tests complete" : "Tests need fixes");
      const manifest = JSON.parse(currentFiles["project.json"] || "{}"); manifest.stage = current.stage; manifest.testResults = results;
      currentFiles["project.json"] = JSON.stringify(manifest, null, 2); current.files = currentFiles; current.testResults = results;
      addOrUpdateCurrent(); showCurrentProject(); installFiles(currentFiles, true); updateApprovalControls(); showTests(results); renderVersionHistory();
      navigate("generator"); refreshPreview(currentFiles);
      showToast("Opened " + file.name + " with its preview and checks. Use Software Generator to view the source files.");
    } catch (error) { showNotice("generatorNotice", error.message || String(error), true); }
  }
  $("openProjectZipAlt").addEventListener("click", () => { $("projectZipInput").value = ""; $("projectZipInput").click(); });
  $("projectZipInput").addEventListener("change", (event) => { const file = event.target.files && event.target.files[0]; void openProjectZipFile(file); });
  function showTests(results) {
    lastTestResults = results || []; const host = $("testResults"); host.replaceChildren();
    let passed = 0; lastTestResults.forEach((result) => { if (result.passed) passed++; const row = document.createElement("div"); row.className = "test-row"; const detail = document.createElement("span"); detail.textContent = result.name + " — " + result.detail + (result.passed ? "" : " Suggested fix: " + result.advice); const badge = document.createElement("span"); badge.className = "test-badge" + (result.passed ? "" : " fail"); badge.textContent = result.passed ? "PASS" : "FAIL"; row.append(detail, badge); host.appendChild(row); });
    $("testsCompleted").textContent = String(lastTestResults.length); $("testsPassed").textContent = String(passed); $("testsFailed").textContent = String(lastTestResults.length - passed); $("testStatus").textContent = lastTestResults.length ? (passed === lastTestResults.length ? "ALL CHECKS PASSED" : "ISSUES FOUND") : "NO TESTS RUN";
    const advice = $("testAdvice"); advice.classList.remove("error", "success"); if (lastTestResults.length) advice.classList.add(passed === lastTestResults.length ? "success" : "error"); const diskChecked = lastTestResults.some((result) => result.name === "Generated files on disk"); advice.textContent = lastTestResults.length ? (passed === lastTestResults.length ? "All " + passed + " performed checks passed." + (diskChecked ? " Generated files were also read back from the selected folder." : " These are source-level checks; open the project folder to verify its saved files.") + " Checks do not replace user acceptance testing." : (lastTestResults.length - passed) + " of " + lastTestResults.length + " checks failed. Review the suggested fixes in the test list.") : "Tests have not been run.";
    updateAIFixControls();
  }
  function updateAIFixControls() {
    if (!aiFixButton) return;
    const hasFailure = lastTestResults.some((result) => !result.passed);
    const enabled = window.ForgeAIProvider.settings().enabled;
    aiFixButton.disabled = aiFixBusy || !hasFailure || !enabled || !currentFiles;
    aiFixButton.title = !enabled ? "Enable the local Ollama model in Settings to request a fix proposal." : !hasFailure ? "Run checks with a failure before requesting a fix proposal." : "Ask the local model for a reviewable source-file replacement.";
    aiFixButton.textContent = enabled ? "Ask local AI to propose a fix for selected file" : "AI fix proposals disabled — enable local AI in Settings";
  }
  function initializeAIFixReview() {
    const host = $("testResults").parentElement;
    const controls = document.createElement("div");
    controls.className = "btn-row";
    aiFixPath = document.createElement("select");
    aiFixPath.className = "input";
    aiFixPath.setAttribute("aria-label", "Source file for AI fix proposal");
    for (const path of ["index.html", "css/styles.css", "js/app.js", "data/sample-data.js"]) {
      const option = document.createElement("option");
      option.value = path;
      option.textContent = path;
      aiFixPath.appendChild(option);
    }
    aiFixButton = document.createElement("button");
    aiFixButton.type = "button";
    aiFixButton.className = "btn";
    aiFixButton.disabled = true;
    aiFixButton.addEventListener("click", async () => {
      if (!current || !currentFiles || !lastTestResults.some((result) => !result.passed)) return;
      const path = aiFixPath.value;
      aiFixBusy = true;
      aiFixButton.disabled = true;
      aiFixButton.textContent = "Asking local model to review the failed checks…";
      try {
        const proposal = await window.ForgeAIProvider.requestFixProposal(path, currentFiles[path], current.requirements, current.architecture, lastTestResults, undefined, currentFiles);
        pendingSourceFix = { path, content: proposal };
        const candidateResults = window.ForgeTests.run({ ...currentFiles, [path]: proposal });
        const candidatePassed = candidateResults.filter((result) => result.passed).length;
        const candidateFailures = candidateResults.filter((result) => !result.passed).map((result) => result.name);
        aiFixCurrent.value = currentFiles[path];
        aiFixProposed.value = proposal;
        aiFixSummary.textContent = "Proposal for " + path + ". Static source checks would pass " + candidatePassed + "/" + candidateResults.length + (candidateFailures.length ? "; remaining failures: " + candidateFailures.join(", ") : "; all current source checks pass.") + " The proposal was not executed.";
        aiFixPanel.classList.remove("hidden");
        aiFixPanel.open = true;
        showNotice("testAdvice", "The model proposed a replacement for " + path + ". Review both versions below; nothing has been changed or run.", false);
      } catch (error) {
        showNotice("testAdvice", "Could not get an AI fix proposal: " + (error.message || String(error)), true);
      } finally { aiFixBusy = false; updateAIFixControls(); }
    });
    controls.append(aiFixPath, aiFixButton);
    host.insertBefore(controls, $("testResults"));

    aiFixPanel = document.createElement("details");
    aiFixPanel.className = "card project-tools hidden";
    const summary = document.createElement("summary");
    summary.textContent = "Review AI-proposed source change (not applied)";
    const review = document.createElement("div");
    review.className = "grid";
    const currentLabel = document.createElement("label");
    currentLabel.textContent = "Current source";
    aiFixCurrent = document.createElement("textarea");
    aiFixCurrent.className = "editor";
    aiFixCurrent.readOnly = true;
    const proposalLabel = document.createElement("label");
    proposalLabel.textContent = "Proposed replacement";
    aiFixProposed = document.createElement("textarea");
    aiFixProposed.className = "editor";
    aiFixProposed.readOnly = true;
    currentLabel.appendChild(aiFixCurrent);
    proposalLabel.appendChild(aiFixProposed);
    review.append(currentLabel, proposalLabel);
    aiFixSummary = document.createElement("p");
    aiFixSummary.className = "card-desc";
    aiFixSummary.textContent = "Review the proposed source before loading it into the editor.";
    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "btn primary";
    loadButton.textContent = "Load proposed source into editor for review";
    loadButton.addEventListener("click", () => {
      if (!pendingSourceFix) return;
      $("filePicker").value = pendingSourceFix.path;
      loadSelectedFile();
      $("sourceEditor").value = pendingSourceFix.content;
      $("sourceEditor").closest("details").open = true;
      navigate("generator");
      showNotice("generatorNotice", "AI proposal loaded into the editor but not saved. Review the source and click Save file only if you approve this change.", false);
    });
    aiFixPanel.append(summary, aiFixSummary, review, loadButton);
    host.insertBefore(aiFixPanel, $("testResults").nextSibling);
    updateAIFixControls();
  }
  $("runTests").addEventListener("click", async () => {
    if (!currentFiles) return;
    const button = $("runTests"); button.disabled = true; button.textContent = "Running checks…";
    try { const diskVerification = currentFolder ? await window.ForgeGenerator.verifyProject(currentFolder, currentFiles) : null; const results = window.ForgeTests.run(currentFiles, diskVerification); showTests(results); current.testResults = results; setStage(results.every((result) => result.passed) ? "Tests complete" : "Tests need fixes"); addOrUpdateCurrent(); showToast("Completed " + results.length + " checks."); }
    catch (error) { showNotice("testAdvice", error.message || String(error), true); }
    finally { button.textContent = "Run project tests"; button.disabled = !currentFiles; }
  });
  function openPreview() { if (!currentFiles) return; refreshPreview(currentFiles); navigate("generator"); $("previewWrap").scrollIntoView({ behavior: "smooth", block: "start" }); }
  $("showPreview").addEventListener("click", openPreview);
  $("refreshPreview").addEventListener("click", () => refreshPreview(currentFiles));
  const aiSettings = window.ForgeAIProvider.settings();
  $("ollamaEnabled").checked = aiSettings.enabled;
  $("ollamaModel").value = aiSettings.model;
  function updateGeneratorMode() {
    const enabled = $("ollamaEnabled").checked;
    $("generateProject").textContent = enabled ? "Generate custom app with local AI" : "Generate offline template app";
    $("generateProject").title = enabled ? "Generate application source files with the selected local model." : "Use Forge's deterministic offline template generator.";
  }
  updateGeneratorMode();
  function saveAISettings() {
    return window.ForgeAIProvider.configure({ enabled: $("ollamaEnabled").checked, model: $("ollamaModel").value });
  }
  ["ollamaEnabled", "ollamaModel"].forEach((id) => $(id).addEventListener("change", () => {
    try { saveAISettings(); updateGeneratorMode(); updateAIFixControls(); showNotice("ollamaNotice", "Local model settings saved. Test the connection before requesting AI architecture or source generation.", false); }
    catch (error) { showNotice("ollamaNotice", error.message || String(error), true); }
  }));
  $("checkOllama").addEventListener("click", async () => {
    const button = $("checkOllama"); button.disabled = true; button.textContent = "Checking local service…";
    try {
      saveAISettings();
      const models = await window.ForgeAIProvider.checkConnection();
      const matching = models.includes($("ollamaModel").value.trim());
      $("modelStatus").textContent = models.length ? "CONNECTED" : "CONNECTED · NO MODEL";
      $("modelStatus").classList.toggle("error", false);
      showNotice("ollamaNotice", models.length ? "Connected. Local models: " + models.join(", ") + (matching ? ". Selected model is installed." : ". Selected model is not in the installed list yet.") : "Connected to Ollama, but no local models are installed yet.", false);
    } catch (error) {
      $("modelStatus").textContent = "NOT CONNECTED";
      $("modelStatus").classList.add("error");
      showNotice("ollamaNotice", "Could not connect to local Ollama: " + (error.message || String(error)), true);
    }
    finally { button.disabled = false; button.textContent = "Check connection & models"; }
  });
  $("exportProjects").addEventListener("click", () => {
    try { const blob = new Blob([JSON.stringify(projects, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "forge-ai-projects.json"; link.click(); URL.revokeObjectURL(url); showNotice("settingsNotice", "Exported " + projects.length + " project records.", false); }
    catch (error) { showNotice("settingsNotice", error.message || String(error), true); }
  });
  $("clearProjects").addEventListener("click", () => {
    if (!window.confirm("Clear all Forge AI project metadata saved in this browser? Generated folders on disk will not be deleted.")) return;
    projects = []; current = null; currentFiles = null; currentFolder = null; localStorage.removeItem(STORE); clearGeneratedUI(); persist(); showNotice("settingsNotice", "Local project metadata cleared. Files saved in project folders were not changed.", false); updateApprovalControls();
  });

  initializeAIFixReview();
  // Restore the most recently updated project as the active workspace on reload.
  if (projects.length) { const latest = projects.slice().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0]; current = latest; currentFiles = latest.files || null; showCurrentProject(); if (currentFiles) installFiles(currentFiles, true); }
  renderProjects(); updateOverview(); updateApprovalControls();
})();
