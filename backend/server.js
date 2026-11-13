import express from 'express';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { createReadStream, promises as fs } from 'node:fs';
import archiver from 'archiver';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

dotenv.config();

const execAsync = promisify(exec);

const app = express();
app.use(express.json());

// ---------- Configuration ----------
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-09-30' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const PORT = process.env.PORT || 4000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ---------- Helper: generate project via OpenRouter ----------
async function generateProject(prompt, type, model) {
  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: `You are a senior full‑stack engineer. Generate a complete, production‑ready ${type} based on the description below. Return a JSON object where each key is the relative file path (including directories) and each value is the exact file content. Do NOT include any explanatory text outside the JSON. Use modern best‑practice libraries, responsive design, and ensure the code runs without errors.

Description:
${prompt}

Guidelines:
- For **websites**, generate a React app with Vite, Tailwind CSS, and Radix UI components. Include a functional navigation bar, hero section, and an example form that validates input.
- For **software**, generate a minimal Node.js CLI or Electron app that fulfills the description, with proper package.json and necessary scripts.
- For **spreadsheets**, generate a CSV file and a small HTML viewer that loads it using SheetJS.
- All files must be UTF‑8 encoded and valid.
`,
      },
    ],
    temperature: 0.7,
    max_tokens: 4096,
  };
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${txt}`);
  }
  const data = await response.json();
  // The assistant should return a JSON string as the content.
  const content = data?.choices?.[0]?.message?.content?.trim();
  try {
    return JSON.parse(content);
  } catch {
    // Fallback: treat whole content as index.html
    return { 'index.html': content };
  }
}

// ---------- Helper: scaffold a React + Vite + Tailwind project ----------
async function scaffoldReactTailwindProject(baseDir) {
  const packageJson = {
    name: 'generated-website',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      react: '^19.2.0',
      'react-dom': '^19.2.0',
      '@radix-ui/react-icons': '^1.3.0',
      '@radix-ui/react-navigation-menu': '^1.2.0',
    },
    devDependencies: {
      vite: '^5.4.0',
      '@vitejs/plugin-react': '^5.0.0',
      tailwindcss: '^3.4.0',
      autoprefixer: '^10.4.20',
      postcss: '^8.4.40',
    },
  };
  await fs.writeFile(path.join(baseDir, 'package.json'), JSON.stringify(packageJson, null, 2));

  const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { open: true },
});`;
  await fs.writeFile(path.join(baseDir, 'vite.config.ts'), viteConfig);

  const tailwindConfig = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};`;
  await fs.writeFile(path.join(baseDir, 'tailwind.config.cjs'), tailwindConfig);

  const postcssConfig = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};`;
  await fs.writeFile(path.join(baseDir, 'postcss.config.cjs'), postcssConfig);

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Generated Website</title>
  </head>
  <body class="font-sans antialiased bg-gray-50 text-gray-900">
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`;
  await fs.writeFile(path.join(baseDir, 'index.html'), indexHtml);

  const srcDir = path.join(baseDir, 'src');
  await fs.mkdir(srcDir, { recursive: true });

  const mainJsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
  await fs.writeFile(path.join(srcDir, 'main.jsx'), mainJsx);

  const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;`;
  await fs.writeFile(path.join(srcDir, 'index.css'), indexCss);

  const appJsx = `import React from 'react';
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink } from '@radix-ui/react-navigation-menu';

export default function App() {
  return (
    <div className="max-w-4xl mx-auto p-4">
      <NavigationMenu className="mb-8">
        <NavigationMenuItem>
          <NavigationMenuLink href="#" className="px-3 py-2 hover:bg-gray-200 rounded">Home</NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="#about" className="px-3 py-2 hover:bg-gray-200 rounded">About</NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="#contact" className="px-3 py-2 hover:bg-gray-200 rounded">Contact</NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenu>
      <section className="text-center py-12 bg-white rounded shadow">
        <h1 className="text-4xl font-bold mb-4">Welcome to Your New Site</h1>
        <p className="text-lg text-gray-600">This is a professionally styled React app built with Vite and Tailwind CSS.</p>
      </section>
      <section id="contact" className="mt-8">
        <h2 className="text-2xl font-semibold mb-4">Contact Us</h2>
        <form className="grid gap-4 max-w-md">
          <input type="text" placeholder="Name" className="border rounded p-2" required />
          <input type="email" placeholder="Email" className="border rounded p-2" required />
          <textarea placeholder="Message" className="border rounded p-2" rows="4" required></textarea>
          <button type="submit" className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">Send</button>
        </form>
      </section>
    </div>
  );
}
`;
  await fs.writeFile(path.join(srcDir, 'App.jsx'), appJsx);
}

// ---------- Route: create Stripe Checkout Session ----------
app.post('/create-checkout', async (req, res) => {
  const { email, prompt, type, quality } = req.body; // quality optional: 'standard'|'pro'
  if (!email || !prompt || !type) return res.status(400).json({ error: 'Missing fields' });

  const { data: user, error: upsertErr } = await supabase
    .from('users')
    .upsert({ email })
    .select()
    .single();
  if (upsertErr) return res.status(500).json({ error: upsertErr.message });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `${type} generation (${quality ?? 'standard'})` },
          unit_amount: quality === 'pro' ? 1999 : 999,
        },
        quantity: 1,
      },
    ],
    metadata: { user_id: user.id, prompt, type, quality: quality ?? 'standard' },
    success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/cancel`,
  });

  await supabase.from('purchases').insert({
    user_id: user.id,
    stripe_session_id: session.id,
    product_id: 'generation',
    fulfilled: false,
    prompt,
    type,
    quality: quality ?? 'standard',
    license_key: crypto.randomUUID(),
  });

  res.json({ url: session.url });
});

// ---------- Stripe webhook ----------
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const rawBody = await new Promise((resolve, reject) => {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', chunk => (data += chunk));
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed.', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta = session.metadata;
    const { user_id, prompt, type, quality } = meta;

    const { data: purchase } = await supabase
      .from('purchases')
      .select('*')
      .eq('stripe_session_id', session.id)
      .single();

    // Choose model based on quality
    const model = quality === 'pro' ? 'openrouter/google/gemini-pro-1.5' : 'openrouter/mistralai/mistral-7b-instruct';

    // Create temporary project directory
    const tempDir = path.join('/tmp', `forge-${session.id}`);
    await fs.mkdir(tempDir, { recursive: true });

    if (type === 'website') {
      // Scaffold React+Tailwind base
      await scaffoldReactTailwindProject(tempDir);
    }

    // Generate user‑specific code via OpenRouter
    const generatedFiles = await generateProject(prompt, type, model);
    // Write generated files into the temp directory (overwrite scaffold where needed)
    for (const [relPath, content] of Object.entries(generatedFiles)) {
      const absPath = path.join(tempDir, relPath);
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, content);
    }

    // Attempt to install deps and build (only for website scaffold)
    let buildSuccess = false;
    if (type === 'website') {
      try {
        console.log('Installing dependencies...');
        await execAsync('npm install', { cwd: tempDir, stdio: 'ignore' });
        console.log('Running build...');
        await execAsync('npm run build', { cwd: tempDir, stdio: 'ignore' });
        buildSuccess = true;
      } catch (e) {
        console.error('Build failed, falling back to source zip:', e.message);
        buildSuccess = false;
      }
    }

    // Zip the appropriate folder
    const zipPath = `${tempDir}.zip`;
    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = await fs.open(zipPath, 'w');
    const stream = output.createWriteStream();
    await new Promise((resolve, reject) => {
      archive.pipe(stream);
      if (buildSuccess && type === 'website') {
        archive.directory(path.join(tempDir, 'dist'), false);
      } else {
        archive.directory(tempDir, false);
      }
      archive.finalize();
      stream.on('close', resolve);
      archive.on('error', reject);
    });
    await output.close();

    // Upload zip to Supabase Storage
    const storagePath = `generated/${user_id}/${session.id}.zip`;
    const zipData = await fs.readFile(zipPath);
    const { error: uploadErr } = await supabase.storage.from('projects').upload(storagePath, zipData, { upsert: true });
    if (uploadErr) throw uploadErr;

    // Signed URL (24 h)
    const { data: { signedURL } } = await supabase.storage.from('projects').createSignedUrl(storagePath, 60 * 60 * 24);

    // Update purchase record
    await supabase
      .from('purchases')
      .update({ fulfilled: true, download_url: signedURL })
      .eq('id', purchase.id);

    // Cleanup temporary files
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await fs.unlink(zipPath).catch(() => {});
  }

  res.json({ received: true });
});

// ---------- Protected route to fetch download URL ----------
app.get('/download/:purchaseId', async (req, res) => {
  const { purchaseId } = req.params;
  const { data: purchase, error } = await supabase
    .from('purchases')
    .select('download_url, fulfilled')
    .eq('id', purchaseId)
    .single();
  if (error) return res.status(404).json({ error: 'Purchase not found' });
  if (!purchase.fulfilled) return res.status(403).json({ error: 'Purchase not fulfilled yet' });
  res.json({ url: purchase.download_url });
});

app.listen(PORT, () => console.log(`⚡️ Backend listening on ${BASE_URL}`));
