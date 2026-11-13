import express from 'express';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { promises as fs } from 'node:fs';
import archiver from 'archiver';
import path from 'node:path';
import crypto from 'node:crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ---------- Supabase Client Setup ----------
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------- Stripe Client Setup ----------
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Ensure Supabase storage bucket "projects" exists (idempotent)
async function ensureBucket() {
  try {
    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (listErr) {
      console.warn('Bucket list notice:', listErr.message);
      return;
    }
    const exists = buckets?.find((b) => b.name === 'projects');
    if (!exists) {
      const { error: createErr } = await supabase.storage.createBucket('projects', { public: false });
      if (createErr) console.warn('Bucket create notice:', createErr.message);
      else console.log('✅ Supabase storage bucket "projects" ready.');
    } else {
      console.log('✅ Supabase storage bucket "projects" verified.');
    }
  } catch (e) {
    console.warn('Storage check:', e.message);
  }
}
ensureBucket();

// ---------- Supabase User Helper ----------
async function getOrCreateUser(email) {
  try {
    const { data: listData } = await supabase.auth.admin.listUsers();
    const existing = listData?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) return existing;
  } catch (e) {
    console.warn('User lookup notice:', e.message);
  }

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { source: 'forge_checkout' },
    });
    if (error) throw error;
    return data.user;
  } catch (err) {
    console.warn('Admin createUser fallback:', err.message);
    return { id: crypto.randomUUID(), email };
  }
}

// ---------- Robust JSON Cleaner for AI Output ----------
function extractJsonFromContent(content) {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();

  // Try direct parse
  try {
    return JSON.parse(trimmed);
  } catch (_) {}

  // Strip markdown code fences (```json ... ``` or ``` ...)
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) {}
  }

  // Look for first { to last }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch (_) {}
  }

  return null;
}

// ---------- High-Quality AI Code Generator ----------
async function generateProject(prompt, type, model) {
  const chosenModel = model || process.env.OPENROUTER_MODEL || 'openrouter/google/gemini-2.0-flash-001';

  const systemInstruction = `You are a world-class principal frontend engineer and UI/UX designer.
Your task is to generate an exceptionally beautiful, super functional, production-ready web application based on the user's description.

RETURN FORMAT:
You MUST return ONLY a valid JSON object where keys are relative file paths and values are string contents of each file.
No markdown commentary outside the JSON. Example:
{
  "index.html": "<!doctype html>...",
  "README.md": "# App\\n..."
}

QUALITY & DESIGN STANDARDS:
1. Visual Polish: Clean, modern SaaS aesthetic (inspired by Linear, Stripe, and Tailwind UI).
   - Use Tailwind CSS and Lucide icons via CDN in index.html for instant, zero-dependency browser preview.
   - Elegant dark/light color palette, typography hierarchy, soft cards, subtle borders, and smooth transitions.
2. Complete Interactivity:
   - Full CRUD: Add, edit, delete, search, status filtering, and sorting.
   - Dynamic KPI metric counters (Total, Active, Completed, Success Rate).
   - Modal dialogs for adding/editing items with form validation.
   - Real-time search and filter with instant feedback and empty states.
   - LocalStorage persistence: Save all records so data persists across refreshes.
   - Pre-populate 4-6 realistic, high-quality sample records matching the user's industry and domain.
   - Export to CSV or JSON feature for real utility.
3. Architecture:
   - "index.html": Standalone zero-build HTML app that can be double-clicked or previewed in any browser immediately.
   - "src/App.jsx": Modular React + Tailwind component.
   - "src/main.jsx": React entry point.
   - "package.json": Dependencies and dev scripts.
   - "README.md": User guide and feature overview.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `Build a complete, stunning ${type} application for: ${prompt}` },
        ],
        temperature: 0.4,
        max_tokens: 8192,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const rawContent = data?.choices?.[0]?.message?.content;
      const parsed = extractJsonFromContent(rawContent);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        return parsed;
      }
    } else {
      const txt = await response.text();
      console.warn(`OpenRouter notice (${response.status}): ${txt}`);
    }
  } catch (err) {
    console.warn('OpenRouter request exception:', err.message);
  }

  // Fallback: Self-healing high-fidelity application generator
  return generateTailoredStandaloneApp(prompt, type);
}

// ---------- Self-Healing Standalone Web App Generator ----------
function generateTailoredStandaloneApp(prompt, type) {
  const safeTitle = prompt.slice(0, 40).replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'Modern Workspace';
  const cleanTitle = safeTitle.charAt(0).toUpperCase() + safeTitle.slice(1);

  const html = `<!doctype html>
<html lang="en" class="h-full">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${cleanTitle} · Forge Studio</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
          },
          colors: {
            brand: { 50: '#eef2ff', 100: '#e0e7ff', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' }
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
    .glass { background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(16px); }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-full flex flex-col antialiased selection:bg-brand-500 selection:text-white">

  <!-- Top Navigation -->
  <header class="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-xl sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-brand-500/20 text-white font-extrabold text-lg">
          F
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="font-bold text-slate-100 text-base sm:text-lg leading-tight">${cleanTitle}</h1>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Production
            </span>
          </div>
          <p class="text-xs text-slate-400">Smart Workspace · ${type.toUpperCase()}</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <button id="exportBtn" class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 bg-slate-800/60 text-xs font-semibold text-slate-300 hover:text-white transition">
          <i data-lucide="download" class="w-3.5 h-3.5"></i> Export CSV
        </button>
        <button id="newItemBtn" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-brand-500/25 transition-all duration-150 active:scale-95">
          <i data-lucide="plus" class="w-4 h-4"></i> Add Record
        </button>
      </div>
    </div>
  </header>

  <!-- Main Body -->
  <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

    <!-- KPI Metric Cards -->
    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div class="flex items-center justify-between text-slate-400 mb-2">
          <span class="text-xs font-medium uppercase tracking-wider">Total Records</span>
          <i data-lucide="layers" class="w-4 h-4 text-brand-400"></i>
        </div>
        <div class="text-3xl font-extrabold text-white" id="statTotal">0</div>
        <div class="text-xs text-slate-500 mt-1">Managed entries</div>
      </div>
      <div class="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div class="flex items-center justify-between text-slate-400 mb-2">
          <span class="text-xs font-medium uppercase tracking-wider">Active Status</span>
          <i data-lucide="activity" class="w-4 h-4 text-emerald-400"></i>
        </div>
        <div class="text-3xl font-extrabold text-emerald-400" id="statActive">0</div>
        <div class="text-xs text-slate-500 mt-1">In progress or ongoing</div>
      </div>
      <div class="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div class="flex items-center justify-between text-slate-400 mb-2">
          <span class="text-xs font-medium uppercase tracking-wider">High Priority</span>
          <i data-lucide="alert-circle" class="w-4 h-4 text-amber-400"></i>
        </div>
        <div class="text-3xl font-extrabold text-amber-400" id="statPriority">0</div>
        <div class="text-xs text-slate-500 mt-1">Requires attention</div>
      </div>
      <div class="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div class="flex items-center justify-between text-slate-400 mb-2">
          <span class="text-xs font-medium uppercase tracking-wider">Completed</span>
          <i data-lucide="check-circle-2" class="w-4 h-4 text-blue-400"></i>
        </div>
        <div class="text-3xl font-extrabold text-blue-400" id="statCompleted">0</div>
        <div class="text-xs text-slate-500 mt-1">Successfully finished</div>
      </div>
    </section>

    <!-- Workspace Controls & Table -->
    <section class="rounded-2xl bg-slate-900/50 border border-slate-800/80 overflow-hidden shadow-xl">
      <!-- Search & Filters -->
      <div class="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-slate-900/30">
        <div class="relative flex-1 max-w-md">
          <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
          <input id="searchInput" type="search" placeholder="Search records, tags, or details..." class="w-full bg-slate-950/70 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition">
        </div>
        <div class="flex items-center gap-2">
          <select id="statusFilter" class="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500">
            <option value="all">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="Completed">Completed</option>
          </select>
          <select id="priorityFilter" class="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500">
            <option value="all">All Priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      <!-- Table / Cards List -->
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-slate-300">
          <thead class="bg-slate-950/40 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
            <tr>
              <th scope="col" class="px-6 py-3.5">Title & Description</th>
              <th scope="col" class="px-6 py-3.5">Category</th>
              <th scope="col" class="px-6 py-3.5">Status</th>
              <th scope="col" class="px-6 py-3.5">Priority</th>
              <th scope="col" class="px-6 py-3.5">Due Date</th>
              <th scope="col" class="px-6 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody id="recordTableBody" class="divide-y divide-slate-800/60">
            <!-- Dynamically populated -->
          </tbody>
        </table>
      </div>

      <!-- Empty State -->
      <div id="emptyState" class="hidden py-16 text-center">
        <div class="w-12 h-12 rounded-full bg-slate-800/80 text-slate-400 mx-auto flex items-center justify-center mb-3">
          <i data-lucide="inbox" class="w-6 h-6"></i>
        </div>
        <p class="text-base font-semibold text-slate-200">No records found</p>
        <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Create a new entry or try modifying your search and filter criteria.</p>
      </div>
    </section>
  </main>

  <!-- Modal Dialog -->
  <dialog id="itemDialog" class="rounded-2xl bg-slate-900 border border-slate-700/80 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/80 max-w-lg w-full">
    <form id="itemForm" class="p-6 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 id="dialogTitle" class="text-lg font-bold text-white">Add New Record</h3>
        <button type="button" id="closeDialogBtn" class="text-slate-400 hover:text-white p-1 rounded-lg">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>
      <input type="hidden" id="recordId">
      <div>
        <label class="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Record Title *</label>
        <input id="formTitle" required class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500" placeholder="e.g. Client Intake or System Review">
      </div>
      <div>
        <label class="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Category</label>
        <input id="formCategory" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500" placeholder="e.g. Operations, Support, Sales">
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Status</label>
          <select id="formStatus" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500">
            <option>Active</option>
            <option>Pending</option>
            <option>Completed</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Priority</label>
          <select id="formPriority" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500">
            <option>Medium</option>
            <option>High</option>
            <option>Low</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Due Date</label>
        <input id="formDueDate" type="date" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500">
      </div>
      <div>
        <label class="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Notes & Context</label>
        <textarea id="formNotes" rows="3" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500" placeholder="Additional details, scope, or requirements..."></textarea>
      </div>
      <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
        <button type="button" id="cancelDialogBtn" class="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-300 transition">Cancel</button>
        <button type="submit" class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-lg shadow-brand-500/25 transition">Save Record</button>
      </div>
    </form>
  </dialog>

  <!-- Script Application Logic -->
  <script>
    const STORAGE_KEY = 'forge_workspace_${safeTitle.toLowerCase()}';
    const defaultData = [
      { id: '1', title: 'Initial Project Assessment', category: 'Discovery', status: 'Completed', priority: 'High', dueDate: '2026-11-15', notes: 'Review requirements and finalize architecture specifications.' },
      { id: '2', title: 'Client Feedback Session', category: 'Operations', status: 'Active', priority: 'High', dueDate: '2026-11-20', notes: 'Present interactive preview and capture adjustments.' },
      { id: '3', title: 'Data Flow & Persistence Audit', category: 'Engineering', status: 'Active', priority: 'Medium', dueDate: '2026-11-25', notes: 'Validate storage schema and local caching mechanisms.' },
      { id: '4', title: 'Production Staging Deployment', category: 'Release', status: 'Pending', priority: 'Low', dueDate: '2026-12-01', notes: 'Prepare final release checklist and live domain configuration.' }
    ];

    let records = [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      records = stored ? JSON.parse(stored) : defaultData;
    } catch (_) {
      records = defaultData;
    }

    function save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch (_) {}
      render();
    }

    function render() {
      const q = document.getElementById('searchInput').value.toLowerCase().trim();
      const statusF = document.getElementById('statusFilter').value;
      const priorityF = document.getElementById('priorityFilter').value;

      const filtered = records.filter(r => {
        const matchesQ = !q || (r.title + ' ' + (r.category||'') + ' ' + (r.notes||'')).toLowerCase().includes(q);
        const matchesS = statusF === 'all' || r.status === statusF;
        const matchesP = priorityF === 'all' || r.priority === priorityF;
        return matchesQ && matchesS && matchesP;
      });

      document.getElementById('statTotal').textContent = records.length;
      document.getElementById('statActive').textContent = records.filter(r => r.status === 'Active').length;
      document.getElementById('statPriority').textContent = records.filter(r => r.priority === 'High').length;
      document.getElementById('statCompleted').textContent = records.filter(r => r.status === 'Completed').length;

      const tbody = document.getElementById('recordTableBody');
      tbody.innerHTML = '';

      if (filtered.length === 0) {
        document.getElementById('emptyState').classList.remove('hidden');
      } else {
        document.getElementById('emptyState').classList.add('hidden');
        filtered.forEach(r => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-slate-800/40 transition group';

          const statusColor = r.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                              r.status === 'Active' ? 'bg-brand-500/10 text-brand-400 border-brand-500/20' :
                              'bg-amber-500/10 text-amber-400 border-amber-500/20';

          const priorityColor = r.priority === 'High' ? 'text-rose-400' :
                                r.priority === 'Medium' ? 'text-amber-400' : 'text-slate-400';

          tr.innerHTML = \`
            <td class="px-6 py-4">
              <div class="font-semibold text-slate-100">\${escapeHtml(r.title)}</div>
              <div class="text-xs text-slate-400 truncate max-w-xs mt-0.5">\${escapeHtml(r.notes || 'No extra notes')}</div>
            </td>
            <td class="px-6 py-4">
              <span class="inline-flex px-2 py-0.5 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                \${escapeHtml(r.category || 'General')}
              </span>
            </td>
            <td class="px-6 py-4">
              <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border \${statusColor}">
                \${escapeHtml(r.status)}
              </span>
            </td>
            <td class="px-6 py-4">
              <span class="text-xs font-bold \${priorityColor}">\${escapeHtml(r.priority)}</span>
            </td>
            <td class="px-6 py-4 text-xs text-slate-400 font-mono">\${escapeHtml(r.dueDate || '—')}</td>
            <td class="px-6 py-4 text-right">
              <div class="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition">
                <button onclick="editRecord('\${r.id}')" class="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white" title="Edit">
                  <i data-lucide="edit-3" class="w-4 h-4"></i>
                </button>
                <button onclick="deleteRecord('\${r.id}')" class="p-1.5 rounded-lg hover:bg-rose-950/60 text-slate-400 hover:text-rose-400" title="Delete">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </td>
          \`;
          tbody.appendChild(tr);
        });
      }
      lucide.createIcons();
    }

    function escapeHtml(s) {
      return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    const dialog = document.getElementById('itemDialog');
    document.getElementById('newItemBtn').addEventListener('click', () => {
      document.getElementById('itemForm').reset();
      document.getElementById('recordId').value = '';
      document.getElementById('dialogTitle').textContent = 'Add New Record';
      dialog.showModal();
    });
    document.getElementById('closeDialogBtn').addEventListener('click', () => dialog.close());
    document.getElementById('cancelDialogBtn').addEventListener('click', () => dialog.close());

    document.getElementById('itemForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('recordId').value;
      const record = {
        id: id || Date.now().toString(),
        title: document.getElementById('formTitle').value.trim(),
        category: document.getElementById('formCategory').value.trim(),
        status: document.getElementById('formStatus').value,
        priority: document.getElementById('formPriority').value,
        dueDate: document.getElementById('formDueDate').value,
        notes: document.getElementById('formNotes').value.trim(),
      };
      if (id) {
        records = records.map(r => r.id === id ? record : r);
      } else {
        records.unshift(record);
      }
      dialog.close();
      save();
    });

    window.editRecord = function(id) {
      const r = records.find(item => item.id === id);
      if (!r) return;
      document.getElementById('recordId').value = r.id;
      document.getElementById('formTitle').value = r.title || '';
      document.getElementById('formCategory').value = r.category || '';
      document.getElementById('formStatus').value = r.status || 'Active';
      document.getElementById('formPriority').value = r.priority || 'Medium';
      document.getElementById('formDueDate').value = r.dueDate || '';
      document.getElementById('formNotes').value = r.notes || '';
      document.getElementById('dialogTitle').textContent = 'Edit Record';
      dialog.showModal();
    };

    window.deleteRecord = function(id) {
      if (confirm('Delete this record?')) {
        records = records.filter(item => item.id !== id);
        save();
      }
    };

    document.getElementById('searchInput').addEventListener('input', render);
    document.getElementById('statusFilter').addEventListener('change', render);
    document.getElementById('priorityFilter').addEventListener('change', render);

    document.getElementById('exportBtn').addEventListener('click', () => {
      const headers = ['id', 'title', 'category', 'status', 'priority', 'dueDate', 'notes'];
      const csv = [headers.join(',')].concat(
        records.map(r => headers.map(h => JSON.stringify(r[h] || '')).join(','))
      ).join('\\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '${safeTitle.toLowerCase()}-export.csv';
      a.click();
    });

    render();
  </script>
</body>
</html>`;

  const reactAppJsx = `import React, { useState, useEffect } from 'react';

export default function App() {
  const [records, setRecords] = useState([
    { id: '1', title: 'Initial Project Assessment', status: 'Completed', priority: 'High' },
    { id: '2', title: 'Interactive Prototype', status: 'Active', priority: 'High' },
    { id: '3', title: 'Production Ready Release', status: 'Active', priority: 'Medium' }
  ]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 max-w-5xl mx-auto font-sans">
      <header className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold">${cleanTitle}</h1>
          <p className="text-sm text-slate-400">Production Web Application</p>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 uppercase font-semibold">Total Records</div>
          <div className="text-3xl font-bold text-white mt-1">{records.length}</div>
        </div>
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 uppercase font-semibold">Active</div>
          <div className="text-3xl font-bold text-emerald-400 mt-1">
            {records.filter(r => r.status === 'Active').length}
          </div>
        </div>
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 uppercase font-semibold">Completed</div>
          <div className="text-3xl font-bold text-blue-400 mt-1">
            {records.filter(r => r.status === 'Completed').length}
          </div>
        </div>
      </div>
    </div>
  );
}`;

  const readme = `# ${cleanTitle}

A high-performance modern web application generated by Forge AI.

## Quick Run
- Simply open \`index.html\` in any web browser. No compilation or dependencies needed!
- Features interactive CRUD, search, status filtering, KPI analytics, CSV export, and persistent browser storage.

## Developer Run (Vite + React)
\`\`\`bash
npm install
npm run dev
\`\`\`
`;

  return {
    'index.html': html,
    'src/App.jsx': reactAppJsx,
    'README.md': readme,
  };
}

// ---------- Express Middleware ----------
app.use(express.json());

// ---------- Health & Info Routes ----------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ForgeAI Backend', timestamp: new Date().toISOString() });
});

app.get('/api/info', (req, res) => {
  res.json({
    name: 'ForgeAI Automation Studio',
    version: '2.0.0',
    stripe_configured: Boolean(process.env.STRIPE_SECRET_KEY),
    supabase_configured: Boolean(process.env.SUPABASE_URL),
    openrouter_configured: Boolean(process.env.OPENROUTER_API_KEY),
  });
});

// ---------- Route: Create Checkout Session ----------
app.post('/create-checkout', async (req, res) => {
  const { email, prompt, type, quality, mode } = req.body;
  if (!email || !prompt || !type) {
    return res.status(400).json({ error: 'Missing required fields: email, prompt, type' });
  }

  try {
    const user = await getOrCreateUser(email);

    // Create project record in Supabase
    let projectId = null;
    try {
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .insert({
          owner_id: user.id,
          name: prompt.slice(0, 50).trim() || 'New Web Project',
          description: prompt,
        })
        .select()
        .single();
      if (!projErr && projData) projectId = projData.id;
    } catch (e) {
      console.warn('Projects table insert notice:', e.message);
    }

    const isSubscription = mode === 'subscription';
    let lineItems = [];

    if (isSubscription && process.env.STRIPE_PRO_SUBSCRIPTION_PRICE_ID) {
      lineItems = [
        {
          price: process.env.STRIPE_PRO_SUBSCRIPTION_PRICE_ID,
          quantity: 1,
        },
      ];
    } else {
      lineItems = [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `ForgeAI ${type} generation (${quality ?? 'pro'})` },
            unit_amount: quality === 'pro' ? 1999 : 999,
          },
          quantity: 1,
        },
      ];
    }

    const session = await stripe.checkout.sessions.create({
      mode: isSubscription ? 'subscription' : 'payment',
      customer_email: email,
      managed_payments: { enabled: false },
      line_items: lineItems,
      metadata: {
        user_id: user.id,
        project_id: projectId || '',
        prompt,
        type,
        quality: quality ?? 'pro',
      },
      success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/cancel`,
    });

    // Save generation record in Supabase
    try {
      await supabase.from('generations').insert({
        owner_id: user.id,
        project_id: projectId,
        prompt,
        status: 'pending',
        model: quality === 'pro' ? 'openrouter/google/gemini-2.0-flash-001' : 'openrouter/mistralai/mistral-7b-instruct',
      });
    } catch (_) {}

    // Fallback: Also try purchases table if schema exists
    try {
      await supabase.from('purchases').insert({
        user_id: user.id,
        stripe_session_id: session.id,
        product_id: 'generation',
        fulfilled: false,
        prompt,
        type,
        quality: quality ?? 'pro',
        license_key: crypto.randomUUID(),
      });
    } catch (_) {}

    res.json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error('Checkout creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------- Route: Stripe Webhook ----------
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await new Promise((resolve, reject) => {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });

    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(rawBody);
    }
  } catch (err) {
    console.error('Webhook verification error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta = session.metadata || {};
    const { user_id, project_id, prompt, type, quality } = meta;

    console.log(`🚀 Webhook received for session ${session.id}: generating ${type}...`);

    const model = quality === 'pro' ? 'openrouter/google/gemini-2.0-flash-001' : 'openrouter/mistralai/mistral-7b-instruct';

    // Temp workspace for zip packaging
    const tempDir = path.join('/tmp', `forge-${session.id}`);
    const zipPath = `${tempDir}.zip`;

    try {
      await fs.mkdir(tempDir, { recursive: true });

      // Generate project files via AI or fallback
      const generatedFiles = await generateProject(prompt || 'Modern web application', type || 'website', model);

      // Write files to temporary folder
      for (const [relPath, content] of Object.entries(generatedFiles)) {
        const absPath = path.join(tempDir, relPath);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
      }

      // Record files in Supabase generation_files
      if (project_id) {
        try {
          const { data: genData } = await supabase
            .from('generations')
            .select('id')
            .eq('project_id', project_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (genData?.id) {
            for (const [relPath, content] of Object.entries(generatedFiles)) {
              await supabase.from('generation_files').insert({
                generation_id: genData.id,
                file_path: relPath,
                content: typeof content === 'string' ? content : JSON.stringify(content),
              });
            }
            await supabase.from('generations').update({ status: 'completed' }).eq('id', genData.id);
          }
        } catch (dbErr) {
          console.warn('DB recording notice:', dbErr.message);
        }
      }

      // Package directory into ZIP
      const archive = archiver('zip', { zlib: { level: 9 } });
      const fileHandle = await fs.open(zipPath, 'w');
      const stream = fileHandle.createWriteStream();

      await new Promise((resolve, reject) => {
        archive.pipe(stream);
        archive.directory(tempDir, false);
        archive.finalize();
        stream.on('close', resolve);
        archive.on('error', reject);
      });
      await fileHandle.close();

      // Upload ZIP to Supabase Storage
      const storagePath = `generated/${user_id || 'anonymous'}/${session.id}.zip`;
      const zipBytes = await fs.readFile(zipPath);

      const { error: uploadErr } = await supabase.storage
        .from('projects')
        .upload(storagePath, zipBytes, { upsert: true, contentType: 'application/zip' });

      if (uploadErr) console.warn('Supabase storage upload notice:', uploadErr.message);

      // Create signed download URL (valid 7 days)
      const { data: signedData } = await supabase.storage
        .from('projects')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

      const downloadUrl = signedData?.signedURL || `${BASE_URL}/download/${session.id}`;

      // Update purchases table if present
      try {
        await supabase
          .from('purchases')
          .update({ fulfilled: true, download_url: downloadUrl })
          .eq('stripe_session_id', session.id);
      } catch (_) {}

      console.log(`✅ Webhook complete! Download URL ready for ${session.id}`);
    } catch (err) {
      console.error('Webhook execution failure:', err);
    } finally {
      // Clean up temp files
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      await fs.unlink(zipPath).catch(() => {});
    }
  }

  res.json({ received: true });
});

// ---------- Route: Download ----------
app.get('/download/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('purchases')
      .select('download_url, fulfilled')
      .or(`id.eq.${id},stripe_session_id.eq.${id}`)
      .single();

    if (data?.download_url) {
      return res.redirect(data.download_url);
    }
    res.status(404).json({ error: 'Download not found or still processing' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`⚡️ ForgeAI Backend is listening on ${BASE_URL} (Port ${PORT})`);
});
