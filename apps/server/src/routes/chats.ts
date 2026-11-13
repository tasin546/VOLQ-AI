import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import {
  type ChatsTable,
  type ConnectionsTable,
  type DatabaseContext,
  DEFAULT_SSRF_POLICY,
  getSetting,
  type MessagesTable,
  type ModelsMetadataTable,
  type SsrfPolicy,
} from '../db/index.js';
import { tryDecryptSecret } from '../lib/crypto.js';
import { retrieveKnowledgeContext } from '../lib/knowledge.js';
import { resolveAccessibleModel } from '../lib/modelCatalog.js';
import {
  type ChatImageAttachment,
  generateChatTitle,
  type ProviderChatMessage,
  streamChatCompletion,
} from '../lib/providers.js';
import {
  computeUserUsageSummary,
  estimateTokensFromText,
  recordUsageEvent,
} from '../lib/usageLimits.js';
import { makeAuthMiddleware } from '../middleware/auth.js';

const chatCreateSchema = z.object({
  title: z.string().trim().min(1).max(120).default('New Chat'),
  connectionId: z.string().nullable().optional(),
  modelId: z.string().nullable().optional(),
  systemPrompt: z.string().max(8000).default(''),
  temperature: z.number().min(0).max(2).nullable().optional(),
  maxTokens: z.number().int().min(1).max(128000).nullable().optional(),
});

const chatUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  isPinned: z.boolean().optional(),
  connectionId: z.string().nullable().optional(),
  modelId: z.string().nullable().optional(),
  systemPrompt: z.string().max(8000).optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  maxTokens: z.number().int().min(1).max(128000).nullable().optional(),
});

const imageSchema = z.object({
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  dataBase64: z.string().min(1).max(8_000_000),
});

const streamBodySchema = z.object({
  content: z.string().max(100_000),
  images: z.array(imageSchema).max(4).default([]),
  connectionId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  systemPrompt: z.string().max(8000).optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  maxTokens: z.number().int().min(1).max(128000).nullable().optional(),
});

const editMessageSchema = z.object({
  content: z.string().min(1).max(100_000),
  connectionId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
});

const idParamSchema = z.object({
  id: z.string().min(1).max(100),
});

const messageParamSchema = z.object({
  id: z.string().min(1).max(100),
  messageId: z.string().min(1).max(100),
});

function parseImages(raw: string): ChatImageAttachment[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface KnowledgeSourceBadge {
  knowledgeBaseName: string;
  filenames: string[];
}

function parseSources(raw: string | undefined): KnowledgeSourceBadge[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeChat(row: ChatsTable) {
  return {
    id: row.id,
    title: row.title,
    connectionId: row.connection_id,
    modelId: row.model_id,
    systemPrompt: row.system_prompt,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    isPinned: Number(row.is_pinned) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeMessage(row: MessagesTable) {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    content: row.content,
    images: parseImages(row.images_json),
    sources: parseSources(row.sources_json),
    modelId: row.model_id,
    connectionId: row.connection_id,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

function writeSseEvent(reply: FastifyReply, payload: unknown): void {
  if (reply.raw.writableEnded) return;
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function registerChatRoutes(
  app: FastifyInstance,
  dbCtx: DatabaseContext,
  config: AppConfig,
  nowFn: () => Date = () => new Date()
): void {
  const db = dbCtx.db;
  const { authenticate, verifyCsrf } = makeAuthMiddleware(db, config);
  const activeStreams = new Map<string, AbortController>();

  async function enforceUsageQuota(
    user: { id: string; role: 'admin' | 'user' },
    reply: FastifyReply
  ): Promise<boolean> {
    const summary = await computeUserUsageSummary({ db, user, nowFn });
    if (!summary.blockedMeter) return true;
    const isMessages = summary.blockedMeter === 'messages';
    const limit = isMessages ? summary.messages.limit : summary.tokens.limit;
    const used = isMessages ? summary.messages.used : summary.tokens.used;
    await reply.code(429).send({
      error: `You've reached your ${summary.blockedMeter} usage limit.`,
      code: 'usage_limit_exceeded',
      meter: summary.blockedMeter,
      limit,
      used,
      resetsAt: summary.resetsAt,
    });
    return false;
  }

  async function getOwnedChat(chatId: string, userId: string): Promise<ChatsTable | undefined> {
    return db
      .selectFrom('chats')
      .selectAll()
      .where('id', '=', chatId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
  }

  async function executeStreamForChat(params: {
    req: FastifyRequest;
    reply: FastifyReply;
    chat: ChatsTable;
    connection: ConnectionsTable;
    modelId: string;
    modelMetadata: ModelsMetadataTable | null;
    knowledgeBaseIds: string[];
    assistantMessageId: string;
    userMessage?: MessagesTable;
    shouldAutoTitle: boolean;
  }): Promise<void> {
    const {
      req,
      reply,
      chat,
      connection,
      modelId,
      modelMetadata,
      knowledgeBaseIds,
      assistantMessageId,
      userMessage,
      shouldAutoTitle,
    } = params;

    const existingController = activeStreams.get(chat.id);
    if (existingController) {
      existingController.abort();
    }

    const controller = new AbortController();
    activeStreams.set(chat.id, controller);

    const onClientClose = () => {
      controller.abort();
    };
    req.raw.on('close', onClientClose);

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const assistantRow = await db
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', assistantMessageId)
      .executeTakeFirstOrThrow();

    writeSseEvent(reply, {
      type: 'meta',
      ...(userMessage ? { userMessage: serializeMessage(userMessage) } : {}),
      assistantMessage: serializeMessage(assistantRow),
    });

    const historyRows = await db
      .selectFrom('messages')
      .selectAll()
      .where('chat_id', '=', chat.id)
      .where('id', '!=', assistantMessageId)
      .orderBy('created_at', 'asc')
      .execute();

    const latestUserContent =
      [...historyRows].reverse().find((m) => m.role === 'user')?.content ?? '';
    const kbResult = await retrieveKnowledgeContext(
      dbCtx,
      config,
      knowledgeBaseIds,
      latestUserContent
    );

    if (kbResult.sources.length > 0) {
      await db
        .updateTable('messages')
        .set({ sources_json: JSON.stringify(kbResult.sources) })
        .where('id', '=', assistantMessageId)
        .execute();
      writeSseEvent(reply, { type: 'sources', sources: kbResult.sources });
    }

    const globalSystemPrompt = (await getSetting<string>(db, 'global_system_prompt', '')).trim();
    const modelSystemPrompt = modelMetadata?.system_prompt.trim() ?? '';
    const chatSystemPrompt = chat.system_prompt.trim();

    // Query active skills for this user / shared skills
    let skillsPromptBlock = '';
    try {
      const activeSkills = await db
        .selectFrom('skills')
        .select(['name', 'description', 'content'])
        .where('enabled', '=', 1)
        .where((eb) =>
          eb.or([
            eb('owner_user_id', '=', req.auth!.user.id),
            eb('shared', '=', 1),
            eb('owner_user_id', 'is', null),
          ])
        )
        .execute();

      if (activeSkills.length > 0) {
        skillsPromptBlock =
          '## Active Skills & Guidelines\n' +
          activeSkills
            .map(
              (s) =>
                `### Skill: ${s.name}\n${s.description ? s.description + '\n' : ''}Instructions:\n${s.content}`
            )
            .join('\n\n');
      }
    } catch {
      // Ignore if skills table query fails gracefully
    }

    const orderedSystemParts = [
      globalSystemPrompt,
      skillsPromptBlock,
      ...kbResult.kbSystemPrompts,
      modelSystemPrompt,
      chatSystemPrompt,
      kbResult.contextBlock ?? '',
    ].filter(Boolean);
    const providerMessages: ProviderChatMessage[] = [];
    if (orderedSystemParts.length > 0) {
      providerMessages.push({ role: 'system', content: orderedSystemParts.join('\n\n') });
    }
    for (const msg of historyRows) {
      if (msg.role === 'system') continue;
      if (msg.role === 'assistant' && !msg.content && msg.status === 'error') continue;
      providerMessages.push({
        role: msg.role,
        content: msg.content,
        images: parseImages(msg.images_json),
      });
    }

    const ssrfPolicy = await getSetting<SsrfPolicy>(db, 'ssrf_policy', DEFAULT_SSRF_POLICY);
    const effectiveTemperature =
      chat.temperature ?? modelMetadata?.default_temperature ?? undefined;
    const effectiveMaxTokens = chat.max_tokens ?? modelMetadata?.default_max_tokens ?? undefined;

    if (shouldAutoTitle && chat.title === 'New Chat' && latestUserContent.trim().length > 0) {
      const quickTitle = latestUserContent.replace(/\s+/g, ' ').trim().slice(0, 48);
      if (quickTitle) {
        await db
          .updateTable('chats')
          .set({ title: quickTitle, updated_at: new Date().toISOString() })
          .where('id', '=', chat.id)
          .execute();
        writeSseEvent(reply, { type: 'title', title: quickTitle });
      }
    }

    let accumulated = '';
    try {
      const decrypted = tryDecryptSecret(connection.encrypted_api_key, config.encryptionKey);
      if (!decrypted.ok) {
        throw new Error(decrypted.error);
      }
      const apiKey = decrypted.value;

      const streamUsage = await streamChatCompletion({
        connection,
        apiKey,
        ssrfPolicy,
        modelId,
        messages: providerMessages,
        temperature: effectiveTemperature,
        maxTokens: effectiveMaxTokens,
        signal: controller.signal,
        onToken: (delta) => {
          accumulated += delta;
          writeSseEvent(reply, { type: 'delta', content: delta });
        },
      });

      const estimatedInput = estimateTokensFromText(providerMessages.map((m) => m.content).join('\n'));
      const estimatedOutput = estimateTokensFromText(accumulated);
      await recordUsageEvent({
        db,
        userId: chat.user_id,
        connectionId: connection.id,
        modelId,
        inputTokens: streamUsage.inputTokens ?? estimatedInput,
        outputTokens: streamUsage.outputTokens ?? estimatedOutput,
        isEstimated: streamUsage.isEstimated,
        nowFn,
      });

      await db
        .updateTable('messages')
        .set({ content: accumulated, status: 'completed' })
        .where('id', '=', assistantMessageId)
        .execute();

      await db
        .updateTable('chats')
        .set({ updated_at: new Date().toISOString() })
        .where('id', '=', chat.id)
        .execute();

      if (shouldAutoTitle && accumulated.trim().length > 0) {
        const firstUser = historyRows.find((m) => m.role === 'user');
        if (firstUser) {
          const generatedTitle = await generateChatTitle({
            connection,
            apiKey,
            ssrfPolicy,
            modelId,
            userPrompt: firstUser.content,
            assistantReply: accumulated,
          });
          await db
            .updateTable('chats')
            .set({ title: generatedTitle, updated_at: new Date().toISOString() })
            .where('id', '=', chat.id)
            .execute();
          writeSseEvent(reply, { type: 'title', title: generatedTitle });
        }
      }

      const finalRow = await db
        .selectFrom('messages')
        .selectAll()
        .where('id', '=', assistantMessageId)
        .executeTakeFirstOrThrow();
      writeSseEvent(reply, { type: 'done', message: serializeMessage(finalRow) });
    } catch (err) {
      const aborted = controller.signal.aborted;
      const status = aborted ? 'stopped' : 'error';
      const errorMessage = aborted ? null : err instanceof Error ? err.message : 'Streaming failed';

      if (accumulated.length > 0) {
        const estimatedInput = estimateTokensFromText(providerMessages.map((m) => m.content).join('\n'));
        const estimatedOutput = estimateTokensFromText(accumulated);
        await recordUsageEvent({
          db,
          userId: chat.user_id,
          connectionId: connection.id,
          modelId,
          inputTokens: estimatedInput,
          outputTokens: estimatedOutput,
          isEstimated: true,
          nowFn,
        });
      }

      await db
        .updateTable('messages')
        .set({ content: accumulated, status, error_message: errorMessage })
        .where('id', '=', assistantMessageId)
        .execute();

      await db
        .updateTable('chats')
        .set({ updated_at: new Date().toISOString() })
        .where('id', '=', chat.id)
        .execute();

      const finalRow = await db
        .selectFrom('messages')
        .selectAll()
        .where('id', '=', assistantMessageId)
        .executeTakeFirstOrThrow();

      if (aborted) {
        writeSseEvent(reply, { type: 'done', message: serializeMessage(finalRow) });
      } else {
        writeSseEvent(reply, {
          type: 'error',
          error: errorMessage,
          message: serializeMessage(finalRow),
        });
      }
    } finally {
      req.raw.off('close', onClientClose);
      if (activeStreams.get(chat.id) === controller) {
        activeStreams.delete(chat.id);
      }
      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    }
  }

  app.get('/api/chats', { preHandler: [authenticate] }, async (req) => {
    const rawQuery = req.query as {
      q?: string;
      excludeEmpty?: string;
      limit?: string;
      offset?: string;
    };
    const query = rawQuery.q?.trim() ?? '';
    const excludeEmpty = rawQuery.excludeEmpty === 'true' || rawQuery.excludeEmpty === '1';
    const parsedLimit = rawQuery.limit ? Math.min(Math.max(Number.parseInt(rawQuery.limit, 10) || 0, 1), 200) : null;
    const parsedOffset = rawQuery.offset ? Math.max(Number.parseInt(rawQuery.offset, 10) || 0, 0) : 0;

    let base = db
      .selectFrom('chats')
      .selectAll()
      .where('user_id', '=', req.auth!.user.id);

    if (excludeEmpty) {
      base = base.where((eb) =>
        eb.exists(
          eb.selectFrom('messages as m_nonempty').select('m_nonempty.id').whereRef('m_nonempty.chat_id', '=', 'chats.id')
        )
      );
    }

    if (query) {
      const pattern = `%${query.toLowerCase()}%`;
      base = base.where((eb) =>
        eb.or([
          sql<boolean>`LOWER(chats.title) LIKE ${pattern}`,
          eb.exists(
            eb
              .selectFrom('messages as m')
              .select('m.id')
              .whereRef('m.chat_id', '=', 'chats.id')
              .where(sql<boolean>`LOWER(m.content) LIKE ${pattern}`)
          ),
        ])
      );
    }

    let ordered = base.orderBy('is_pinned', 'desc').orderBy('updated_at', 'desc');
    if (parsedLimit !== null) {
      ordered = ordered.limit(parsedLimit + 1).offset(parsedOffset);
    }

    const rows = await ordered.execute();
    const hasMore = parsedLimit !== null ? rows.length > parsedLimit : false;
    const sliced = parsedLimit !== null ? rows.slice(0, parsedLimit) : rows;

    const snippets = new Map<string, string>();
    if (query && sliced.length > 0) {
      const chatIds = sliced.map((r) => r.id);
      const pattern = `%${query.toLowerCase()}%`;
      const matchedMsgs = await db
        .selectFrom('messages')
        .select(['chat_id', 'content'])
        .where('chat_id', 'in', chatIds)
        .where(sql<boolean>`LOWER(content) LIKE ${pattern}`)
        .orderBy('created_at', 'desc')
        .execute();
      const needle = query.toLowerCase();
      for (const msg of matchedMsgs) {
        if (snippets.has(msg.chat_id)) continue;
        const lower = msg.content.toLowerCase();
        const idx = lower.indexOf(needle);
        if (idx >= 0) {
          const start = Math.max(0, idx - 36);
          const end = Math.min(msg.content.length, idx + query.length + 64);
          const prefix = start > 0 ? '...' : '';
          const suffix = end < msg.content.length ? '...' : '';
          snippets.set(
            msg.chat_id,
            `${prefix}${msg.content.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`
          );
        }
      }
    }

    return {
      chats: sliced.map((row) => ({
        ...serializeChat(row),
        ...(snippets.has(row.id) ? { matchSnippet: snippets.get(row.id) } : {}),
      })),
      ...(parsedLimit !== null ? { hasMore } : {}),
    };
  });

  app.post('/api/chats', { preHandler: [authenticate, verifyCsrf] }, async (req, reply) => {
    const body = chatCreateSchema.parse(req.body ?? {});
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .insertInto('chats')
      .values({
        id,
        user_id: req.auth!.user.id,
        title: body.title,
        connection_id: body.connectionId ?? null,
        model_id: body.modelId ?? null,
        system_prompt: body.systemPrompt,
        temperature: body.temperature ?? null,
        max_tokens: body.maxTokens ?? null,
        is_pinned: 0,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const created = await db
      .selectFrom('chats')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    return reply.code(201).send({ chat: serializeChat(created) });
  });

  app.get('/api/chats/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const chat = await getOwnedChat(id, req.auth!.user.id);
    if (!chat) {
      return reply.code(404).send({ error: 'Chat not found' });
    }

    const messages = await db
      .selectFrom('messages')
      .selectAll()
      .where('chat_id', '=', chat.id)
      .orderBy('created_at', 'asc')
      .execute();

    return {
      chat: serializeChat(chat),
      messages: messages.map(serializeMessage),
    };
  });

  app.patch('/api/chats/:id', { preHandler: [authenticate, verifyCsrf] }, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = chatUpdateSchema.parse(req.body);
    const chat = await getOwnedChat(id, req.auth!.user.id);
    if (!chat) {
      return reply.code(404).send({ error: 'Chat not found' });
    }

    const now = new Date().toISOString();
    await db
      .updateTable('chats')
      .set({
        title: body.title ?? chat.title,
        is_pinned: body.isPinned !== undefined ? (body.isPinned ? 1 : 0) : chat.is_pinned,
        connection_id:
          body.connectionId !== undefined ? body.connectionId : chat.connection_id,
        model_id: body.modelId !== undefined ? body.modelId : chat.model_id,
        system_prompt:
          body.systemPrompt !== undefined ? body.systemPrompt : chat.system_prompt,
        temperature: body.temperature !== undefined ? body.temperature : chat.temperature,
        max_tokens: body.maxTokens !== undefined ? body.maxTokens : chat.max_tokens,
        updated_at: now,
      })
      .where('id', '=', chat.id)
      .where('user_id', '=', req.auth!.user.id)
      .execute();

    const updated = (await getOwnedChat(id, req.auth!.user.id))!;
    return { chat: serializeChat(updated) };
  });

  app.delete('/api/chats/:id', { preHandler: [authenticate, verifyCsrf] }, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const chat = await getOwnedChat(id, req.auth!.user.id);
    if (!chat) {
      return reply.code(404).send({ error: 'Chat not found' });
    }

    activeStreams.get(chat.id)?.abort();
    await db
      .deleteFrom('chats')
      .where('id', '=', chat.id)
      .where('user_id', '=', req.auth!.user.id)
      .execute();

    return { ok: true };
  });

  app.post(
    '/api/chats/:id/clear',
    { preHandler: [authenticate, verifyCsrf] },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const chat = await getOwnedChat(id, req.auth!.user.id);
      if (!chat) {
        return reply.code(404).send({ error: 'Chat not found' });
      }

      activeStreams.get(chat.id)?.abort();
      await db.deleteFrom('messages').where('chat_id', '=', chat.id).execute();
      await db
        .updateTable('chats')
        .set({ updated_at: new Date().toISOString() })
        .where('id', '=', chat.id)
        .execute();

      return { ok: true };
    }
  );

  app.get('/api/chats/:id/export', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const format = (req.query as { format?: string }).format === 'json' ? 'json' : 'md';
    const chat = await getOwnedChat(id, req.auth!.user.id);
    if (!chat) {
      return reply.code(404).send({ error: 'Chat not found' });
    }

    const messages = await db
      .selectFrom('messages')
      .selectAll()
      .where('chat_id', '=', chat.id)
      .orderBy('created_at', 'asc')
      .execute();

    const slug =
      chat.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'volq-chat';

    if (format === 'json') {
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${slug}.json"`);
      return JSON.stringify(
        {
          chat: serializeChat(chat),
          messages: messages.map(serializeMessage),
        },
        null,
        2
      );
    }

    const metaRows = await db
      .selectFrom('models_metadata')
      .select(['provider_model_id', 'display_name'])
      .where('is_deleted', '=', 0)
      .execute();
    const nameMap = new Map<string, string>();
    for (const r of metaRows) {
      if (r.display_name?.trim()) {
        nameMap.set(r.provider_model_id, r.display_name.trim());
      }
    }

    const lines: string[] = [`# ${chat.title}`, ''];
    if (chat.system_prompt.trim()) {
      lines.push(`> System Prompt: ${chat.system_prompt.trim()}`, '');
    }
    for (const msg of messages) {
      const resolvedName = msg.model_id ? (nameMap.get(msg.model_id) ?? msg.model_id) : 'model';
      const heading = msg.role === 'user' ? '## User' : `## Assistant (${resolvedName})`;
      lines.push(heading, '', msg.content, '');
    }

    reply.header('Content-Type', 'text/markdown; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${slug}.md"`);
    return lines.join('\n');
  });

  app.post(
    '/api/chats/:id/stop',
    { preHandler: [authenticate, verifyCsrf] },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const chat = await getOwnedChat(id, req.auth!.user.id);
      if (!chat) {
        return reply.code(404).send({ error: 'Chat not found' });
      }
      activeStreams.get(chat.id)?.abort();
      return { ok: true };
    }
  );

  app.post(
    '/api/chats/:id/messages/stream',
    { preHandler: [authenticate, verifyCsrf] },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const body = streamBodySchema.parse(req.body);

      if (!body.content.trim() && body.images.length === 0) {
        return reply.code(400).send({ error: 'Message content or image is required' });
      }

      const chat = await getOwnedChat(id, req.auth!.user.id);
      if (!chat) {
        return reply.code(404).send({ error: 'Chat not found' });
      }

      const connectionId = body.connectionId ?? chat.connection_id;
      const modelId = body.modelId ?? chat.model_id;
      if (!connectionId || !modelId) {
        return reply.code(400).send({ error: 'Select a model before sending a message' });
      }

      const resolved = await resolveAccessibleModel(
        db,
        connectionId,
        modelId,
        req.auth!.user.role
      );
      if (!resolved.ok) {
        return reply.code(resolved.status).send({ error: resolved.error });
      }
      if (!(await enforceUsageQuota(req.auth!.user, reply))) return;
      const { connection, metadata: modelMetadata, knowledgeBaseIds } = resolved;

      const countRes = await db
        .selectFrom('messages')
        .select(db.fn.countAll<number | string>().as('count'))
        .where('chat_id', '=', chat.id)
        .executeTakeFirstOrThrow();
      const existingCount = Number(countRes.count);

      const nextSystemPrompt = body.systemPrompt ?? chat.system_prompt;
      const nextTemp = body.temperature !== undefined ? body.temperature : chat.temperature;
      const nextMaxTokens = body.maxTokens !== undefined ? body.maxTokens : chat.max_tokens;
      const now = new Date();
      const userCreatedAt = now.toISOString();
      const assistantCreatedAt = new Date(now.getTime() + 1).toISOString();

      await db
        .updateTable('chats')
        .set({
          connection_id: connection.id,
          model_id: modelId,
          system_prompt: nextSystemPrompt,
          temperature: nextTemp,
          max_tokens: nextMaxTokens,
          updated_at: assistantCreatedAt,
        })
        .where('id', '=', chat.id)
        .execute();

      const updatedChat = (await getOwnedChat(chat.id, req.auth!.user.id))!;

      const userMessageId = crypto.randomUUID();
      await db
        .insertInto('messages')
        .values({
          id: userMessageId,
          chat_id: chat.id,
          role: 'user',
          content: body.content,
          images_json: JSON.stringify(body.images),
          sources_json: '[]',
          model_id: modelId,
          connection_id: connection.id,
          status: 'completed',
          error_message: null,
          created_at: userCreatedAt,
        })
        .execute();

      const assistantMessageId = crypto.randomUUID();
      await db
        .insertInto('messages')
        .values({
          id: assistantMessageId,
          chat_id: chat.id,
          role: 'assistant',
          content: '',
          images_json: '[]',
          sources_json: '[]',
          model_id: modelId,
          connection_id: connection.id,
          status: 'streaming',
          error_message: null,
          created_at: assistantCreatedAt,
        })
        .execute();

      const userMessage = await db
        .selectFrom('messages')
        .selectAll()
        .where('id', '=', userMessageId)
        .executeTakeFirstOrThrow();

      await executeStreamForChat({
        req,
        reply,
        chat: updatedChat,
        connection,
        modelId,
        modelMetadata,
        knowledgeBaseIds,
        assistantMessageId,
        userMessage,
        shouldAutoTitle: existingCount === 0 && updatedChat.title === 'New Chat',
      });
    }
  );

  app.post(
    '/api/chats/:id/regenerate',
    { preHandler: [authenticate, verifyCsrf] },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const chat = await getOwnedChat(id, req.auth!.user.id);
      if (!chat) {
        return reply.code(404).send({ error: 'Chat not found' });
      }

      const body = z
        .object({
          connectionId: z.string().optional(),
          modelId: z.string().optional(),
        })
        .parse(req.body ?? {});

      const connectionId = body.connectionId ?? chat.connection_id;
      const modelId = body.modelId ?? chat.model_id;
      if (!connectionId || !modelId) {
        return reply.code(400).send({ error: 'Select a model before regenerating' });
      }

      const resolved = await resolveAccessibleModel(
        db,
        connectionId,
        modelId,
        req.auth!.user.role
      );
      if (!resolved.ok) {
        return reply.code(resolved.status).send({ error: resolved.error });
      }
      if (!(await enforceUsageQuota(req.auth!.user, reply))) return;
      const { connection, metadata: modelMetadata, knowledgeBaseIds } = resolved;

      const messages = await db
        .selectFrom('messages')
        .selectAll()
        .where('chat_id', '=', chat.id)
        .orderBy('created_at', 'asc')
        .execute();

      const last = messages[messages.length - 1];
      if (!last) {
        return reply.code(400).send({ error: 'No messages to regenerate' });
      }

      if (last.role === 'assistant') {
        await db.deleteFrom('messages').where('id', '=', last.id).execute();
      }

      const assistantMessageId = crypto.randomUUID();
      const now = new Date().toISOString();
      await db
        .insertInto('messages')
        .values({
          id: assistantMessageId,
          chat_id: chat.id,
          role: 'assistant',
          content: '',
          images_json: '[]',
          sources_json: '[]',
          model_id: modelId,
          connection_id: connection.id,
          status: 'streaming',
          error_message: null,
          created_at: now,
        })
        .execute();

      await executeStreamForChat({
        req,
        reply,
        chat,
        connection,
        modelId,
        modelMetadata,
        knowledgeBaseIds,
        assistantMessageId,
        shouldAutoTitle: false,
      });
    }
  );

  app.patch(
    '/api/chats/:id/messages/:messageId',
    { preHandler: [authenticate, verifyCsrf] },
    async (req, reply) => {
      const { id, messageId } = messageParamSchema.parse(req.params);
      const body = editMessageSchema.parse(req.body);
      const chat = await getOwnedChat(id, req.auth!.user.id);
      if (!chat) {
        return reply.code(404).send({ error: 'Chat not found' });
      }

      const target = await db
        .selectFrom('messages')
        .selectAll()
        .where('id', '=', messageId)
        .where('chat_id', '=', chat.id)
        .executeTakeFirst();

      if (!target || target.role !== 'user') {
        return reply.code(404).send({ error: 'User message not found' });
      }

      const connectionId = body.connectionId ?? chat.connection_id;
      const modelId = body.modelId ?? chat.model_id;
      if (!connectionId || !modelId) {
        return reply.code(400).send({ error: 'Select a model before sending' });
      }

      const resolved = await resolveAccessibleModel(
        db,
        connectionId,
        modelId,
        req.auth!.user.role
      );
      if (!resolved.ok) {
        return reply.code(resolved.status).send({ error: resolved.error });
      }
      if (!(await enforceUsageQuota(req.auth!.user, reply))) return;
      const { connection, metadata: modelMetadata, knowledgeBaseIds } = resolved;

      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable('messages')
          .set({ content: body.content })
          .where('id', '=', target.id)
          .execute();
        await trx
          .deleteFrom('messages')
          .where('chat_id', '=', chat.id)
          .where('created_at', '>', target.created_at)
          .execute();
      });

      const assistantMessageId = crypto.randomUUID();
      const now = new Date().toISOString();
      await db
        .insertInto('messages')
        .values({
          id: assistantMessageId,
          chat_id: chat.id,
          role: 'assistant',
          content: '',
          images_json: '[]',
          sources_json: '[]',
          model_id: modelId,
          connection_id: connection.id,
          status: 'streaming',
          error_message: null,
          created_at: now,
        })
        .execute();

      const updatedUserMsg = await db
        .selectFrom('messages')
        .selectAll()
        .where('id', '=', target.id)
        .executeTakeFirstOrThrow();

      await executeStreamForChat({
        req,
        reply,
        chat,
        connection,
        modelId,
        modelMetadata,
        knowledgeBaseIds,
        assistantMessageId,
        userMessage: updatedUserMsg,
        shouldAutoTitle: false,
      });
    }
  );

  app.delete(
    '/api/chats/:id/messages/:messageId',
    { preHandler: [authenticate, verifyCsrf] },
    async (req, reply) => {
      const { id, messageId } = messageParamSchema.parse(req.params);
      const chat = await getOwnedChat(id, req.auth!.user.id);
      if (!chat) {
        return reply.code(404).send({ error: 'Chat not found' });
      }
      const res = await db
        .deleteFrom('messages')
        .where('id', '=', messageId)
        .where('chat_id', '=', chat.id)
        .executeTakeFirst();
      if (Number(res.numDeletedRows) === 0) {
        return reply.code(404).send({ error: 'Message not found' });
      }
      return { ok: true };
    }
  );
}
