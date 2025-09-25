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

beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    if (originalFetch) {
        global.fetch = originalFetch;
    } else {
        delete global.fetch;
    }
});

afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    if (originalFetch) {
        global.fetch = originalFetch;
    } else {
        delete global.fetch;
    }
});

test('rejects when ALLOWED_ORIGINS is missing', async () => {
    delete process.env.ALLOWED_ORIGINS;

    const req = { method: 'POST', headers: {} };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [500]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Server misconfiguration.' });
});

test('rejects requests from disallowed origins', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example';

    const req = {
        method: 'POST',
        headers: {
            origin: 'https://evil.example'
        }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [403]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Origin not allowed.' });
});

test('handles OPTIONS preflight requests with proper headers', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example';

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
    assert.equal(res.getHeader('Access-Control-Allow-Headers'), 'Content-Type, Authorization');
    assert.equal(res.getHeader('Access-Control-Max-Age'), '600');
});

test('returns 500 when GEMINI_API_KEY is missing', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example';
    process.env.GENERATE_INSIGHT_TOKEN = 'secret';
    delete process.env.GEMINI_API_KEY;

    const req = {
        method: 'POST',
        headers: {
            origin: 'https://allowed.example',
            authorization: 'Bearer secret',
            'content-type': 'application/json'
        },
        body: { prompt: 'Hello' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [500]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'API key is not configured.' });
});

test('returns 500 when GENERATE_INSIGHT_TOKEN is missing', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example';
    process.env.GEMINI_API_KEY = 'key';
    delete process.env.GENERATE_INSIGHT_TOKEN;

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

    assert.deepEqual(res.statusCalls, [500]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Server misconfiguration.' });
});

test('rejects non-POST methods', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example';
    process.env.GEMINI_API_KEY = 'key';
    process.env.GENERATE_INSIGHT_TOKEN = 'secret';

    const req = {
        method: 'GET',
        headers: {
            origin: 'https://allowed.example'
        }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [405]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Method Not Allowed' });
});

test('rejects requests without a valid bearer token', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example';
    process.env.GEMINI_API_KEY = 'key';
    process.env.GENERATE_INSIGHT_TOKEN = 'secret';

    let fetchCalled = false;
    global.fetch = async () => {
        fetchCalled = true;
        return { ok: true, json: async () => ({}) };
    };

    const req = {
        method: 'POST',
        headers: {
            origin: 'https://allowed.example',
            authorization: 'Bearer wrong',
            'content-type': 'application/json'
        },
        body: { prompt: 'Hello' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [401]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Unauthorized.' });
    assert.equal(fetchCalled, false);
});

test('rejects unsupported content types', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example';
    process.env.GEMINI_API_KEY = 'key';
    process.env.GENERATE_INSIGHT_TOKEN = 'secret';

    const req = {
        method: 'POST',
        headers: {
            origin: 'https://allowed.example',
            authorization: 'Bearer secret',
            'content-type': 'text/plain'
        },
        body: { prompt: 'Hello' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [415]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Content-Type must be application/json.' });
});

test('validates presence of prompt', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example';
    process.env.GEMINI_API_KEY = 'key';
    process.env.GENERATE_INSIGHT_TOKEN = 'secret';

    const req = {
        method: 'POST',
        headers: {
            origin: 'https://allowed.example',
            authorization: 'Bearer secret',
            'content-type': 'application/json'
        },
        body: {}
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [400]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Prompt is required in the request body.' });
});

test('enforces prompt length limits', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example';
    process.env.GEMINI_API_KEY = 'key';
    process.env.GENERATE_INSIGHT_TOKEN = 'secret';

    const req = {
        method: 'POST',
        headers: {
            origin: 'https://allowed.example',
            authorization: 'Bearer secret',
            'content-type': 'application/json'
        },
        body: { prompt: 'a'.repeat(4001) }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [413]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Prompt is too long.' });
});

test('propagates upstream errors from Gemini', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example';
    process.env.GEMINI_API_KEY = 'key';
    process.env.GENERATE_INSIGHT_TOKEN = 'secret';

    global.fetch = async () => ({
        ok: false,
        status: 502,
        text: async () => 'Bad Gateway'
    });

    const req = {
        method: 'POST',
        headers: {
            origin: 'https://allowed.example',
            authorization: 'Bearer secret',
            'content-type': 'application/json'
        },
        body: { prompt: 'Hello' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [500]);
    assert.deepEqual(res.jsonPayloads[0], { error: 'Failed to generate insight.' });
});

test('returns Gemini response payload on success', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example';
    process.env.GEMINI_API_KEY = 'key';
    process.env.GENERATE_INSIGHT_TOKEN = 'secret';

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
        headers: {
            origin: 'https://allowed.example',
            authorization: 'Bearer secret',
            'content-type': 'application/json'
        },
        body: { prompt: 'Explain quantum computing.' }
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.deepEqual(res.statusCalls, [200]);
    assert.equal(res.getHeader('Access-Control-Allow-Origin'), 'https://allowed.example');
    assert.deepEqual(res.body, expectedPayload);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0][0], `${API_URL}?key=key`);
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
