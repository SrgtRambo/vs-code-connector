import assert from 'node:assert/strict';
import test from 'node:test';

test('Health and API info endpoints', async () => {
  const res = await fetch('http://localhost:4000/health');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');

  const infoRes = await fetch('http://localhost:4000/api/info');
  assert.equal(infoRes.status, 200);
  const infoData = await infoRes.json();
  assert.equal(infoData.stripe_configured, true);
  assert.equal(infoData.supabase_configured, true);
});

test('Create checkout session endpoint (one-time)', async () => {
  const res = await fetch('http://localhost:4000/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'automated-test@example.com',
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

test('Create checkout session endpoint (subscription)', async () => {
  const res = await fetch('http://localhost:4000/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'automated-sub@example.com',
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
