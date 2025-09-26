const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const handler = require('../generate-insight');

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent';

const ORIGINAL_ENV = { ...process.env };
const originalFetch = global.fetch;

function createMockResponse() {
    const headers = new Map();
    return {
        statusCode: 200,
        body: undefined,
        statusCalls: [],
        jsonPayloads: [],
        headerCalls: [],
        endCalled: false,
        status(code) {
            this.statusCalls.push(code);
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.jsonPayloads.push(payload);
            this.body = payload;
            return this;
        },
        setHeader(name, value) {
            this.headerCalls.push([name, value]);
            headers.set(name, value);
        },
        getHeader(name) {
            return headers.get(name);
        },
        end() {
            this.endCalled = true;
        }
    };
}

const CLIENT_GEMINI_KEY = 'client-provided-key';

const withGeminiKey = (headers = {}) => ({
    ...headers,
    'x-gemini-api-key': CLIENT_GEMINI_KEY
});

beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    handler.__resetRateLimiter();
    if (originalFetch) {
        global.fetch = originalFetch;
    } else {
        delete global.fetch;
    }

    process.env.ALLOWED_ORIGINS = 'https://allowed.example';
});

afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    handler.__resetRateLimiter();
    if (originalFetch) {
        global.fetch = originalFetch;
    } else {
        delete global.fetch;
    }
});

test('rejects requests when ALLOWED_ORIGINS is missing in production', async () => {
    delete process.env.ALLOWED_ORIGINS;
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';

    global.fetch = async () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] })
    });

    const req = {
        method: 'POST',
        headers: withGeminiKey({
            origin: 'https://profile.example',
            'content-type': 'application/json'
        }),
        body: { prompt: 'Hello' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [500]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'CORS configuration is missing on the server.' });
});

test('rejects requests when VERCEL_ENV uses different casing for production', async () => {
    delete process.env.ALLOWED_ORIGINS;
    process.env.VERCEL_ENV = 'Production';

    global.fetch = async () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] })
    });

    const req = {
        method: 'POST',
        headers: withGeminiKey({
            origin: 'https://profile.example',
            'content-type': 'application/json'
        }),
        body: { prompt: 'Hello' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [500]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'CORS configuration is missing on the server.' });
});

test('allows requests when ALLOWED_ORIGINS includes a wildcard', async () => {
    process.env.ALLOWED_ORIGINS = '*';

    const expectedPayload = { data: 'ok' };

    global.fetch = async () => ({
        ok: true,
        json: async () => expectedPayload
    });

    const req = {
        method: 'POST',
        headers: withGeminiKey({
            origin: 'https://profile.example',
            'content-type': 'application/json'
        }),
        body: { prompt: 'Hello' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [200]);
    assert.equal(res.getHeader('Access-Control-Allow-Origin'), '*');
    assert.deepEqual(res.body, expectedPayload);
});

test('allows requests outside production when ALLOWED_ORIGINS is not set', async () => {
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.NODE_ENV;
    delete process.env.VERCEL_ENV;

    const expectedPayload = { ok: true };

    global.fetch = async () => ({
        ok: true,
        json: async () => expectedPayload
    });

    const req = {
        method: 'POST',
        headers: withGeminiKey({
            origin: 'https://allowed.example',
            'content-type': 'application/json'
        }),
        body: { prompt: 'Hello' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [200]);
    assert.deepEqual(res.body, expectedPayload);
});

test('rejects requests from disallowed origins', async () => {
    const req = {
        method: 'POST',
        headers: withGeminiKey({
            origin: 'https://evil.example'
        })
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [403]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Origin not allowed.' });
});

test('handles OPTIONS preflight requests with proper headers', async () => {
    const req = {
        method: 'OPTIONS',
        headers: {
            origin: 'https://allowed.example'
        }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [204]);
    assert.equal(res.endCalled, true);
    assert.equal(res.getHeader('Access-Control-Allow-Origin'), 'https://allowed.example');
    assert.equal(res.getHeader('Vary'), 'Origin');
    assert.equal(res.getHeader('Access-Control-Allow-Methods'), 'POST, OPTIONS');
    assert.equal(res.getHeader('Access-Control-Allow-Headers'), 'Content-Type, Authorization, X-Gemini-Api-Key');
    assert.equal(res.getHeader('Access-Control-Max-Age'), '600');
});

test('returns 401 when Gemini API key header is missing', async () => {
    const req = {
        method: 'POST',
        headers: {
            origin: 'https://allowed.example',
            'content-type': 'application/json'
        },
        body: { prompt: 'Hello' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [401]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Gemini API key is required.' });
});

test('rejects non-POST methods', async () => {
    const req = {
        method: 'GET',
        headers: withGeminiKey({
            origin: 'https://allowed.example'
        })
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [405]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Method Not Allowed' });
});

test('rejects unsupported content types', async () => {
    const req = {
        method: 'POST',
        headers: withGeminiKey({
            origin: 'https://allowed.example',
            'content-type': 'text/plain'
        }),
        body: { prompt: 'Hello' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [415]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Content-Type must be application/json.' });
});

test('validates presence of prompt', async () => {
    const req = {
        method: 'POST',
        headers: withGeminiKey({
            origin: 'https://allowed.example',
            'content-type': 'application/json'
        }),
        body: {}
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [400]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Prompt is required in the request body.' });
});

test('enforces prompt length limits', async () => {
    const req = {
        method: 'POST',
        headers: withGeminiKey({
            origin: 'https://allowed.example',
            'content-type': 'application/json'
        }),
        body: { prompt: 'a'.repeat(4001) }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [413]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Prompt is too long.' });
});

test('propagates upstream errors from Gemini', async () => {
    global.fetch = async () => ({
        ok: false,
        status: 502,
        text: async () => 'Bad Gateway'
    });

    const req = {
        method: 'POST',
        headers: withGeminiKey({
            origin: 'https://allowed.example',
            'content-type': 'application/json'
        }),
        body: { prompt: 'Hello' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [500]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Failed to generate insight.' });
});

test('returns Gemini response payload on success', async () => {
    const expectedPayload = { contents: [{ parts: [{ text: 'Insight' }] }] };
    const fetchCalls = [];

    global.fetch = async (...args) => {
        fetchCalls.push(args);
        return {
            ok: true,
            json: async () => expectedPayload
        };
    };

    const req = {
        method: 'POST',
        headers: withGeminiKey({
            origin: 'https://allowed.example',
            'content-type': 'application/json'
        }),
        body: { prompt: 'Explain quantum computing.' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [200]);
    assert.equal(res.getHeader('Access-Control-Allow-Origin'), 'https://allowed.example');
    assert.deepEqual(res.body, expectedPayload);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0][0], `${API_URL}?key=${CLIENT_GEMINI_KEY}`);
    const fetchOptions = fetchCalls[0][1];
    assert.equal(fetchOptions.method, 'POST');
    assert.equal(fetchOptions.headers['Content-Type'], 'application/json');
    const parsedBody = JSON.parse(fetchOptions.body);
    assert.deepEqual(parsedBody, {
        contents: [{
            parts: [{ text: 'Explain quantum computing.' }]
        }]
    });
});

test('limits repeated requests from the same client', async () => {
    process.env.GENERATE_INSIGHT_MAX_REQUESTS = '2';
    process.env.GENERATE_INSIGHT_WINDOW_MS = '1000';

    global.fetch = async () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'Hello' }] } }] })
    });

    const baseRequest = {
        method: 'POST',
        headers: withGeminiKey({
            origin: 'https://allowed.example',
            'content-type': 'application/json',
            'x-forwarded-for': '1.2.3.4'
        }),
        body: { prompt: 'Hello' }
    };

    const first = createMockResponse();
    await handler(baseRequest, first);
    assert.deepEqual(first.statusCalls, [200]);

    const second = createMockResponse();
    await handler(baseRequest, second);
    assert.deepEqual(second.statusCalls, [200]);

    const limited = createMockResponse();
    await handler(baseRequest, limited);
    assert.deepEqual(limited.statusCalls, [429]);
    assert.deepEqual(limited.jsonPayloads[0], { error: 'Too many requests. Please slow down.' });
    assert.ok(limited.getHeader('Retry-After'));
});

test('retries Gemini calls on transient failures', async () => {
    const expectedPayload = { data: true };
    let attempts = 0;

    global.fetch = async () => {
        attempts += 1;
        if (attempts === 1) {
            return {
                ok: false,
                status: 502,
                text: async () => 'Bad Gateway'
            };
        }

        return {
            ok: true,
            json: async () => expectedPayload
        };
    };

    const req = {
        method: 'POST',
        headers: withGeminiKey({
            origin: 'https://allowed.example',
            'content-type': 'application/json'
        }),
        body: { prompt: 'Hello' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.equal(attempts, 2);
    assert.deepEqual(res.body, expectedPayload);
});

test('cleans up expired rate limit buckets', async () => {
    process.env.GENERATE_INSIGHT_MAX_REQUESTS = '1';
    process.env.GENERATE_INSIGHT_WINDOW_MS = '10';

    global.fetch = async () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
    });

    const req = {
        method: 'POST',
        headers: withGeminiKey({
            origin: 'https://allowed.example',
            'content-type': 'application/json',
            'x-forwarded-for': '2.3.4.5'
        }),
        body: { prompt: 'Hello' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.ok(handler.__getRateLimiterSnapshot().size >= 1);

    // advance time beyond window
    const originalDateNow = Date.now;
    Date.now = () => originalDateNow() + 50;

    const secondResponse = createMockResponse();
    await handler(req, secondResponse);

    Date.now = originalDateNow;

    assert.deepEqual(secondResponse.statusCalls, [200]);
    assert.ok(handler.__getRateLimiterSnapshot().size <= 1);
});

test('enforces request timeout failures', async () => {
    process.env.GENERATE_INSIGHT_TIMEOUT_MS = '1';
    process.env.GENERATE_INSIGHT_MAX_RETRIES = '0';

    global.fetch = async () => new Promise((resolve, reject) => {
        setTimeout(() => reject(Object.assign(new Error('AbortError'), { name: 'AbortError' })), 5);
    });

    const req = {
        method: 'POST',
        headers: withGeminiKey({
            origin: 'https://allowed.example',
            'content-type': 'application/json'
        }),
        body: { prompt: 'Hello' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [500]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Failed to generate insight.' });
});
