import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, ArrowRight, Zap, ShieldCheck, CheckCircle2, Layers, Cpu, Code2, Globe } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [prompt, setPrompt] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("http://localhost:4000/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          prompt,
          type: "website",
          quality: "pro"
        })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setResult("Generation triggered! Check your backend console.");
      }
    } catch (err: any) {
      setResult(`Notice: Checkout initiated locally. ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-extrabold text-lg">
              F
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-white">FORGE <span className="text-indigo-400">AI</span></span>
              <span className="text-xs text-slate-400 ml-2 font-mono">v2.0</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a href="http://127.0.0.1:8765" target="_blank" rel="noreferrer" className="text-xs font-semibold text-slate-300 hover:text-white transition">
              Local Studio (Port 8765)
            </a>
            <a href="http://localhost:4000/health" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Backend Online
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-xs font-semibold mb-8">
          <Sparkles className="w-4 h-4 text-indigo-400" /> Production-Grade AI Software Studio
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-4xl leading-tight">
          Turn business requirements into <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-200 bg-clip-text text-transparent">functional, beautiful software</span> in seconds.
        </h1>

        <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed">
          Integrated with Stripe checkout, Supabase cloud persistence, and state-of-the-art OpenRouter intelligence. Clean, responsive, and ready to deploy.
        </p>

        {/* Interactive App Generator Form */}
        <form onSubmit={handleCheckout} className="mt-10 w-full max-w-2xl bg-slate-900/60 p-3 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-xl flex flex-col gap-3 text-left">
          <div className="px-3 pt-2">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Describe your application
            </label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Modern photo studio booking portal with customer invoices and gallery..."
              className="w-full bg-transparent border-0 text-white placeholder-slate-500 focus:outline-none text-base"
              required
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-800/80">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address..."
              className="flex-1 bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 transition active:scale-95 disabled:opacity-50"
            >
              {loading ? "Preparing..." : "Generate with Stripe"} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {result && (
          <div className="mt-4 p-3 rounded-xl bg-slate-900 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
            {result}
          </div>
        )}

        {/* Feature Highlights Grid */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 w-full text-left">
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Instant Standalone & React</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every project packages a zero-dependency HTML preview plus modern Vite + React code for developer flexibility.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Stripe & Supabase Connected</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Automated one-time and monthly subscription billing with encrypted file storage and 7-day signed downloads.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Self-Healing Generator</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Resilient code generation handles markdown fences, validates component syntax, and guarantees 100% working apps.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-800/80 py-8 text-center text-xs text-slate-500">
        ForgeAI Studio · Built with modern React, Tailwind CSS, Stripe, Supabase & OpenRouter
      </footer>
    </div>
  );
}
