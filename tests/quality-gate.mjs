#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gateNames = ['G1', 'G2', 'G3', 'G4', 'G5'];
const immutableInfrastructurePaths = [
  '.github/CODEOWNERS',
  '.github/pull_request_template.md',
  '.github/workflows/verify-main.yml',
  'AGENTS.md',
  'PROJECT_HANDOVER.md',
  'PROJECT_STATUS.json',
  'QUALITY_GATE.md',
  'README.md',
  'quality-reviews/**',
  'tests/quality-gate.mjs',
];
const protectedReviewPath = /^quality-reviews\/[^/]+\/(?:acceptance\.json|round-\d{3}\.json|attestations\/round-\d{3}-[^/]+\.json)$/;

const options = {
  requireActivePass: false,
  requireChangedPass: false,
  changedFrom: null,
};

for (const argument of process.argv.slice(2)) {
  if (argument === '--require-active-pass') options.requireActivePass = true;
  else if (argument === '--require-changed-pass') options.requireChangedPass = true;
  else if (argument.startsWith('--changed-from=')) options.changedFrom = argument.slice('--changed-from='.length);
  else throw new Error(`Unknown argument: ${argument}`);
}

assert.ok(
  !options.requireChangedPass || options.changedFrom,
  '--require-changed-pass requires --changed-from=<git-sha>',
);

function invariant(value, message) {
  assert.ok(value, message);
}

function nonEmptyString(value, label) {
  invariant(typeof value === 'string' && value.trim().length > 0, `${label} must be a non-empty string`);
}

function uniqueStrings(values, label) {
  invariant(Array.isArray(values), `${label} must be an array`);
  for (const [index, value] of values.entries()) nonEmptyString(value, `${label}[${index}]`);
  invariant(new Set(values).size === values.length, `${label} must not contain duplicates`);
}

function repositoryPath(value, label) {
  nonEmptyString(value, label);
  const normalized = value.replaceAll('\\', '/');
  invariant(!path.isAbsolute(normalized), `${label} must be repository-relative`);
  invariant(!normalized.split('/').includes('..'), `${label} must not escape the repository`);
  return normalized.replace(/^\.\//, '');
}

function absoluteRepositoryPath(value, label) {
  return path.join(root, repositoryPath(value, label));
}

async function readJson(relativePath, label = relativePath) {
  const source = await readFile(absoluteRepositoryPath(relativePath, label), 'utf8');
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

async function sha256(relativePath) {
  const bytes = await readFile(absoluteRepositoryPath(relativePath, relativePath));
  return createHash('sha256').update(bytes).digest('hex');
}

function assertSha(value, label) {
  invariant(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), `${label} must be a lowercase SHA-256`);
}

function exactKeys(object, expectedKeys, label) {
  invariant(object && typeof object === 'object' && !Array.isArray(object), `${label} must be an object`);
  const actual = Object.keys(object).sort();
  const expected = [...expectedKeys].sort();
  assert.deepEqual(actual, expected, `${label} keys must be exactly ${expected.join(', ')}`);
}

function resolvePointer(object, pointer) {
  nonEmptyString(pointer, 'status pointer');
  const tokens = [];
  const matcher = /(?:^|\.)([^.[\]]+)|\[(\d+)\]/g;
  let match;
  let consumed = '';
  while ((match = matcher.exec(pointer)) !== null) {
    tokens.push(match[1] ?? Number(match[2]));
    consumed += match[0];
  }
  invariant(consumed === pointer && tokens.length > 0, `Invalid status pointer: ${pointer}`);
  return tokens.reduce((value, token) => value?.[token], object);
}

function globToRegExp(glob) {
  repositoryPath(glob, 'glob');
  let source = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*') {
      if (glob[index + 1] === '*') {
        index += 1;
        if (glob[index + 1] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`${source}$`);
}

function matchesAny(relativePath, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(relativePath));
}

function git(args, label) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const detail = error.stderr?.trim() || error.message;
    throw new Error(`${label}: ${detail}`);
  }
}

function gitBytes(args, label) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: null, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`${label}: ${detail}`);
  }
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function validateNonPassRecovery(review, label) {
  const failure = review.failureRecord;
  invariant(failure && typeof failure === 'object' && !Array.isArray(failure), `${label}.failureRecord is required`);
  nonEmptyString(failure.mistakenCompletion, `${label}.failureRecord.mistakenCompletion`);
  uniqueStrings(failure.skippedChecks, `${label}.failureRecord.skippedChecks`);
  invariant(failure.skippedChecks.length > 0, `${label}.failureRecord.skippedChecks must not be empty`);
  nonEmptyString(failure.expectationGap, `${label}.failureRecord.expectationGap`);
  nonEmptyString(failure.rootCause, `${label}.failureRecord.rootCause`);
  uniqueStrings(failure.addedAcceptanceConditions, `${label}.failureRecord.addedAcceptanceConditions`);
  invariant(
    failure.addedAcceptanceConditions.length > 0,
    `${label}.failureRecord.addedAcceptanceConditions must not be empty`,
  );
  nonEmptyString(failure.reuse, `${label}.failureRecord.reuse`);
  nonEmptyString(failure.discardOrRebuild, `${label}.failureRecord.discardOrRebuild`);

  const reconstruction = review.reconstructionPlan;
  invariant(
    reconstruction && typeof reconstruction === 'object' && !Array.isArray(reconstruction),
    `${label}.reconstructionPlan is required`,
  );
  for (const field of ['startFrom', 'firstBuild', 'expansionCondition', 'nextReviewFile']) {
    nonEmptyString(reconstruction[field], `${label}.reconstructionPlan.${field}`);
  }
  repositoryPath(reconstruction.nextReviewFile, `${label}.reconstructionPlan.nextReviewFile`);
  uniqueStrings(review.nextRoundHypothesis, `${label}.nextRoundHypothesis`);
  invariant(review.nextRoundHypothesis.length > 0, `${label}.nextRoundHypothesis must not be empty`);
}

async function validateArtifact(registry, projectStatus) {
  const label = `qualityGate.artifacts[${registry.artifactId ?? '?'}]`;
  nonEmptyString(registry.artifactId, `${label}.artifactId`);
  const acceptancePath = repositoryPath(registry.acceptanceMatrix, `${label}.acceptanceMatrix`);
  const reviewPath = repositoryPath(registry.activeReview, `${label}.activeReview`);
  assertSha(registry.acceptanceMatrixSha256, `${label}.acceptanceMatrixSha256`);
  assertSha(registry.activeReviewSha256, `${label}.activeReviewSha256`);
  invariant(Number.isInteger(registry.activeReviewRound) && registry.activeReviewRound > 0, `${label}.activeReviewRound is invalid`);

  assert.equal(await sha256(acceptancePath), registry.acceptanceMatrixSha256, `${label} acceptance hash is stale`);
  assert.equal(await sha256(reviewPath), registry.activeReviewSha256, `${label} review hash is stale`);

  const acceptance = await readJson(acceptancePath, `${label}.acceptanceMatrix`);
  const review = await readJson(reviewPath, `${label}.activeReview`);
  assert.equal(acceptance.artifactId, registry.artifactId, `${label} acceptance artifactId mismatch`);
  assert.equal(review.artifactId, registry.artifactId, `${label} review artifactId mismatch`);
  assert.equal(review.artifactType, acceptance.artifactType, `${label} artifactType mismatch`);
  assert.equal(review.round, registry.activeReviewRound, `${label} active round mismatch`);
  assert.equal(review.overallStatus, registry.activeReviewOverallStatus, `${label} active status mismatch`);
  invariant(review.historyIsAppendOnly === true, `${label} review must declare append-only history`);

  invariant(review.acceptanceMatrix && typeof review.acceptanceMatrix === 'object', `${label} review acceptance reference is missing`);
  assert.equal(review.acceptanceMatrix.path, acceptancePath, `${label} review acceptance path mismatch`);
  assert.equal(review.acceptanceMatrix.sha256, registry.acceptanceMatrixSha256, `${label} review acceptance hash mismatch`);

  const expectedReviewName = `round-${String(registry.activeReviewRound).padStart(3, '0')}.json`;
  assert.equal(path.basename(reviewPath), expectedReviewName, `${label} active review filename does not match round`);
  const reviewDirectory = path.posix.dirname(reviewPath);
  const roundFiles = (await readdir(absoluteRepositoryPath(reviewDirectory, reviewDirectory)))
    .filter((name) => /^round-\d{3}\.json$/.test(name))
    .sort();
  invariant(roundFiles.length > 0, `${label} has no review rounds`);
  assert.deepEqual(
    roundFiles,
    Array.from({ length: registry.activeReviewRound }, (_, index) => `round-${String(index + 1).padStart(3, '0')}.json`),
    `${label} review rounds must be contiguous from round-001`,
  );
  assert.equal(roundFiles.at(-1), expectedReviewName, `${label} active review is not the latest round`);
  if (registry.activeReviewRound === 1) {
    assert.equal(review.supersedes, null, `${label} round-001 must not supersede another round`);
  } else {
    const previousPath = `${reviewDirectory}/round-${String(registry.activeReviewRound - 1).padStart(3, '0')}.json`;
    invariant(review.supersedes && typeof review.supersedes === 'object', `${label}.supersedes must reference the previous round`);
    assert.equal(review.supersedes.path, previousPath, `${label}.supersedes path must reference the previous round`);
    assertSha(review.supersedes.sha256, `${label}.supersedes.sha256`);
    assert.equal(await sha256(previousPath), review.supersedes.sha256, `${label}.supersedes hash is stale`);
  }

  uniqueStrings(acceptance.requiredArtifactPaths, `${label}.requiredArtifactPaths`);
  uniqueStrings(acceptance.ownedPaths, `${label}.ownedPaths`);
  uniqueStrings(acceptance.statusPointers, `${label}.statusPointers`);
  uniqueStrings(acceptance.comparisonAxes, `${label}.comparisonAxes`);
  invariant(acceptance.requiredArtifactPaths.length > 0, `${label} must require at least one artifact`);
  invariant(acceptance.ownedPaths.length > 0, `${label} must own at least one path`);
  invariant(acceptance.statusPointers.length > 0, `${label} must declare at least one status pointer`);
  invariant(acceptance.comparisonAxes.length > 0, `${label} must declare at least one comparison axis`);

  invariant(Array.isArray(review.artifactHashes), `${label}.artifactHashes must be an array`);
  const manifestPaths = review.artifactHashes.map((entry, index) => {
    invariant(entry && typeof entry === 'object' && !Array.isArray(entry), `${label}.artifactHashes[${index}] must be an object`);
    const artifactPath = repositoryPath(entry.path, `${label}.artifactHashes[${index}].path`);
    assertSha(entry.sha256, `${label}.artifactHashes[${index}].sha256`);
    return artifactPath;
  });
  uniqueStrings(manifestPaths, `${label}.artifactHashes paths`);
  assert.deepEqual(
    [...manifestPaths].sort(),
    [...acceptance.requiredArtifactPaths].sort(),
    `${label} artifact manifest must exactly match requiredArtifactPaths`,
  );
  const artifactHashes = new Map();
  for (const entry of review.artifactHashes) {
    assert.equal(await sha256(entry.path), entry.sha256, `${label} artifact hash is stale: ${entry.path}`);
    artifactHashes.set(entry.path, entry.sha256);
  }
  const artifactSetSha256 = createHash('sha256').update(JSON.stringify(review.artifactHashes)).digest('hex');

  exactKeys(review.gates, gateNames, `${label}.gates`);
  for (const gateName of gateNames) {
    const gate = review.gates[gateName];
    invariant(gate && typeof gate === 'object' && !Array.isArray(gate), `${label}.${gateName} must be an object`);
    invariant(['PASS', 'FAIL', 'BLOCKED'].includes(gate.verdict), `${label}.${gateName}.verdict is invalid`);
    invariant(Array.isArray(gate.evidence) && gate.evidence.length > 0, `${label}.${gateName} needs evidence`);
    for (const [index, evidence] of gate.evidence.entries()) {
      invariant(evidence && typeof evidence === 'object' && !Array.isArray(evidence), `${label}.${gateName}.evidence[${index}] must be an object`);
      const evidencePath = repositoryPath(evidence.path, `${label}.${gateName}.evidence[${index}].path`);
      assertSha(evidence.sha256, `${label}.${gateName}.evidence[${index}].sha256`);
      nonEmptyString(evidence.claim, `${label}.${gateName}.evidence[${index}].claim`);
      invariant(artifactHashes.has(evidencePath), `${label}.${gateName} evidence is outside the exact artifact manifest: ${evidencePath}`);
      assert.equal(evidence.sha256, artifactHashes.get(evidencePath), `${label}.${gateName} evidence hash mismatch: ${evidencePath}`);
    }
  }

  invariant(Array.isArray(review.reviewers), `${label}.reviewers must be an array`);
  const reviewerIds = review.reviewers.map((reviewer, index) => {
    invariant(reviewer && typeof reviewer === 'object' && !Array.isArray(reviewer), `${label}.reviewers[${index}] must be an object`);
    nonEmptyString(reviewer.identity, `${label}.reviewers[${index}].identity`);
    nonEmptyString(reviewer.role, `${label}.reviewers[${index}].role`);
    invariant(typeof reviewer.independent === 'boolean', `${label}.reviewers[${index}].independent must be boolean`);
    return reviewer.identity;
  });
  uniqueStrings(reviewerIds, `${label}.reviewer identities`);
  invariant(
    review.reviewers.some((reviewer) => reviewer.role === 'builder-self-review' && reviewer.independent === false),
    `${label} needs a non-independent builder-self-review`,
  );
  const independentCritics = review.reviewers.filter(
    (reviewer) => reviewer.independent && reviewer.role.includes('critic'),
  );
  const thresholds = acceptance.qualityThresholds;
  invariant(thresholds && typeof thresholds === 'object', `${label}.qualityThresholds is required`);
  invariant(
    Number.isInteger(thresholds.minimumIndependentCritics) && thresholds.minimumIndependentCritics >= 1,
    `${label}.minimumIndependentCritics is invalid`,
  );
  invariant(
    independentCritics.length >= thresholds.minimumIndependentCritics,
    `${label} needs at least ${thresholds.minimumIndependentCritics} independent critics`,
  );
  invariant(
    review.reviewers.some((reviewer) => reviewer.independent && reviewer.role === 'quality-decision-reviewer'),
    `${label} needs an independent quality-decision-reviewer`,
  );

  invariant(Array.isArray(review.reviewAttestations), `${label}.reviewAttestations must be an array`);
  const attestationReviewerIds = review.reviewAttestations.map((attestation, index) => {
    invariant(attestation && typeof attestation === 'object' && !Array.isArray(attestation), `${label}.reviewAttestations[${index}] must be an object`);
    nonEmptyString(attestation.reviewer, `${label}.reviewAttestations[${index}].reviewer`);
    const attestationPath = repositoryPath(attestation.path, `${label}.reviewAttestations[${index}].path`);
    assertSha(attestation.sha256, `${label}.reviewAttestations[${index}].sha256`);
    const expectedPrefix = `${reviewDirectory}/attestations/round-${String(review.round).padStart(3, '0')}-`;
    invariant(attestationPath.startsWith(expectedPrefix) && attestationPath.endsWith('.json'), `${label} attestation path must be round-scoped`);
    return attestation.reviewer;
  });
  uniqueStrings(attestationReviewerIds, `${label}.reviewAttestations reviewers`);
  assert.deepEqual([...attestationReviewerIds].sort(), [...reviewerIds].sort(), `${label} needs one attestation per reviewer`);
  const attestationsByReviewer = new Map();
  for (const entry of review.reviewAttestations) {
    assert.equal(await sha256(entry.path), entry.sha256, `${label} attestation hash is stale: ${entry.path}`);
    const attestation = await readJson(entry.path, `${label} attestation ${entry.reviewer}`);
    const reviewer = review.reviewers.find((candidate) => candidate.identity === entry.reviewer);
    assert.equal(attestation.artifactId, review.artifactId, `${label} attestation artifactId mismatch`);
    assert.equal(attestation.round, review.round, `${label} attestation round mismatch`);
    assert.equal(attestation.reviewer, reviewer.identity, `${label} attestation reviewer mismatch`);
    assert.equal(attestation.role, reviewer.role, `${label} attestation role mismatch`);
    assert.equal(attestation.independent, reviewer.independent, `${label} attestation independence mismatch`);
    assert.equal(attestation.acceptanceMatrixSha256, registry.acceptanceMatrixSha256, `${label} attestation acceptance hash mismatch`);
    assert.equal(attestation.artifactSetSha256, artifactSetSha256, `${label} attestation artifact-set hash mismatch`);
    invariant(['PASS', 'IN_PROGRESS', 'BLOCKED'].includes(attestation.verdict), `${label} attestation verdict is invalid`);
    invariant(Array.isArray(attestation.findings) && attestation.findings.length > 0, `${label} attestation findings are required`);
    uniqueStrings(attestation.findings, `${label} attestation findings`);
    attestationsByReviewer.set(entry.reviewer, attestation);
  }
  const builderAttestation = attestationsByReviewer.get(review.reviewers.find((reviewer) => reviewer.role === 'builder-self-review').identity);
  invariant(builderAttestation.selfReviewCompleted === true, `${label} builder attestation must confirm self-review`);
  const decisionAttestation = attestationsByReviewer.get(review.reviewers.find((reviewer) => reviewer.role === 'quality-decision-reviewer').identity);
  assert.equal(decisionAttestation.verdict, review.overallStatus, `${label} decision attestation must match overallStatus`);
  uniqueStrings(decisionAttestation.criticAttestationSha256s, `${label} decision attestation critic hashes`);
  const expectedCriticAttestationHashes = independentCritics.map((critic) => review.reviewAttestations.find((entry) => entry.reviewer === critic.identity).sha256).sort();
  assert.deepEqual([...decisionAttestation.criticAttestationSha256s].sort(), expectedCriticAttestationHashes, `${label} decision attestation must reference every independent critic attestation hash`);
  exactKeys(decisionAttestation.gateVerdicts, gateNames, `${label} decision attestation gateVerdicts`);
  for (const gateName of gateNames) {
    assert.equal(decisionAttestation.gateVerdicts[gateName], review.gates[gateName].verdict, `${label} decision attestation ${gateName} mismatch`);
  }

  invariant(Array.isArray(review.fiveSecondReviews), `${label}.fiveSecondReviews must be an array`);
  invariant(
    Number.isInteger(thresholds.minimumFreshFiveSecondReviews) && thresholds.minimumFreshFiveSecondReviews >= 1,
    `${label}.minimumFreshFiveSecondReviews is invalid`,
  );
  invariant(
    review.fiveSecondReviews.length >= thresholds.minimumFreshFiveSecondReviews,
    `${label} needs at least ${thresholds.minimumFreshFiveSecondReviews} five-second reviews`,
  );
  const fiveSecondIds = review.fiveSecondReviews.map((result, index) => {
    nonEmptyString(result.reviewer, `${label}.fiveSecondReviews[${index}].reviewer`);
    invariant(typeof result.understoodProductPromise === 'boolean', `${label}.fiveSecondReviews[${index}].understoodProductPromise must be boolean`);
    nonEmptyString(result.finding, `${label}.fiveSecondReviews[${index}].finding`);
    const reviewer = review.reviewers.find((candidate) => candidate.identity === result.reviewer);
    invariant(
      reviewer?.independent === true && reviewer.role.includes('critic'),
      `${label}.fiveSecondReviews[${index}] must reference an independent critic`,
    );
    const attestation = attestationsByReviewer.get(result.reviewer);
    assert.equal(attestation.understoodProductPromise, result.understoodProductPromise, `${label}.fiveSecondReviews[${index}] disagrees with reviewer attestation`);
    exactKeys(attestation.comparisonScoresOutOf10, acceptance.comparisonAxes, `${label} critic attestation comparison scores`);
    for (const axis of acceptance.comparisonAxes) {
      const score = attestation.comparisonScoresOutOf10[axis];
      invariant(typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 10, `${label} critic attestation ${axis} score must be 0..10`);
    }
    return result.reviewer;
  });
  uniqueStrings(fiveSecondIds, `${label}.fiveSecondReviews reviewers`);

  exactKeys(review.comparisonScoresOutOf10, acceptance.comparisonAxes, `${label}.comparisonScoresOutOf10`);
  const scores = acceptance.comparisonAxes.map((axis) => review.comparisonScoresOutOf10[axis]);
  for (const [index, score] of scores.entries()) {
    invariant(typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 10, `${label}.${acceptance.comparisonAxes[index]} score must be 0..10`);
  }
  for (const axis of acceptance.comparisonAxes) {
    const criticMinimum = Math.min(...independentCritics.map((critic) => attestationsByReviewer.get(critic.identity).comparisonScoresOutOf10[axis]));
    assert.equal(review.comparisonScoresOutOf10[axis], criticMinimum, `${label}.${axis} must equal the minimum independent-critic score`);
  }
  exactKeys(review.comparisonFindings, acceptance.comparisonAxes, `${label}.comparisonFindings`);
  for (const axis of acceptance.comparisonAxes) {
    const finding = review.comparisonFindings[axis];
    for (const field of ['target', 'observed', 'disproof']) nonEmptyString(finding[field], `${label}.comparisonFindings.${axis}.${field}`);
    uniqueStrings(finding.evidencePaths, `${label}.comparisonFindings.${axis}.evidencePaths`);
    invariant(finding.evidencePaths.length > 0, `${label}.comparisonFindings.${axis} needs evidence`);
    for (const evidencePath of finding.evidencePaths) {
      invariant(artifactHashes.has(evidencePath), `${label}.comparisonFindings.${axis} evidence is outside the artifact manifest: ${evidencePath}`);
    }
  }
  for (const field of ['placeholderVisuals', 'criticalFindingsAllowed', 'majorFindingsAllowed']) {
    invariant(Number.isInteger(thresholds[field]) && thresholds[field] >= 0, `${label}.qualityThresholds.${field} must be a non-negative integer`);
  }
  for (const field of ['comparisonScoreOutOf10MinimumPerAxis', 'comparisonScoreOutOf10MinimumAverage']) {
    invariant(
      typeof thresholds[field] === 'number' && Number.isFinite(thresholds[field]) && thresholds[field] >= 0 && thresholds[field] <= 10,
      `${label}.qualityThresholds.${field} must be 0..10`,
    );
  }
  invariant(Number.isInteger(review.placeholderVisualCount) && review.placeholderVisualCount >= 0, `${label}.placeholderVisualCount is invalid`);
  uniqueStrings(review.criticalFindings, `${label}.criticalFindings`);
  uniqueStrings(review.majorFindings, `${label}.majorFindings`);

  const overall = review.overallStatus;
  invariant(['PASS', 'IN_PROGRESS', 'BLOCKED'].includes(overall), `${label}.overallStatus is invalid`);
  for (const pointer of acceptance.statusPointers) {
    assert.equal(resolvePointer(projectStatus, pointer), overall, `${label} status pointer ${pointer} disagrees with review`);
  }

  if (overall === 'PASS') {
    invariant(review.passEligible === true, `${label} PASS requires passEligible=true`);
    invariant(gateNames.every((name) => review.gates[name].verdict === 'PASS'), `${label} PASS requires G1-G5 PASS`);
    invariant(review.placeholderVisualCount <= thresholds.placeholderVisuals, `${label} PASS exceeds placeholder limit`);
    invariant(review.criticalFindings.length <= thresholds.criticalFindingsAllowed, `${label} PASS exceeds critical finding limit`);
    invariant(review.majorFindings.length <= thresholds.majorFindingsAllowed, `${label} PASS exceeds major finding limit`);
    invariant(review.fiveSecondReviews.every((result) => result.understoodProductPromise), `${label} PASS requires every five-second review to understand the promise`);
    invariant(independentCritics.every((critic) => attestationsByReviewer.get(critic.identity).verdict === 'PASS'), `${label} PASS requires every independent critic attestation to be PASS`);
    invariant(scores.every((score) => score >= thresholds.comparisonScoreOutOf10MinimumPerAxis), `${label} PASS has a comparison axis below threshold`);
    invariant(scores.reduce((sum, score) => sum + score, 0) / scores.length >= thresholds.comparisonScoreOutOf10MinimumAverage, `${label} PASS has a comparison average below threshold`);
    invariant(review.acceptanceMatrix.retrospectiveForThisRound === false, `${label} PASS requires a prospectively locked acceptance matrix`);
    invariant(Number.isInteger(acceptance.prospectiveLockRequiredFromRound) && acceptance.prospectiveLockRequiredFromRound >= 1, `${label} prospective lock round is invalid`);
    invariant(review.round >= acceptance.prospectiveLockRequiredFromRound, `${label} PASS is not allowed before the prospective-lock round`);
    invariant(typeof review.reviewedSourceCommit === 'string' && /^[a-f0-9]{40}$/.test(review.reviewedSourceCommit), `${label} PASS requires a full reviewedSourceCommit`);
    invariant(typeof review.acceptanceMatrix.lockedCommit === 'string' && /^[a-f0-9]{40}$/.test(review.acceptanceMatrix.lockedCommit), `${label} PASS requires a full acceptance lockedCommit`);
    invariant(review.acceptanceMatrix.lockedCommit !== review.reviewedSourceCommit, `${label} acceptance must be locked in an earlier commit than the reviewed source`);
    git(['merge-base', '--is-ancestor', review.acceptanceMatrix.lockedCommit, review.reviewedSourceCommit], `${label} acceptance lock is not an ancestor of reviewed source`);
    assert.equal(
      sha256Bytes(gitBytes(['show', `${review.acceptanceMatrix.lockedCommit}:${acceptancePath}`], `${label} could not read locked acceptance`)),
      registry.acceptanceMatrixSha256,
      `${label} locked acceptance bytes differ from the active matrix`,
    );
    for (const artifact of review.artifactHashes) {
      assert.equal(
        sha256Bytes(gitBytes(['show', `${review.reviewedSourceCommit}:${artifact.path}`], `${label} could not read reviewed artifact ${artifact.path}`)),
        artifact.sha256,
        `${label} reviewedSourceCommit differs from manifest: ${artifact.path}`,
      );
    }
    invariant(registry.pullRequestReadyAllowed === true, `${label} PASS requires pullRequestReadyAllowed=true`);
    invariant(registry.pullRequestMergeAllowed === true, `${label} PASS requires pullRequestMergeAllowed=true`);
  } else {
    invariant(review.passEligible === false, `${label} non-PASS requires passEligible=false`);
    invariant(gateNames.some((name) => review.gates[name].verdict !== 'PASS'), `${label} non-PASS needs a failing or blocked gate`);
    invariant(registry.pullRequestReadyAllowed === false, `${label} non-PASS requires pullRequestReadyAllowed=false`);
    invariant(registry.pullRequestMergeAllowed === false, `${label} non-PASS requires pullRequestMergeAllowed=false`);
    if (overall === 'BLOCKED') {
      invariant(gateNames.some((name) => review.gates[name].verdict === 'BLOCKED'), `${label} BLOCKED needs a blocked gate`);
    } else {
      invariant(gateNames.some((name) => review.gates[name].verdict === 'FAIL'), `${label} IN_PROGRESS needs a failing gate`);
      invariant(gateNames.every((name) => review.gates[name].verdict !== 'BLOCKED'), `${label} a blocked gate requires overallStatus=BLOCKED`);
    }
    validateNonPassRecovery(review, label);
  }

  return {
    artifactId: registry.artifactId,
    overallStatus: overall,
    ownedPaths: acceptance.ownedPaths,
    reviewedArtifactPaths: new Set(manifestPaths),
    reviewPath,
  };
}

function validateAppendOnlyHistory(changedFrom) {
  const baseFiles = git(
    ['ls-tree', '-r', '--name-only', changedFrom, '--', 'quality-reviews'],
    'Could not enumerate base quality-review history',
  ).split(/\r?\n/).filter((candidate) => protectedReviewPath.test(candidate));
  for (const protectedPath of baseFiles) {
    invariant(existsSync(absoluteRepositoryPath(protectedPath, protectedPath)), `Append-only violation (deleted): ${protectedPath}`);
    const baseBlob = git(['rev-parse', `${changedFrom}:${protectedPath}`], `Could not hash base review ${protectedPath}`).trim();
    const currentBlob = git(['hash-object', '--', protectedPath], `Could not hash current review ${protectedPath}`).trim();
    assert.equal(currentBlob, baseBlob, `Append-only violation (modified): ${protectedPath}`);
  }
}

function changedFiles(changedFrom) {
  const output = git(['diff', '--name-only', `${changedFrom}...HEAD`], 'Could not inspect changed files');
  return output.split(/\r?\n/).filter(Boolean).map((value) => value.replaceAll('\\', '/'));
}

function validateBaseRegistryContinuity(changedFrom, currentQualityGate) {
  let baseStatus;
  try {
    baseStatus = JSON.parse(git(['show', `${changedFrom}:PROJECT_STATUS.json`], 'Could not read base PROJECT_STATUS.json'));
  } catch (error) {
    throw new Error(`Base PROJECT_STATUS.json is invalid: ${error.message}`);
  }
  const baseGate = baseStatus.qualityGate;
  if (!baseGate?.artifacts) return;
  for (const baseArtifact of baseGate.artifacts) {
    const currentArtifact = currentQualityGate.artifacts.find((candidate) => candidate.artifactId === baseArtifact.artifactId);
    invariant(currentArtifact, `Registered artifact cannot be removed: ${baseArtifact.artifactId}`);
    assert.equal(
      currentArtifact.acceptanceMatrix,
      baseArtifact.acceptanceMatrix,
      `Registered artifact cannot be repointed to another Acceptance Matrix: ${baseArtifact.artifactId}`,
    );
  }
}

const projectStatus = await readJson('PROJECT_STATUS.json');
const qualityGate = projectStatus.qualityGate;
invariant(qualityGate && typeof qualityGate === 'object', 'PROJECT_STATUS.json qualityGate is required');
invariant(qualityGate.status === 'ACTIVE', 'qualityGate.status must be ACTIVE');
invariant(Array.isArray(qualityGate.artifacts) && qualityGate.artifacts.length > 0, 'qualityGate.artifacts registry is required');
uniqueStrings(qualityGate.infrastructurePaths, 'qualityGate.infrastructurePaths');
assert.deepEqual(
  [...qualityGate.infrastructurePaths].sort(),
  [...immutableInfrastructurePaths].sort(),
  'qualityGate.infrastructurePaths must exactly match the validator-owned narrow allowlist',
);

const artifactIds = qualityGate.artifacts.map((artifact) => artifact.artifactId);
uniqueStrings(artifactIds, 'qualityGate artifactIds');
const validatedArtifacts = [];
for (const registry of qualityGate.artifacts) validatedArtifacts.push(await validateArtifact(registry, projectStatus));

nonEmptyString(qualityGate.activeArtifactId, 'qualityGate.activeArtifactId');
const activeArtifact = validatedArtifacts.find((artifact) => artifact.artifactId === qualityGate.activeArtifactId);
invariant(activeArtifact, `qualityGate.activeArtifactId is not registered: ${qualityGate.activeArtifactId}`);

if (options.requireActivePass) {
  assert.equal(activeArtifact.overallStatus, 'PASS', `Active artifact ${activeArtifact.artifactId} is ${activeArtifact.overallStatus}, not PASS`);
}

let changed = [];
if (options.changedFrom) {
  validateBaseRegistryContinuity(options.changedFrom, qualityGate);
  validateAppendOnlyHistory(options.changedFrom);
  changed = changedFiles(options.changedFrom);
  for (const changedPath of changed) {
    const infrastructure = matchesAny(changedPath, qualityGate.infrastructurePaths);
    const owners = validatedArtifacts.filter((artifact) => matchesAny(changedPath, artifact.ownedPaths));
    invariant(infrastructure || owners.length > 0, `Changed file is not registered as infrastructure or artifact-owned: ${changedPath}`);
    if (options.requireChangedPass && owners.length > 0) {
      for (const owner of owners) {
        invariant(
          owner.reviewedArtifactPaths.has(changedPath),
          `Changed artifact-owned file is absent from the active review hash manifest: ${changedPath} (${owner.artifactId})`,
        );
        assert.equal(owner.overallStatus, 'PASS', `Changed artifact ${owner.artifactId} is ${owner.overallStatus}, not PASS (${changedPath})`);
      }
    }
  }
}

process.stdout.write(`${JSON.stringify({
  recordIntegrity: 'PASS',
  activeArtifactId: activeArtifact.artifactId,
  activeArtifactStatus: activeArtifact.overallStatus,
  validatedArtifacts: validatedArtifacts.map(({ artifactId, overallStatus }) => ({ artifactId, overallStatus })),
  changedFrom: options.changedFrom,
  changedFilesChecked: changed.length,
  requireActivePass: options.requireActivePass,
  requireChangedPass: options.requireChangedPass,
}, null, 2)}\n`);
