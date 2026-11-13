import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Database, FileText, Plus, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { Button, ConfirmDialog, Input, Select } from '../../../ui/Primitives';
import { apiFetch, getCsrfToken } from '../../../../lib/api';
import type {
  AdminConnection,
  KnowledgeBaseItem,
  KnowledgeConfig,
  KnowledgeFileItem,
} from '../../../../lib/types';
import { useUiStore } from '../../../../stores/uiStore';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const KnowledgeSettingsSection: React.FC = () => {
  const pushToast = useUiStore((s) => s.pushToast);

  const [bases, setBases] = useState<KnowledgeBaseItem[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [files, setFiles] = useState<KnowledgeFileItem[]>([]);
  const [retrievalMode, setRetrievalMode] = useState<'pgvector' | 'fts_postgres' | 'fts_sqlite'>(
    'fts_sqlite'
  );
  const [maxUploadMb, setMaxUploadMb] = useState(25);
  const [connections, setConnections] = useState<AdminConnection[]>([]);
  const [kbConfig, setKbConfig] = useState<KnowledgeConfig>({
    embeddingConnectionId: null,
    embeddingModelId: null,
    chunkSizeChars: 1200,
    chunkOverlapChars: 200,
    maxContextTokens: 2000,
    topK: 5,
  });

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [confirmDeleteKb, setConfirmDeleteKb] = useState<KnowledgeBaseItem | null>(null);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<KnowledgeFileItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBases = useCallback(async () => {
    const [kbRes, connsRes] = await Promise.all([
      apiFetch<{
        bases: KnowledgeBaseItem[];
        retrievalMode: 'pgvector' | 'fts_postgres' | 'fts_sqlite';
        config: KnowledgeConfig;
        maxUploadMb: number;
      }>('/api/admin/knowledge/bases'),
      apiFetch<{ connections: AdminConnection[] }>('/api/admin/connections'),
    ]);
    setBases(kbRes.bases);
    setRetrievalMode(kbRes.retrievalMode);
    setKbConfig(kbRes.config);
    setMaxUploadMb(kbRes.maxUploadMb);
    setConnections(connsRes.connections);

    setSelectedKbId((prev) => {
      if (prev && kbRes.bases.some((b) => b.id === prev)) return prev;
      return kbRes.bases[0]?.id ?? null;
    });
  }, []);

  const loadFiles = useCallback(async (kbId: string | null) => {
    if (!kbId) {
      setFiles([]);
      return;
    }
    const res = await apiFetch<{ files: KnowledgeFileItem[] }>(
      `/api/admin/knowledge/bases/${kbId}/files`
    );
    setFiles(res.files);
  }, []);

  useEffect(() => {
    void loadBases();
  }, [loadBases]);

  useEffect(() => {
    void loadFiles(selectedKbId);
  }, [selectedKbId, loadFiles]);

  const handleCreateBase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ base: KnowledgeBaseItem }>('/api/admin/knowledge/bases', {
        method: 'POST',
        body: JSON.stringify({ name: newName, description: newDesc, systemPrompt: newPrompt }),
      });
      setNewName('');
      setNewDesc('');
      setNewPrompt('');
      await loadBases();
      setSelectedKbId(res.base.id);
      pushToast('Knowledge base created');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to create knowledge base', 'error');
    }
  };

  const handleDeleteBase = async (id: string) => {
    await apiFetch(`/api/admin/knowledge/bases/${id}`, { method: 'DELETE' });
    await loadBases();
    pushToast('Knowledge base deleted');
  };

  const handleUploadFile = (file: File) => {
    if (!selectedKbId) return;
    const form = new FormData();
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/admin/knowledge/bases/${selectedKbId}/files`);
    xhr.withCredentials = true;
    const csrf = getCsrfToken();
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };

    xhr.onload = async () => {
      setUploadProgress(null);
      try {
        const parsed = JSON.parse(xhr.responseText) as { error?: string };
        if (xhr.status >= 200 && xhr.status < 300) {
          pushToast(`Uploaded ${file.name}`);
          await loadBases();
          await loadFiles(selectedKbId);
        } else {
          pushToast(parsed.error ?? 'Upload failed', 'error');
        }
      } catch {
        pushToast('Upload failed', 'error');
      }
    };

    xhr.onerror = () => {
      setUploadProgress(null);
      pushToast('Network error during upload', 'error');
    };

    setUploadProgress(0);
    xhr.send(form);
  };

  const handleSaveConfig = async () => {
    try {
      const res = await apiFetch<{
        config: KnowledgeConfig;
        retrievalMode: 'pgvector' | 'fts_postgres' | 'fts_sqlite';
      }>('/api/admin/knowledge/config', {
        method: 'PATCH',
        body: JSON.stringify(kbConfig),
      });
      setKbConfig(res.config);
      setRetrievalMode(res.retrievalMode);
      pushToast('Retrieval settings saved');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save config', 'error');
    }
  };

  const selectedKb = bases.find((b) => b.id === selectedKbId) ?? null;

  return (
    <div className="space-y-5" data-setting-row="admin-knowledge-bases">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">
          Admin-only document repositories injected into attached models.
        </p>
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text)]">
          <Database className="w-3.5 h-3.5" />
          {retrievalMode === 'pgvector'
            ? 'pgvector'
            : retrievalMode === 'fts_postgres'
              ? 'PostgreSQL FTS'
              : 'SQLite FTS5'}
        </span>
      </div>

      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <form onSubmit={handleCreateBase} className="space-y-3">
          <h3 className="text-sm font-medium text-[var(--text)]">Create knowledge base</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Product Docs"
            />
            <Input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <textarea
            rows={2}
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="Optional system prompt applied when this knowledge base is used..."
            className="w-full p-2.5 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-base sm:text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-strong)]"
          />
          <Button type="submit" variant="primary" size="sm">
            <Plus className="w-3.5 h-3.5" />
            Create knowledge base
          </Button>
        </form>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          {bases.length === 0 ? (
            <div className="p-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text-muted)] text-center">
              No knowledge bases yet.
            </div>
          ) : (
            bases.map((b) => {
              const active = b.id === selectedKbId;
              return (
                <div
                  key={b.id}
                  onClick={() => setSelectedKbId(b.id)}
                  className={`p-3.5 rounded-[var(--radius-lg)] border cursor-pointer transition-colors ${
                    active
                      ? 'bg-[var(--surface-active)] border-[var(--accent)]'
                      : 'bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate text-[var(--text)]">{b.name}</div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                        {b.fileCount} file(s) · {b.chunkCount} chunks
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete ${b.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteKb(b);
                      }}
                      className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--status-error)] hover:bg-[var(--status-error-soft)]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="lg:col-span-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 space-y-4">
          {!selectedKb ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">
              Select or create a knowledge base to upload files.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-[var(--text)]">{selectedKb.name}</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    PDF, TXT, MD, DOCX, DOC, CSV, JSON, HTML (max {maxUploadMb} MB)
                  </p>
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.md,.markdown,.docx,.doc,.csv,.json,.html,.htm"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadFile(f);
                      e.target.value = '';
                    }}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={uploadProgress !== null}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadProgress !== null ? `Uploading ${uploadProgress}%` : 'Upload file'}
                  </Button>
                </div>
              </div>

              {uploadProgress !== null && (
                <div className="w-full h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] transition-all duration-150"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}

              <div className="space-y-2">
                {files.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                    No files uploaded to this knowledge base yet.
                  </div>
                ) : (
                  files.map((f) => (
                    <div
                      key={f.id}
                      className="p-3 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-[var(--text-2)] mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate text-[var(--text)]">
                            {f.filename}
                          </div>
                          <div className="text-[11px] font-mono text-[var(--text-muted)]">
                            {formatBytes(f.sizeBytes)} · {f.chunkCount} chunks ·{' '}
                            <span
                              className={
                                f.status === 'failed'
                                  ? 'text-[var(--status-error)]'
                                  : f.status === 'ready'
                                    ? 'text-[var(--text)]'
                                    : 'text-[var(--status-warning)]'
                              }
                            >
                              {f.status}
                            </span>
                          </div>
                          {f.errorMessage && (
                            <div className="text-[11px] text-[var(--status-error)] mt-0.5">
                              {f.errorMessage}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label={`Reprocess ${f.filename}`}
                          onClick={async () => {
                            await apiFetch(`/api/admin/knowledge/files/${f.id}/reprocess`, {
                              method: 'POST',
                            });
                            await loadBases();
                            await loadFiles(selectedKb.id);
                            pushToast('Reprocessed file');
                          }}
                          className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${f.filename}`}
                          onClick={() => setConfirmDeleteFile(f)}
                          className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-2)] hover:text-[var(--status-error)] hover:bg-[var(--status-error-soft)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-[var(--text)]">
            Retrieval &amp; embedding settings
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Optional embedding model enables pgvector search on PostgreSQL.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[var(--text-2)] mb-1">Embedding connection</label>
            <Select
              value={kbConfig.embeddingConnectionId ?? ''}
              onChange={(e) =>
                setKbConfig((p) => ({
                  ...p,
                  embeddingConnectionId: e.target.value || null,
                }))
              }
            >
              <option value="">None (full-text search)</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-2)] mb-1">Embedding model ID</label>
            <Input
              value={kbConfig.embeddingModelId ?? ''}
              onChange={(e) =>
                setKbConfig((p) => ({ ...p, embeddingModelId: e.target.value || null }))
              }
              placeholder="nomic-embed-text"
              className="font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-2)] mb-1">Max context tokens</label>
            <Input
              type="number"
              min={200}
              max={16000}
              value={kbConfig.maxContextTokens}
              onChange={(e) =>
                setKbConfig((p) => ({
                  ...p,
                  maxContextTokens: Number(e.target.value) || 2000,
                }))
              }
            />
          </div>
        </div>

        <Button size="sm" variant="secondary" onClick={() => void handleSaveConfig()}>
          <Save className="w-3.5 h-3.5" />
          Save retrieval settings
        </Button>
      </section>

      <ConfirmDialog
        open={Boolean(confirmDeleteKb)}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteKb(null);
        }}
        title="Delete knowledge base"
        description={`Permanently delete knowledge base "${confirmDeleteKb?.name ?? ''}" and all uploaded files?`}
        confirmLabel="Delete knowledge base"
        onConfirm={async () => {
          if (!confirmDeleteKb) return;
          const id = confirmDeleteKb.id;
          setConfirmDeleteKb(null);
          await handleDeleteBase(id);
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteFile)}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteFile(null);
        }}
        title="Delete knowledge file"
        description={`Remove "${confirmDeleteFile?.filename ?? ''}" from "${selectedKb?.name ?? 'this knowledge base'}"?`}
        confirmLabel="Delete file"
        onConfirm={async () => {
          if (!confirmDeleteFile || !selectedKb) return;
          const fileId = confirmDeleteFile.id;
          setConfirmDeleteFile(null);
          await apiFetch(`/api/admin/knowledge/files/${fileId}`, { method: 'DELETE' });
          await loadBases();
          await loadFiles(selectedKb.id);
          pushToast('File deleted');
        }}
      />
    </div>
  );
};
