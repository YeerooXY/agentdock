'use strict';

function isFiniteNonnegative(n) {
  return Number.isFinite(n) && n >= 0;
}

function validUsage(u) {
  if (!u || typeof u !== 'object') return false;
  const c = u;
  if (!c || typeof c !== 'object') return false;
  return isFiniteNonnegative(c.input) &&
         isFiniteNonnegative(c.output) &&
         isFiniteNonnegative(c.unknown);
}

function checkComparable(baseline, candidate) {
  const reasons = [];

  if (!baseline || typeof baseline !== 'object') {
    reasons.push('missing/invalid record');
    return { comparable: false, reasons };
  }
  if (!candidate || typeof candidate !== 'object') {
    reasons.push('missing/invalid record');
    return { comparable: false, reasons };
  }

  const bk = baseline.benchmarkKey;
  const ck = candidate.benchmarkKey;
  if (typeof bk !== 'string' || !bk.trim()) {
    reasons.push('mismatched task');
  } else if (typeof ck !== 'string' || !ck.trim()) {
    reasons.push('mismatched task');
  } else if (bk !== ck) {
    reasons.push('mismatched task');
  }

  if (baseline.accepted !== true) {
    reasons.push('failed acceptance');
  }
  if (candidate.accepted !== true) {
    reasons.push('failed acceptance');
  }

  if (baseline.cloudComplete !== true) {
    reasons.push('incomplete coordinator/worker capture');
  }
  if (candidate.cloudComplete !== true) {
    reasons.push('incomplete coordinator/worker capture');
  }

  const bUsage = baseline.usage && baseline.usage.cloud;
  const cUsage = candidate.usage && candidate.usage.cloud;

  if (!bUsage || typeof bUsage !== 'object' || !validUsage(bUsage)) {
    reasons.push('missing/invalid cloud tokens');
  } else if (bUsage.unknown !== 0) {
    reasons.push('missing/invalid cloud tokens');
  }

  if (!cUsage || typeof cUsage !== 'object' || !validUsage(cUsage)) {
    reasons.push('missing/invalid cloud tokens');
  } else if (cUsage.unknown !== 0) {
    reasons.push('missing/invalid cloud tokens');
  }

  if (!isFiniteNonnegative(baseline.wallMs)) {
    reasons.push('missing wall time');
  }
  if (!isFiniteNonnegative(candidate.wallMs)) {
    reasons.push('missing wall time');
  }

  return { comparable: reasons.length === 0, reasons };
}

function compareUsage(baseline, candidate) {
  const check = checkComparable(baseline, candidate);

  if (!check.comparable) {
    return {
      comparable: false,
      reasons: check.reasons,
      cloudInputReduction: null,
      cloudOutputReduction: null,
      cachedInputReduction: null,
      wallMsReduction: null
    };
  }

  const bCloud = baseline.usage.cloud;
  const cCloud = candidate.usage.cloud;

  let cachedInputReduction = null;
  if (bCloud.unknownCached === 0 && cCloud.unknownCached === 0) {
    if (isFiniteNonnegative(bCloud.cached) && bCloud.cached <= bCloud.input &&
        isFiniteNonnegative(cCloud.cached) && cCloud.cached <= cCloud.input) {
      cachedInputReduction = bCloud.cached - cCloud.cached;
    }
  }

  return {
    comparable: true,
    reasons: check.reasons,
    cloudInputReduction: bCloud.input - cCloud.input,
    cloudOutputReduction: bCloud.output - cCloud.output,
    cachedInputReduction: cachedInputReduction,
    wallMsReduction: baseline.wallMs - candidate.wallMs
  };
}

module.exports = { compareUsage };
