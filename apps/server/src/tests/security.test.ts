import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/index.js';

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const first = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!first) return '';
  return first.split(';')[0] ?? '';
}

describe('Security & Access Control (RBAC, IDOR, CSRF, Model Visibility)', () => {
  it('enforces Admin RBAC, IDOR isolation between users, CSRF protection, and model visibility', async () => {
    const dbCtx = await createDatabase(':memory:');
    const config = loadConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-security-audit-0000',
      ENCRYPTION_KEY: 'test-encryption-key-security-audit-0000',
      APP_ORIGIN: 'http://localhost:3000',
    });

    const { app } = await buildApp({ dbCtx, config, logger: false });

    // 1. Verify Anonymous Access to Admin Routes returns 401
    const anonAdminUsers = await app.inject({ method: 'GET', url: '/api/admin/users' });
    expect(anonAdminUsers.statusCode).toBe(401);

    const anonAdminSettings = await app.inject({ method: 'GET', url: '/api/admin/settings' });
    expect(anonAdminSettings.statusCode).toBe(401);

    const anonAdminConnections = await app.inject({ method: 'GET', url: '/api/admin/connections' });
    expect(anonAdminConnections.statusCode).toBe(401);

    const anonAdminSystem = await app.inject({ method: 'GET', url: '/api/admin/system' });
    expect(anonAdminSystem.statusCode).toBe(401);

    // 2. Register first user (automatically bootstrapped as Admin)
    const adminRegRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'admin@security-test.local',
        password: 'AdminPassword123!',
        displayName: 'Security Admin',
      },
    });
    expect(adminRegRes.statusCode).toBe(201);
    const adminCookie = extractCookie(adminRegRes.headers['set-cookie']);
    const adminCsrf = adminRegRes.json().csrfToken;
    const adminHeaders = {
      cookie: adminCookie,
      'x-csrf-token': adminCsrf,
      origin: 'http://localhost:3000',
    };

    // Verify Admin CAN access admin routes
    const adminUsersCheck = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: adminHeaders,
    });
    expect(adminUsersCheck.statusCode).toBe(200);

    // 3. Register User A (Regular User)
    const userARegRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'usera@security-test.local',
        password: 'UserAPassword123!',
        displayName: 'User Alpha',
      },
    });
    expect(userARegRes.statusCode).toBe(201);
    expect(userARegRes.json().user.role).toBe('user');
    const userACookie = extractCookie(userARegRes.headers['set-cookie']);
    const userACsrf = userARegRes.json().csrfToken;
    const userAHeaders = {
      cookie: userACookie,
      'x-csrf-token': userACsrf,
      origin: 'http://localhost:3000',
    };

    // 4. Register User B (Regular User)
    const userBRegRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'userb@security-test.local',
        password: 'UserBPassword123!',
        displayName: 'User Bravo',
      },
    });
    expect(userBRegRes.statusCode).toBe(201);
    expect(userBRegRes.json().user.role).toBe('user');
    const userBCookie = extractCookie(userBRegRes.headers['set-cookie']);
    const userBCsrf = userBRegRes.json().csrfToken;
    const userBHeaders = {
      cookie: userBCookie,
      'x-csrf-token': userBCsrf,
      origin: 'http://localhost:3000',
    };

    // 5. Test Non-Admin RBAC Barrier (User A attempts Admin actions -> 403 Forbidden)
    const userAToAdminUsers = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: userAHeaders,
    });
    expect(userAToAdminUsers.statusCode).toBe(403);

    const userAToAdminSettings = await app.inject({
      method: 'GET',
      url: '/api/admin/settings',
      headers: userAHeaders,
    });
    expect(userAToAdminSettings.statusCode).toBe(403);

    const userAToAdminConnections = await app.inject({
      method: 'GET',
      url: '/api/admin/connections',
      headers: userAHeaders,
    });
    expect(userAToAdminConnections.statusCode).toBe(403);

    const userAToAdminSystem = await app.inject({
      method: 'GET',
      url: '/api/admin/system',
      headers: userAHeaders,
    });
    expect(userAToAdminSystem.statusCode).toBe(403);

    // 6. CSRF Enforcement: Mutations without CSRF token must be rejected (403)
    const missingCsrfMutation = await app.inject({
      method: 'POST',
      url: '/api/chats',
      headers: {
        cookie: userACookie,
        origin: 'http://localhost:3000',
      },
      payload: { title: 'Test Chat' },
    });
    expect(missingCsrfMutation.statusCode).toBe(403);

    // 7. User A creates private resources (Chat, Prompt, Skill)
    const userAChatRes = await app.inject({
      method: 'POST',
      url: '/api/chats',
      headers: userAHeaders,
      payload: { title: 'Alpha Confidential Chat' },
    });
    expect(userAChatRes.statusCode).toBe(201);
    const userAChatId = userAChatRes.json().chat.id;

    const userAPromptRes = await app.inject({
      method: 'POST',
      url: '/api/prompts',
      headers: userAHeaders,
      payload: {
        title: 'Alpha Secret Prompt',
        command: 'secret-alpha',
        content: 'Confidential instructions for Alpha',
      },
    });
    expect(userAPromptRes.statusCode).toBe(201);
    const userAPromptId = userAPromptRes.json().prompt.id;

    const userASkillRes = await app.inject({
      method: 'POST',
      url: '/api/skills',
      headers: userAHeaders,
      payload: {
        name: 'Alpha Secret Skill',
        slug: 'alpha-secret',
        content: 'Alpha secret skill instructions',
      },
    });
    expect(userASkillRes.statusCode).toBe(201);
    const userASkillId = userASkillRes.json().skill.id;

    // 8. IDOR Verification: User B attempts to access or mutate User A's Chat
    const userBGetChat = await app.inject({
      method: 'GET',
      url: `/api/chats/${userAChatId}`,
      headers: userBHeaders,
    });
    expect(userBGetChat.statusCode).toBe(404);

    const userBPatchChat = await app.inject({
      method: 'PATCH',
      url: `/api/chats/${userAChatId}`,
      headers: userBHeaders,
      payload: { title: 'Hacked Title' },
    });
    expect(userBPatchChat.statusCode).toBe(404);

    const userBExportChat = await app.inject({
      method: 'GET',
      url: `/api/chats/${userAChatId}/export`,
      headers: userBHeaders,
    });
    expect(userBExportChat.statusCode).toBe(404);

    const userBDeleteChat = await app.inject({
      method: 'DELETE',
      url: `/api/chats/${userAChatId}`,
      headers: userBHeaders,
    });
    expect(userBDeleteChat.statusCode).toBe(404);

    // Verify User A's chat is still intact
    const userAGetChat = await app.inject({
      method: 'GET',
      url: `/api/chats/${userAChatId}`,
      headers: userAHeaders,
    });
    expect(userAGetChat.statusCode).toBe(200);
    expect(userAGetChat.json().chat.title).toBe('Alpha Confidential Chat');

    // 9. IDOR Verification: User B attempts to access or mutate User A's Prompt
    const userBListPrompts = await app.inject({
      method: 'GET',
      url: '/api/prompts',
      headers: userBHeaders,
    });
    expect(userBListPrompts.statusCode).toBe(200);
    const userBPromptList = userBListPrompts.json().prompts as Array<{ id: string }>;
    expect(userBPromptList.some((p) => p.id === userAPromptId)).toBe(false);

    const userBPatchPrompt = await app.inject({
      method: 'PATCH',
      url: `/api/prompts/${userAPromptId}`,
      headers: userBHeaders,
      payload: { title: 'Hacked Prompt' },
    });
    expect(userBPatchPrompt.statusCode).toBe(404);

    const userBDeletePrompt = await app.inject({
      method: 'DELETE',
      url: `/api/prompts/${userAPromptId}`,
      headers: userBHeaders,
    });
    expect(userBDeletePrompt.statusCode).toBe(404);

    // 10. IDOR Verification: User B attempts to modify or delete User A's Skill
    const userBUpdateSkill = await app.inject({
      method: 'PUT',
      url: `/api/skills/${userASkillId}`,
      headers: userBHeaders,
      payload: { name: 'Hacked Skill' },
    });
    expect(userBUpdateSkill.statusCode).toBe(403);

    const userBDeleteSkill = await app.inject({
      method: 'DELETE',
      url: `/api/skills/${userASkillId}`,
      headers: userBHeaders,
    });
    expect(userBDeleteSkill.statusCode).toBe(403);

    // 11. IDOR Verification: User B cannot delete User A's avatar
    const userBDeleteAvatar = await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${userARegRes.json().user.id}/avatar`,
      headers: userBHeaders,
    });
    expect(userBDeleteAvatar.statusCode).toBe(403);

    await app.close();
  });
});
