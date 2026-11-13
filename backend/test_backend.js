import assert from 'node:assert/strict';
import test from 'node:test';

test('Security headers present on all responses', async () => {
  const res = await fetch('http://localhost:4000/health');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(res.headers.get('x-xss-protection'), '1; mode=block');
});

test('Health and API info endpoints return valid metadata', async () => {
  const res = await fetch('http://localhost:4000/health');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');
  assert.equal(data.service, 'ForgeAI Backend');

  const infoRes = await fetch('http://localhost:4000/api/info');
  assert.equal(infoRes.status, 200);
  const infoData = await infoRes.json();
  assert.equal(infoData.name, 'ForgeAI Automation Studio');
  assert.equal(infoData.stripe_configured, true);
  assert.equal(infoData.supabase_configured, true);
  assert.equal(infoData.openrouter_configured, true);
});

test('Input validation rejects missing fields', async () => {
  const res = await fetch('http://localhost:4000/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com' })
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /Missing required fields/i);
});

test('Input validation rejects invalid email format', async () => {
  const res = await fetch('http://localhost:4000/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'not-an-email',
      prompt: 'Test prompt',
      type: 'website'
    })
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /Invalid email address/i);
});

test('Input validation rejects oversized prompt to prevent payload abuse', async () => {
  const res = await fetch('http://localhost:4000/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      prompt: 'A'.repeat(5000),
      type: 'website'
    })
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /under 4000 characters/i);
});

test('Create checkout session endpoint (one-time payment)', async () => {
  const res = await fetch('http://localhost:4000/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'security-test@example.com',
      prompt: 'Modern SaaS analytics dashboard with dark theme',
      type: 'website',
      quality: 'pro'
    })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.url && data.url.startsWith('https://checkout.stripe.com/'));
  assert.ok(data.session_id);
});

test('Create checkout session endpoint (recurring subscription)', async () => {
  const res = await fetch('http://localhost:4000/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'security-sub@example.com',
      prompt: 'ForgeAI Pro Monthly Subscription',
      type: 'website',
      quality: 'pro',
      mode: 'subscription'
    })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.url && data.url.startsWith('https://checkout.stripe.com/'));
  assert.ok(data.session_id);
});

test('Download endpoint returns 404 for unknown or unfulfilled purchase', async () => {
  const res = await fetch('http://localhost:4000/download/non-existent-purchase-id');
  assert.equal(res.status, 404);
});
