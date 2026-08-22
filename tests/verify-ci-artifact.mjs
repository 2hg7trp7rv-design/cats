#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [role, runIdText, attemptText] = process.argv.slice(2);
assert(
  ['c3-pr', 'initial-main-seal', 'future-main'].includes(role),
  'role must be c3-pr, initial-main-seal, or future-main',
);
const runId = Number(runIdText);
assert(Number.isInteger(runId) && runId > 0, 'run ID must be a positive integer');
const attempt = Number(attemptText);
assert(Number.isInteger(attempt) && attempt > 0, 'run attempt must be a positive integer');
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
assert(token, 'GH_TOKEN or GITHUB_TOKEN is required for direct GitHub API verification');
const repository = process.env.GITHUB_REPOSITORY || '2hg7trp7rv-design/cats_tower';
assert.equal(repository, '2hg7trp7rv-design/cats_tower');
const baselineCommit = '727b8d00c281e7539117da5ded7309ea01c7e516';
const baselineTree = 'c508c58b0bb1b3fa591eefe143aab2dd6eac9271';
const sealPath = 'quality-reviews/step-1-legacy-baseline/round-005.json';
const workflowPath = '.github/workflows/verify-main.yml';
const externalWorkflowPath = '.github/workflows/verify-step-1-artifacts.yml';

function git(args, encoding = 'utf8') {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitPathExists(commit, relativePath) {
  try {
    git(['cat-file', '-e', `${commit}:${relativePath}`]);
    return true;
  } catch {
    return false;
  }
}

function gitIsAncestor(ancestor, descendant) {
  try {
    git(['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

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

function workflowPathMatches(actual, expected) {
  return actual === expected || (
    typeof actual === 'string'
    && actual.startsWith(`${expected}@`)
    && actual.length > expected.length + 1
    && !/[\r\n]/u.test(actual)
  );
}

async function githubApi(endpoint, binary = false) {
  const response = await fetch(`https://api.github.com/repos/${repository}${endpoint}`, {
    redirect: 'follow',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'cats-tower-step-1-artifact-verifier',
    },
  });
  assert(response.ok, `GitHub API ${endpoint} failed: ${response.status}`);
  return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
assert.throws(() => parseJsonStrict('{"x":1,"x":2}', 'strict-parser-self-test'), /duplicate object key/u);

const currentHead = git(['rev-parse', 'HEAD']).trim();
const currentTree = git(['rev-parse', 'HEAD^{tree}']).trim();
const rows = git(['rev-list', '--parents', 'HEAD']).trim().split('\n').filter(Boolean).map(row => row.split(/\s+/u));
const sealCommits = rows.filter(([commit, ...parents]) => (
  gitPathExists(commit, sealPath) && parents.every(parent => !gitPathExists(parent, sealPath))
)).map(([commit]) => commit);
assert.equal(sealCommits.length, 1, 'exactly one reachable Round 5 seal introduction is required');
const sealCommit = sealCommits[0];
const sealTree = git(['rev-parse', `${sealCommit}^{tree}`]).trim();
const sealedRound = parseJsonStrict(git(['show', `${sealCommit}:${sealPath}`]), 'sealed round-005.json');
const c2Commit = sealedRound.reviewTargetCommit;
const c1Commit = sealedRound.acceptance.commit;
assert.equal(git(['rev-parse', `${sealCommit}^`]).trim(), c2Commit);
assert.equal(git(['rev-parse', `${c2Commit}^`]).trim(), c1Commit);
for (const commit of [c1Commit, c2Commit, sealCommit]) git(['merge-base', '--is-ancestor', commit, currentHead]);
const sealMergeRows = rows.filter(([commit, ...parents]) => (
  parents.length === 2
  && parents[1] === sealCommit
  && git(['rev-parse', `${commit}^{tree}`]).trim() === sealTree
  && !gitIsAncestor(sealCommit, parents[0])
));
assert.equal(sealMergeRows.length, 1, 'exactly one proper historical [pre-main,C3] seal merge is required');
const [sealMergeCommit, preMergeMainCommit] = sealMergeRows[0];
git(['merge-base', '--is-ancestor', sealMergeCommit, currentHead]);
const initialMerge = currentHead === sealMergeCommit;
if (role === 'future-main') {
  assert.equal(initialMerge, false, 'future-main must not relabel the initial two-parent seal merge');
} else {
  assert.equal(initialMerge, true, `${role} requires the exact initial two-parent [base,C3] seal merge`);
}

const run = await githubApi(`/actions/runs/${runId}/attempts/${attempt}`);
assert.equal(run.id, runId);
assert.equal(run.run_attempt, attempt);
assert.equal(run.workflow_id, 335561992);
assert.equal(run.name, "Verify Cat's Tower baseline and quality records");
assert(workflowPathMatches(run.path, workflowPath), 'workflow run path differs from the protected primary workflow path');
assert.equal(run.status, 'completed');
assert.equal(run.conclusion, 'success');
assert.equal(run.event, role === 'c3-pr' ? 'pull_request' : 'push');
assert.equal(run.head_sha, role === 'c3-pr' ? sealCommit : currentHead);
if (role !== 'c3-pr') assert.equal(run.head_branch, 'main');
else assert.equal(typeof run.head_branch, 'string');

let initialExternalAudit = null;
if (role === 'future-main') {
  const query = new URLSearchParams({
    event: 'workflow_run',
    status: 'success',
    head_sha: sealMergeCommit,
    per_page: '100',
  });
  const payload = await githubApi(`/actions/workflows/verify-step-1-artifacts.yml/runs?${query}`);
  const candidates = payload.workflow_runs.filter(candidate => (
    candidate.event === 'workflow_run'
    && candidate.head_sha === sealMergeCommit
    && candidate.head_branch === 'main'
    && candidate.status === 'completed'
    && candidate.conclusion === 'success'
    && candidate.name === 'Verify sealed Step 1 external CI artifacts'
    && workflowPathMatches(candidate.path, externalWorkflowPath)
    && Date.parse(candidate.updated_at) < Date.parse(run.run_started_at)
  )).sort((left, right) => left.id - right.id);
  const verified = [];
  for (const candidate of candidates) {
    const candidateAttempt = candidate.run_attempt;
    if (!Number.isInteger(candidateAttempt) || candidateAttempt < 1) continue;
    const exactRun = await githubApi(`/actions/runs/${candidate.id}/attempts/${candidateAttempt}`);
    if (
      exactRun.id !== candidate.id
      || exactRun.run_attempt !== candidateAttempt
      || exactRun.event !== 'workflow_run'
      || exactRun.head_sha !== sealMergeCommit
      || exactRun.head_branch !== 'main'
      || exactRun.status !== 'completed'
      || exactRun.conclusion !== 'success'
      || exactRun.name !== 'Verify sealed Step 1 external CI artifacts'
      || !workflowPathMatches(exactRun.path, externalWorkflowPath)
      || Date.parse(exactRun.updated_at) >= Date.parse(run.run_started_at)
    ) continue;
    const candidateJobs = await githubApi(`/actions/runs/${candidate.id}/attempts/${candidateAttempt}/jobs?per_page=100`);
    const matchingJobs = candidateJobs.jobs.filter(item => (
      item.name === 'verify-sealed-artifacts'
      && item.run_id === candidate.id
      && item.head_sha === sealMergeCommit
      && item.status === 'completed'
      && item.conclusion === 'success'
    ));
    if (matchingJobs.length !== 1) continue;
    const candidateStepMap = new Map(matchingJobs[0].steps.map(step => [step.name, step.conclusion]));
    if (![
      'Bind source main workflow run',
      'Resolve seal, audit mode, and exact C3 run when required',
      'Verify C3 pull-request artifact through GitHub API',
      'Verify merged main artifact through GitHub API',
      'Upload external artifact audit results',
    ].every(stepName => candidateStepMap.get(stepName) === 'success')) continue;
    verified.push({
      runId: exactRun.id,
      runAttempt: exactRun.run_attempt,
      jobId: matchingJobs[0].id,
      headSha: exactRun.head_sha,
      completedAt: exactRun.updated_at,
    });
  }
  assert(verified.length >= 1, 'future-main requires an earlier provider-bound successful initial seal audit for the exact seal merge');
  [initialExternalAudit] = verified;
}

const jobsPayload = await githubApi(`/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`);
const jobs = jobsPayload.jobs.filter(candidate => candidate.name === 'vertical-tower-qa');
assert.equal(jobs.length, 1, 'exactly one matched vertical-tower-qa job is required');
const job = jobs[0];
assert.equal(job.run_id, runId);
assert.equal(job.head_sha, run.head_sha);
assert.equal(job.status, 'completed');
assert.equal(job.conclusion, 'success');
assert(Date.parse(job.started_at) < Date.parse(job.completed_at));
const stepMap = new Map(job.steps.map(step => [step.name, step.conclusion]));
for (const stepName of [
  'Assert primary checkout provenance', 'Capture immutable invocation provenance',
  'Resolve immutable Step 1 verification kit', 'Finalize event-time CI provenance',
  'Repository handover and source contracts', 'Vertical tower source and raster contracts',
  'Bind unexpired CI records and downloaded artifacts before seal',
  'GitHub recovery ref and live runtime manifest', 'Chromium and WebKit vertical tower loop QA',
  'Attach captured CI provenance', 'Upload V0.8.2 vertical tower evidence',
]) assert.equal(stepMap.get(stepName), 'success', `missing successful step: ${stepName}`);
assert.equal(
  stepMap.get('Clean checkout of the immutable V0.8.2 commit'),
  role === 'c3-pr' ? 'success' : 'skipped',
  'baseline checkout conclusion differs from role-specific expectation',
);

const artifactsPayload = await githubApi(`/actions/runs/${runId}/artifacts?per_page=100`);
const artifacts = artifactsPayload.artifacts.filter(candidate => (
  candidate.name === `cats-v082-step-1-recovery-evidence-attempt-${attempt}`
  && !candidate.expired
  && Date.parse(candidate.created_at) >= Date.parse(job.started_at)
  && Date.parse(candidate.created_at) <= Date.parse(job.completed_at)
));
assert.equal(artifacts.length, 1, 'exactly one unexpired artifact in the matched attempt interval is required');
const artifact = artifacts[0];
assert.match(artifact.digest, /^sha256:[a-f0-9]{64}$/u);
assert(Date.now() < Date.parse(artifact.expires_at));
const archiveBytes = await githubApi(`/actions/artifacts/${artifact.id}/zip`, true);
assert.equal(archiveBytes.byteLength, artifact.size_in_bytes);
assert.equal(sha256(archiveBytes), artifact.digest.slice('sha256:'.length));

const temporary = await mkdtemp(path.join(os.tmpdir(), 'cats-step1-artifact-'));
try {
  const archivePath = path.join(temporary, 'artifact.zip');
  await writeFile(archivePath, archiveBytes);
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
  assert.equal(provenance.repository, repository);
  assert.equal(provenance.workflowName, run.name);
  assert.equal(provenance.workflowPath, workflowPath);
  assert.match(provenance.workflowCommitSha, /^[a-f0-9]{40}$/u);
  assert.equal(provenance.generator, 'workflow-steps:Capture immutable invocation provenance+Finalize event-time CI provenance');
  assert.equal(provenance.sourceBoundary, 'frozen-workflow-generated record; not a GitHub-signed attestation');
  assert.equal(provenance.event, run.event);
  assert.equal(provenance.runId, run.id);
  assert.equal(provenance.runNumber, run.run_number);
  assert.equal(provenance.runAttempt, attempt);
  assert.equal(provenance.jobName, 'vertical-tower-qa');
  assert.deepEqual(provenance.invocationCheckout, {
    sha: run.head_sha,
    tree: role === 'c3-pr' ? sealTree : currentTree,
    ref: run.head_sha,
  });

  const workflowCommit = await githubApi(`/git/commits/${provenance.workflowCommitSha}`);
  assert.equal(workflowCommit.sha, provenance.workflowCommitSha);
  const workflowTree = await githubApi(`/git/trees/${workflowCommit.tree.sha}?recursive=1`);
  assert.equal(workflowTree.truncated, false);
  const workflowEntries = workflowTree.tree.filter(entry => entry.path === workflowPath && entry.type === 'blob');
  assert.equal(workflowEntries.length, 1);
  assert.equal(workflowEntries[0].sha, provenance.workflowBlobSha);
  const expectedWorkflowCommit = role === 'future-main' ? currentHead : sealCommit;
  assert.equal(
    provenance.workflowBlobSha,
    git(['rev-parse', `${expectedWorkflowCommit}:${workflowPath}`]).trim(),
    'workflow blob must match the role-authoritative repository tree',
  );

  if (role === 'c3-pr') {
    exactKeys(provenance.eventContext.pullRequest, ['number', 'baseBranch', 'baseSha', 'headBranch', 'headSha'], 'pullRequest');
    assert.equal(provenance.eventContext.kind, 'pull_request');
    assert.equal(provenance.eventContext.push, null);
    assert.equal(provenance.eventContext.workflowDispatch, null);
    const pullRequestNumber = provenance.eventContext.pullRequest.number;
    assert(Number.isSafeInteger(pullRequestNumber) && pullRequestNumber > 0, 'pull-request number must be a positive safe integer');
    assert.equal(provenance.workflowRef, `${repository}/${workflowPath}@refs/pull/${pullRequestNumber}/merge`);
    assert.equal(provenance.eventContext.pullRequest.baseBranch, 'main');
    assert.equal(provenance.eventContext.pullRequest.headBranch, run.head_branch);
    assert.equal(provenance.eventContext.pullRequest.headSha, sealCommit);
    assert.equal(provenance.eventContext.pullRequest.baseSha, preMergeMainCommit);
    const eventBaseCommit = await githubApi(`/git/commits/${provenance.eventContext.pullRequest.baseSha}`);
    assert.equal(eventBaseCommit.sha, provenance.eventContext.pullRequest.baseSha);
    assert.match(eventBaseCommit.tree.sha, /^[a-f0-9]{40}$/u);
    assert.deepEqual(provenance.verificationKit, { mode: 'current-head', sha: sealCommit, tree: sealTree });
    assert.deepEqual(provenance.servedRuntime, { mode: 'immutable-baseline-checkout', sha: baselineCommit, tree: baselineTree });
  } else {
    assert.equal(provenance.workflowRef, `${repository}/${workflowPath}@refs/heads/main`);
    exactKeys(provenance.eventContext.push, ['ref', 'before', 'after'], 'push');
    assert.equal(provenance.eventContext.kind, 'push');
    assert.equal(provenance.eventContext.pullRequest, null);
    assert.equal(provenance.eventContext.workflowDispatch, null);
    assert.equal(provenance.eventContext.push.ref, 'refs/heads/main');
    assert.equal(provenance.eventContext.push.after, currentHead);
    if (role === 'initial-main-seal') {
      assert.equal(provenance.eventContext.push.before, preMergeMainCommit);
    } else {
      assert.match(provenance.eventContext.push.before, /^[a-f0-9]{40}$/u);
      assert.notEqual(provenance.eventContext.push.before, currentHead);
      git(['merge-base', '--is-ancestor', provenance.eventContext.push.before, currentHead]);
    }
    assert.deepEqual(provenance.verificationKit, { mode: 'historical-seal', sha: sealCommit, tree: sealTree });
    assert.deepEqual(provenance.servedRuntime, { mode: 'sealed-c3-runtime', sha: sealCommit, tree: sealTree });
  }

  console.log(JSON.stringify({
    status: 'PASS',
    role,
    runId: run.id,
    runAttempt: attempt,
    jobId: job.id,
    artifactId: artifact.id,
    event: run.event,
    headSha: run.head_sha,
    artifactDigest: artifact.digest,
    provenanceSha256: sha256(provenanceBytes),
    verificationKit: provenance.verificationKit,
    servedRuntime: provenance.servedRuntime,
    initialExternalAudit,
  }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
