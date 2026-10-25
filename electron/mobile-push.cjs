'use strict';
const { createPrivateKey, sign } = require('node:crypto');
const PACKAGE = 'com.yeeroo.agentdock.mobile';
function publicConfig(raw) {
  const client = raw?.client?.find(x => x.client_info?.android_client_info?.package_name === PACKAGE);
  const config = { projectId: raw?.project_info?.project_id, messagingSenderId: raw?.project_info?.project_number, appId: client?.client_info?.mobilesdk_app_id, apiKey: client?.api_key?.[0]?.current_key };
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(config.projectId || '') || !/^\d+$/.test(config.messagingSenderId || '') || !/^1:\d+:android:[a-f0-9]+$/.test(config.appId || '') || !/^AIza[\w-]{20,}$/.test(config.apiKey || '')) throw new Error(`Choose google-services.json for Android package ${PACKAGE}.`);
  return config;
}
function serviceAccount(raw, project) {
  if (raw?.type !== 'service_account' || raw.project_id !== project || !/^[\w.+-]+@[\w.-]+\.iam\.gserviceaccount\.com$/.test(raw.client_email || '') || typeof raw.private_key !== 'string' || raw.private_key.length > 16000) throw new Error('Choose a service account from the same Firebase project.');
  try { if (createPrivateKey(raw.private_key).asymmetricKeyType !== 'rsa') throw new Error(); } catch { throw new Error('This service-account key could not be read.'); }
  return { project_id: project, client_email: raw.client_email, private_key: raw.private_key };
}
class MobilePush {
  constructor({ credential, fetcher = fetch } = {}) { this.credential = credential; this.fetch = fetcher; this.cached = null; this.error = ''; this.lastSent = 0; }
  async token(key) {
    if (this.cached?.email === key.client_email && this.cached.until > Date.now()) return this.cached.token;
    const now = Math.floor(Date.now() / 1000), encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const body = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
    const assertion = body + '.' + sign('RSA-SHA256', Buffer.from(body), key.private_key).toString('base64url');
    const response = await this.fetch('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Firebase sign-in failed. Check the service account in Mobile setup.');
    const data = await response.json(); if (typeof data.access_token !== 'string') throw new Error('Firebase did not return an access token.');
    this.cached = { email: key.client_email, token: data.access_token, until: Date.now() + Math.min(3300, Number(data.expires_in) || 0) * 1000 }; return data.access_token;
  }
  async send(token, eventId = 'test') {
    try {
      const key = this.credential(); if (!key || !token) throw new Error('Finish Firebase setup and enable alerts on your phone first.');
      const bearer = await this.token(key);
      const response = await this.fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(key.project_id)}/messages:send`, { method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { token, notification: { title: 'Paddock', body: eventId === 'test' ? 'Your phone is connected. Alerts are ready.' : 'An agent needs your attention.' }, android: { priority: 'high', ttl: '3600s', notification: { channel_id: 'agent_dock_ready', tag: eventId, default_sound: true } }, data: { event: eventId === 'test' ? 'test' : 'ready' } } }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(response.status === 404 ? 'This phone needs to enable alerts again.' : 'Firebase could not send the alert. Check Cloud Messaging permissions.');
      this.error = ''; this.lastSent = Date.now(); return { sent: true };
    } catch (error) { this.error = error.message; throw error; }
  }
}
module.exports = { MobilePush, publicConfig, serviceAccount, PACKAGE };
