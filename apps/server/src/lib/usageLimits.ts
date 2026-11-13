import crypto from 'node:crypto';
import type { Kysely } from 'kysely';
import {
  type DatabaseSchema,
  DEFAULT_USAGE_LIMITS_POLICY,
  getSetting,
  type UsageLimitsPolicy,
  type UsagePeriod,
  type UserUsageOverridesTable,
} from '../db/index.js';

export interface UsageMeterStatus {
  enabled: boolean;
  limit: number | null;
  used: number;
  period: UsagePeriod;
  resetsAt: string;
  remaining: number | null;
}

export interface UserUsageSummary {
  exempt: boolean;
  mode: 'global' | 'custom' | 'unlimited';
  messages: UsageMeterStatus;
  tokens: UsageMeterStatus;
  blockedMeter: 'messages' | 'tokens' | null;
  resetsAt: string | null;
}

export function getUsageWindowBounds(
  period: UsagePeriod,
  now: Date
): { windowStart: string; resetsAt: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  if (period === 'day') {
    const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
    return { windowStart: start.toISOString(), resetsAt: end.toISOString() };
  }

  if (period === 'week') {
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ...
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const start = new Date(Date.UTC(y, m, d - daysSinceMonday, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, d - daysSinceMonday + 7, 0, 0, 0, 0));
    return { windowStart: start.toISOString(), resetsAt: end.toISOString() };
  }

  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  return { windowStart: start.toISOString(), resetsAt: end.toISOString() };
}

export function estimateTokensFromText(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export async function getUsageLimitsPolicy(db: Kysely<DatabaseSchema>): Promise<UsageLimitsPolicy> {
  return getSetting<UsageLimitsPolicy>(db, 'usage_limits_policy', DEFAULT_USAGE_LIMITS_POLICY);
}

export async function computeUserUsageSummary(params: {
  db: Kysely<DatabaseSchema>;
  user: { id: string; role: 'admin' | 'user' };
  policy?: UsageLimitsPolicy;
  override?: UserUsageOverridesTable | null;
  nowFn?: () => Date;
}): Promise<UserUsageSummary> {
  const now = (params.nowFn ?? (() => new Date()))();
  const policy = params.policy ?? (await getUsageLimitsPolicy(params.db));
  const override =
    params.override !== undefined
      ? params.override
      : await params.db
          .selectFrom('user_usage_overrides')
          .selectAll()
          .where('user_id', '=', params.user.id)
          .executeTakeFirst();

  const mode = override?.mode ?? 'global';
  const isUnlimited =
    mode === 'unlimited' ||
    (mode === 'global' && params.user.role === 'admin' && !policy.applyToAdmins);

  const msgEnabled = isUnlimited
    ? false
    : mode === 'custom'
      ? Number(override?.messages_enabled) === 1
      : policy.messagesEnabled;
  const msgLimit = msgEnabled
    ? (mode === 'custom' ? override?.messages_limit ?? null : policy.messagesLimit)
    : null;
  const msgPeriod: UsagePeriod =
    mode === 'custom' ? override?.messages_period ?? 'day' : policy.messagesPeriod;

  const tokEnabled = isUnlimited
    ? false
    : mode === 'custom'
      ? Number(override?.tokens_enabled) === 1
      : policy.tokensEnabled;
  const tokLimit = tokEnabled
    ? (mode === 'custom' ? override?.tokens_limit ?? null : policy.tokensLimit)
    : null;
  const tokPeriod: UsagePeriod =
    mode === 'custom' ? override?.tokens_period ?? 'day' : policy.tokensPeriod;

  const msgBounds = getUsageWindowBounds(msgPeriod, now);
  const tokBounds = getUsageWindowBounds(tokPeriod, now);

  const resetBefore = override?.reset_before ?? '';
  const msgEffectiveStart =
    resetBefore && resetBefore > msgBounds.windowStart ? resetBefore : msgBounds.windowStart;
  const tokEffectiveStart =
    resetBefore && resetBefore > tokBounds.windowStart ? resetBefore : tokBounds.windowStart;

  const earliestStart =
    msgEffectiveStart < tokEffectiveStart ? msgEffectiveStart : tokEffectiveStart;

  const events = await params.db
    .selectFrom('usage_events')
    .select(['input_tokens', 'output_tokens', 'created_at'])
    .where('user_id', '=', params.user.id)
    .where('created_at', '>=', earliestStart)
    .execute();

  let messagesUsed = 0;
  let tokensUsed = 0;
  for (const ev of events) {
    if (ev.created_at >= msgEffectiveStart) {
      messagesUsed += 1;
    }
    if (ev.created_at >= tokEffectiveStart) {
      tokensUsed += Number(ev.input_tokens || 0) + Number(ev.output_tokens || 0);
    }
  }

  const msgBlocked = msgEnabled && msgLimit !== null && messagesUsed >= msgLimit;
  const tokBlocked = tokEnabled && tokLimit !== null && tokensUsed >= tokLimit;
  const blockedMeter = msgBlocked ? 'messages' : tokBlocked ? 'tokens' : null;
  const resetsAt = msgBlocked ? msgBounds.resetsAt : tokBlocked ? tokBounds.resetsAt : null;

  return {
    exempt: isUnlimited,
    mode,
    messages: {
      enabled: msgEnabled,
      limit: msgLimit,
      used: messagesUsed,
      period: msgPeriod,
      resetsAt: msgBounds.resetsAt,
      remaining: msgLimit !== null ? Math.max(0, msgLimit - messagesUsed) : null,
    },
    tokens: {
      enabled: tokEnabled,
      limit: tokLimit,
      used: tokensUsed,
      period: tokPeriod,
      resetsAt: tokBounds.resetsAt,
      remaining: tokLimit !== null ? Math.max(0, tokLimit - tokensUsed) : null,
    },
    blockedMeter,
    resetsAt,
  };
}

export async function recordUsageEvent(params: {
  db: Kysely<DatabaseSchema>;
  userId: string;
  connectionId: string | null;
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
  isEstimated: boolean;
  nowFn?: () => Date;
}): Promise<void> {
  const now = (params.nowFn ?? (() => new Date()))();
  await params.db
    .insertInto('usage_events')
    .values({
      id: crypto.randomUUID(),
      user_id: params.userId,
      connection_id: params.connectionId,
      model_id: params.modelId,
      input_tokens: Math.max(0, Math.trunc(params.inputTokens)),
      output_tokens: Math.max(0, Math.trunc(params.outputTokens)),
      is_estimated: params.isEstimated ? 1 : 0,
      created_at: now.toISOString(),
    })
    .execute();
}
