const assert = require('node:assert/strict');

const { consumeRateLimitToken, resetBuckets } = require('./lib/rate-limit');
const { main } = require('./TicketIngestEndpoint');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printBucketStats(label, stats) {
  console.log('\n' + label);
  console.log('  allowed=' + stats.allowed + ' // Whether this request is accepted in the current window');
  console.log('  limit=' + stats.limit + ' // Max tokens available per user for the window');
  console.log('  remaining=' + stats.remaining + ' // Tokens left after this request consumes one token');
  console.log('  retryAfterSeconds=' + stats.retryAfterSeconds + ' // Seconds until the bucket can accept again');
  console.log('  resetAt=' + stats.resetAt + ' // Exact timestamp when the bucket refills');
}

function printEndpointStats(label, response) {
  const rate = response.body && response.body.rateLimit ? response.body.rateLimit : {};
  console.log('\n' + label);
  console.log('  statusCode=' + response.statusCode + ' // 200 means allowed, 429 means blocked by limiter');
  console.log('  success=' + response.body.success + ' // Endpoint business operation result');
  if (response.body.error) {
    console.log('  error=' + response.body.error + ' // Human-readable reason when request is blocked');
  }
  console.log('  rateLimit.limit=' + rate.limit + ' // Bucket size configured for each user');
  console.log('  rateLimit.remaining=' + rate.remaining + ' // Tokens left for this user in the current window');
  if (rate.retryAfterSeconds !== undefined) {
    console.log('  rateLimit.retryAfterSeconds=' + rate.retryAfterSeconds + ' // Wait time before next attempt can pass');
  }
  console.log('  rateLimit.resetAt=' + rate.resetAt + ' // Refill boundary for this user bucket');
}

async function runLifecycleDemo() {
  resetBuckets();

  const demoWindowSeconds = process.env.RATE_LIMIT_DEMO_WINDOW_SECONDS || '8';

  process.env.HUBSPOT_PRIVATE_APP_TOKEN = 'test-token';
  process.env.RATE_LIMIT_MAX_TOKENS = '2';
  process.env.RATE_LIMIT_WINDOW_SECONDS = demoWindowSeconds;

  global.fetch = async (url, options = {}) => {
    if (url.includes('/search')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ results: [] }),
      };
    }

    if (options.method === 'POST') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: '12345' }),
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
    };
  };

  const invoke = () =>
    new Promise((resolve) => {
      main(
        {
          event: {
            headers: {
              'x-user-id': 'lifecycle-demo-user',
            },
          },
          body: JSON.stringify({
            subject: 'Lifecycle demo request',
            external_ticket_id: 'ext-lifecycle-demo',
          }),
        },
        resolve,
      );
    });

  console.log('\n=== Full Rate Limit Lifecycle Demo ===');
  console.log(
    'window=' +
      demoWindowSeconds +
      's, tokens=' +
      process.env.RATE_LIMIT_MAX_TOKENS +
      ' // Demo settings for bucket refill timing',
  );

  const first = await invoke();
  printEndpointStats('request #1', first);

  const second = await invoke();
  printEndpointStats('request #2', second);

  const blocked = await invoke();
  printEndpointStats('request #3 (rate-limited)', blocked);

  let secondsLeft = blocked.body.rateLimit.retryAfterSeconds || 0;
  console.log('\ncountdown to next period // Bucket stays blocked until this reaches zero');
  while (secondsLeft > 0) {
    console.log('  next period in ' + secondsLeft + 's // Remaining wait time before refill');
    await sleep(1000);
    secondsLeft -= 1;
  }

  console.log('period boundary reached // New token bucket period should be active now');
  const afterReset = await invoke();
  printEndpointStats('request #4 (after refill)', afterReset);

  assert.equal(blocked.statusCode, 429);
  assert.equal(afterReset.statusCode, 200);
}

async function verifyTokenBucketRefill() {
  resetBuckets();

  const first = consumeRateLimitToken('user-1', {
    maxTokens: 2,
    windowMs: 1000,
    now: 0,
  });
  const second = consumeRateLimitToken('user-1', {
    maxTokens: 2,
    windowMs: 1000,
    now: 100,
  });
  const blocked = consumeRateLimitToken('user-1', {
    maxTokens: 2,
    windowMs: 1000,
    now: 200,
  });
  const refilled = consumeRateLimitToken('user-1', {
    maxTokens: 2,
    windowMs: 1000,
    now: 1001,
  });

  console.log('\n=== Deterministic Token Bucket Stats ===');
  printBucketStats('first request', first);
  printBucketStats('second request', second);
  printBucketStats('third request (same window)', blocked);
  printBucketStats('refilled request (next window)', refilled);

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(refilled.allowed, true);
  assert.equal(refilled.remaining, 1);
}

async function verifyThirtyTokenBucket() {
  resetBuckets();

  const windowMs = 60 * 1000;
  const maxTokens = 30;
  const now = 10_000;
  let lastAllowed = null;

  for (let i = 1; i <= maxTokens; i += 1) {
    lastAllowed = consumeRateLimitToken('user-30', {
      maxTokens,
      windowMs,
      now,
    });
    assert.equal(lastAllowed.allowed, true);
  }

  const blocked = consumeRateLimitToken('user-30', {
    maxTokens,
    windowMs,
    now,
  });
  const refilled = consumeRateLimitToken('user-30', {
    maxTokens,
    windowMs,
    now: now + windowMs + 1,
  });

  console.log('\n=== 30 Token Baseline Stats ===');
  printBucketStats('30th request (last allowed in window)', lastAllowed);
  printBucketStats('31st request (blocked in same window)', blocked);
  printBucketStats('next request after refill window', refilled);

  assert.equal(lastAllowed.limit, 30);
  assert.equal(lastAllowed.remaining, 0);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(refilled.allowed, true);
  assert.equal(refilled.remaining, 29);
}

async function verifyEndpointEnforcement() {
  resetBuckets();

  process.env.HUBSPOT_PRIVATE_APP_TOKEN = 'test-token';
  process.env.RATE_LIMIT_MAX_TOKENS = '2';
  process.env.RATE_LIMIT_WINDOW_SECONDS = '60';

  global.fetch = async (url, options = {}) => {
    if (url.includes('/search')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ results: [] }),
      };
    }

    if (options.method === 'POST') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: '12345' }),
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
    };
  };

  const invoke = () =>
    new Promise((resolve) => {
      main(
        {
          event: {
            headers: {
              'x-user-id': 'agent-test-user',
            },
          },
          body: JSON.stringify({
            subject: 'Rate limit verification',
            external_ticket_id: `ext-${Math.random().toString(16).slice(2)}`,
          }),
        },
        resolve,
      );
    });

  const first = await invoke();
  const second = await invoke();
  const third = await invoke();

  console.log('\n=== Endpoint Enforcement Stats ===');
  printEndpointStats('first endpoint call', first);
  printEndpointStats('second endpoint call', second);
  printEndpointStats('third endpoint call', third);

  assert.equal(first.statusCode, 200);
  assert.equal(first.body.rateLimit.limit, 2);
  assert.equal(first.body.rateLimit.remaining, 1);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.rateLimit.remaining, 0);
  assert.equal(third.statusCode, 429);
  assert.equal(third.body.rateLimit.limit, 2);
  assert.equal(third.body.rateLimit.remaining, 0);
  assert.match(third.body.error, /Rate limit exceeded/i);
}

async function run() {
  await verifyTokenBucketRefill();
  await verifyThirtyTokenBucket();
  await verifyEndpointEnforcement();
  if (process.argv.includes('--lifecycle-demo')) {
    await runLifecycleDemo();
  } else {
    console.log('\nTip: run with --lifecycle-demo to print countdown and refill in real time.');
  }
  console.log('Rate limit verification passed.');
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  run,
};