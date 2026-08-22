#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const [inspectionPath, archivePath] = process.argv.slice(2);
assert(inspectionPath && archivePath, 'usage: node tests/verify-ci-artifact.mjs INSPECTION.json ARTIFACT.zip');

function parseJsonStrict(text, label) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
  let index = 0;
  const fail = message => { throw new Error(`${label}: ${message} at character ${index}`); };
  const whitespace = () => { while (/\s/u.test(text[index] || '')) index += 1; };
  const string = () => {
    const start = index;
    if (text[index] !== '"') fail('expected string');
    index += 1;
    while (index < text.length) {
      if (text[index] === '\\') index += 2;
      else if (text[index] === '"') return JSON.parse(text.slice(start, ++index));
      else index += 1;
    }
    fail('unterminated string');
  };
  const value = location => {
    whitespace();
    if (text[index] === '{') {
      index += 1;
      whitespace();
      const keys = new Set();
      if (text[index] === '}') { index += 1; return; }
      while (index < text.length) {
        whitespace();
        const key = string();
        if (keys.has(key)) fail(`duplicate object key ${JSON.stringify(key)} at ${location}`);
        keys.add(key);
        whitespace();
        if (text[index++] !== ':') fail('expected colon');
        value(`${location}.${key}`);
        whitespace();
        if (text[index] === '}') { index += 1; return; }
        if (text[index++] !== ',') fail('expected comma');
      }
    } else if (text[index] === '[') {
      index += 1;
      whitespace();
      if (text[index] === ']') { index += 1; return; }
      for (let item = 0; index < text.length; item += 1) {
        value(`${location}[${item}]`);
        whitespace();
        if (text[index] === ']') { index += 1; return; }
        if (text[index++] !== ',') fail('expected comma');
      }
    } else if (text[index] === '"') string();
    else {
      const primitive = text.slice(index).match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/u);
      if (!primitive) fail(`invalid value at ${location}`);
      index += primitive[0].length;
    }
  };
  value('$');
  whitespace();
  if (index !== text.length) fail('trailing content');
  return parsed;
}

function exactKeys(value, keys, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} keys differ`);
}

assert.throws(() => parseJsonStrict('{"x":1,"x":2}', 'strict-parser-self-test'), /duplicate object key/u);

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const inspection = parseJsonStrict(await readFile(inspectionPath, 'utf8'), 'inspection');
exactKeys(inspection, ['schemaVersion', 'providerSource', 'run', 'job', 'artifact', 'workflowGitObject', 'expected'], 'inspection');
assert.equal(inspection.schemaVersion, 1);
assert.equal(inspection.providerSource, 'GitHub connector/API records captured after workflow completion');

const { run, job, artifact, workflowGitObject, expected } = inspection;
exactKeys(run, [
  'id', 'runNumber', 'runAttempt', 'workflowId', 'workflowName', 'event', 'headSha', 'headBranch',
  'status', 'conclusion',
], 'run');
exactKeys(job, [
  'id', 'runId', 'runAttempt', 'name', 'status', 'conclusion', 'startedAt', 'completedAt', 'steps',
], 'job');
exactKeys(artifact, [
  'id', 'runId', 'name', 'sizeBytes', 'digest', 'createdAt', 'expiresAt', 'expired',
], 'artifact');
exactKeys(workflowGitObject, ['commitSha', 'treeSha', 'path', 'workflowBlobSha'], 'workflowGitObject');
exactKeys(expected, [
  'runId', 'runAttempt', 'jobId', 'artifactId', 'event', 'workflowRef', 'workflowBlobSha',
  'workflowSourceCommit', 'provenanceSha256', 'invocationCheckout', 'verificationKit', 'servedRuntime',
  'eventContext',
], 'expected');
for (const [index, step] of job.steps.entries()) exactKeys(step, ['name', 'conclusion'], `job.steps[${index}]`);
assert.equal(run.id, expected.runId);
assert.equal(run.runAttempt, expected.runAttempt);
assert.equal(run.workflowId, 335561992);
assert.equal(run.workflowName, "Verify Cat's Tower baseline and quality records");
assert.equal(run.event, expected.event);
assert.equal(run.headSha, expected.invocationCheckout.sha);
assert.equal(run.status, 'completed');
assert.equal(run.conclusion, 'success');
assert(Number.isInteger(run.runNumber) && run.runNumber > 0);
assert.equal(job.id, expected.jobId);
assert.equal(job.runId, run.id);
assert.equal(job.runAttempt, run.runAttempt);
assert.equal(job.name, 'vertical-tower-qa');
assert.equal(job.status, 'completed');
assert.equal(job.conclusion, 'success');
assert(Date.parse(job.startedAt) < Date.parse(job.completedAt));
const requiredSteps = [
  'Assert primary checkout provenance',
  'Capture immutable invocation provenance',
  'Resolve immutable Step 1 verification kit',
  'Finalize event-time CI provenance',
  'Repository handover and source contracts',
  'Vertical tower source and raster contracts',
  'Bind unexpired CI records and downloaded artifacts before seal',
  'GitHub recovery ref and live runtime manifest',
  'Chromium and WebKit vertical tower loop QA',
  'Attach captured CI provenance',
  'Upload V0.8.2 vertical tower evidence',
];
const actualSteps = new Map(job.steps.map(step => [step.name, step.conclusion]));
for (const step of requiredSteps) assert.equal(actualSteps.get(step), 'success', `missing successful step: ${step}`);

assert.equal(artifact.id, expected.artifactId);
assert.equal(artifact.runId, run.id);
assert.equal(artifact.name, 'cats-v082-step-1-recovery-evidence');
assert.equal(artifact.expired, false);
assert.match(artifact.digest, /^sha256:[a-f0-9]{64}$/u);
assert(Date.parse(artifact.createdAt) >= Date.parse(job.startedAt));
assert(Date.parse(artifact.createdAt) <= Date.parse(job.completedAt));
assert(Date.now() < Date.parse(artifact.expiresAt));
const archiveBytes = await readFile(archivePath);
assert.equal((await stat(archivePath)).size, artifact.sizeBytes);
assert.equal(sha256(archiveBytes), artifact.digest.slice('sha256:'.length));

const archiveNames = JSON.parse(execFileSync('python3', ['-c', [
  'import json,sys,zipfile',
  'with zipfile.ZipFile(sys.argv[1]) as z:',
  ' print(json.dumps(z.namelist()))',
].join('\n'), archivePath], { encoding: 'utf8' }));
assert.equal(archiveNames.length, 95);
assert.equal(new Set(archiveNames).size, archiveNames.length, 'artifact has duplicate member names');
for (const name of archiveNames) {
  const candidate = path.posix.normalize(name);
  assert(name && !name.startsWith('/') && !name.includes('\\') && !name.includes('//'), `unsafe member: ${name}`);
  assert(candidate === name && !candidate.startsWith('../') && candidate !== '..' && candidate !== '.', `unsafe member: ${name}`);
}
assert.equal(archiveNames.filter(name => name === 'ci-provenance.json').length, 1);
const provenanceBytes = execFileSync('unzip', ['-p', archivePath, 'ci-provenance.json'], { encoding: null });
const provenance = parseJsonStrict(provenanceBytes.toString('utf8'), 'ci-provenance.json');
assert.equal(sha256(provenanceBytes), expected.provenanceSha256);
exactKeys(provenance, [
  'schemaVersion', 'repository', 'workflowName', 'workflowPath', 'workflowRef', 'workflowCommitSha',
  'workflowBlobSha', 'generator', 'sourceBoundary', 'event', 'eventContext', 'runId', 'runNumber',
  'runAttempt', 'jobName', 'invocationCheckout', 'verificationKit', 'servedRuntime',
], 'provenance');
exactKeys(provenance.eventContext, ['kind', 'pullRequest', 'push', 'workflowDispatch'], 'eventContext');
exactKeys(provenance.invocationCheckout, ['sha', 'tree', 'ref'], 'invocationCheckout');
exactKeys(provenance.verificationKit, ['mode', 'sha', 'tree'], 'verificationKit');
exactKeys(provenance.servedRuntime, ['mode', 'sha', 'tree'], 'servedRuntime');
assert.equal(provenance.schemaVersion, 1);
assert.equal(provenance.repository, '2hg7trp7rv-design/cats_tower');
assert.equal(provenance.workflowName, run.workflowName);
assert.equal(provenance.workflowPath, '.github/workflows/verify-main.yml');
assert.equal(provenance.workflowRef, expected.workflowRef);
assert.equal(provenance.workflowCommitSha, workflowGitObject.commitSha);
assert.equal(provenance.workflowBlobSha, workflowGitObject.workflowBlobSha);
assert.equal(provenance.workflowBlobSha, expected.workflowBlobSha);
assert.equal(workflowGitObject.path, provenance.workflowPath);
assert.match(workflowGitObject.treeSha, /^[a-f0-9]{40}$/u);
assert.equal(provenance.generator, 'workflow-steps:Capture immutable invocation provenance+Finalize event-time CI provenance');
assert.equal(provenance.sourceBoundary, 'frozen-workflow-generated record; not a GitHub-signed attestation');
assert.equal(provenance.event, expected.event);
assert.equal(provenance.runId, run.id);
assert.equal(provenance.runNumber, run.runNumber);
assert.equal(provenance.runAttempt, run.runAttempt);
assert.equal(provenance.jobName, job.name);
assert.deepEqual(provenance.invocationCheckout, expected.invocationCheckout);
assert.deepEqual(provenance.verificationKit, expected.verificationKit);
assert.deepEqual(provenance.servedRuntime, expected.servedRuntime);
assert.deepEqual(provenance.eventContext, expected.eventContext);
assert.equal(execFileSync('git', ['rev-parse', `${provenance.invocationCheckout.sha}^{tree}`], { encoding: 'utf8' }).trim(), provenance.invocationCheckout.tree);
assert.equal(execFileSync('git', ['rev-parse', `${expected.workflowSourceCommit}:.github/workflows/verify-main.yml`], { encoding: 'utf8' }).trim(), provenance.workflowBlobSha);
if (expected.event === 'pull_request') {
  exactKeys(provenance.eventContext.pullRequest, ['number', 'baseBranch', 'baseSha', 'headBranch', 'headSha'], 'pullRequest');
  assert.equal(provenance.eventContext.push, null);
  assert.equal(provenance.eventContext.workflowDispatch, null);
assert.equal(provenance.eventContext.pullRequest.headSha, run.headSha);
  assert.equal(run.headBranch, provenance.eventContext.pullRequest.headBranch);
} else if (expected.event === 'push') {
  exactKeys(provenance.eventContext.push, ['ref', 'before', 'after'], 'push');
  assert.equal(provenance.eventContext.pullRequest, null);
  assert.equal(provenance.eventContext.workflowDispatch, null);
  assert.equal(provenance.eventContext.push.ref, 'refs/heads/main');
  assert.equal(provenance.eventContext.push.after, run.headSha);
  assert.equal(run.headBranch, 'main');
  assert.match(provenance.eventContext.push.before, /^[a-f0-9]{40}$/u);
  execFileSync('git', ['merge-base', '--is-ancestor', provenance.eventContext.push.before, provenance.eventContext.push.after]);
} else if (expected.event === 'workflow_dispatch') {
  exactKeys(provenance.eventContext.workflowDispatch, ['ref', 'sha'], 'workflowDispatch');
  assert.equal(provenance.eventContext.pullRequest, null);
  assert.equal(provenance.eventContext.push, null);
  assert.equal(provenance.eventContext.workflowDispatch.sha, run.headSha);
} else {
  assert.fail(`unsupported event: ${expected.event}`);
}

console.log(JSON.stringify({
  status: 'PASS',
  runId: run.id,
  runAttempt: run.runAttempt,
  jobId: job.id,
  artifactId: artifact.id,
  event: expected.event,
  headSha: run.headSha,
  artifactDigest: artifact.digest,
  provenanceSha256: sha256(provenanceBytes),
  verificationKit: provenance.verificationKit,
  servedRuntime: provenance.servedRuntime,
}, null, 2));
