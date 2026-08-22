#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shareUrl = process.env.CATS_PREVIEW_SHARE_URL;
const deploymentId = process.env.CATS_PREVIEW_DEPLOYMENT_ID;
const deploymentCommit = process.env.CATS_PREVIEW_COMMIT;
const deploymentTree = process.env.CATS_PREVIEW_TREE;
assert(shareUrl, 'CATS_PREVIEW_SHARE_URL is required');
assert(deploymentId, 'CATS_PREVIEW_DEPLOYMENT_ID is required');
assert(deploymentCommit, 'CATS_PREVIEW_COMMIT is required');
assert(deploymentTree, 'CATS_PREVIEW_TREE is required');

const manifest = JSON.parse(await readFile(
  path.join(root, 'quality-reviews/step-1-legacy-baseline/evidence/runtime-manifest.json'),
  'utf8',
));
const baseUrl = new URL(shareUrl).origin;
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'cats-v082-preview-'));
const cookieJar = path.join(temporaryRoot, 'cookies.txt');
const toolbarMarker = 'vercel.live/_next-live/feedback/feedback.js';
const toolbarSuffix = `<script async data-explicit-opt-in="true" data-deployment-id="${deploymentId}" src="https://${toolbarMarker}"></script>`;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function curl(args) {
  execFileSync('curl', args, { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
}

function finalHeaders(source) {
  const blocks = source.replaceAll('\r\n', '\n').trim().split(/\n\n+/);
  const block = [...blocks].reverse().find(item => /^HTTP\/\S+ 200/m.test(item));
  assert(block, 'No final HTTP 200 response headers were captured');
  const headers = {};
  for (const line of block.split('\n').slice(1)) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    headers[line.slice(0, separator).toLowerCase()] = line.slice(separator + 1).trim();
  }
  const allowed = ['age', 'cache-control', 'content-length', 'content-type', 'etag', 'server', 'x-vercel-cache', 'x-vercel-id'];
  return Object.fromEntries(allowed.filter(name => headers[name] !== undefined).map(name => [name, headers[name]]));
}

try {
  curl(['-fsSL', '-c', cookieJar, '-b', cookieJar, shareUrl, '-o', path.join(temporaryRoot, 'bootstrap')]);
  const entries = [];
  for (const [index, expected] of manifest.entries.entries()) {
    const bodyPath = path.join(temporaryRoot, `body-${index}`);
    const headerPath = path.join(temporaryRoot, `headers-${index}`);
    curl(['-fsSL', '-b', cookieJar, '-D', headerPath, `${baseUrl}${expected.servedPath}`, '-o', bodyPath]);
    const body = await readFile(bodyPath);
    const observedSha256 = sha256(body);
    const result = {
      servedPath: expected.servedPath,
      expectedBytes: expected.bytes,
      observedBytes: body.byteLength,
      expectedSha256: expected.sha256,
      observedSha256,
      headers: finalHeaders(await readFile(headerPath, 'utf8')),
    };
    if (observedSha256 === expected.sha256) {
      result.result = 'EXACT';
    } else {
      assert(['/', '/index.html'].includes(expected.servedPath), `Unexpected Preview mismatch: ${expected.servedPath}`);
      const expectedBody = await readFile(path.join(root, '.github/baselines/v0.8.2/runtime/index.html'));
      assert.equal(expectedBody.byteLength, expected.bytes);
      assert.equal(sha256(expectedBody), expected.sha256);
      assert(body.byteLength > expectedBody.byteLength, `Preview HTML has no injected suffix: ${expected.servedPath}`);
      assert(body.subarray(0, expectedBody.byteLength).equals(expectedBody), `Preview HTML changed before its injected suffix: ${expected.servedPath}`);
      const suffix = body.subarray(expectedBody.byteLength);
      assert.equal(suffix.toString('utf8'), toolbarSuffix, `Preview HTML has an unexpected injected suffix: ${expected.servedPath}`);
      assert.equal(body.toString('utf8').split(toolbarMarker).length - 1, 1, `Preview Toolbar marker count differs: ${expected.servedPath}`);
      result.normalizedSha256 = sha256(expectedBody);
      result.toolbarSuffixBytes = suffix.byteLength;
      result.toolbarSuffixSha256 = sha256(suffix);
      result.rawResponseBase64 = body.toString('base64');
      assert.equal(result.normalizedSha256, expected.sha256, `Normalized Preview HTML differs: ${expected.servedPath}`);
      result.result = 'PREVIEW_TOOLBAR_NORMALIZED';
    }
    entries.push(result);
  }
  const report = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    deploymentId,
    deploymentCommit,
    deploymentTree,
    baselineCommit: manifest.baselineCommit,
    baselineTree: manifest.baselineTree,
    temporaryShareCredentialPersisted: false,
    normalizationMarker: toolbarMarker,
    normalizationStrategy: 'raw response must equal exact baseline HTML bytes followed by exactly one deployment-bound Vercel Toolbar script suffix',
    expectedToolbarSuffix: toolbarSuffix,
    summary: {
      exact: entries.filter(entry => entry.result === 'EXACT').length,
      previewToolbarNormalized: entries.filter(entry => entry.result === 'PREVIEW_TOOLBAR_NORMALIZED').length,
      failed: entries.filter(entry => !['EXACT', 'PREVIEW_TOOLBAR_NORMALIZED'].includes(entry.result)).length,
      total: entries.length,
    },
    entries,
  };
  assert.deepEqual(report.summary, { exact: 15, previewToolbarNormalized: 2, failed: 0, total: 17 });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
