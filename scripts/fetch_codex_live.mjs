import fs from 'fs';
import os from 'os';
import path from 'path';
import { app, session } from 'electron';

const USER_DATA_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'Guyue Master');
const PARTITIONS_DIR = path.join(USER_DATA_PATH, 'Partitions');
const CODEX_URL = 'https://chatgpt.com/codex';

function listCodexPartitions() {
  if (!fs.existsSync(PARTITIONS_DIR)) return [];

  return fs.readdirSync(PARTITIONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => name === 'codex-usage' || name.startsWith('codex-usage%3A'))
    .map(name => ({
      folder: name,
      partition: `persist:${decodeURIComponent(name)}`,
      profileId: decodeURIComponent(name).replace(/^codex-usage:?/, '') || 'default',
    }));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function extractSessionHints(sessionData) {
  const accessToken = sessionData?.accessToken || sessionData?.access_token || sessionData?.token || null;
  const jwtPayload = accessToken ? decodeJwtPayload(accessToken) : null;
  const authClaims = jwtPayload?.['https://api.openai.com/auth'] || {};

  return {
    accessToken,
    accountId:
      sessionData?.account_id
      || sessionData?.chatgpt_account_id
      || sessionData?.user?.id
      || sessionData?.user?.account_id
      || authClaims?.chatgpt_account_id
      || null,
    planType:
      sessionData?.chatgpt_plan_type
      || sessionData?.user?.plan_type
      || sessionData?.user?.planType
      || authClaims?.chatgpt_plan_type
      || null,
  };
}

function normalizeWindow(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const usedPercent = Number(raw.used_percent ?? raw.usedPercent ?? 0);
  const limitWindowSeconds = Number(raw.limit_window_seconds ?? raw.limitWindowSeconds ?? 0);
  const resetsAt = Number(raw.reset_at ?? raw.resetsAt ?? 0);

  return {
    usedPercent: Number.isFinite(usedPercent) ? usedPercent : 0,
    windowMinutes: Number.isFinite(limitWindowSeconds) && limitWindowSeconds > 0
      ? Math.round(limitWindowSeconds / 60)
      : null,
    resetsAt: Number.isFinite(resetsAt) && resetsAt > 0 ? resetsAt : null,
  };
}

function normalizePayload(payload, meta = {}) {
  return {
    planType:
      typeof payload?.plan_type === 'string'
        ? payload.plan_type
        : typeof payload?.planType === 'string'
          ? payload.planType
          : meta.planType ?? null,
    primary: normalizeWindow(payload?.rate_limit?.primary_window ?? payload?.rateLimit?.primaryWindow),
    secondary: normalizeWindow(payload?.rate_limit?.secondary_window ?? payload?.rateLimit?.secondaryWindow),
    raw: payload,
  };
}

async function fetchSessionData(ses) {
  for (const endpoint of ['https://chatgpt.com/api/auth/session', 'https://chatgpt.com/auth/session']) {
    try {
      const response = await ses.fetch(endpoint, {
        method: 'GET',
        headers: { accept: 'application/json' },
      });
      const text = await response.text();
      if (!response.ok || !text.trim()) continue;
      const parsed = safeJsonParse(text);
      if (parsed) return parsed;
    } catch {
      // ignore
    }
  }
  return null;
}

async function fetchUsageWithCookies(ses) {
  for (const endpoint of ['https://chatgpt.com/backend-api/wham/usage', 'https://chatgpt.com/backend-api/codex/wham/usage']) {
    try {
      const response = await ses.fetch(endpoint, {
        method: 'GET',
        headers: { accept: 'application/json' },
      });
      const text = await response.text();
      if (!response.ok || !text.trim()) continue;
      const parsed = safeJsonParse(text);
      if (parsed) return { endpoint, payload: parsed };
    } catch {
      // ignore
    }
  }
  return null;
}

async function fetchUsageWithToken(accessToken, accountId) {
  for (const endpoint of ['https://chatgpt.com/backend-api/wham/usage', 'https://chatgpt.com/backend-api/codex/wham/usage']) {
    try {
      const headers = {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
        origin: 'https://chatgpt.com',
        referer: CODEX_URL,
        'user-agent': 'Guyue Master',
      };
      if (accountId) headers['ChatGPT-Account-Id'] = accountId;

      const response = await fetch(endpoint, { headers });
      const text = await response.text();
      if (!response.ok || !text.trim()) continue;
      const parsed = safeJsonParse(text);
      if (parsed) return { endpoint, payload: parsed };
    } catch {
      // ignore
    }
  }
  return null;
}

async function fetchProfileUsage(profile) {
  const ses = session.fromPartition(profile.partition);
  const sessionData = await fetchSessionData(ses);
  const hints = extractSessionHints(sessionData || {});
  const usageViaCookies = await fetchUsageWithCookies(ses);
  const usageViaToken = !usageViaCookies && hints.accessToken
    ? await fetchUsageWithToken(hints.accessToken, hints.accountId)
    : null;

  const usage = usageViaCookies || usageViaToken;

  return {
    profile,
    loginRequired: !hints.accessToken && !usage,
    session: {
      hasAccessToken: Boolean(hints.accessToken),
      accountId: hints.accountId,
      planType: hints.planType,
    },
    usage: usage ? normalizePayload(usage.payload, { planType: hints.planType }) : null,
    endpoint: usage?.endpoint || null,
  };
}

async function main() {
  app.setPath('userData', USER_DATA_PATH);
  await app.whenReady();

  const profiles = listCodexPartitions();
  const results = [];

  for (const profile of profiles) {
    results.push(await fetchProfileUsage(profile));
  }

  console.log(JSON.stringify({
    userDataPath: USER_DATA_PATH,
    profilesFound: profiles.length,
    results,
  }, null, 2));

  app.quit();
}

main().catch(error => {
  console.error(error);
  app.quit();
  process.exit(1);
});
