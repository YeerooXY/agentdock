'use strict';
const { validateRequest } = require('./domain.cjs');
const { DEFAULT_PROFILES } = require('./shared.cjs');
const { runApi } = require('./api-run.cjs');
async function callApi(raw, key, rates, fetcher = fetch) {
  const request = validateRequest(raw);
  return runApi(request, key, rates, { profile: DEFAULT_PROFILES.find(x => x.id === request.provider), fetcher });
}
module.exports = { callApi, runApi };
