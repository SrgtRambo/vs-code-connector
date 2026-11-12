// Rule-based requirements and architecture engine.
// Future model adapters can implement the same buildArchitecture interface.
(function () {
  "use strict";
  const clean = (value, fallback) => String(value || "").trim() || fallback;
  const hasAny = (text, words) => words.some((word) => text.includes(word));
  const unique = (values) => [...new Set(values.filter(Boolean))];

  function buildArchitecture(input) {
    const d = input || {};
    const business = clean(d.business, "New business project");
    const industry = clean(d.industry, "Other");
    const problem = clean(d.problem, "Problem details required");
    const goal = clean(d.goal, "Outcome details required");
    const workflow = clean(d.workflow, "Current workflow needs review with users");
    const users = clean(d.users, "Business owners and staff");
    const constraints = clean(d.constraints, "No additional constraints were provided");
    const success = clean(d.success, "Agree on a measurable target with users");
    const context = [problem, goal, workflow, d.activities, d.features].join(" ").toLowerCase();
    const customerContext = hasAny(context, ["customer", "client", "lead", "inquir", "booking"]);
    const inventoryContext = hasAny(context, ["inventory", "stock", "product", "supply", "supplies"]);
    const featureRequests = String(d.features || "").split(/[\n,;]+/).map((v) => v.trim()).filter(Boolean);
    const features = ["Search and filter records", "Create and edit work items", "Track status and due dates", "Save records locally in the browser"];
    if (hasAny(context, ["lead", "customer", "client", "inquir", "booking"])) features.push("Customer and inquiry pipeline");
    if (hasAny(context, ["follow", "remind", "appointment", "calendar", "estimate", "quote", "miss"])) features.push("Follow-up tracking with due dates");
    if (hasAny(context, ["invoice", "payment", "bill", "paid"])) features.push("Invoice status tracking (no payment processing)");
    if (hasAny(context, ["employee", "team", "staff", "assign", "worker"])) features.push("Team ownership and work assignments");
    if (inventoryContext) features.push("Inventory and low-stock tracking");
    features.push(...featureRequests);
    const workflows = [];
    if (hasAny(context, ["lead", "customer", "client", "inquir", "booking"])) workflows.push("Capture a customer request → assign an owner → update status → record the outcome.");
    if (hasAny(context, ["follow", "remind", "appointment", "calendar", "estimate", "quote", "miss"])) workflows.push("Create a follow-up → set a due date → review upcoming work → complete or reschedule.");
    if (inventoryContext) workflows.push("Record incoming stock → compare on-hand quantities with reorder thresholds → flag products that need replenishment.");
    if (!workflows.length) workflows.push("Create a work item → assign an owner → update status → review completion.");
    const screens = [
      { name: "Work Queue", purpose: "Search, filter, and review active and completed records." },
      { name: "Work Item Form", purpose: "Create or edit a record, owner, status, due date, and notes." },
      { name: "Workspace Summary", purpose: "Show open work, items due today, and completed work." }
    ];
    if (hasAny(context, ["customer", "client", "lead", "inquir"])) screens.push({ name: "Customer Pipeline", purpose: "Track requests from intake through resolution." });
    if (inventoryContext) {
      screens.push({ name: "Inventory Catalog", purpose: "Review product quantities, supplier details, and low-stock items." });
      screens.push({ name: "Product Form", purpose: "Add or update a product, on-hand quantity, reorder threshold, and supplier notes." });
    }
    const entities = [
      { name: "WorkItem", fields: ["id", "title", "contact", "status", "dueDate", "notes", "createdAt", "updatedAt"], relations: "One optional contact label; no external database." },
      { name: "ProjectSettings", fields: ["businessName", "industry", "storageKey"], relations: "One settings record per generated app." }
    ];
    if (hasAny(context, ["customer", "client", "lead", "inquir"])) entities.push({ name: "Customer", fields: ["id", "name", "contact", "notes"], relations: "A customer can be referenced by multiple work items." });
    if (inventoryContext) entities.push({ name: "InventoryItem", fields: ["id", "productName", "supplier", "quantity", "minimum", "status", "nextDelivery", "notes"], relations: "Quantity is compared with the reorder threshold for each product." });
    const roles = String(d.users || "").split(/[,;\n]+/).map((role) => role.trim()).filter(Boolean);
    const validation = ["Work item title is required", "Dates use the browser date input", "Text inputs are length-limited and rendered with HTML escaping"];
    if (inventoryContext) validation.push("Stock quantity and reorder threshold must be non-negative whole numbers", "Items at or below the reorder threshold are flagged for replenishment");
    else if (customerContext) validation.push("Customer stage must be New lead, Contacted, Appointment set, Active, or Closed");
    else validation.push("Work status must be New, In progress, Waiting, or Done");
    const questions = [];
    if (!d.workflow) questions.push("Confirm the actual start-to-finish steps and handoffs.");
    if (!d.users) questions.push("Confirm who can create, update, and remove records.");
    if (!d.constraints) questions.push("Confirm privacy, device, backup, and access requirements before using real data.");
    if (!d.success) questions.push("Set one measurable success target for the first month.");
    const architecture = {
      business, industry,
      overview: `${business} needs a local application to address: ${problem} The first version focuses on: ${goal}`,
      technology: ["HTML5", "CSS", "Vanilla JavaScript", "Browser localStorage"],
      structure: ["index.html — application structure", "css/styles.css — responsive interface", "js/app.js — CRUD, search, filters, and persistence", "data/sample-data.js — empty fictional sample data", "project.json — project and architecture metadata"],
      visualDirection: {
        style: inventoryContext ? "A clear, tactile operations catalog for stock decisions." : customerContext ? "A welcoming, relationship-centered workspace for customer follow-through." : "A focused, practical workspace shaped around the team's daily handoffs.",
        palette: inventoryContext ? ["#f5f1e8", "#274c3b", "#d18b45", "#202923"] : customerContext ? ["#f5f0eb", "#574273", "#c87557", "#28232e"] : ["#eff3f2", "#315e68", "#d29a55", "#242d31"],
        typography: "Use system sans-serif for controls and a restrained system serif for prominent headings.",
        composition: "Prioritize the main daily decision and its next action over generic summary cards.",
        signature: "Use one restrained, business-relevant color or shape cue to distinguish the primary workflow."
      },
      features: unique(features), modules: ["Work item management", "Search and status filtering", "Local persistence", "Summary metrics"],
      screens, navigation: inventoryContext ? ["Workspace Summary", "Inventory Catalog", "Product Form"] : ["Workspace Summary", "Work Queue", "Work Item Form"], workflows,
      entities, permissions: roles.length ? roles.map((role) => `${role}: local prototype uses shared device access; confirm production permissions before real use.`) : ["Single local user on this device; shared-device access is not protected."],
      validation,
      errors: ["Invalid or unavailable browser storage is reported to the user", "Folder access cancellation does not overwrite files", "Existing project folder names receive a numeric suffix"],
      tests: ["Required files exist", "HTML core structure and internal references", "JavaScript syntax compilation", "Create/edit/delete and local persistence hooks", "Required form validation"],
      milestones: ["Generate a working local starter app", "Run the built-in source checks and preview the workflow", "Review with fictional sample data", "Refine the first workflow before adding integrations"],
      requirements: { business, industry, size: d.size || "Not provided", employees: d.employees || "Not provided", activities: d.activities || "Not provided", tools: d.tools || "Not provided", problem, workflow, goal, features: d.features || "Derived from problem and outcome", users, success, constraints, followUpAnswers: Array.isArray(d.followUpAnswers) ? d.followUpAnswers : [] },
      questions
    };
    const ai = d.aiArchitecture;
    const list = (value, fallback) => Array.isArray(value) && value.length && value.length <= 30 ? value.map((item) => String(item).slice(0, 500)).filter(Boolean) : fallback;
    if (ai && typeof ai === "object") {
      architecture.overview = typeof ai.overview === "string" ? ai.overview.slice(0, 2000) : architecture.overview;
      architecture.features = list(ai.features, architecture.features);
      architecture.modules = list(ai.modules, ["Business workflow"]);
      architecture.screens = Array.isArray(ai.screens) && ai.screens.length && ai.screens.length <= 20 ? ai.screens.filter((item) => item && typeof item.name === "string" && typeof item.purpose === "string").map((item) => ({ name: item.name.slice(0, 120), purpose: item.purpose.slice(0, 500) })) : [{ name: "Application", purpose: "Complete the approved business workflow." }];
      architecture.navigation = list(ai.navigation, architecture.navigation);
      architecture.workflows = list(ai.workflows, architecture.workflows);
      architecture.entities = Array.isArray(ai.entities) && ai.entities.length && ai.entities.length <= 20 ? ai.entities.filter((item) => item && typeof item.name === "string" && Array.isArray(item.fields) && typeof item.relations === "string").map((item) => ({ name: item.name.slice(0, 120), fields: item.fields.slice(0, 30).map((field) => String(field).slice(0, 120)), relations: item.relations.slice(0, 500) })) : [{ name: "BusinessRecord", fields: ["id"], relations: "Records needed by the approved workflow." }];
      architecture.validation = list(ai.validation, ["Validate required business information before saving."]);
      if (ai.visualDirection && typeof ai.visualDirection === "object") {
        architecture.visualDirection = {
          style: String(ai.visualDirection.style || "").slice(0, 500),
          palette: Array.isArray(ai.visualDirection.palette) ? ai.visualDirection.palette.slice(0, 6).map((color) => String(color).slice(0, 40)) : architecture.visualDirection.palette,
          typography: String(ai.visualDirection.typography || "").slice(0, 500),
          composition: String(ai.visualDirection.composition || "").slice(0, 500),
          signature: String(ai.visualDirection.signature || "").slice(0, 500)
        };
      }
      architecture.tests = ["Implement and test each approved business workflow", "Validate required and business-specific fields", "Verify responsive layout and local persistence"];
      architecture.questions = Array.isArray(ai.questions) && ai.questions.length <= 30 ? ai.questions.map((item) => String(item).slice(0, 500)) : architecture.questions;
      architecture.provider = "ollama";
    } else architecture.provider = "local-rules";
    const lines = [
      "FORGE AI — SOFTWARE ARCHITECTURE", ai ? "LOCAL AI DRAFT · REVIEW BEFORE GENERATION" : "RULE-BASED LOCAL DRAFT · REVIEW BEFORE GENERATION", "",
      "APPLICATION OVERVIEW", architecture.overview, `Industry: ${industry}`, `Primary users: ${users}`, `Success measure: ${success}`, "",
      "REQUIREMENTS", `Problem: ${problem}`, `Desired outcome: ${goal}`, `Current workflow: ${workflow}`, `Current tools: ${d.tools || "Not provided"}`, `Constraints: ${constraints}`, "",
      "TECHNOLOGY", ...architecture.technology.map((item) => "• " + item), "",
      "APPLICATION STRUCTURE", ...architecture.structure.map((item) => "• " + item), "",
      "FEATURES & MODULES", ...architecture.features.map((item, i) => `${i + 1}. ${item}`), "Modules: " + architecture.modules.join(" · "), "",
      "SCREENS", ...architecture.screens.map((screen, i) => `${i + 1}. ${screen.name}: ${screen.purpose}`), "",
      "NAVIGATION", ...architecture.navigation.map((item, i) => `${i + 1}. ${item}`), "",
      "WORKFLOWS", ...architecture.workflows.map((item, i) => `${i + 1}. ${item}`), "",
      "VISUAL DIRECTION", `Style: ${architecture.visualDirection.style}`, `Palette: ${architecture.visualDirection.palette.join(" · ")}`, `Typography: ${architecture.visualDirection.typography}`, `Composition: ${architecture.visualDirection.composition}`, `Signature detail: ${architecture.visualDirection.signature}`, "",
      "DATA STRUCTURE & RELATIONSHIPS", ...architecture.entities.map((entity) => `${entity.name}: ${entity.fields.join(", ")}\n  Relationship: ${entity.relations}`), "",
      "ROLES & PERMISSIONS", ...architecture.permissions.map((item) => "• " + item), "",
      "VALIDATION & ERROR STATES", ...architecture.validation.map((item) => "• " + item), ...architecture.errors.map((item) => "• " + item), "",
      "TESTING REQUIREMENTS", ...architecture.tests.map((item, i) => `${i + 1}. ${item}`), "",
      "DEVELOPMENT MILESTONES", ...architecture.milestones.map((item, i) => `${i + 1}. ${item}`), "",
      "OPEN QUESTIONS", ...(architecture.questions.length ? architecture.questions.map((item, i) => `${i + 1}. ${item}`) : ["Review assumptions with intended users before expanding scope."]), "",
      "APPROVAL", ai ? "Approve this blueprint to generate a runnable, local HTML/CSS/JavaScript application. Model-generated architecture should be reviewed and is not a production security review." : "Approve this blueprint to generate a runnable, local HTML/CSS/JavaScript application. This rule-based draft is not a production security review."
    ];
    architecture.report = lines.join("\n");
    return architecture;
  }

  window.ForgeArchitect = { buildArchitecture, provider: "local-rules" };
  window.buildArchitecture = buildArchitecture;
})();
