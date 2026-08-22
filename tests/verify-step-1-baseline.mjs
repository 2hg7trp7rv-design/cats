#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(process.env.CATS_REPO_ROOT || kitRoot);
const targetRoot = path.resolve(process.env.CATS_BASELINE_DIR || kitRoot);
const baselineCommit = '727b8d00c281e7539117da5ded7309ea01c7e516';
const baselineTree = 'c508c58b0bb1b3fa591eefe143aab2dd6eac9271';
const archiveRef = 'refs/heads/archive/v0.8.2-legacy-baseline';
const roundThreePath = 'quality-reviews/step-1-legacy-baseline/round-003.json';
const futureImmutablePaths = [
  '.github/baselines/v0.8.2',
  'quality-reviews/step-1-legacy-baseline',
];
const futureRequiredQualityGateClaims = [
  'この規則は、仕様書、調査、画像、画面、コード、QA、配信など、ユーザーへ成果として渡す全作業へ適用する。',
  '3. **実物を自己検収する**',
  '4. **反証する**',
  '一つでも不合格なら`IN_PROGRESS`へ戻し、失敗原因を次のAcceptanceへ加えて手順1から再構成する。',
  '`PASS`時だけ完成報告する。未完成時は完成したように表現しない。',
  'それ以外は内部で①〜④を繰り返し、合格後にまとめて報告する。',
  'ユーザーが品質を否認した場合は旧判定を守らず、直ちに`IN_PROGRESS`へ戻して次roundの失敗条件へ反映する。',
];
const futureCanonicalPaths = [
  'README.md', 'AGENTS.md', 'MASTER_SPEC.md', 'FLOORS_1_10_DESIGN.md', 'PROJECT_HANDOVER.md', 'BASELINE_V082.md',
];
const live = process.argv.includes('--live');
const remote = process.argv.includes('--remote');
const preflight = process.argv.includes('--preflight');

function parseJsonStrict(text, label = 'JSON') {
  assert.equal(typeof text, 'string', `${label} must be UTF-8 text`);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }

  let index = 0;
  const fail = message => {
    throw new Error(`${label} has an ambiguous JSON representation at byte ${Buffer.byteLength(text.slice(0, index), 'utf8')}: ${message}`);
  };
  const skipWhitespace = () => {
    while (index < text.length && /\s/u.test(text[index])) index += 1;
  };
  const consume = expected => {
    if (text[index] !== expected) fail(`expected ${JSON.stringify(expected)}`);
    index += 1;
  };
  const scanString = () => {
    const start = index;
    consume('"');
    while (index < text.length) {
      if (text[index] === '\\') {
        index += 2;
        continue;
      }
      if (text[index] === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      }
      index += 1;
    }
    fail('unterminated string');
  };
  const scanValue = location => {
    skipWhitespace();
    const token = text[index];
    if (token === '{') {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === '}') {
        index += 1;
        return;
      }
      while (index < text.length) {
        skipWhitespace();
        if (text[index] !== '"') fail(`expected an object key at ${location}`);
        const key = scanString();
        if (keys.has(key)) fail(`duplicate object key ${JSON.stringify(key)} at ${location}`);
        keys.add(key);
        skipWhitespace();
        consume(':');
        scanValue(`${location}.${key}`);
        skipWhitespace();
        if (text[index] === '}') {
          index += 1;
          return;
        }
        consume(',');
      }
      fail(`unterminated object at ${location}`);
    }
    if (token === '[') {
      index += 1;
      skipWhitespace();
      if (text[index] === ']') {
        index += 1;
        return;
      }
      let arrayIndex = 0;
      while (index < text.length) {
        scanValue(`${location}[${arrayIndex}]`);
        arrayIndex += 1;
        skipWhitespace();
        if (text[index] === ']') {
          index += 1;
          return;
        }
        consume(',');
      }
      fail(`unterminated array at ${location}`);
    }
    if (token === '"') {
      scanString();
      return;
    }
    const primitive = text.slice(index).match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/u);
    if (!primitive) fail(`invalid value at ${location}`);
    index += primitive[0].length;
  };

  scanValue('$');
  skipWhitespace();
  if (index !== text.length) fail('trailing content');
  return parsed;
}

assert.deepEqual(parseJsonStrict('{"outer":{"key":1},"items":[true,null]}', 'strict JSON self-test'), {
  outer: { key: 1 },
  items: [true, null],
});
assert.throws(
  () => parseJsonStrict('{"key":1,"key":2}', 'strict JSON duplicate-key self-test'),
  /duplicate object key/u,
);
assert.throws(
  () => parseJsonStrict('{"key":1,"\\u006bey":2}', 'strict JSON escaped-key self-test'),
  /duplicate object key/u,
);

function git(args, encoding = 'utf8') {
  return execFileSync('git', args, {
    cwd: targetRoot,
    encoding,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function kitGit(args, encoding = 'utf8') {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function pathIntroductionCommits(commitRows, pathExistsAtCommit) {
  return commitRows
    .filter(([commit, ...parents]) => pathExistsAtCommit(commit) && parents.every(parent => !pathExistsAtCommit(parent)))
    .map(([commit]) => commit)
    .sort();
}

function reachablePathIntroductions(relativePath) {
  const commitRows = kitGit(['rev-list', '--parents', 'HEAD']).trim().split('\n').filter(Boolean)
    .map(row => row.trim().split(/\s+/u));
  return pathIntroductionCommits(commitRows, commit => gitPathExists(commit, relativePath));
}

const syntheticReachableDag = [
  ['merge', 'branch-a', 'branch-b'],
  ['branch-a', 'root'],
  ['branch-b', 'root'],
  ['root'],
];
const syntheticPathOwners = new Set(['merge', 'branch-a', 'branch-b']);
assert.deepEqual(
  pathIntroductionCommits(syntheticReachableDag, commit => syntheticPathOwners.has(commit)),
  ['branch-a', 'branch-b'],
  'Reachable path-introduction discovery must expose additions hidden on separate merge branches',
);

assert.equal(kitGit(['rev-parse', '--is-shallow-repository']).trim(), 'false', 'Step 1 verification requires full Git history');
assert.equal(kitGit(['replace', '-l']).trim(), '', 'Git replace refs are forbidden during Step 1 verification');
const reachableSealCommits = reachablePathIntroductions(roundThreePath);
assert(reachableSealCommits.length <= 1, 'round-003 was added more than once in reachable history');
if (process.env.CATS_SEAL_COMMIT) {
  assert.equal(reachableSealCommits.length, 1, 'An injected seal commit is forbidden when no unique reachable seal exists');
  assert.equal(process.env.CATS_SEAL_COMMIT, reachableSealCommits[0], 'An injected seal commit differs from the unique reachable seal');
}
const sealCommit = reachableSealCommits[0] || null;
const currentHead = kitGit(['rev-parse', 'HEAD']).trim();
if (sealCommit) {
  assert.equal(
    kitGit(['rev-list', '--parents', '-n', '1', sealCommit]).trim().split(/\s+/u).length,
    2,
    'The unique reachable Step 1 seal must be a single-parent commit',
  );
  assert.equal(kitGit(['rev-parse', `${sealCommit}^{commit}`]).trim(), sealCommit, 'Seal commit is missing');
  kitGit(['merge-base', '--is-ancestor', sealCommit, 'HEAD']);
}
if (process.env.CATS_SEALED_REENTRY === '1') {
  assert(process.env.CATS_SEAL_COMMIT, 'Sealed re-entry requires the parent-validated seal commit');
  assert(sealCommit, 'Sealed re-entry requires one reachable historical seal');
  assert.notEqual(repoRoot, kitRoot, 'Sealed re-entry may not bypass descendant checks from the current checkout');
  assert.notEqual(currentHead, sealCommit, 'Sealed re-entry requires a descendant HEAD distinct from the historical seal');
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: kitRoot, encoding: 'utf8' }).trim(),
    sealCommit,
    'Sealed re-entry must execute from the detached historical seal worktree',
  );
}

// Later steps may legitimately change product files. Re-run the immutable Step 1
// verifier from the historical seal instead of comparing the future HEAD to V0.8.2.
if (sealCommit && currentHead !== sealCommit) {
  const frozenAcceptance = parseJsonStrict(kitGit([
    'show', `${sealCommit}:quality-reviews/step-1-legacy-baseline/acceptance-round-003.json`,
  ], 'utf8'), 'sealed acceptance-round-003.json');
  assert.deepEqual(frozenAcceptance.futureImmutablePaths, futureImmutablePaths);
  assert.deepEqual(frozenAcceptance.futureRequiredQualityGateClaims, futureRequiredQualityGateClaims);
  assert.equal(frozenAcceptance.futureNormativeKernel.arbitraryNaturalLanguageSemanticCompletenessClaimed, false);
  for (const relativePath of futureImmutablePaths) {
    assert.equal(
      kitGit(['rev-parse', `${currentHead}:${relativePath}`]).trim(),
      kitGit(['rev-parse', `${sealCommit}:${relativePath}`]).trim(),
      `Current HEAD changed or removed sealed Step 1 evidence: ${relativePath}`,
    );
  }
  const currentQualityGate = kitGit(['show', `${currentHead}:QUALITY_GATE.md`], 'utf8');
  for (const claim of futureRequiredQualityGateClaims) {
    assert(currentQualityGate.includes(claim), `Current HEAD weakened a required universal quality-loop claim: ${claim}`);
  }
  const sealedStatus = parseJsonStrict(
    kitGit(['show', `${sealCommit}:PROJECT_STATUS.json`], 'utf8'),
    'sealed PROJECT_STATUS.json',
  );
  const currentStatus = parseJsonStrict(
    kitGit(['show', `${currentHead}:PROJECT_STATUS.json`], 'utf8'),
    'current PROJECT_STATUS.json',
  );
  const sealedStepOne = {
    order: 1,
    name: 'legacy-v082-source-runtime-byte-checkpoint',
    status: 'PASS',
  };
  assert.deepEqual(sealedStatus.preparation[0], sealedStepOne, 'The sealed Step 1A preparation entry is not canonical');
  assert.deepEqual(currentStatus.preparation[0], sealedStepOne, 'Current HEAD changed the sealed Step 1A preparation entry');
  assert.equal(
    currentStatus.preparation.filter(item => item?.name === sealedStepOne.name).length,
    1,
    'Current HEAD duplicates the authoritative Step 1A preparation name',
  );
  assert.equal(
    currentStatus.preparation.filter(item => item?.order === sealedStepOne.order).length,
    1,
    'Current HEAD duplicates the authoritative Step 1A preparation order',
  );
  assert.deepEqual(
    currentStatus.legacyBaseline,
    sealedStatus.legacyBaseline,
    'Current HEAD changed the sealed Step 1A baseline status record',
  );
  assert.deepEqual(
    currentStatus.legacyV082Verification,
    sealedStatus.legacyV082Verification,
    'Current HEAD changed the sealed Step 1A verification record',
  );
  for (const relativePath of futureCanonicalPaths) {
    const contents = kitGit(['show', `${currentHead}:${relativePath}`], 'utf8');
    const structuredStatusLines = contents.match(/^工程状態: 工程1A=[^\n]+$/gmu) || [];
    assert.equal(structuredStatusLines.length, 1, `${relativePath} must retain exactly one structured Step 1A status marker`);
    assert(structuredStatusLines[0].startsWith('工程状態: 工程1A=PASS /'), `${relativePath} no longer reports the sealed Step 1A PASS`);
    const checklistRows = contents.match(/^1\. V0\.8\.2 deployed browser-runtime source \+ deployment-input byte checkpoint — `[^`]+`$/gmu) || [];
    assert.deepEqual(checklistRows, ['1. V0.8.2 deployed browser-runtime source + deployment-input byte checkpoint — `PASS`']);
    assert.equal(contents.split('工程1A正式名称: V0.8.2 deployed browser-runtime source + deployment-input byte checkpoint').length - 1, 1);
    assert.equal(contents.split('工程1A対象外: whole-repository backup / player-save backup / physical-iPhone approval / Production alias switch').length - 1, 1);
  }
  if (process.env.CATS_SEALED_REENTRY !== '1') {
    const temporaryWorktree = await mkdtemp(path.join(os.tmpdir(), 'cats-step1-seal-'));
    try {
      kitGit(['worktree', 'add', '--detach', temporaryWorktree, sealCommit]);
      const forwardedArgs = process.argv.slice(2).filter(argument => !['--live', '--remote', '--preflight'].includes(argument));
      execFileSync(process.execPath, [path.join(temporaryWorktree, 'tests/verify-step-1-baseline.mjs'), ...forwardedArgs], {
        cwd: temporaryWorktree,
        env: {
          ...process.env,
          CATS_REPO_ROOT: repoRoot,
          CATS_SEAL_COMMIT: sealCommit,
          CATS_SEALED_REENTRY: '1',
        },
        stdio: 'inherit',
        maxBuffer: 16 * 1024 * 1024,
      });
    } finally {
      try {
        kitGit(['worktree', 'remove', '--force', temporaryWorktree]);
      } finally {
        await rm(temporaryWorktree, { recursive: true, force: true });
      }
    }
    console.log(`Step 1 historical seal ${sealCommit} verified; future external aliases and expiring CI records were not re-queried.`);
    process.exit(0);
  }
}

const sealedRound = sealCommit
  ? parseJsonStrict(kitGit(['show', `${sealCommit}:${roundThreePath}`], 'utf8'), 'sealed round-003.json')
  : null;
const contentCommit = sealedRound?.reviewTargetCommit || currentHead;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitObjectSha1(type, bytes) {
  return createHash('sha1').update(Buffer.concat([
    Buffer.from(`${type} ${bytes.byteLength}\0`, 'utf8'),
    bytes,
  ])).digest('hex');
}

async function listFiles(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, child));
    else if (entry.isFile()) files.push(child.split(path.sep).join('/'));
  }
  return files.sort();
}

function webpDimensions(bytes) {
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', 'Visual evidence is not RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', 'Visual evidence is not WebP');
  const kind = bytes.subarray(12, 16).toString('ascii');
  if (kind === 'VP8X') {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (kind === 'VP8L') {
    assert.equal(bytes[20], 0x2f, 'Invalid lossless WebP signature');
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    };
  }
  const frame = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
  assert(frame >= 0, 'Invalid lossy WebP frame header');
  return {
    width: bytes.readUInt16LE(frame + 3) & 0x3fff,
    height: bytes.readUInt16LE(frame + 5) & 0x3fff,
  };
}

assert.equal(git(['rev-parse', `${baselineCommit}^{commit}`]).trim(), baselineCommit, 'Baseline commit is missing');
assert.equal(git(['rev-parse', `${baselineCommit}^{tree}`]).trim(), baselineTree, 'Baseline tree changed');
git(['fsck', '--full', '--no-dangling']);
if (process.env.CATS_BASELINE_DIR) {
  assert.equal(git(['rev-parse', 'HEAD']).trim(), baselineCommit, 'Recovered checkout HEAD is not the baseline commit');
  assert.equal(git(['rev-parse', 'HEAD^{tree}']).trim(), baselineTree, 'Recovered checkout tree is not the baseline tree');
  assert.equal(git(['status', '--porcelain', '--untracked-files=all']).trim(), '', 'Recovered checkout is not clean');
}
const baselineTreeEntries = git(['ls-tree', '-r', baselineCommit]).trim().split('\n').filter(Boolean);
assert(!baselineTreeEntries.some(line => line.startsWith('160000 ')), 'Baseline contains a submodule gitlink');
let lfsPointers = '';
try {
  lfsPointers = git(['grep', '-I', '-l', 'version https://git-lfs.github.com/spec/v1', baselineCommit, '--']).trim();
} catch (error) {
  assert.equal(error.status, 1, 'Unable to inspect the baseline for Git LFS pointers');
}
assert.equal(lfsPointers, '', `Baseline contains Git LFS pointers: ${lfsPointers}`);

const manifestPath = path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/runtime-manifest.json');
const manifest = parseJsonStrict(await readFile(manifestPath, 'utf8'), 'runtime-manifest.json');
assert.equal(manifest.baselineCommit, baselineCommit);
assert.equal(manifest.baselineTree, baselineTree);
assert.equal(manifest.entries.length, 17, 'The runtime manifest must contain all 17 execution and license entries');
assert.equal(new Set(manifest.entries.map(entry => entry.servedPath)).size, 17, 'Every served manifest path must be unique');

const uniqueSourcePaths = [...new Set(manifest.entries.map(entry => entry.sourcePath))];
const deploymentInputPaths = manifest.deploymentInputs.map(entry => entry.sourcePath);
assert.deepEqual([...deploymentInputPaths].sort(), ['.vercelignore', 'vercel.json']);
for (const sourcePath of [...uniqueSourcePaths, ...deploymentInputPaths]) {
  const entries = manifest.entries.filter(entry => entry.sourcePath === sourcePath);
  const deploymentEntries = manifest.deploymentInputs.filter(entry => entry.sourcePath === sourcePath);
  const expectedEntries = [...entries, ...deploymentEntries];
  const baselineBytes = git(['show', `${baselineCommit}:${sourcePath}`], null);
  const workingBytes = await readFile(path.join(targetRoot, sourcePath));
  for (const entry of expectedEntries) {
    assert.equal(baselineBytes.byteLength, entry.bytes, `Baseline byte size mismatch: ${sourcePath}`);
    assert.equal(sha256(baselineBytes), entry.sha256, `Baseline SHA-256 mismatch: ${sourcePath}`);
    assert.equal(sha256(workingBytes), entry.sha256, `Working runtime diverged from baseline: ${sourcePath}`);
  }
}

const runtimeDiff = kitGit([
  'diff', '--name-only', `${baselineCommit}..${contentCommit}`, '--', ...uniqueSourcePaths, ...deploymentInputPaths,
]).trim();
assert.equal(runtimeDiff, '', `Step 1A must not change runtime or deployment inputs: ${runtimeDiff}`);

const status = parseJsonStrict(
  await readFile(path.join(kitRoot, 'PROJECT_STATUS.json'), 'utf8'),
  'PROJECT_STATUS.json',
);
assert.deepEqual(Object.keys(status.preparation[0]), ['order', 'name', 'status']);
assert.equal(status.preparation[0].order, 1);
assert.equal(status.preparation[0].name, 'legacy-v082-source-runtime-byte-checkpoint');
assert(['IN_PROGRESS', 'PASS'].includes(status.preparation[0].status));
assert.equal(
  status.preparation.filter(item => item?.name === 'legacy-v082-source-runtime-byte-checkpoint').length,
  1,
  'PROJECT_STATUS duplicates the authoritative Step 1A preparation name',
);
assert.equal(
  status.preparation.filter(item => item?.order === 1).length,
  1,
  'PROJECT_STATUS duplicates the authoritative Step 1A preparation order',
);
assert.equal(status.legacyBaseline.commit, baselineCommit);
assert.equal(status.legacyBaseline.sourceRuntimeCheckpoint, status.preparation[0].status);
assert.equal(status.legacyBaseline.playerSaveBackup, 'UNAVAILABLE_IN_V082');
assert.equal(status.legacyBaseline.physicalIPhoneStandalonePwaApproval, 'NOT_VERIFIED');
assert.deepEqual(
  status.preparation.slice(1).map(item => item.status),
  ['PENDING_REVALIDATION', 'PENDING_REVALIDATION', ...Array(7).fill('NOT_STARTED')],
  'Later preparation steps do not have their required revalidation/not-started states',
);

const browserEvidence = parseJsonStrict(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/browser-qa.json'),
  'utf8',
), 'browser-qa.json');
for (const evidence of browserEvidence.visualEvidence) {
  const evidencePath = path.join(kitRoot, evidence.path);
  const bytes = await readFile(evidencePath);
  assert.equal(sha256(bytes), evidence.sha256, `Visual evidence hash mismatch: ${evidence.path}`);
  assert.deepEqual(webpDimensions(bytes), { width: 390, height: 844 }, `Visual evidence dimensions mismatch: ${evidence.path}`);
}
assert.equal(browserEvidence.visualEvidence.length, 6, 'Six final-size visual records are required');
assert.equal(browserEvidence.deterministicLoop.length, 4, 'Four Chromium/WebKit deterministic viewport reports are required');
assert.equal(browserEvidence.normalUiFlow.length, 4, 'Four Chromium/WebKit normal-flow viewport reports are required');
assert.equal(browserEvidence.serviceWorkerRecovery.length, 2, 'Two Chromium service-worker reports are required');
assert.equal(browserEvidence.cleanCheckoutCi.durableRawReportsCommitted, 10);
assert.equal(browserEvidence.cleanCheckoutCi.durableEvidenceDoesNotDependOnArtifactRetention, true);
assert.equal(browserEvidence.sourceArtifact.runId, browserEvidence.cleanCheckoutCi.runId);
assert.equal(browserEvidence.sourceArtifact.artifactId, browserEvidence.cleanCheckoutCi.artifactId);
assert.equal(browserEvidence.sourceArtifact.digest, browserEvidence.cleanCheckoutCi.artifactDigest);
assert.equal(browserEvidence.sourceArtifact.downloadedZipSha256, browserEvidence.cleanCheckoutCi.artifactDigest.replace(/^sha256:/, ''));
assert.equal(browserEvidence.sourceArtifact.entryCount, 94);
assert.equal(browserEvidence.sourceArtifact.downloadedAndIndependentlyInspected, true);

const repositoryEvidence = parseJsonStrict(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/repository.json'),
  'utf8',
), 'repository.json');
assert.equal(repositoryEvidence.baselineCommit, baselineCommit);
assert.equal(repositoryEvidence.baselineTree, baselineTree);
assert.equal(repositoryEvidence.archiveRef, archiveRef);
assert.equal(repositoryEvidence.archiveRefCommit, baselineCommit);
assert.equal(repositoryEvidence.archiveRefProtectedAtAudit, false);
assert.equal(repositoryEvidence.mainProtectedAtAudit, false);
assert.equal(repositoryEvidence.localAnnotatedTagObject, '43c9e624e3e87040a3808c9cd370fd311763d500');
assert.equal(repositoryEvidence.gameRuntimeChangedByStep1Redo, false);
assert.equal(repositoryEvidence.gitLfsUsed, false);
assert.equal(repositoryEvidence.submodulesUsed, false);
assert.equal(repositoryEvidence.selfContainedRuntimeSnapshot, '.github/baselines/v0.8.2');

const deploymentEvidence = parseJsonStrict(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/deployments.json'),
  'utf8',
), 'deployments.json');
assert.equal(deploymentEvidence.historicalBaselineDeployment.githubCommitSha, baselineCommit);
assert.equal(deploymentEvidence.historicalBaselineDeployment.isCurrentFixedAliasTarget, false);
assert.equal(deploymentEvidence.historicalBaselineDeployment.state, 'READY');
assert.notEqual(
  deploymentEvidence.currentProductionDeploymentAtAudit.githubCommitSha,
  deploymentEvidence.historicalBaselineDeployment.githubCommitSha,
  'Current Production and historical deployment identities must remain distinct',
);
assert.equal(deploymentEvidence.runtimeManifestMismatchCount, 0);
assert.equal(deploymentEvidence.runtimeManifestMatchCount, 17);
assert.equal(deploymentEvidence.freshRecoveryDrill.tree, baselineTree);
assert.equal(deploymentEvidence.freshRecoveryDrill.treeEqualsBaseline, true);
assert.equal(deploymentEvidence.freshRecoveryDrill.state, 'READY');
assert.equal(deploymentEvidence.freshRecoveryDrill.runtimeEntriesExact, 15);
assert.equal(deploymentEvidence.freshRecoveryDrill.htmlEntriesEqualAfterRemovingVercelPreviewToolbarInjection, 2);
assert.equal(deploymentEvidence.freshRecoveryDrill.runtimeEntriesFailed, 0);

const vercelMetadata = parseJsonStrict(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/vercel-deployment-metadata.json'),
  'utf8',
), 'vercel-deployment-metadata.json');
assert.equal(vercelMetadata.recheckedAt, '2026-08-22T15:28:51Z');
assert.equal(vercelMetadata.source, 'Vercel deployment API through the connected project');
assert.equal(vercelMetadata.connectorAuthentication, 'authenticated connected-project access');
assert.equal(vercelMetadata.cryptographicResponseSignatureStored, false);
assert.equal(vercelMetadata.proceduralIndependentRecheckRequired, true);
assert.equal(vercelMetadata.project.id, deploymentEvidence.project.id);
const vercelDeploymentsByRole = Object.fromEntries(vercelMetadata.deployments.map(item => [item.role, item]));
assert.equal(vercelDeploymentsByRole['historical-baseline'].id, deploymentEvidence.historicalBaselineDeployment.id);
assert.equal(vercelDeploymentsByRole['historical-baseline'].githubCommitSha, baselineCommit);
assert.equal(vercelDeploymentsByRole['fixed-production-at-audit'].id, deploymentEvidence.currentProductionDeploymentAtAudit.id);
assert.equal(
  vercelDeploymentsByRole['fixed-production-at-audit'].githubCommitSha,
  deploymentEvidence.currentProductionDeploymentAtAudit.githubCommitSha,
);
assert.equal(vercelDeploymentsByRole['fresh-baseline-tree-recovery-preview'].id, deploymentEvidence.freshRecoveryDrill.deploymentId);
assert.equal(vercelDeploymentsByRole['fresh-baseline-tree-recovery-preview'].state, 'READY');
assert.equal(
  vercelDeploymentsByRole['fresh-baseline-tree-recovery-preview'].githubCommitSha,
  deploymentEvidence.freshRecoveryDrill.commit,
);
const recoveryCommitObjectBase64 = await readFile(path.join(
  kitRoot,
  'quality-reviews/step-1-legacy-baseline/evidence/fresh-recovery-commit-object.b64',
), 'utf8');
assert.deepEqual(deploymentEvidence.freshRecoveryDrill.commitObjectWitness, {
  path: 'quality-reviews/step-1-legacy-baseline/evidence/fresh-recovery-commit-object.b64',
  encoding: 'base64',
  decodedBytes: 314,
  encodedFileSha256: sha256(Buffer.from(recoveryCommitObjectBase64, 'utf8')),
});
assert.match(recoveryCommitObjectBase64, /^[A-Za-z0-9+/]+=*\n$/);
const recoveryCommitObject = Buffer.from(recoveryCommitObjectBase64.trim(), 'base64');
assert.equal(recoveryCommitObject.byteLength, 314);
assert.equal(gitObjectSha1('commit', recoveryCommitObject), deploymentEvidence.freshRecoveryDrill.commit);
const recoveryCommitLines = recoveryCommitObject.toString('utf8').split('\n');
assert.equal(recoveryCommitLines[0], `tree ${baselineTree}`);
assert.equal(recoveryCommitLines[1], `parent ${baselineCommit}`);
assert.equal(recoveryCommitLines.filter(line => line.startsWith('tree ')).length, 1);
assert.equal(recoveryCommitLines.filter(line => line.startsWith('parent ')).length, 1);
assert.equal(recoveryCommitLines.at(-1), 'test: rebuild the V0.8.2 baseline from an unchanged tree');

const previewEvidence = parseJsonStrict(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/fresh-recovery-preview.json'),
  'utf8',
), 'fresh-recovery-preview.json');
assert.equal(previewEvidence.deploymentId, deploymentEvidence.freshRecoveryDrill.deploymentId);
assert.equal(previewEvidence.deploymentTree, baselineTree);
assert.deepEqual(previewEvidence.summary, { exact: 15, previewToolbarNormalized: 2, failed: 0, total: 17 });
assert.deepEqual(
  previewEvidence.entries.map(entry => entry.servedPath),
  manifest.entries.map(entry => entry.servedPath),
  'Fresh Preview evidence must cover the complete runtime manifest in order',
);
for (const [index, previewEntry] of previewEvidence.entries.entries()) {
  const expected = manifest.entries[index];
  assert.equal(previewEntry.expectedBytes, expected.bytes);
  assert.equal(previewEntry.expectedSha256, expected.sha256);
  if (previewEntry.result === 'EXACT') {
    assert.equal(previewEntry.observedPreviewSha256, expected.sha256);
  } else {
    assert.equal(previewEntry.result, 'PREVIEW_TOOLBAR_NORMALIZED');
    assert(['/', '/index.html'].includes(previewEntry.servedPath));
    assert.equal(previewEntry.normalizedSha256, expected.sha256);
    assert.notEqual(previewEntry.observedPreviewSha256, expected.sha256);
  }
}

const previewCapture = parseJsonStrict(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/fresh-recovery-preview-capture.json'),
  'utf8',
), 'fresh-recovery-preview-capture.json');
assert.equal(previewCapture.deploymentId, previewEvidence.deploymentId);
assert.equal(previewCapture.deploymentCommit, previewEvidence.deploymentCommit);
assert.equal(previewCapture.deploymentCommit, vercelDeploymentsByRole['fresh-baseline-tree-recovery-preview'].githubCommitSha);
assert.equal(previewCapture.deploymentTree, baselineTree);
assert.equal(
  previewCapture.normalizationStrategy,
  'raw response must equal exact baseline HTML bytes followed by exactly one deployment-bound Vercel Toolbar script suffix',
);
assert.equal(previewCapture.temporaryShareCredentialPersisted, false);
assert.deepEqual(previewCapture.summary, { exact: 15, previewToolbarNormalized: 2, failed: 0, total: 17 });
assert.deepEqual(previewCapture.entries.map(entry => entry.servedPath), manifest.entries.map(entry => entry.servedPath));
for (const [index, captureEntry] of previewCapture.entries.entries()) {
  const expected = manifest.entries[index];
  assert.equal(captureEntry.expectedBytes, expected.bytes);
  assert.equal(captureEntry.expectedSha256, expected.sha256);
  assert((captureEntry.headers['content-type'] || '').startsWith(expected.contentType), `Preview MIME mismatch: ${expected.servedPath}`);
  if (captureEntry.result === 'EXACT') {
    assert.equal(captureEntry.observedBytes, expected.bytes);
    assert.equal(captureEntry.observedSha256, expected.sha256);
    assert.equal(captureEntry.rawResponseBase64, undefined, 'Exact binary responses must not bloat the evidence record');
  } else {
    assert.equal(captureEntry.result, 'PREVIEW_TOOLBAR_NORMALIZED');
    assert(['/', '/index.html'].includes(captureEntry.servedPath));
    const rawHtml = Buffer.from(captureEntry.rawResponseBase64, 'base64');
    assert.equal(rawHtml.byteLength, captureEntry.observedBytes);
    assert.equal(sha256(rawHtml), captureEntry.observedSha256);
    const expectedHtml = git(['show', `${baselineCommit}:index.html`], null);
    assert.equal(expectedHtml.byteLength, expected.bytes);
    assert(rawHtml.subarray(0, expectedHtml.byteLength).equals(expectedHtml), `Preview HTML prefix differs: ${expected.servedPath}`);
    const expectedToolbarSuffix = `<script async data-explicit-opt-in="true" data-deployment-id="${previewCapture.deploymentId}" src="https://${previewCapture.normalizationMarker}"></script>`;
    const suffix = rawHtml.subarray(expectedHtml.byteLength);
    assert.equal(suffix.toString('utf8'), expectedToolbarSuffix, `Preview Toolbar suffix differs: ${expected.servedPath}`);
    assert.equal(rawHtml.toString('utf8').split(previewCapture.normalizationMarker).length - 1, 1);
    assert.equal(captureEntry.toolbarSuffixBytes, suffix.byteLength);
    assert.equal(captureEntry.toolbarSuffixSha256, sha256(suffix));
    assert.equal(previewCapture.expectedToolbarSuffix, expectedToolbarSuffix);
    assert.equal(sha256(expectedHtml), expected.sha256);
    assert.equal(captureEntry.normalizedSha256, expected.sha256);
  }
}

const cleanRecovery = parseJsonStrict(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/clean-recovery.json'),
  'utf8',
), 'clean-recovery.json');
assert.equal(cleanRecovery.sourceRefCommit, baselineCommit);
assert.equal(cleanRecovery.checkoutHead, baselineCommit);
assert.equal(cleanRecovery.checkoutTree, baselineTree);
assert.equal(cleanRecovery.ciBaselineCheckoutRef, baselineCommit);
assert.equal(cleanRecovery.historicalDescendantsDependOnMutableArchiveRef, false);
assert.equal(cleanRecovery.checkoutStatusPorcelain, '');
assert.equal(cleanRecovery.verifierResult, 'PASS');

const serviceWorkerSource = await readFile(path.join(targetRoot, 'sw.js'), 'utf8');
const coreMatch = /const CORE=\[([\s\S]*?)\];/.exec(serviceWorkerSource);
assert(coreMatch, 'Unable to parse the service-worker CORE list');
const serviceWorkerCore = [...coreMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]).sort();
const expectedCore = manifest.entries
  .filter(entry => !['sw.js', 'assets/fonts/NotoSansJP-OFL.txt'].includes(entry.sourcePath))
  .map(entry => entry.servedPath)
  .sort();
assert.deepEqual(serviceWorkerCore, expectedCore, 'Runtime manifest must equal service-worker CORE plus sw.js and font license');

const snapshotRoot = path.join(kitRoot, '.github/baselines/v0.8.2');
const snapshotManifest = parseJsonStrict(
  await readFile(path.join(snapshotRoot, 'MANIFEST.json'), 'utf8'),
  'snapshot MANIFEST.json',
);
assert.equal(snapshotManifest.baselineCommit, baselineCommit);
assert.equal(snapshotManifest.baselineTree, baselineTree);
const requiredSnapshotBindings = [
  ...uniqueSourcePaths.map(sourcePath => {
    const runtimeEntry = manifest.entries.find(entry => entry.sourcePath === sourcePath);
    return { path: `runtime/${sourcePath}`, baselinePath: sourcePath, sha256: runtimeEntry.sha256 };
  }),
  ...manifest.deploymentInputs.map(entry => ({
    path: `runtime/${entry.sourcePath}`,
    baselinePath: entry.sourcePath,
    sha256: entry.sha256,
  })),
  ...[
    ['verification/tests/living-tower-v080.mjs', 'tests/living-tower-v080.mjs'],
    ['verification/scripts/build_v080_art.py', 'scripts/build_v080_art.py'],
  ].map(([snapshotPath, baselinePath]) => ({
    path: snapshotPath,
    baselinePath,
    sha256: sha256(git(['show', `${baselineCommit}:${baselinePath}`], null)),
  })),
].sort((left, right) => left.path.localeCompare(right.path));
assert.equal(requiredSnapshotBindings.length, 20);
assert.deepEqual(
  snapshotManifest.files.map(({ path: entryPath, baselinePath, sha256: digest }) => ({ path: entryPath, baselinePath, sha256: digest }))
    .sort((left, right) => left.path.localeCompare(right.path)),
  requiredSnapshotBindings,
  'Snapshot manifest does not contain the exact required runtime/deployment/verification bindings',
);
assert.equal(new Set(snapshotManifest.files.map(entry => entry.baselinePath)).size, 20);
for (const entry of snapshotManifest.files) {
  const snapshotBytes = await readFile(path.join(snapshotRoot, entry.path));
  const baselineBytes = git(['show', `${baselineCommit}:${entry.baselinePath}`], null);
  assert.equal(sha256(snapshotBytes), entry.sha256, `Snapshot SHA-256 mismatch: ${entry.path}`);
  assert.equal(sha256(baselineBytes), entry.sha256, `Snapshot differs from baseline: ${entry.baselinePath}`);
}
const expectedSnapshotFiles = ['MANIFEST.json', 'RESTORE.md', ...snapshotManifest.files.map(entry => entry.path)].sort();
assert.deepEqual(await listFiles(snapshotRoot), expectedSnapshotFiles, 'Snapshot contains missing or unmanifested files');

const rawReportLedger = new Map((browserEvidence.rawReports || []).map(report => [report.sha256, report.path]));
assert.equal(rawReportLedger.size, 10, 'Ten unique raw Chromium/WebKit browser reports are required');
assert.equal(new Set(browserEvidence.rawReports.map(report => report.path)).size, 10, 'Raw browser report paths must be unique');
assert.equal(new Set(browserEvidence.rawReports.map(report => report.artifactMember)).size, 10, 'Artifact report members must be unique');
const rawRoot = path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/raw');
assert.deepEqual(
  await listFiles(rawRoot),
  browserEvidence.rawReports.map(report => path.basename(report.path)).sort(),
  'The durable raw-report directory must exactly equal the ten-file ledger',
);
for (const report of browserEvidence.rawReports || []) {
  const bytes = await readFile(path.join(kitRoot, report.path));
  assert.equal(sha256(bytes), report.sha256, `Raw browser report hash mismatch: ${report.path}`);
}
assert.deepEqual(
  browserEvidence.deterministicLoop.map(item => `${item.browser}:${item.viewportCss}`).sort(),
  ['chromium:375x667', 'chromium:390x844', 'webkit:375x667', 'webkit:390x844'],
  'Deterministic raw evidence does not cover both engines and both mobile viewports',
);
assert.deepEqual(
  browserEvidence.normalUiFlow.map(item => `${item.browser}:${item.viewportCss}`).sort(),
  ['chromium:375x667', 'chromium:390x844', 'webkit:375x667', 'webkit:390x844'],
  'Normal-flow raw evidence does not cover both engines and both mobile viewports',
);
assert.deepEqual(
  browserEvidence.serviceWorkerRecovery.map(item => `${item.browser}:${item.viewportCss}`).sort(),
  ['chromium:375x667', 'chromium:390x844'],
  'Service-worker raw evidence must cover both Chromium mobile viewports',
);
async function loadRawSummary(summary, kind) {
  assert(rawReportLedger.has(summary.rawReportSha256), `Summary report is absent from the raw ledger: ${summary.rawReportSha256}`);
  const rawPath = rawReportLedger.get(summary.rawReportSha256);
  assert(rawPath.endsWith(`-${kind}.json`), `Raw report type differs from its summary: ${rawPath}`);
  const raw = parseJsonStrict(await readFile(path.join(kitRoot, rawPath), 'utf8'), rawPath);
  assert.equal(raw.passed, true, 'A raw browser report is not passing');
  assert(['chromium', 'webkit'].includes(summary.browser), 'Raw evidence names an unsupported browser');
  assert.equal(raw.browserName, summary.browser, 'Raw browser identity differs from its summary');
  assert(rawPath.includes(`/${summary.browser}-`), 'Raw report path omits its browser identity');
  assert(rawPath.includes(`-${summary.viewportCss}-`), 'Raw report path omits its viewport identity');
  assert.equal(`${raw.viewport.width}x${raw.viewport.height}`, summary.viewportCss, 'Raw viewport differs from its summary');
  assert.equal(raw.targetUrl, 'http://127.0.0.1:4173/');
  return raw;
}

const expectedLoopEvidenceNames = [
  '00-title.png', '00-settings-paused.png', '01-auto-climb.png', '02-tap-dispatch.png', '02-full-party-rally.png',
  '03-upgrade-panel.png', '04-floor-conquered.png', '05-food-support-full.png', '05-food-support-sheet.png',
  '06-shared-room-full.png', '06-shared-room-sheet.png', '07-wall.png', '08-dawn-preview-full.png',
  '08-dawn-preview-sheet.png', '08-dawn-actions.png', '09-faster-replay.png', '10-first-night-boss.png',
  '11-first-night-clear.png',
].sort();
for (const summary of browserEvidence.deterministicLoop) {
  const raw = await loadRawSummary(summary, 'loop');
  assert.equal(raw.version, '0.8.2');
  assert.equal(raw.gameplaySchema, 2);
  assert.equal(raw.viewport.deviceScaleFactor, 3);
  assert.equal(raw.viewport.reducedMotion, 'reduce');
  assert.deepEqual(raw.errors, []);
  assert.deepEqual(raw.badResponses, []);
  assert.deepEqual(raw.failedRequests, []);
  assert.equal(raw.japaneseFont.status, 'loaded');
  assert.equal(raw.japaneseFont.checked, true);
  assert(raw.japaneseFont.faceCount >= 1);
  assert(raw.japaneseFont.faceStatuses.every(value => value === 'loaded'));
  assert(raw.japaneseFont.bodyFamily.includes('CatsTowerJP'));
  assert.equal(raw.japaneseFont.fontHttpStatus, 200);
  assert.equal(raw.japaneseFont.fontByteLength, 1039792);
  assert.equal(raw.japaneseFont.fontSignature, 'wOF2');
  assert(raw.japaneseFont.customFingerprint.ink > 0);
  assert.notEqual(raw.japaneseFont.customFingerprint.hash, raw.japaneseFont.fallbackFingerprint.hash);
  const assets = Object.fromEntries(raw.v082Assets.map(item => [item.path, item]));
  assert.deepEqual(Object.keys(assets).sort(), [
    '/assets/v082/pixel-r3/cats-cast-r3.png',
    '/assets/v082/pixel-r3/enemies-r3.png',
  ]);
  assert.deepEqual(
    { status: assets['/assets/v082/pixel-r3/cats-cast-r3.png'].status, bytes: assets['/assets/v082/pixel-r3/cats-cast-r3.png'].bytes, width: assets['/assets/v082/pixel-r3/cats-cast-r3.png'].width, height: assets['/assets/v082/pixel-r3/cats-cast-r3.png'].height },
    { status: 200, bytes: 977730, width: 1448, height: 1086 },
  );
  assert.deepEqual(
    { status: assets['/assets/v082/pixel-r3/enemies-r3.png'].status, bytes: assets['/assets/v082/pixel-r3/enemies-r3.png'].bytes, width: assets['/assets/v082/pixel-r3/enemies-r3.png'].width, height: assets['/assets/v082/pixel-r3/enemies-r3.png'].height },
    { status: 200, bytes: 1012304, width: 1448, height: 1086 },
  );
  assert.deepEqual(raw.modalPause, { playTimeMs: 0, enemyDamage: 0, floorBefore: 1, floorAfter: 1 });
  assert.equal(raw.recoveryRosterContract.waitingUnitCount, 5);
  assert.equal(Math.max(...Object.values(raw.recoveryRosterContract.waitingCounts)), 1);
  assert.equal(raw.recoveryRosterContract.recoveredUnitCount, 6);
  assert.equal(new Set(Object.values(raw.recoveryRosterContract.recoveredCounts)).size, 1);
  assert.equal([...new Set(Object.values(raw.recoveryRosterContract.recoveredCounts))][0], 1);
  assert.equal(raw.recoveryRosterContract.recoveryCount, 0);
  assert.equal(raw.recoveryRosterContract.totalUnitsRecovered, 1);
  assert.deepEqual(raw.roleTargetContract.withFrontline, { kind: 'mugi', role: 'frontline' });
  assert(['ranged', 'support'].includes(raw.roleTargetContract.withoutFrontline.role));
  const loop = raw.loop;
  assert(loop.autoDispatches >= 1);
  assert(loop.tapDispatches >= 1);
  assert.equal(loop.tapDirectDamage, 0);
  assert.equal(loop.rally.directDamage, 0);
  assert.equal(loop.rally.durationMs, 6000);
  assert.equal(loop.rally.unitCount, 6);
  assert.deepEqual(loop.rally.namedKinds, ['luna', 'mugi', 'toto']);
  assert(new Set(loop.rally.castVisual.characters).has('luna'));
  assert(new Set(loop.rally.castVisual.characters).has('toto'));
  assert(new Set(loop.rally.castVisual.characters).has('helper'));
  assert(loop.rally.castVisual.backgrounds.every(value => value.includes('cats-cast-r3.png')));
  assert.deepEqual(loop.rally.helperHueVisual, { 'helper-tabby': '42deg', 'helper-gray': '84deg', 'helper-calico': '0deg' });
  assert(loop.rally.rallyHelperFilters['helper-tabby'].includes('hue-rotate(42deg)'));
  assert(loop.rally.rallyHelperFilters['helper-gray'].includes('hue-rotate(84deg)'));
  assert(loop.rally.rallyHelperFilters['helper-calico'].includes('hue-rotate(0deg)'));
  assert(loop.rally.partyGeometry.footSpread <= 1.5);
  assert(loop.rally.partyGeometry.groundRatio >= 0.875 && loop.rally.partyGeometry.groundRatio <= 0.885);
  assert(loop.rally.partyGeometry.minimumGap >= 2);
  assert.equal(loop.rally.partyGeometry.contained, true);
  assert.equal(loop.rally.alignmentPhaseMatrix.cats.length, 24);
  assert.equal(loop.rally.alignmentPhaseMatrix.enemies.length, 16);
  assert(loop.rally.alignmentPhaseMatrix.maximumCatGroundError <= 0.15);
  assert(loop.rally.alignmentPhaseMatrix.maximumEnemyHoverError <= 0.15);
  assert(loop.firstKillReward > 0);
  assert.equal(loop.upgrade.levelAfter, loop.upgrade.levelBefore + 1);
  assert(loop.upgrade.dpsAfter > loop.upgrade.dpsBefore);
  assert.equal(loop.wall.floor, raw.rules.wallFloor);
  assert.equal(loop.wall.heldMs, 12000);
  assert.equal(loop.wall.visual.enemy, 'black-feather-barrier');
  assert.equal(loop.wall.visual.character, 'barrier');
  assert(loop.wall.visual.spriteBackground.includes('enemies-r3.png'));
  assert(loop.wall.ground.hoverGap >= 3 && loop.wall.ground.hoverGap <= 7.5);
  assert(loop.dawn.bestFloorAfter >= loop.dawn.bestFloorBefore);
  assert(loop.dawn.shardsAfter > loop.dawn.shardsBefore);
  assert(loop.replay.replayMs < loop.replay.baselineMs);
  assert(loop.replay.speedupRatio <= 0.75);
  assert.equal(loop.firstEnemy.ground.enemy, 'crow');
  assert(loop.firstEnemy.ground.hoverGap >= 3 && loop.firstEnemy.ground.hoverGap <= 7.5);
  assert.equal(loop.normalEnemy.enemy, 'owl');
  assert.equal(loop.normalEnemy.character, 'owl');
  assert(loop.normalEnemy.spriteBackground.includes('enemies-r3.png'));
  assert(loop.normalEnemy.ground.hoverGap >= 3 && loop.normalEnemy.ground.hoverGap <= 7.5);
  assert.equal(loop.firstNightBoss.enemy, 'boss');
  assert.equal(loop.firstNightBoss.character, 'boss');
  assert.notEqual(loop.firstNightBoss.phase, 'defeated');
  assert(loop.firstNightBoss.opacity > 0 && loop.firstNightBoss.intersectsViewport === true);
  assert(loop.firstNightBoss.width > 0 && loop.firstNightBoss.height > 0);
  assert(loop.firstNightBoss.spriteBackground.includes('enemies-r3.png'));
  assert(loop.firstNightBoss.ground.hoverGap >= 3 && loop.firstNightBoss.ground.hoverGap <= 7.5);
  assert.equal(loop.firstNightBoss.entryFormation.count, 6);
  assert.equal(new Set(loop.firstNightBoss.entryFormation.kinds).size, 6);
  assert(loop.firstNightBoss.entryFormation.minimumGap >= 2);
  assert.equal(loop.firstNightBoss.entryFormation.contained, true);
  assert(loop.firstNightBoss.entryFormationSweep.samples >= 2);
  assert(loop.firstNightBoss.entryFormationSweep.minimumGap >= 2);
  assert.equal(loop.firstNightBoss.entryFormationSweep.allContained, true);
  assert.equal(loop.completedImmediateRoster.unitCount, 6);
  assert.equal(new Set(loop.completedImmediateRoster.kinds).size, 6);
  assert.equal(loop.completedImmediateRoster.recoveryCount, 0);
  assert(loop.completedImmediateRoster.geometry.minimumGap >= 2);
  assert.equal(loop.completedImmediateRoster.geometry.contained, true);
  assert.equal(loop.firstNightCleared, true);
  assert.equal(loop.firstNightCompleted, true);
  assert.equal(loop.completedFloor, raw.rules.firstBossFloor);
  assert.equal(loop.completedFloor, 10);
  assert.equal(raw.save.newSchemaReload, true);
  assert.equal(raw.save.completedReloadRuntime.unitCount, 6);
  assert.equal(new Set(raw.save.completedReloadRuntime.kinds).size, 6);
  assert.deepEqual(raw.save.completedReloadRuntime.phases, ['celebrating']);
  assert(raw.save.completedReloadRuntime.geometry.minimumGap >= 2);
  assert.equal(raw.save.completedReloadRuntime.geometry.contained, true);
  assert.deepEqual(
    raw.save.migrations.map(item => item.name).sort(),
    ['living-v080', 'legacy-v01', 'corrupt-v080', 'v081-post-dawn', 'v081-boss-clear', 'future-schema'].sort(),
  );
  assert(raw.save.migrations.every(item => item.passed === true));
  assert.deepEqual(raw.evidence.map(item => item.name).sort(), expectedLoopEvidenceNames);
}

const durableKeys = [
  'gameplaySchema', 'currentFloor', 'bestFloor', 'checkpointFloor', 'runFloorPeak', 'enemyFloor', 'enemyHp',
  'coins', 'fish', 'mugiLevel', 'weaponLevel', 'dispatchLevel', 'restaurantLevel', 'roomLevel', 'dawnShards',
  'lifetimeShards', 'ascensions', 'firstNightCleared', 'completed',
].sort();
const screenKeys = ['floor', 'enemy', 'enemyHp', 'coins'].sort();
for (const summary of browserEvidence.normalUiFlow) {
  assert.equal(summary.qaMode, false);
  assert.equal(summary.reducedMotion, false);
  const raw = await loadRawSummary(summary, 'normal-flow');
  assert.equal(raw.deviceScaleFactor, 1);
  assert.equal(raw.qaMode, false);
  assert.equal(raw.reducedMotion, false);
  assert.equal(raw.serviceWorkers, 'enabled');
  assert.deepEqual(raw.initial, { floor: '1F', enemy: '夜ガラス', enemyHp: 'HP 21 / 21' });
  assert.equal(raw.active.gameVisible, true);
  assert.equal(raw.active.titleHidden, true);
  assert(raw.active.visibleCats >= 1);
  assert(raw.active.floor && raw.active.enemy && raw.active.enemyHp);
  assert.equal(raw.durableReload.before.rawPresent, true);
  assert.equal(raw.durableReload.after.rawPresent, true);
  assert.equal(raw.durableReload.preserved, true);
  assert.equal(raw.durableReload.before.durable.gameplaySchema, 2);
  assert.deepEqual(Object.keys(raw.durableReload.before.durable).sort(), durableKeys);
  assert.deepEqual(Object.keys(raw.durableReload.after.durable).sort(), durableKeys);
  assert.deepEqual(raw.durableReload.before.durable, raw.durableReload.after.durable);
  assert.deepEqual(Object.keys(raw.durableReload.before.screen).sort(), screenKeys);
  assert.deepEqual(Object.keys(raw.durableReload.after.screen).sort(), screenKeys);
  assert.deepEqual(raw.durableReload.before.screen, raw.durableReload.after.screen);
  assert.equal(raw.reloaded.gameVisible, true);
  if (summary.browser === 'chromium') {
    for (const sw of [raw.durableReload.before.serviceWorker, raw.durableReload.after.serviceWorker, raw.reloaded]) {
      assert.equal(sw.serviceWorkerSupported ?? sw.supported, true);
      assert.equal(sw.serviceWorkerControlled ?? sw.controlled, true);
      assert((sw.serviceWorkerControllerUrl ?? sw.controllerUrl).endsWith('/sw.js?v=082r3'));
    }
  }
  assert.deepEqual(raw.screenshots.map(item => item.name), ['01-title.png', '02-active-battle.png', '03-reloaded.png']);
  assert(raw.screenshots.every(item => item.bytes > 0 && /^[a-f0-9]{64}$/.test(item.sha256)));
  assert.deepEqual(raw.errors, []);
  assert.deepEqual(raw.failedRequests, []);
}
for (const summary of browserEvidence.serviceWorkerRecovery) {
  assert.equal(summary.cachedResponseSha256Count, 15);
  assert.equal(summary.futureSchemaRawBytesUnchanged, 'PASS');
  assert.equal(summary.midCombatRosterNonPersistenceReproduced, 'PASS');
  const raw = await loadRawSummary(summary, 'service-worker');
  assert.equal(raw.browserName, 'chromium');
  assert.equal(raw.runtimeVersion, '0.8.2');
  assert.equal(raw.gameplaySchema, 2);
  assert.equal(raw.saveKey, 'cats-tower-v080');
  assert.equal(raw.cacheState.expectedName, 'cats-tower-v082-pixel-tower-r3');
  assert.deepEqual(raw.cacheState.cacheNames, ['cats-tower-v082-pixel-tower-r3']);
  assert.deepEqual([...raw.cacheState.keys].sort(), expectedCore);
  assert.deepEqual(
    [...raw.cacheState.paths].sort(),
    expectedCore.map(servedPath => new URL(servedPath, 'http://127.0.0.1:4173/').pathname).sort(),
  );
  assert.equal(raw.cacheState.controlled, true);
  assert.equal(raw.cacheState.actualEntryCount, 15);
  assert.equal(raw.cacheState.expectedEntryCount, 15);
  assert.equal(raw.cacheEntrySetVerified, true);
  assert.equal(raw.cachedResponseHashesVerified, 15);
  assert.deepEqual(raw.schema2Reload, { currentFloor: 5, bestFloor: 5, coins: 4321, fish: 17 });
  assert.equal(raw.midCombatKnownDefect.durableFieldsPreserved, true);
  assert(raw.midCombatKnownDefect.enemyHpBefore > 0);
  assert.equal(raw.midCombatKnownDefect.enemyHpAfter, raw.midCombatKnownDefect.enemyHpBefore);
  assert.equal(raw.midCombatKnownDefect.unitCountBefore, 6);
  assert.equal(raw.midCombatKnownDefect.unitCountAfter, 0);
  assert.equal(raw.futureSchemaPreserved, true);
  assert.equal(raw.futureSchemaRawBytesUnchanged, true);
  assert.equal(raw.obsoleteCacheRemoved, true);
  assert.equal(raw.offline.version, '0.8.2');
  assert.equal(raw.offline.controlled, true);
  assert.deepEqual(raw.offline.cacheNames, ['cats-tower-v082-pixel-tower-r3']);
  assert.deepEqual(raw.errors, []);
}
assert(browserEvidence.knownLegacyDefects.some(item => /roster/i.test(item)), 'Roster persistence defect is not disclosed');
assert(browserEvidence.knownLegacyDefects.some(item => /localStorage/i.test(item)), 'Deleted-save limitation is not disclosed');
assert(browserEvidence.knownLegacyDefects.some(item => /physical-iPhone/i.test(item)), 'Physical iPhone evidence boundary is not disclosed');

function gitPathExists(commit, relativePath) {
  try {
    kitGit(['cat-file', '-e', `${commit}:${relativePath}`]);
    return true;
  } catch {
    return false;
  }
}

function singleParent(commit, label) {
  const row = kitGit(['rev-list', '--parents', '-n', '1', commit]).trim().split(/\s+/);
  assert.equal(row.length, 2, `${label} must be a single-parent commit`);
  return row[1];
}

function touchedPaths(parent, child) {
  const output = kitGit([
    'diff-tree', '--no-commit-id', '-r', '--name-only', '--no-renames', '-z', parent, child,
  ], null);
  return output.toString('utf8').split('\0').filter(Boolean).sort();
}

function changedEntries(parent, child) {
  const output = kitGit([
    'diff-tree', '--no-commit-id', '-r', '--name-status', '--no-renames', '-z', parent, child,
  ], null).toString('utf8').split('\0').filter(Boolean);
  assert.equal(output.length % 2, 0, 'Unexpected name-status record shape');
  const entries = [];
  for (let index = 0; index < output.length; index += 2) {
    entries.push({ status: output[index], path: output[index + 1] });
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function assertRegularFile(commit, relativePath) {
  const row = kitGit(['ls-tree', commit, '--', relativePath]).trim().split(/\s+/);
  assert.equal(row[0], '100644', `Expected a 100644 regular file at ${commit}: ${relativePath}`);
}

async function readOptionalJson(relativePath) {
  try {
    return parseJsonStrict(await readFile(path.join(kitRoot, relativePath), 'utf8'), relativePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function validateCiRecord(record, role, expectedHead = null) {
  assert.equal(record.schemaVersion, 2);
  if (role === 'raw-source') assert([undefined, 'raw-source'].includes(record.role));
  else assert.equal(record.role, role);
  assert.equal(record.repository, '2hg7trp7rv-design/cats_tower');
  assert.equal(record.workflowName, "Verify Cat's Tower baseline and quality records");
  assert.equal(record.workflowId, 335561992);
  assert.equal(record.workflowPath, '.github/workflows/verify-main.yml');
  assert.equal(record.event, 'pull_request');
  assert(Number.isInteger(record.runId) && record.runId > 0);
  assert(Number.isInteger(record.runNumber) && record.runNumber > 0);
  assert(Number.isInteger(record.runAttempt) && record.runAttempt > 0);
  assert.equal(record.status, 'completed');
  assert.equal(record.conclusion, 'success');
  assert.equal(record.pullRequest.number, 4);
  assert.equal(record.pullRequest.baseBranch, 'main');
  if (expectedHead) assert.equal(record.pullRequest.headSha, expectedHead);
  assert.equal(kitGit(['rev-parse', `${record.pullRequest.baseSha}^{tree}`]).trim(), record.pullRequest.baseTree);
  assert.equal(kitGit(['rev-parse', `${record.pullRequest.headSha}^{tree}`]).trim(), record.pullRequest.headTree);
  assert.equal(record.checkout.tree, record.pullRequest.headTree);
  assert.deepEqual(record.checkout.contentDiffFromHead, []);
  if (role === 'raw-source') {
    assert(['pull-request-head', 'pull-request-merge'].includes(record.checkout.mode));
    if (record.checkout.mode === 'pull-request-merge') {
      assert.match(record.checkout.sha, /^[a-f0-9]{40}$/);
      assert.equal(record.checkout.ref, `refs/pull/${record.pullRequest.number}/merge`);
      assert.deepEqual(record.checkout.parents, [record.pullRequest.baseSha, record.pullRequest.headSha]);
    }
  } else {
    assert.equal(record.checkout.mode, 'pull-request-head', `${role} must test the exact PR head`);
    assert.equal(record.checkout.sha, record.pullRequest.headSha);
    assert.equal(record.checkout.ref, record.pullRequest.headSha);
  }
  assert.equal(record.job.name, 'vertical-tower-qa');
  assert.equal(record.job.status, 'completed');
  assert.equal(record.job.conclusion, 'success');
  assert(Date.parse(record.job.startedAt) < Date.parse(record.job.completedAt));
  assert(record.job.requiredSteps.length >= 6);
  assert(record.job.requiredSteps.every(step => step.conclusion === 'success'));
  if (role !== 'raw-source') {
    const requiredStepNames = [
      'Assert primary checkout provenance',
      'Resolve immutable Step 1 verification kit',
      'Clean checkout of the immutable V0.8.2 commit',
      'Repository handover and source contracts',
      'Vertical tower source and raster contracts',
      'Bind unexpired CI records and downloaded artifacts before seal',
      'GitHub recovery ref and live runtime manifest',
      'Chromium and WebKit vertical tower loop QA',
      'Upload V0.8.2 vertical tower evidence',
    ];
    const recordedSteps = new Map(record.job.requiredSteps.map(step => [step.name, step.conclusion]));
    for (const stepName of requiredStepNames) {
      assert.equal(recordedSteps.get(stepName), 'success', `${role} CI omits successful required step: ${stepName}`);
    }
  }
  assert.match(record.artifact.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(record.artifact.name, 'cats-v082-step-1-recovery-evidence');
  assert(Number.isInteger(record.artifact.id) && record.artifact.id > 0);
  assert(Number.isInteger(record.artifact.sizeBytes) && record.artifact.sizeBytes > 0);
  assert.equal(record.artifact.fileCount, 94);
  assert(Date.parse(record.artifact.createdAt) < Date.parse(record.artifact.expiresAt));
  assert.equal(record.artifact.supplementaryOnly, true);
  return record;
}

const rawCiEvidence = validateCiRecord(parseJsonStrict(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/ci-run.json'),
  'utf8',
), 'ci-run.json'), 'raw-source');
assert.equal(rawCiEvidence.apiVerification.requiredAtC1C2C3, true);
assert.equal(rawCiEvidence.apiVerification.artifactMustExistAndBeUnexpiredBeforeSeal, true);
assert.equal(rawCiEvidence.apiVerification.downloadedZipAndTenRawMembersMustMatch, true);
assert.equal(rawCiEvidence.apiVerification.historicalDescendantsSkipTimeLimitedApi, true);
assert(Object.values(rawCiEvidence.assertedResults).every(result => result === 'PASS'));
assert.equal(browserEvidence.sourceArtifact.runId, rawCiEvidence.runId);
assert.equal(browserEvidence.sourceArtifact.artifactId, rawCiEvidence.artifact.id);
assert.equal(browserEvidence.sourceArtifact.digest, rawCiEvidence.artifact.digest);
assert.equal(browserEvidence.sourceArtifact.sizeBytes, rawCiEvidence.artifact.sizeBytes);

const roundTwoFailure = parseJsonStrict(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/round-002.json'),
  'utf8',
), 'round-002.json');
assert.equal(roundTwoFailure.round, 2);
assert.equal(roundTwoFailure.reviewTargetCommit, '5792be4a0cee37e540747233fd2921ab5f0db392');
assert.equal(roundTwoFailure.overallStatus, 'FAIL');
assert(roundTwoFailure.materialBlockers.length >= 8, 'Round 2 failure did not preserve its material findings');

const acceptanceRelativePath = 'quality-reviews/step-1-legacy-baseline/acceptance-round-003.json';
const strengthenedAcceptanceBytes = await readFile(path.join(kitRoot, acceptanceRelativePath));
const strengthenedAcceptance = parseJsonStrict(
  strengthenedAcceptanceBytes.toString('utf8'),
  acceptanceRelativePath,
);
assert.equal(strengthenedAcceptance.artifactId, 'step-1-legacy-baseline');
assert.equal(strengthenedAcceptance.acceptanceRevision, 3);
assert.equal(strengthenedAcceptance.scopeName, 'Step 1A — V0.8.2 deployed browser-runtime source and deployment-input byte checkpoint');
const requiredAcceptanceIds = [
  'S1', 'S2', 'S3', 'S4', 'S5', 'D1', 'D2', 'D3', 'D4', 'D5', 'R1', 'R2', 'R3', 'R4',
  'V1', 'V2', 'E1', 'E2', 'E3', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6',
];
assert.deepEqual(strengthenedAcceptance.requirements.map(item => item.id), requiredAcceptanceIds);
assert.equal(
  strengthenedAcceptance.requirements.find(item => item.id === 'S5').condition,
  'The remote archive ref resolves exactly to the baseline commit, and a clean GitHub checkout of that immutable SHA passes the independently retained verification kit through CATS_BASELINE_DIR; historical descendants do not depend on the mutable ref.',
);
assert.deepEqual(
  strengthenedAcceptance.separateCapabilities.map(item => item.status),
  ['UNAVAILABLE_IN_V082', 'NOT_VERIFIED', 'NOT_EXECUTED_BY_DESIGN', 'NOT_CONFIGURED_AT_AUDIT'],
);
assert.deepEqual(
  strengthenedAcceptance.explicitExclusions.map(item => item.id),
  [
    'whole-repository-off-provider-backup', 'deleted-or-corrupt-player-save-recovery',
    'physical-iphone-standalone-pwa-approval', 'production-alias-switch', 'tamper-proof-github-workflow-bootstrap',
  ],
);
assert.equal(strengthenedAcceptance.reviewAuthenticity.proceduralIndependenceRequired, true);
assert.equal(strengthenedAcceptance.reviewAuthenticity.cryptographicReviewerAuthenticationClaimed, false);
assert.deepEqual(
  strengthenedAcceptance.reviewAuthenticity.requiredRecordedFields,
  ['taskPath', 'assignment', 'verbatimResponse', 'verbatimResponseSha256'],
);
assert.equal(
  strengthenedAcceptance.reviewAuthenticity.verbatimResponseContract,
  'Each reviewer must return one JSON object that binds its role, exact target commit and tree, CI run and job, verdict, material blockers, method, and findings to the outer record. The runtime critic must additionally bind its post-C1 Vercel deployment re-query; the final judge must bind the three critic-record hashes.',
);
assert.deepEqual(strengthenedAcceptance.externalMetadataAuthenticity, {
  vercelSource: 'authenticated connected-project Vercel deployment metadata',
  cryptographicResponseSignatureStored: false,
  mitigation: "Freeze the exact C1 metadata record, independently re-query the fresh deployment after C1, bind that check in the runtime critic's target-specific verbatim response, and separately verify the sealed raw deployment responses.",
  claimBoundary: 'This is procedurally cross-checked provider metadata plus recalculable response evidence, not a cryptographically signed Vercel attestation.',
});

const requiredProtectedPaths = [
  '.github/baselines/v0.8.2/MANIFEST.json',
  '.github/baselines/v0.8.2/RESTORE.md',
  '.github/workflows/verify-main.yml',
  'QUALITY_GATE.md',
  'quality-reviews/step-1-legacy-baseline/evidence/fresh-recovery-commit-object.b64',
  'quality-reviews/step-1-legacy-baseline/evidence/fresh-recovery-preview-capture.json',
  'quality-reviews/step-1-legacy-baseline/evidence/runtime-manifest.json',
  'quality-reviews/step-1-legacy-baseline/evidence/vercel-deployment-metadata.json',
  'quality-reviews/step-1-legacy-baseline/evidence/raw/chromium-375x667-loop.json',
  'quality-reviews/step-1-legacy-baseline/evidence/raw/chromium-375x667-normal-flow.json',
  'quality-reviews/step-1-legacy-baseline/evidence/raw/chromium-375x667-service-worker.json',
  'quality-reviews/step-1-legacy-baseline/evidence/raw/chromium-390x844-loop.json',
  'quality-reviews/step-1-legacy-baseline/evidence/raw/chromium-390x844-normal-flow.json',
  'quality-reviews/step-1-legacy-baseline/evidence/raw/chromium-390x844-service-worker.json',
  'quality-reviews/step-1-legacy-baseline/evidence/raw/webkit-375x667-loop.json',
  'quality-reviews/step-1-legacy-baseline/evidence/raw/webkit-375x667-normal-flow.json',
  'quality-reviews/step-1-legacy-baseline/evidence/raw/webkit-390x844-loop.json',
  'quality-reviews/step-1-legacy-baseline/evidence/raw/webkit-390x844-normal-flow.json',
  'tests/capture-v082-preview.mjs',
  'tests/verify-step-1-baseline.mjs',
];
assert.deepEqual(strengthenedAcceptance.protectedFiles.map(item => item.path).sort(), [...requiredProtectedPaths].sort());
assert.equal(new Set(strengthenedAcceptance.protectedFiles.map(item => item.path)).size, requiredProtectedPaths.length);
for (const protectedFile of strengthenedAcceptance.protectedFiles) {
  const bytes = await readFile(path.join(kitRoot, protectedFile.path));
  assert.equal(sha256(bytes), protectedFile.sha256, `Acceptance protected-file hash is stale: ${protectedFile.path}`);
}

const criticPathsByRole = {
  'adversarial-critic': 'quality-reviews/step-1-legacy-baseline/audits/round-003-adversarial-critic.json',
  'repository-critic': 'quality-reviews/step-1-legacy-baseline/audits/round-003-repository-critic.json',
  'runtime-critic': 'quality-reviews/step-1-legacy-baseline/audits/round-003-runtime-critic.json',
};
const canonicalMarkdownPaths = [
  'README.md', 'AGENTS.md', 'MASTER_SPEC.md', 'FLOORS_1_10_DESIGN.md', 'PROJECT_HANDOVER.md', 'BASELINE_V082.md',
];
const acceptanceCiPath = 'quality-reviews/step-1-legacy-baseline/evidence/acceptance-ci-run.json';
const candidateCiPath = 'quality-reviews/step-1-legacy-baseline/evidence/candidate-ci-run.json';
const finalJudgePath = 'quality-reviews/step-1-legacy-baseline/audits/round-003-final-judge.json';
const requiredCandidatePaths = [acceptanceCiPath, 'quality-reviews/step-1-legacy-baseline/evidence/clean-recovery.json', ...Object.values(criticPathsByRole)].sort();
const requiredSealPaths = [
  'AGENTS.md', 'BASELINE_V082.md', 'FLOORS_1_10_DESIGN.md', 'MASTER_SPEC.md', 'PROJECT_HANDOVER.md',
  'PROJECT_STATUS.json', 'README.md', candidateCiPath, finalJudgePath, roundThreePath,
].sort();
assert.deepEqual([...strengthenedAcceptance.candidateAllowedPaths].sort(), requiredCandidatePaths);
assert.deepEqual([...strengthenedAcceptance.sealAllowedPaths].sort(), requiredSealPaths);
const expectedCandidateEntries = requiredCandidatePaths.map(relativePath => ({
  status: relativePath === 'quality-reviews/step-1-legacy-baseline/evidence/clean-recovery.json' ? 'M' : 'A',
  path: relativePath,
})).sort((left, right) => left.path.localeCompare(right.path));
const expectedSealEntries = requiredSealPaths.map(relativePath => ({
  status: canonicalMarkdownPaths.includes(relativePath) || relativePath === 'PROJECT_STATUS.json' ? 'M' : 'A',
  path: relativePath,
})).sort((left, right) => left.path.localeCompare(right.path));

function assertExactEdge(parent, child, expectedEntries, label) {
  assert.deepEqual(changedEntries(parent, child), expectedEntries, `${label} change kinds or paths differ from Acceptance`);
  for (const entry of expectedEntries) {
    if (entry.status === 'A') assert.equal(gitPathExists(parent, entry.path), false, `${label} addition already existed in its parent: ${entry.path}`);
    else assert.equal(gitPathExists(parent, entry.path), true, `${label} modification was absent from its parent: ${entry.path}`);
    assertRegularFile(child, entry.path);
    if (entry.status === 'M') assertRegularFile(parent, entry.path);
  }
}
assert.deepEqual(Object.keys(strengthenedAcceptance.commitProtocol), ['c1', 'c2', 'c3', 'sealDiscovery', 'futureMode', 'mergePolicy']);
assert.equal(
  strengthenedAcceptance.commitProtocol.futureMode,
  'When the current repository workflow invokes it on a descendant of C3, the immutable Acceptance kernel remains the sole machine authority. Verification requires both sealed evidence trees, all exact universal quality-loop mirror claims, the duplicate-key-free authoritative Step 1A JSON entry with its canonical order, name, and PASS status, and one structured PASS marker and checklist row in each canonical document, then re-runs the historical C3 verifier against the immutable baseline. Arbitrary natural-language semantic completeness is not claimed, and preventing deletion or short-circuiting of the workflow itself requires an external GitHub ruleset that is not configured at audit time.',
);
assert.deepEqual(strengthenedAcceptance.futureImmutablePaths, futureImmutablePaths);
assert.deepEqual(strengthenedAcceptance.futureRequiredQualityGateClaims, futureRequiredQualityGateClaims);
assert.deepEqual(strengthenedAcceptance.futureNormativeKernel, {
  authorityPath: 'quality-reviews/step-1-legacy-baseline/acceptance-round-003.json',
  authorityRetention: 'The full quality-reviews/step-1-legacy-baseline Git tree is immutable at descendants of C3 when the verifier runs, so this kernel cannot be overridden by a current Markdown edit.',
  qualityLoopAuthority: 'futureRequiredQualityGateClaims is the non-overridable machine-readable minimum; current QUALITY_GATE.md is an evolvable mirror that must retain every exact claim.',
  step1StatusAuthority: 'The sealed PROJECT_STATUS legacyBaseline and legacyV082Verification objects plus the exact preparation[0] object {order:1,name:legacy-v082-source-runtime-byte-checkpoint,status:PASS} are authoritative; that entry must be unique by name and order, and current canonical Markdown files must retain one structured PASS marker and checklist row.',
  jsonAuthorityEncoding: 'Every JSON document consumed by the verifier, including PROJECT_STATUS, Acceptance, CI, round, evidence, critic, judge, and embedded verbatimResponse JSON, must reject duplicate object keys before semantic validation.',
  arbitraryNaturalLanguageSemanticCompletenessClaimed: false,
  boundary: 'The verifier does not claim to understand every possible contradictory natural-language sentence. Such prose cannot override this frozen kernel or structured JSON status, and later human review remains responsible for editorial clarity.',
});
assert.deepEqual(
  strengthenedAcceptance.sealStatusTransforms.projectStatusJsonPointers,
  [
    'preparation[0].status', 'legacyBaseline.sourceRuntimeCheckpoint', 'legacyV082Verification.githubActionsRun',
    'legacyV082Verification.githubActionsHead', 'legacyV082Verification.githubActionsConclusion', 'nextAction',
  ],
);
assert.deepEqual(
  Object.keys(strengthenedAcceptance.sealStatusTransforms.markdownReplacements).sort(),
  [...canonicalMarkdownPaths].sort(),
  'Acceptance must define the exact C2→C3 transform for every canonical Markdown file',
);
const expectedMarkdownReplacementCounts = {
  'README.md': 8,
  'AGENTS.md': 3,
  'MASTER_SPEC.md': 2,
  'FLOORS_1_10_DESIGN.md': 4,
  'PROJECT_HANDOVER.md': 9,
  'BASELINE_V082.md': 2,
};
assert.deepEqual(
  Object.fromEntries(
    Object.entries(strengthenedAcceptance.sealStatusTransforms.markdownReplacements)
      .map(([relativePath, replacements]) => [relativePath, replacements.length]),
  ),
  expectedMarkdownReplacementCounts,
  'Acceptance C2→C3 Markdown transform paths or replacement counts differ from the frozen protocol',
);
for (const [relativePath, replacements] of Object.entries(strengthenedAcceptance.sealStatusTransforms.markdownReplacements)) {
  assert(Array.isArray(replacements) && replacements.length >= 1, `No seal replacements defined for ${relativePath}`);
  assert.equal(new Set(replacements.map(replacement => replacement.from)).size, replacements.length, `${relativePath} repeats a seal-transform source`);
  assert.equal(new Set(replacements.map(replacement => replacement.to)).size, replacements.length, `${relativePath} repeats a seal-transform destination`);
  for (const replacement of replacements) {
    assert.deepEqual(Object.keys(replacement), ['from', 'to']);
    assert.equal(typeof replacement.from, 'string');
    assert.equal(typeof replacement.to, 'string');
    assert(replacement.from.length > 0 && replacement.to.length > 0 && replacement.from !== replacement.to);
  }
}
assert.deepEqual(
  strengthenedAcceptance.sealStatusTransforms.projectStatusTransforms.map(item => item.pointer),
  strengthenedAcceptance.sealStatusTransforms.projectStatusJsonPointers,
  'PROJECT_STATUS transform definitions and pointer allowlist differ',
);
assert.deepEqual(strengthenedAcceptance.externalCompletionStopConditions, [
  'the remote pull-request head equals C3',
  'the exact C3 head completes this workflow successfully',
  'the C3 Vercel Preview reaches READY and serves the expected documentation-only tree',
  'the PR is merged without squashing or rebasing so C1, C2, and C3 remain ancestors of main',
  'the resulting main head has the same Git tree as C3, so the merge adds no unreviewed content and every canonical Step 1 blob equals its sealed C3 blob',
  'the exact resulting main head completes the main push workflow successfully in historical-seal mode',
  'the remote archive ref still resolves to the exact baseline commit at completion-report time',
  'the fixed Production URL is rechecked after merge; no Production alias switch is performed',
]);
assert(strengthenedAcceptance.automaticFailureConditions.length >= 22);

const acceptanceCiRecord = await readOptionalJson(acceptanceCiPath);
const candidateCiRecord = await readOptionalJson(candidateCiPath);
const criticRecords = {};
for (const [role, relativePath] of Object.entries(criticPathsByRole)) {
  criticRecords[role] = await readOptionalJson(relativePath);
}
const committedAcceptance = gitPathExists(currentHead, acceptanceRelativePath);
const committedCandidatePieces = [acceptanceCiPath, ...Object.values(criticPathsByRole)]
  .map(relativePath => gitPathExists(currentHead, relativePath));
assert(committedCandidatePieces.every(Boolean) || committedCandidatePieces.every(value => !value), 'C2 critic/CI files are only partially committed');
const phase = preflight
  ? 'preflight'
  : sealCommit
    ? 'seal'
    : committedCandidatePieces.every(Boolean)
      ? 'candidate'
      : committedAcceptance
        ? 'acceptance'
        : 'preflight';
const acceptanceCommit = phase === 'seal'
  ? sealedRound.acceptance.commit
  : phase === 'candidate'
    ? singleParent(currentHead, 'C2')
    : phase === 'acceptance'
      ? currentHead
      : null;
const candidateCommit = phase === 'seal' ? sealedRound.reviewTargetCommit : phase === 'candidate' ? currentHead : null;

if (phase === 'candidate') {
  assert.deepEqual(touchedPaths(acceptanceCommit, candidateCommit), requiredCandidatePaths, 'C1→C2 touched-path set differs from Acceptance');
  assertExactEdge(acceptanceCommit, candidateCommit, expectedCandidateEntries, 'C1→C2');
}
if (phase === 'seal') {
  assert.equal(singleParent(candidateCommit, 'C2'), acceptanceCommit, 'C2 is not the direct child of C1');
  assert.equal(singleParent(sealCommit, 'C3'), candidateCommit, 'C3 is not the direct child of C2');
  assert.deepEqual(touchedPaths(acceptanceCommit, candidateCommit), requiredCandidatePaths, 'C1→C2 touched-path set differs from Acceptance');
  assert.deepEqual(touchedPaths(candidateCommit, sealCommit), requiredSealPaths, 'C2→C3 touched-path set differs from Acceptance');
  assertExactEdge(acceptanceCommit, candidateCommit, expectedCandidateEntries, 'C1→C2');
  assertExactEdge(candidateCommit, sealCommit, expectedSealEntries, 'C2→C3');
}

if (acceptanceCommit) {
  const frozenAcceptance = kitGit(['show', `${acceptanceCommit}:${acceptanceRelativePath}`], null);
  assert.equal(sha256(frozenAcceptance), sha256(strengthenedAcceptanceBytes), 'Acceptance changed after C1');
  for (const protectedFile of strengthenedAcceptance.protectedFiles) {
    for (const commit of [acceptanceCommit, candidateCommit, sealCommit].filter(Boolean)) {
      const row = kitGit(['ls-tree', commit, '--', protectedFile.path]).trim().split(/\s+/);
      assert.equal(row[0], '100644', `Protected path is not a regular file at ${commit}: ${protectedFile.path}`);
      assert.equal(sha256(kitGit(['show', `${commit}:${protectedFile.path}`], null)), protectedFile.sha256);
    }
  }
}

const canonicalDocuments = {
  'README.md': await readFile(path.join(kitRoot, 'README.md'), 'utf8'),
  'AGENTS.md': await readFile(path.join(kitRoot, 'AGENTS.md'), 'utf8'),
  'MASTER_SPEC.md': await readFile(path.join(kitRoot, 'MASTER_SPEC.md'), 'utf8'),
  'FLOORS_1_10_DESIGN.md': await readFile(path.join(kitRoot, 'FLOORS_1_10_DESIGN.md'), 'utf8'),
  'PROJECT_HANDOVER.md': await readFile(path.join(kitRoot, 'PROJECT_HANDOVER.md'), 'utf8'),
  'BASELINE_V082.md': await readFile(path.join(kitRoot, 'BASELINE_V082.md'), 'utf8'),
};
const canonicalMarker = `工程状態: 工程1A=${status.preparation[0].status} / 工程2=PENDING_REVALIDATION / 工程3=PENDING_REVALIDATION / 工程4以降=NOT_STARTED`;
const canonicalScope = '工程1A正式名称: V0.8.2 deployed browser-runtime source + deployment-input byte checkpoint';
const canonicalExclusions = '工程1A対象外: whole-repository backup / player-save backup / physical-iPhone approval / Production alias switch';
const canonicalChecklist = `1. V0.8.2 deployed browser-runtime source + deployment-input byte checkpoint — \`${status.preparation[0].status}\``;
for (const [name, contents] of Object.entries(canonicalDocuments)) {
  assert(contents.includes(canonicalMarker), `${name} omits the exact canonical project-state marker`);
  assert(contents.includes(canonicalScope), `${name} omits the exact Step 1A scope`);
  assert(contents.includes(canonicalExclusions), `${name} omits the exact Step 1A exclusions`);
  const checklistRows = contents.match(/^1\. V0\.8\.2 deployed browser-runtime source \+ deployment-input byte checkpoint — `[^`]+`$/gmu) || [];
  assert.deepEqual(checklistRows, [canonicalChecklist], `${name} must contain exactly one canonical Step 1A checklist row`);
  assert(!/工程1(?![A0-9])/u.test(contents), `${name} contains an unqualified Step 1 claim`);
  assert(!contents.includes('現行版の保存点'), `${name} contains the retired ambiguous checkpoint name`);
}

if (phase !== 'seal') {
  for (const [relativePath, replacements] of Object.entries(strengthenedAcceptance.sealStatusTransforms.markdownReplacements)) {
    let source = canonicalDocuments[relativePath];
    for (const replacement of replacements) {
      assert.equal(source.split(replacement.from).length - 1, 1, `${relativePath} C2 seal source is not unique`);
      source = source.replace(replacement.from, replacement.to);
    }
  }
}

if (phase !== 'seal') {
  assert.equal(status.preparation[0].status, 'IN_PROGRESS', 'C1 and C2 must remain IN_PROGRESS');
  assert.equal(candidateCiRecord, null, 'candidate-ci-run.json may only be introduced by C3');
} else {
  assert.equal(status.preparation[0].status, 'PASS', 'C3 must perform the exact PASS transition');
}

async function validateCriticRecord(record, role, relativePath, c1, c1Ci, acceptanceSha) {
  assert(record, `Missing ${role} record`);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.artifactId, 'step-1-legacy-baseline');
  assert.equal(record.role, role);
  assert.equal(record.source, 'Codex collaboration sub-agent response recorded by the primary agent');
  assert.equal(record.cryptographicReviewerAuthentication, false);
  assert.equal(typeof record.reviewerId, 'string');
  assert(record.reviewerId.length >= 3);
  assert.equal(typeof record.taskPath, 'string');
  assert(record.taskPath.startsWith('/root/step1_'));
  assert.equal(typeof record.assignment, 'string');
  assert(record.assignment.length >= 80);
  assert.equal(typeof record.verbatimResponse, 'string');
  assert(record.verbatimResponse.length >= 200);
  assert.equal(record.verbatimResponseSha256, sha256(Buffer.from(record.verbatimResponse, 'utf8')));
  const verbatim = parseJsonStrict(record.verbatimResponse, `${role} verbatimResponse`);
  const expectedVerbatimKeys = [
    'findings', 'materialBlockers', 'method', 'reviewTargetCommit', 'reviewTargetTree',
    'reviewedCiJobId', 'reviewedCiRunId', 'role', 'verdict',
  ];
  if (role === 'runtime-critic') {
    expectedVerbatimKeys.push('vercelCommitSha', 'vercelDeploymentId', 'vercelRecheckedAt', 'vercelState');
  }
  assert.deepEqual(Object.keys(verbatim).sort(), expectedVerbatimKeys.sort());
  assert.equal(record.reviewTargetCommit, c1);
  assert.equal(record.reviewTargetTree, kitGit(['rev-parse', `${c1}^{tree}`]).trim());
  assert.equal(record.reviewedAcceptanceSha256, acceptanceSha);
  assert.equal(record.reviewedCiRunId, c1Ci.runId);
  assert.equal(record.reviewedCiJobId, c1Ci.job.id);
  assert.equal(record.reviewedCiCheckoutSha, c1Ci.checkout.sha);
  assert.equal(record.reviewedCiCheckoutTree, c1Ci.checkout.tree);
  assert.equal(record.reviewedCiArtifactDigest, c1Ci.artifact.digest);
  assert.equal(record.reviewedCiRecordPath, acceptanceCiPath);
  assert.equal(
    record.reviewedCiRecordSha256,
    sha256(kitGit(['show', `${candidateCommit}:${acceptanceCiPath}`], null)),
    `${role} does not bind the exact C1 CI record bytes`,
  );
  assert(Date.parse(record.reviewedAt) > Date.parse(c1Ci.job.completedAt));
  assert.equal(record.status, 'PASS');
  assert.deepEqual(record.unresolvedMaterialBlockers, []);
  assert(Array.isArray(record.method) && record.method.length >= 2 && record.method.every(item => typeof item === 'string' && item.length >= 20));
  assert(Array.isArray(record.findings) && record.findings.length >= 2 && record.findings.every(item => typeof item === 'string' && item.length >= 20));
  assert.equal(verbatim.verdict, record.status, `${role} verbatim verdict contradicts its outer status`);
  assert.equal(verbatim.role, record.role, `${role} verbatim role contradicts its outer role`);
  assert.equal(verbatim.reviewTargetCommit, record.reviewTargetCommit, `${role} verbatim target commit contradicts its outer target`);
  assert.equal(verbatim.reviewTargetTree, record.reviewTargetTree, `${role} verbatim target tree contradicts its outer target`);
  assert.equal(verbatim.reviewedCiRunId, record.reviewedCiRunId, `${role} verbatim CI run contradicts its outer record`);
  assert.equal(verbatim.reviewedCiJobId, record.reviewedCiJobId, `${role} verbatim CI job contradicts its outer record`);
  if (role === 'runtime-critic') {
    assert.equal(record.vercelDeploymentId, 'dpl_3qe2uhLnFQ4e9M4UmedQxRGUY3xV');
    assert.equal(record.vercelCommitSha, '2b58ab705e569cc4f5c1ee2e88ea550ab162e4b3');
    assert.equal(record.vercelState, 'READY');
    assert(Date.parse(record.vercelRecheckedAt) > Date.parse(c1Ci.job.completedAt));
    assert(Date.parse(record.vercelRecheckedAt) <= Date.parse(record.reviewedAt));
    assert.equal(verbatim.vercelDeploymentId, record.vercelDeploymentId);
    assert.equal(verbatim.vercelCommitSha, record.vercelCommitSha);
    assert.equal(verbatim.vercelState, record.vercelState);
    assert.equal(verbatim.vercelRecheckedAt, record.vercelRecheckedAt);
  }
  assert.deepEqual(verbatim.materialBlockers, record.unresolvedMaterialBlockers, `${role} verbatim blockers contradict the outer blocker list`);
  assert.deepEqual(verbatim.method, record.method, `${role} verbatim method contradicts the outer method list`);
  assert.deepEqual(verbatim.findings, record.findings, `${role} verbatim findings contradict the outer findings list`);
  const bytes = kitGit(['show', `${candidateCommit}:${relativePath}`], null);
  assert.equal(sha256(bytes), sha256(await readFile(path.join(kitRoot, relativePath))));
  return record;
}

let validatedCritics = null;
if (phase === 'candidate' || phase === 'seal') {
  const c1Ci = validateCiRecord(acceptanceCiRecord, 'acceptance', acceptanceCommit);
  assert(Date.parse(c1Ci.job.completedAt) < Date.parse(c1Ci.artifact.expiresAt));
  assert.equal(cleanRecovery.directGitHubCheckoutCiResult, 'PASS');
  assert.equal(cleanRecovery.browserFromCleanCheckoutCiResult, 'PASS');
  assert.equal(cleanRecovery.githubActionsRunId, c1Ci.runId);
  assert.equal(cleanRecovery.githubActionsHeadSha, acceptanceCommit);
  assert.equal(cleanRecovery.githubActionsConclusion, 'success');
  const acceptanceSha = sha256(strengthenedAcceptanceBytes);
  validatedCritics = {};
  for (const [role, relativePath] of Object.entries(criticPathsByRole)) {
    validatedCritics[role] = await validateCriticRecord(
      criticRecords[role], role, relativePath, acceptanceCommit, c1Ci, acceptanceSha,
    );
  }
  assert.equal(new Set(Object.values(validatedCritics).map(record => record.reviewerId)).size, 3);
  assert.equal(new Set(Object.values(validatedCritics).map(record => record.taskPath)).size, 3);
}

function applyExactReplacements(source, replacements, relativePath) {
  let result = source;
  for (const [from, to] of replacements) {
    assert.equal(result.split(from).length - 1, 1, `${relativePath} seal transform source is not unique`);
    result = result.replace(from, to);
  }
  return result;
}

if (phase === 'seal') {
  const finalReview = sealedRound;
  const c2Ci = validateCiRecord(candidateCiRecord, 'candidate', candidateCommit);
  assert(Date.parse(c2Ci.job.startedAt) > Math.max(...Object.values(validatedCritics).map(record => Date.parse(record.reviewedAt))));
  const markdownTransforms = strengthenedAcceptance.sealStatusTransforms.markdownReplacements;
  for (const [relativePath, replacements] of Object.entries(markdownTransforms)) {
    const before = kitGit(['show', `${candidateCommit}:${relativePath}`], 'utf8');
    const after = kitGit(['show', `${sealCommit}:${relativePath}`], 'utf8');
    assert.equal(
      after,
      applyExactReplacements(before, replacements.map(item => [item.from, item.to]), relativePath),
      `C3 made a non-mechanical change to ${relativePath}`,
    );
  }
  const statusBeforeText = kitGit(['show', `${candidateCommit}:PROJECT_STATUS.json`], 'utf8');
  const statusBefore = parseJsonStrict(statusBeforeText, 'C2 PROJECT_STATUS.json');
  const expectedStatusAfter = structuredClone(statusBefore);
  const dynamicStatusValues = {
    'candidateCi.runId': c2Ci.runId,
    'candidateCi.pullRequest.headSha': candidateCommit,
  };
  const statusLocations = {
    'preparation[0].status': [expectedStatusAfter.preparation[0], 'status'],
    'legacyBaseline.sourceRuntimeCheckpoint': [expectedStatusAfter.legacyBaseline, 'sourceRuntimeCheckpoint'],
    'legacyV082Verification.githubActionsRun': [expectedStatusAfter.legacyV082Verification, 'githubActionsRun'],
    'legacyV082Verification.githubActionsHead': [expectedStatusAfter.legacyV082Verification, 'githubActionsHead'],
    'legacyV082Verification.githubActionsConclusion': [expectedStatusAfter.legacyV082Verification, 'githubActionsConclusion'],
    nextAction: [expectedStatusAfter, 'nextAction'],
  };
  for (const transform of strengthenedAcceptance.sealStatusTransforms.projectStatusTransforms) {
    const [owner, key] = statusLocations[transform.pointer];
    assert(owner, `Unknown PROJECT_STATUS transform pointer: ${transform.pointer}`);
    assert.deepEqual(owner[key], transform.from, `PROJECT_STATUS C2 source differs at ${transform.pointer}`);
    owner[key] = Object.hasOwn(transform, 'to') ? transform.to : dynamicStatusValues[transform.toSource];
    assert.notEqual(owner[key], undefined, `Unknown PROJECT_STATUS dynamic source: ${transform.toSource}`);
  }
  assert.equal(
    kitGit(['show', `${sealCommit}:PROJECT_STATUS.json`], 'utf8'),
    `${JSON.stringify(expectedStatusAfter, null, 2)}\n`,
    'C3 made a non-mechanical or formatting change to PROJECT_STATUS.json',
  );

  const judge = parseJsonStrict(
    await readFile(path.join(kitRoot, finalJudgePath), 'utf8'),
    finalJudgePath,
  );
  assert.equal(judge.schemaVersion, 1);
  assert.equal(judge.artifactId, 'step-1-legacy-baseline');
  assert.equal(judge.role, 'final-judge');
  assert.equal(judge.source, 'Codex collaboration sub-agent response recorded by the primary agent');
  assert.equal(judge.cryptographicReviewerAuthentication, false);
  assert.equal(typeof judge.reviewerId, 'string');
  assert(judge.reviewerId.length >= 3);
  assert.equal(typeof judge.taskPath, 'string');
  assert(judge.taskPath.startsWith('/root/step1_'));
  assert.equal(typeof judge.assignment, 'string');
  assert(judge.assignment.length >= 80);
  assert.equal(typeof judge.verbatimResponse, 'string');
  assert(judge.verbatimResponse.length >= 200);
  assert.equal(judge.reviewTargetCommit, candidateCommit);
  assert.equal(judge.reviewTargetTree, kitGit(['rev-parse', `${candidateCommit}^{tree}`]).trim());
  assert.equal(judge.reviewedAcceptanceSha256, sha256(strengthenedAcceptanceBytes));
  assert.equal(judge.reviewedCiRunId, c2Ci.runId);
  assert.equal(judge.reviewedCiJobId, c2Ci.job.id);
  assert.equal(judge.reviewedCiCheckoutSha, c2Ci.checkout.sha);
  assert.equal(judge.reviewedCiCheckoutTree, c2Ci.checkout.tree);
  assert.equal(judge.reviewedCiArtifactDigest, c2Ci.artifact.digest);
  assert.equal(judge.reviewedCiRecordPath, candidateCiPath);
  assert.equal(
    judge.reviewedCiRecordSha256,
    sha256(kitGit(['show', `${sealCommit}:${candidateCiPath}`], null)),
    'Final judge does not bind the exact C2 CI record bytes',
  );
  assert.equal(judge.verbatimResponseSha256, sha256(Buffer.from(judge.verbatimResponse, 'utf8')));
  const judgeVerbatim = parseJsonStrict(judge.verbatimResponse, 'final-judge verbatimResponse');
  assert.deepEqual(Object.keys(judgeVerbatim).sort(), [
    'criticRecordHashes', 'findings', 'materialBlockers', 'method', 'reviewTargetCommit',
    'reviewTargetTree', 'reviewedCiJobId', 'reviewedCiRunId', 'role', 'verdict',
  ]);
  assert(Date.parse(judge.reviewedAt) > Date.parse(c2Ci.job.completedAt));
  assert.equal(judge.status, 'PASS');
  assert.deepEqual(judge.unresolvedMaterialBlockers, []);
  assert(Array.isArray(judge.method) && judge.method.length >= 2 && judge.method.every(item => typeof item === 'string' && item.length >= 20));
  assert(Array.isArray(judge.findings) && judge.findings.length >= 2 && judge.findings.every(item => typeof item === 'string' && item.length >= 20));
  assert.equal(judgeVerbatim.verdict, judge.status, 'Final-judge verbatim verdict contradicts its outer status');
  assert.equal(judgeVerbatim.role, judge.role, 'Final-judge verbatim role contradicts its outer role');
  assert.equal(judgeVerbatim.reviewTargetCommit, judge.reviewTargetCommit, 'Final-judge verbatim target commit contradicts its outer target');
  assert.equal(judgeVerbatim.reviewTargetTree, judge.reviewTargetTree, 'Final-judge verbatim target tree contradicts its outer target');
  assert.equal(judgeVerbatim.reviewedCiRunId, judge.reviewedCiRunId, 'Final-judge verbatim CI run contradicts its outer record');
  assert.equal(judgeVerbatim.reviewedCiJobId, judge.reviewedCiJobId, 'Final-judge verbatim CI job contradicts its outer record');
  assert.deepEqual(judgeVerbatim.materialBlockers, judge.unresolvedMaterialBlockers, 'Final-judge verbatim blockers contradict the outer blocker list');
  assert.deepEqual(judgeVerbatim.method, judge.method, 'Final-judge verbatim method contradicts the outer method list');
  assert.deepEqual(judgeVerbatim.findings, judge.findings, 'Final-judge verbatim findings contradict the outer findings list');
  const expectedCriticReferences = Object.entries(criticPathsByRole).map(([role, relativePath]) => ({
    role,
    path: relativePath,
    sha256: sha256(kitGit(['show', `${candidateCommit}:${relativePath}`], null)),
    verbatimResponseSha256: validatedCritics[role].verbatimResponseSha256,
  })).sort((left, right) => left.role.localeCompare(right.role));
  assert.deepEqual([...judge.criticReferences].sort((left, right) => left.role.localeCompare(right.role)), expectedCriticReferences);
  assert.deepEqual(
    [...judgeVerbatim.criticRecordHashes].sort((left, right) => left.role.localeCompare(right.role)),
    expectedCriticReferences.map(({ role, sha256: recordSha256 }) => ({ role, sha256: recordSha256 })),
    'Final-judge verbatim response does not bind the exact three critic-record hashes',
  );

  assert.equal(finalReview.artifactId, 'step-1-legacy-baseline');
  assert.equal(finalReview.round, 3);
  assert.equal(finalReview.reviewTargetCommit, candidateCommit);
  assert.equal(finalReview.reviewTargetTree, kitGit(['rev-parse', `${candidateCommit}^{tree}`]).trim());
  assert.equal(finalReview.overallStatus, 'PASS');
  assert.deepEqual(Object.keys(finalReview.gates), ['G1', 'G2', 'G3', 'G4', 'G5']);
  assert.deepEqual(Object.values(finalReview.gates), ['PASS', 'PASS', 'PASS', 'PASS', 'PASS']);
  assert.equal(finalReview.acceptance.file, acceptanceRelativePath);
  assert.equal(finalReview.acceptance.commit, acceptanceCommit);
  assert.equal(finalReview.acceptance.tree, kitGit(['rev-parse', `${acceptanceCommit}^{tree}`]).trim());
  assert.equal(finalReview.acceptance.sha256, sha256(strengthenedAcceptanceBytes));
  assert.equal(finalReview.candidateCiEvidence.file, candidateCiPath);
  assert.equal(
    finalReview.candidateCiEvidence.sha256,
    sha256(kitGit(['show', `${sealCommit}:${candidateCiPath}`], null)),
  );
  assert.equal(finalReview.candidateCiEvidence.runId, c2Ci.runId);
  assert.equal(finalReview.candidateCiEvidence.jobId, c2Ci.job.id);
  assert.equal(finalReview.candidateCiEvidence.headSha, candidateCommit);
  assert.equal(finalReview.candidateCiEvidence.checkoutTree, c2Ci.checkout.tree);
  assert.equal(finalReview.candidateCiEvidence.artifactDigest, c2Ci.artifact.digest);
  assert.deepEqual(Object.keys(finalReview.requirementResults).sort(), requiredAcceptanceIds.sort());
  assert(Object.values(finalReview.requirementResults).every(result => result === 'PASS'));
  assert.equal(finalReview.independentAudits.length, 4);
  const auditRecords = {
    ...Object.fromEntries(Object.entries(criticPathsByRole).map(([role, relativePath]) => [role, { record: validatedCritics[role], path: relativePath }])),
    'final-judge': { record: judge, path: finalJudgePath },
  };
  assert.deepEqual(finalReview.independentAudits.map(item => item.role).sort(), Object.keys(auditRecords).sort());
  assert.equal(new Set(finalReview.independentAudits.map(item => item.reviewerId)).size, 4);
  assert.equal(new Set([...Object.values(validatedCritics), judge].map(record => record.taskPath)).size, 4);
  assert.equal(new Set([...Object.values(validatedCritics), judge].map(record => record.reviewerId)).size, 4);
  for (const audit of finalReview.independentAudits) {
    const expected = auditRecords[audit.role];
    assert.equal(audit.path, expected.path);
    assert.equal(audit.reviewerId, expected.record.reviewerId);
    assert.equal(audit.sha256, sha256(await readFile(path.join(kitRoot, audit.path))));
    assert.equal(audit.verbatimResponseSha256, expected.record.verbatimResponseSha256);
  }
  assert.deepEqual(finalReview.externalSealCi, {
    requiredBeforeCompletionReport: true,
    recordedInsideSeal: false,
    exactC3PullRequestHeadCiRequired: true,
    mergedMainPushCiRequired: true,
    mergedMainMustContainC1C2C3: true,
    mergedMainTreeMustEqualC3Tree: true,
  });
}

if (remote) {
  const ref = git(['ls-remote', 'origin', archiveRef]).trim().split(/\s+/);
  assert.equal(ref[0], baselineCommit, `Remote archive ref does not resolve to ${baselineCommit}`);
  assert.equal(ref[1], archiveRef, 'Remote archive ref is missing');
}

if (live) {
  for (const entry of manifest.entries) {
    const url = new URL(entry.servedPath, manifest.fixedProductionUrl);
    const response = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    assert.equal(response.status, 200, `Live HTTP failure: ${url}`);
    assert((response.headers.get('content-type') || '').startsWith(entry.contentType), `Live MIME mismatch: ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.byteLength, entry.bytes, `Live byte size mismatch: ${url}`);
    assert.equal(sha256(bytes), entry.sha256, `Live SHA-256 mismatch: ${url}`);
  }
}

console.log(`Step 1 baseline verification passed${remote ? ' + remote ref' : ''}${live ? ' + live runtime' : ''}.`);
