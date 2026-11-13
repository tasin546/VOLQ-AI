import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, setSetting } from '../apps/server/src/db/index.js';
import { hashPassword } from '../apps/server/src/lib/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const demoDataDir = path.join(rootDir, '.demo-data');
if (!fs.existsSync(demoDataDir)) {
  fs.mkdirSync(demoDataDir, { recursive: true });
}

const demoDbPath = path.join(demoDataDir, 'volq.db');
if (fs.existsSync(demoDbPath)) {
  fs.unlinkSync(demoDbPath);
}
for (const ext of ['-wal', '-shm']) {
  if (fs.existsSync(demoDbPath + ext)) {
    fs.unlinkSync(demoDbPath + ext);
  }
}

async function main() {
  console.log(`Seeding demo database at: ${demoDbPath}`);
  const dbCtx = await createDatabase(demoDbPath);
  const db = dbCtx.db;

  const now = new Date().toISOString();
  const passwordHash = await hashPassword('DemoPassword123!');

  // 1. Seed Demo Admin User
  const demoUserId = 'demo-user-admin';
  await db
    .insertInto('users')
    .values({
      id: demoUserId,
      email: 'demo@example.com',
      display_name: 'Demo Admin',
      password_hash: passwordHash,
      role: 'admin',
      is_active: 1,
      preferences_json: JSON.stringify({
        theme: 'system',
        darkStyle: 'obsidian',
        timezone: 'UTC',
        sendOnEnter: true,
        hasCompletedOnboarding: true,
      }),
      email_verified_at: now,
      created_at: now,
      updated_at: now,
    })
    .execute();

  // 2. Seed Demo Connection
  const connId = 'conn-demo';
  await db
    .insertInto('connections')
    .values({
      id: connId,
      name: 'Local Demo Server',
      type: 'openai_compatible',
      base_url: 'http://127.0.0.1:11435/v1',
      encrypted_api_key: null,
      api_key_hint: null,
      is_enabled: 1,
      cached_models_json: JSON.stringify(['demo-fast', 'demo-reasoner', 'demo-vision']),
      models_updated_at: now,
      created_at: now,
      updated_at: now,
    })
    .execute();

  // 3. Seed Models Metadata
  const modelsData = [
    {
      id: `${connId}:demo-fast`,
      connection_id: connId,
      provider_model_id: 'demo-fast',
      display_name: 'Demo Fast (8B)',
      description: 'Ultra-low latency model for general coding and analysis',
      icon: null,
      visibility: 'public' as const,
      is_hidden: 0,
      is_deleted: 0,
      system_prompt: '',
      default_temperature: 0.7,
      default_max_tokens: 2048,
    },
    {
      id: `${connId}:demo-reasoner`,
      connection_id: connId,
      provider_model_id: 'demo-reasoner',
      display_name: 'Demo Reasoner (Deep)',
      description: 'Extended reasoning and mathematical analysis engine',
      icon: null,
      visibility: 'public' as const,
      is_hidden: 0,
      is_deleted: 0,
      system_prompt: '',
      default_temperature: 0.5,
      default_max_tokens: 4096,
    },
    {
      id: `${connId}:demo-vision`,
      connection_id: connId,
      provider_model_id: 'demo-vision',
      display_name: 'Demo Vision (Multimodal)',
      description: 'Visual reasoning and image understanding',
      icon: null,
      visibility: 'public' as const,
      is_hidden: 0,
      is_deleted: 0,
      system_prompt: '',
      default_temperature: 0.7,
      default_max_tokens: 2048,
    },
  ];

  for (const m of modelsData) {
    await db
      .insertInto('models_metadata')
      .values({
        ...m,
        created_at: now,
        updated_at: now,
      })
      .execute();
  }

  // 4. Seed Chats & Messages
  const chat1Id = 'chat-fastapi-docker';
  await db
    .insertInto('chats')
    .values({
      id: chat1Id,
      user_id: demoUserId,
      title: 'FastAPI and Docker Architecture',
      is_pinned: 1,
      connection_id: connId,
      model_id: 'demo-fast',
      system_prompt: '',
      temperature: 0.7,
      max_tokens: 2048,
      created_at: now,
      updated_at: now,
    })
    .execute();

  await db
    .insertInto('messages')
    .values([
      {
        id: 'msg-1',
        chat_id: chat1Id,
        role: 'user',
        content:
          'Can you suggest a production-ready Docker Compose architecture for a Python microservice with performance metrics?',
        model_id: 'demo-fast',
        connection_id: connId,
        status: 'completed',
        images_json: '[]',
        sources_json: '[]',
        error_message: null,
        created_at: now,
      },
      {
        id: 'msg-2',
        chat_id: chat1Id,
        role: 'assistant',
        content: `### Architecture Overview

Here is a recommended Docker Compose setup for a high-performance Python microservice:

\`\`\`yaml
services:
  api:
    image: python:3.12-slim
    ports:
      - "8000:8000"
    environment:
      - WORKERS=4
      - LOG_LEVEL=info
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/healthz"]
      interval: 10s
\`\`\`

#### Key Metrics & Performance

| Component | Target Latency | P99 SLA | Concurrency |
| :--- | :--- | :--- | :--- |
| **API Gateway** | < 5ms | 15ms | 10,000 req/s |
| **Cache Layer** | < 2ms | 5ms | 50,000 req/s |
| **Database** | < 12ms | 45ms | 2,500 req/s |

Let me know if you would like me to configure the monitoring pipeline.`,
        model_id: 'demo-fast',
        connection_id: connId,
        status: 'completed',
        images_json: '[]',
        sources_json: '[]',
        error_message: null,
        created_at: now,
      },
    ])
    .execute();

  const chat2Id = 'chat-quicksort';
  await db
    .insertInto('chats')
    .values({
      id: chat2Id,
      user_id: demoUserId,
      title: 'QuickSort Algorithm Analysis',
      is_pinned: 0,
      connection_id: connId,
      model_id: 'demo-reasoner',
      system_prompt: '',
      temperature: 0.7,
      max_tokens: 2048,
      created_at: now,
      updated_at: now,
    })
    .execute();

  await db
    .insertInto('messages')
    .values([
      {
        id: 'msg-3',
        chat_id: chat2Id,
        role: 'user',
        content:
          'Provide a clean Python implementation of QuickSort and discuss its theoretical complexity.',
        model_id: 'demo-reasoner',
        connection_id: connId,
        status: 'completed',
        images_json: '[]',
        sources_json: '[]',
        error_message: null,
        created_at: now,
      },
      {
        id: 'msg-4',
        chat_id: chat2Id,
        role: 'assistant',
        content: `Here is a clean implementation of the QuickSort algorithm with step-by-step partition logic:

\`\`\`python
def quicksort(arr: list[int]) -> list[int]:
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)

# Example usage
numbers = [38, 27, 43, 3, 9, 82, 10]
sorted_numbers = quicksort(numbers)
print("Sorted:", sorted_numbers)
\`\`\`

The average time complexity is $\\mathcal{O}(n \\log n)$, with space complexity $\\mathcal{O}(\\log n)$.`,
        model_id: 'demo-reasoner',
        connection_id: connId,
        status: 'completed',
        images_json: '[]',
        sources_json: '[]',
        error_message: null,
        created_at: now,
      },
    ])
    .execute();

  const chat3Id = 'chat-meeting';
  await db
    .insertInto('chats')
    .values({
      id: chat3Id,
      user_id: demoUserId,
      title: 'Q4 Product Roadmap & Action Items',
      is_pinned: 0,
      connection_id: connId,
      model_id: 'demo-fast',
      system_prompt: '',
      temperature: 0.7,
      max_tokens: 2048,
      created_at: now,
      updated_at: now,
    })
    .execute();

  // 5. Seed Skills
  await db
    .insertInto('skills')
    .values([
      {
        id: 'skill-1',
        name: 'Code Reviewer',
        slug: 'code-reviewer',
        description: 'Reviews code for security, efficiency, and clarity',
        content:
          'You are an expert staff software engineer. Review all submitted code for security, memory efficiency, and idiomatic design.',
        enabled: 1,
        shared: 1,
        owner_user_id: demoUserId,
        token_estimate: 32,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'skill-2',
        name: 'Docstring Generator',
        slug: 'docstring-generator',
        description: 'Generates Google-style Python docstrings',
        content:
          'Generate comprehensive docstrings including Args, Returns, and Raises sections in Google format.',
        enabled: 1,
        shared: 0,
        owner_user_id: demoUserId,
        token_estimate: 25,
        created_at: now,
        updated_at: now,
      },
    ])
    .execute();

  // 6. Seed Prompts
  await db
    .insertInto('prompts')
    .values([
      {
        id: 'prompt-1',
        user_id: demoUserId,
        title: 'Explain Time Complexity',
        command: 'complexity',
        content:
          'Analyze the Big-O time and space complexity of the following code snippet in detail:',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'prompt-2',
        user_id: demoUserId,
        title: 'Generate Unit Tests',
        command: 'testgen',
        content:
          'Write comprehensive unit test cases covering happy paths and edge cases for the following function:',
        created_at: now,
        updated_at: now,
      },
    ])
    .execute();

  // 7. Seed Knowledge Base
  await db
    .insertInto('knowledge_bases')
    .values({
      id: 'kb-1',
      name: 'Engineering Architecture Docs',
      description:
        'Core microservice guidelines, REST API conventions, and database standards',
      system_prompt: 'Reference standard architectural patterns and REST guidelines.',
      created_at: now,
      updated_at: now,
    })
    .execute();

  await setSetting(db, 'branding', {
    siteName: 'VOLQ AI',
    tagline: 'Modern, Private, High-Performance AI Workspace',
    customLogoUrl: null,
    customFaviconUrl: null,
  });

  await setSetting(db, 'welcome', {
    enabled: true,
    headline: 'Intelligence at your command.',
    description:
      'Experience lightning-fast local and cloud model inference with privacy-first architecture, rich formatting, and side-by-side comparison.',
    actionText: 'Get Started',
    showSignInButton: true,
    themeBackdrops: {
      obsidian: 0.85,
      amoled: 0.95,
      frost: 0.7,
    },
  });

  console.log('✅ Demo database successfully seeded with zero personal data.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error seeding demo data:', err);
  process.exit(1);
});
