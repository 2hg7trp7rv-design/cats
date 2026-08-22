#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetRoot = path.resolve(process.env.CATS_BASELINE_DIR || kitRoot);
const baselineCommit = '727b8d00c281e7539117da5ded7309ea01c7e516';
const baselineTree = 'c508c58b0bb1b3fa591eefe143aab2dd6eac9271';
const archiveRef = 'refs/heads/archive/v0.8.2-legacy-baseline';
const live = process.argv.includes('--live');
const remote = process.argv.includes('--remote');

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
    cwd: kitRoot,
    encoding,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
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
  'diff', '--name-only', `${baselineCommit}..HEAD`, '--', ...uniqueSourcePaths, ...deploymentInputPaths,
]).trim();
assert.equal(runtimeDiff, '', `Step 1 must not change runtime or deployment inputs: ${runtimeDiff}`);

const status = JSON.parse(await readFile(path.join(kitRoot, 'PROJECT_STATUS.json'), 'utf8'));
assert.equal(status.preparation[0].name, 'legacy-baseline-save-point');
assert(['IN_PROGRESS', 'PASS'].includes(status.preparation[0].status));
assert.equal(status.legacyBaseline.commit, baselineCommit);

const browserEvidence = JSON.parse(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/browser-qa.json'),
  'utf8',
));
for (const evidence of browserEvidence.visualEvidence) {
  const evidencePath = path.join(kitRoot, evidence.path);
  const bytes = await readFile(evidencePath);
  assert.equal(sha256(bytes), evidence.sha256, `Visual evidence hash mismatch: ${evidence.path}`);
  assert.deepEqual(webpDimensions(bytes), { width: 390, height: 844 }, `Visual evidence dimensions mismatch: ${evidence.path}`);
}
assert.equal(browserEvidence.visualEvidence.length, 6, 'Six final-size visual records are required');
assert.equal(browserEvidence.deterministicLoop.length, 2, 'Two deterministic viewport reports are required');
assert.equal(browserEvidence.normalUiFlow.length, 2, 'Two normal-flow viewport reports are required');
assert.equal(browserEvidence.serviceWorkerRecovery.length, 2, 'Two Chromium service-worker reports are required');

const repositoryEvidence = JSON.parse(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/repository.json'),
  'utf8',
));
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

const deploymentEvidence = JSON.parse(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/deployments.json'),
  'utf8',
));
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

const vercelMetadata = JSON.parse(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/vercel-deployment-metadata.json'),
  'utf8',
));
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

const previewEvidence = JSON.parse(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/fresh-recovery-preview.json'),
  'utf8',
));
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

const cleanRecovery = JSON.parse(await readFile(
  path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/evidence/clean-recovery.json'),
  'utf8',
));
assert.equal(cleanRecovery.sourceRefCommit, baselineCommit);
assert.equal(cleanRecovery.checkoutHead, baselineCommit);
assert.equal(cleanRecovery.checkoutTree, baselineTree);
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
const snapshotManifest = JSON.parse(await readFile(path.join(snapshotRoot, 'MANIFEST.json'), 'utf8'));
assert.equal(snapshotManifest.baselineCommit, baselineCommit);
assert.equal(snapshotManifest.baselineTree, baselineTree);
for (const entry of snapshotManifest.files) {
  const snapshotBytes = await readFile(path.join(snapshotRoot, entry.path));
  const baselineBytes = git(['show', `${baselineCommit}:${entry.baselinePath}`], null);
  assert.equal(sha256(snapshotBytes), entry.sha256, `Snapshot SHA-256 mismatch: ${entry.path}`);
  assert.equal(sha256(baselineBytes), entry.sha256, `Snapshot differs from baseline: ${entry.baselinePath}`);
}
const expectedSnapshotFiles = ['MANIFEST.json', 'RESTORE.md', ...snapshotManifest.files.map(entry => entry.path)].sort();
assert.deepEqual(await listFiles(snapshotRoot), expectedSnapshotFiles, 'Snapshot contains missing or unmanifested files');

const rawReportLedger = new Map((browserEvidence.rawReports || []).map(report => [report.sha256, report.path]));
assert.equal(rawReportLedger.size, 6, 'Six unique raw browser reports are required');
for (const report of browserEvidence.rawReports || []) {
  const bytes = await readFile(path.join(kitRoot, report.path));
  assert.equal(sha256(bytes), report.sha256, `Raw browser report hash mismatch: ${report.path}`);
}
for (const summary of [
  ...browserEvidence.deterministicLoop,
  ...browserEvidence.serviceWorkerRecovery,
  ...browserEvidence.normalUiFlow,
]) {
  assert(rawReportLedger.has(summary.rawReportSha256), `Summary report is absent from the raw ledger: ${summary.rawReportSha256}`);
  const raw = JSON.parse(await readFile(path.join(kitRoot, rawReportLedger.get(summary.rawReportSha256)), 'utf8'));
  assert.equal(raw.passed, true, 'A raw browser report is not passing');
  assert.equal(summary.browser, 'chromium', 'Persisted local raw evidence must name its actual Chromium runner');
  assert(rawReportLedger.get(summary.rawReportSha256).includes('chromium-'), 'Raw report path omits its browser identity');
  assert.equal(`${raw.viewport.width}x${raw.viewport.height}`, summary.viewportCss, 'Raw viewport differs from its summary');
}
for (const summary of browserEvidence.normalUiFlow) {
  assert.equal(summary.qaMode, false);
  assert.equal(summary.reducedMotion, false);
}
for (const summary of browserEvidence.serviceWorkerRecovery) {
  assert.equal(summary.cachedResponseSha256Count, 15);
  assert.equal(summary.futureSchemaRawBytesUnchanged, 'PASS');
  assert.equal(summary.midCombatRosterNonPersistenceReproduced, 'PASS');
}
assert(browserEvidence.knownLegacyDefects.some(item => /roster/i.test(item)), 'Roster persistence defect is not disclosed');
assert(browserEvidence.knownLegacyDefects.some(item => /localStorage/i.test(item)), 'Deleted-save limitation is not disclosed');
assert(browserEvidence.knownLegacyDefects.some(item => /physical-iPhone/i.test(item)), 'Physical iPhone evidence boundary is not disclosed');

const strengthenedAcceptancePath = path.join(
  kitRoot,
  'quality-reviews/step-1-legacy-baseline/acceptance-round-002.json',
);
const strengthenedAcceptanceBytes = await readFile(strengthenedAcceptancePath);
const strengthenedAcceptance = JSON.parse(strengthenedAcceptanceBytes.toString('utf8'));
assert.equal(strengthenedAcceptance.artifactId, 'step-1-legacy-baseline');
assert.equal(strengthenedAcceptance.acceptanceRevision, 2);
assert(strengthenedAcceptance.requirements.length >= 18, 'Strengthened Acceptance is incomplete');
assert.deepEqual(
  strengthenedAcceptance.separateCapabilities.map(item => item.status),
  ['UNAVAILABLE_IN_V082', 'NOT_VERIFIED', 'NOT_EXECUTED_BY_DESIGN'],
);

const canonicalDocuments = {
  'README.md': await readFile(path.join(kitRoot, 'README.md'), 'utf8'),
  'AGENTS.md': await readFile(path.join(kitRoot, 'AGENTS.md'), 'utf8'),
  'MASTER_SPEC.md': await readFile(path.join(kitRoot, 'MASTER_SPEC.md'), 'utf8'),
  'FLOORS_1_10_DESIGN.md': await readFile(path.join(kitRoot, 'FLOORS_1_10_DESIGN.md'), 'utf8'),
  'PROJECT_HANDOVER.md': await readFile(path.join(kitRoot, 'PROJECT_HANDOVER.md'), 'utf8'),
};
for (const [name, contents] of Object.entries(canonicalDocuments)) {
  assert(contents.includes('PENDING_REVALIDATION'), `${name} omits the later-step revalidation state`);
}

if (status.preparation[0].status === 'PASS') {
  const finalReview = JSON.parse(await readFile(
    path.join(kitRoot, 'quality-reviews/step-1-legacy-baseline/round-002.json'),
    'utf8',
  ));
  assert.equal(finalReview.artifactId, 'step-1-legacy-baseline');
  assert.equal(finalReview.round, 2);
  assert.equal(finalReview.overallStatus, 'PASS', 'A PASS status requires a PASS round-002');
  assert.deepEqual(Object.keys(finalReview.gates), ['G1', 'G2', 'G3', 'G4', 'G5']);
  assert.deepEqual(Object.values(finalReview.gates), ['PASS', 'PASS', 'PASS', 'PASS', 'PASS']);
  assert.equal(finalReview.acceptance.file, 'quality-reviews/step-1-legacy-baseline/acceptance-round-002.json');
  assert.equal(finalReview.acceptance.sha256, sha256(strengthenedAcceptanceBytes));
  assert.equal(kitGit(['rev-parse', `${finalReview.acceptance.commit}^{commit}`]).trim(), finalReview.acceptance.commit);
  const frozenAcceptance = kitGit(['show', `${finalReview.acceptance.commit}:${finalReview.acceptance.file}`], null);
  assert.equal(sha256(frozenAcceptance), sha256(strengthenedAcceptanceBytes), 'Acceptance changed after its checkpoint commit');
  assert.deepEqual(
    Object.keys(finalReview.requirementResults).sort(),
    strengthenedAcceptance.requirements.map(item => item.id).sort(),
    'Round 2 does not judge every strengthened requirement',
  );
  assert(Object.values(finalReview.requirementResults).every(result => result === 'PASS'));
  assert.equal(cleanRecovery.directGitHubCheckoutCiResult, 'PASS');
  assert.equal(cleanRecovery.browserFromCleanCheckoutCiResult, 'PASS');
  assert.equal(finalReview.independentAudits.length, 4, 'Three critics and one final judge are required');
  assert.equal(new Set(finalReview.independentAudits.map(item => item.role)).size, 4, 'Independent review roles must be distinct');
  for (const audit of finalReview.independentAudits) {
    const auditBytes = await readFile(path.join(kitRoot, audit.path));
    assert.equal(sha256(auditBytes), audit.sha256, `Independent audit hash mismatch: ${audit.path}`);
    const record = JSON.parse(auditBytes.toString('utf8'));
    assert.equal(record.status, 'PASS', `Independent audit is not PASS: ${audit.path}`);
    assert.deepEqual(record.unresolvedMaterialBlockers, [], `Independent audit retains blockers: ${audit.path}`);
  }
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
