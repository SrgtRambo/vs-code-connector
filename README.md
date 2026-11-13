# ⚡️ Forge AI · Production-Grade Software Studio & Automation Backend

Forge AI transforms business requirements into production-ready web applications, automated workflows, and full-stack software. It combines an offline-capable browser design studio, a local proxy server, a high-performance Express/Node backend, Stripe billing (one-time & monthly subscriptions), Supabase cloud storage, and OpenRouter AI code generation.

---

## 🏗 System Architecture

```
                    ┌───────────────────────────────────────────┐
                    │            FORGE AI CLIENTS               │
                    │  • Browser Studio (http://127.0.0.1:8765) │
                    │  • Web Portal     (http://localhost:5173) │
                    └─────────────────────┬─────────────────────┘
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   │                                             │
                   ▼                                             ▼
       ┌────────────────────────┐                   ┌────────────────────────┐
       │   Local Studio Proxy   │                   │  Production Backend    │
       │     (server.js)        │                   │   (backend/server.js)  │
       │   Port 8765 (Loopback) │                   │       Port 4000        │
       └───────────┬────────────┘                   └───────────┬────────────┘
                   │                                             │
      ┌────────────┴────────────┐            ┌───────────────────┴───────────────────┐
      ▼                         ▼            ▼                   ▼                   ▼
┌───────────┐             ┌───────────┐ ┌───────────┐      ┌───────────┐       ┌───────────┐
│  Ollama   │             │  Offline  │ │  Stripe   │      │ Supabase  │       │OpenRouter │
│ (Local AI)│             │ Templates │ │ (Billing) │      │(DB/Bucket)│       │ (AI Code) │
└───────────┘             └───────────┘ └───────────┘      └───────────┘       └───────────┘
```

---

## 🚀 Quickstart

### 1. Run the Local Studio (Port 8765)
Double-click `Start Forge AI.command` on macOS, or run:
```bash
npm run server
```
Opens the Studio at `http://127.0.0.1:8765`.

### 2. Run the Automation Backend (Port 4000)
```bash
npm run backend
```
Listens on `http://localhost:4000`. Connects to Stripe, Supabase, and OpenRouter.

### 3. Run the Modern React / TanStack Web App (Port 5173)
```bash
npm run dev
```

---

## 🧪 Comprehensive Test Suite (76 Passed, 0 Failed)

Run all unit, generator, architecture, and backend integration tests:
```bash
npm run test:all
```
- **Studio & Generator Tests:** 68 passed (`node --test *.test.js`)
- **Backend & Stripe Integration Tests:** 8 passed (`npm run test:backend`)

Individual commands:
```bash
npm run test          # Runs generator, architect, testing, and proxy tests
npm run test:backend  # Runs Stripe, Supabase, rate limiting, and security tests
```

---

## 🔒 Security Hardening

- **Security Headers:** Enforces `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-XSS-Protection: 1; mode=block`.
- **Sliding-Window Rate Limiting:** In-memory request limiter protects checkout and generation endpoints from abuse and DoS.
- **Input Validation:** Strict regex email validation, payload size caps (max 4,000 characters for prompts), and type allowlists.
- **Path Traversal Defense:** `isSafePath` checks ensure generated files cannot escape sandboxed temporary directories during ZIP packaging.
- **Sandboxed Execution:** App previews run in an isolated iframe (`sandbox="allow-scripts allow-forms allow-modals"`) preventing access to parent cookies and storage.
- **Zero Secret Leakage:** `.env` and environment configurations are excluded via `.gitignore`.

---

## ☁️ Replit Deployment

The repository includes pre-configured [.replit](file:///.replit) and [replit.nix](file:///replit.nix) files:
1. Open Replit and choose **"Import from GitHub"**.
2. Enter your repository URL: `https://github.com/SrgtRambo/ForgeAI-v1.git`.
3. Add your environment variables in Replit **Secrets**:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRO_SUBSCRIPTION_PRICE_ID`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENROUTER_API_KEY`
4. Click **Run** — Replit automatically installs dependencies and starts the service.

---

## 💡 "Outside the Box" Engineering Features

1. **Dual-Mode Deliverables:**
   Every generated ZIP includes:
   - A standalone `index.html` with Tailwind CSS + Lucide Icons via CDN that runs instantly in **any** web browser without `npm install` or build steps.
   - A modular Vite + React codebase for professional developer customization.
2. **Self-Healing LLM Parser:**
   Handles markdown fences (` ```json `), trailing text, and partial tokens gracefully without crashing.
3. **Managed Payments Compatibility:**
   Stripe checkout sessions are built to work with modern Stripe accounts with automatic tax and payment method detection.
4. **Instant Standalone Interactivity:**
   Generated applications come pre-wired with full CRUD, real-time search, category/priority filters, KPI analytics metrics, and local browser persistence.
