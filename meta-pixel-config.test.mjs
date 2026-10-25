import assert from 'node:assert/strict';
import test from 'node:test';
import handler from './api/meta-pixel-config.js';

function responseMock() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    end(body) { this.body = body; }
  };
}

test('pixel config endpoint returns only a valid public Pixel ID', () => {
  const originalValue = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  process.env.NEXT_PUBLIC_META_PIXEL_ID = '12345';
  const res = responseMock();
  handler({ method: 'GET' }, res);
  if (originalValue === undefined) delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
  else process.env.NEXT_PUBLIC_META_PIXEL_ID = originalValue;

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { pixelId: '12345' });
});

test('pixel config endpoint hides malformed IDs and rejects non-GET methods', () => {
  const originalValue = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  process.env.NEXT_PUBLIC_META_PIXEL_ID = 'not-an-id';
  const getResponse = responseMock();
  handler({ method: 'GET' }, getResponse);
  const postResponse = responseMock();
  handler({ method: 'POST' }, postResponse);
  if (originalValue === undefined) delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
  else process.env.NEXT_PUBLIC_META_PIXEL_ID = originalValue;

  assert.deepEqual(JSON.parse(getResponse.body), { pixelId: '' });
  assert.equal(postResponse.statusCode, 405);
  assert.equal(postResponse.headers.allow, 'GET');
});
