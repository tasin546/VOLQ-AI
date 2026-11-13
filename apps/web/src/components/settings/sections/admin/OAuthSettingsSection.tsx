import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  FlaskConical,
  Play,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { OAuthProviderMark } from '../../../oauth/ProviderMarks';
import { Button, ConfirmDialog, DialogModal, Input, Select, Switch } from '../../../ui/Primitives';
import { apiFetch } from '../../../../lib/api';
import type { AdminOAuthProvider, OAuthProviderId } from '../../../../lib/types';
import { useUiStore } from '../../../../stores/uiStore';
import type { AdminDirtyState } from '../../SettingsSearchIndex';

interface ProviderDraft {
  isEnabled: boolean;
  clientId: string;
  clientSecret: string;
  scopes: string;
  allowSignup: boolean;
  defaultRole: 'user' | 'admin';
  allowedDomainsText: string;
  linkByVerifiedEmail: boolean;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  jwksEndpoint: string;
  issuer: string;
}

interface TestInspectionData {
  provider: string;
  displayName: string;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  domainStatus: 'not_configured' | 'matched' | 'blocked';
  allowedDomains: string[];
}

function toDraft(p: AdminOAuthProvider): ProviderDraft {
  return {
    isEnabled: p.isEnabled,
    clientId: p.clientId,
    clientSecret: '',
    scopes: p.scopes,
    allowSignup: p.allowSignup,
    defaultRole: p.defaultRole,
    allowedDomainsText: p.allowedDomains.join(', '),
    linkByVerifiedEmail: p.linkByVerifiedEmail,
    authorizationEndpoint: p.endpointOverrides?.authorizationEndpoint ?? '',
    tokenEndpoint: p.endpointOverrides?.tokenEndpoint ?? '',
    userinfoEndpoint: p.endpointOverrides?.userinfoEndpoint ?? '',
    jwksEndpoint: p.endpointOverrides?.jwksEndpoint ?? '',
    issuer: p.endpointOverrides?.issuer ?? '',
  };
}

export const OAuthSettingsSection: React.FC<{
  onDirtyStateChange?: (state: AdminDirtyState | null) => void;
}> = ({ onDirtyStateChange }) => {
  const pushToast = useUiStore((s) => s.pushToast);

  const [providers, setProviders] = useState<AdminOAuthProvider[]>([]);
  const [selectedId, setSelectedId] = useState<OAuthProviderId | null>(null);
  const [draft, setDraft] = useState<ProviderDraft | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testLoginLoading, setTestLoginLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copiedUri, setCopiedUri] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [endpointsOpen, setEndpointsOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Dry-run Test Inspector state
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorData, setInspectorData] = useState<TestInspectionData | null>(null);
  const [inspectorError, setInspectorError] = useState<string | null>(null);
  const [inspectorRaw, setInspectorRaw] = useState<string>('');
  const [inspectorProvider, setInspectorProvider] = useState<string>('');
  const [showRawJson, setShowRawJson] = useState(false);

  const loadProviders = useCallback(async () => {
    const res = await apiFetch<{ providers: AdminOAuthProvider[] }>('/api/admin/oauth/providers');
    setProviders(res.providers);
    return res.providers;
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  // Inspect URL query params for test sign-in return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const testProvider = params.get('test_provider');
    const testStatus = params.get('test_status');
    const testDataStr = params.get('test_data');
    const testErrorStr = params.get('test_error');

    if (testProvider && (testStatus || testDataStr || testErrorStr)) {
      setInspectorProvider(testProvider);
      if (testStatus === 'success' && testDataStr) {
        try {
          const parsed = JSON.parse(testDataStr) as TestInspectionData;
          setInspectorData(parsed);
          setInspectorRaw(JSON.stringify(parsed, null, 2));
          setInspectorError(null);
          setInspectorOpen(true);
        } catch {
          setInspectorError('Unable to parse test profile payload');
          setInspectorOpen(true);
        }
      } else if (testStatus === 'error' || testErrorStr) {
        setInspectorError(testErrorStr || 'Sign-in test failed or was cancelled');
        setInspectorData(null);
        setInspectorRaw('');
        setInspectorOpen(true);
      }

      // Clean test query params without causing reload
      params.delete('test_provider');
      params.delete('test_status');
      params.delete('test_data');
      params.delete('test_error');
      const newQuery = params.toString();
      const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '');
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  const activeProvider = providers.find((p) => p.id === selectedId) ?? null;

  const openProvider = (p: AdminOAuthProvider) => {
    const d = toDraft(p);
    setSelectedId(p.id);
    setDraft(d);
    setInitialSnapshot(JSON.stringify(d));
    setTestResult(null);
    setGuideOpen(false);
    setEndpointsOpen(Boolean(p.id === 'oidc' || p.endpointOverrides?.authorizationEndpoint));
  };

  const currentSnapshot = draft ? JSON.stringify(draft) : '';
  const isDirty = Boolean(activeProvider && draft && initialSnapshot !== currentSnapshot);

  const handleSave = useCallback(async () => {
    if (!activeProvider || !draft) return;
    setSaving(true);
    try {
      const allowedDomains = draft.allowedDomainsText
        .split(/[\n,]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const endpointOverrides = {
        authorizationEndpoint: draft.authorizationEndpoint.trim() || undefined,
        tokenEndpoint: draft.tokenEndpoint.trim() || undefined,
        userinfoEndpoint: draft.userinfoEndpoint.trim() || undefined,
        jwksEndpoint: draft.jwksEndpoint.trim() || undefined,
        issuer: draft.issuer.trim() || undefined,
      };

      await apiFetch(`/api/admin/oauth/providers/${activeProvider.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          isEnabled: draft.isEnabled,
          clientId: draft.clientId.trim(),
          ...(draft.clientSecret.trim() ? { clientSecret: draft.clientSecret.trim() } : {}),
          scopes: draft.scopes.trim(),
          allowSignup: draft.allowSignup,
          defaultRole: draft.defaultRole,
          allowedDomains,
          linkByVerifiedEmail: draft.linkByVerifiedEmail,
          endpointOverrides,
        }),
      });
      const updatedList = await loadProviders();
      const updated = updatedList.find((p) => p.id === activeProvider.id);
      if (updated) {
        const nextDraft = toDraft(updated);
        setDraft(nextDraft);
        setInitialSnapshot(JSON.stringify(nextDraft));
      }
      pushToast(`${activeProvider.displayName} OAuth settings saved`);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save OAuth provider', 'error');
    } finally {
      setSaving(false);
    }
  }, [activeProvider, draft, loadProviders, pushToast]);

  const handleReset = useCallback(() => {
    if (!activeProvider) return;
    const d = toDraft(activeProvider);
    setDraft(d);
    setInitialSnapshot(JSON.stringify(d));
  }, [activeProvider]);

  useEffect(() => {
    if (!onDirtyStateChange) return;
    if (isDirty) {
      onDirtyStateChange({
        dirty: true,
        saving,
        label: `Unsaved ${activeProvider?.displayName ?? 'OAuth'} changes`,
        onSave: handleSave,
        onReset: handleReset,
      });
    } else {
      onDirtyStateChange(null);
    }
    return () => onDirtyStateChange(null);
  }, [isDirty, saving, activeProvider?.displayName, handleSave, handleReset, onDirtyStateChange]);

  const handleTestEndpoints = async () => {
    if (!activeProvider) return;
    if (isDirty) {
      await handleSave();
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch<{ ok: boolean; message?: string; error?: string }>(
        `/api/admin/oauth/providers/${activeProvider.id}/test`,
        { method: 'POST' }
      );
      setTestResult({
        ok: res.ok,
        message: res.ok
          ? res.message ?? 'Provider endpoint reachable'
          : res.error ?? 'Configuration test failed',
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Configuration test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleTestLogin = async () => {
    if (!activeProvider) return;
    if (isDirty) {
      await handleSave();
    }
    setTestLoginLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; authUrl: string }>(
        `/api/admin/oauth/providers/${activeProvider.id}/test-login`,
        { method: 'POST' }
      );
      if (res.ok && res.authUrl) {
        window.location.href = res.authUrl;
      } else {
        pushToast('Unable to start test sign-in flow', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to start test sign-in', 'error');
    } finally {
      setTestLoginLoading(false);
    }
  };

  const handleDeleteConfig = async () => {
    if (!activeProvider) return;
    await apiFetch(`/api/admin/oauth/providers/${activeProvider.id}`, { method: 'DELETE' });
    const updatedList = await loadProviders();
    const updated = updatedList.find((p) => p.id === activeProvider.id);
    if (updated) {
      const d = toDraft(updated);
      setDraft(d);
      setInitialSnapshot(JSON.stringify(d));
    }
    setTestResult(null);
    pushToast(`${activeProvider.displayName} credentials cleared`);
  };

  if (activeProvider && draft) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedId(null);
                setDraft(null);
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              OAuth Providers
            </Button>
            <span className="text-xs text-[var(--text-muted)]">/</span>
            <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text)]">
              <OAuthProviderMark provider={activeProvider.iconKey} className="w-4 h-4" />
              {activeProvider.displayName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={testing || !activeProvider.hasClientSecret}
              onClick={() => void handleTestEndpoints()}
              title="Test if authorization and token endpoints are reachable"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              {testing ? 'Testing...' : 'Test discovery'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={testLoginLoading || !activeProvider.hasClientSecret}
              onClick={() => void handleTestLogin()}
              title="Perform a dry-run sign in to inspect user attributes without logging in"
            >
              <Play className="w-3.5 h-3.5 text-[var(--accent)]" />
              {testLoginLoading ? 'Starting...' : 'Test sign-in (dry run)'}
            </Button>
            {activeProvider.hasClientSecret && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmRemove(true)}
                className="text-[var(--status-error)] hover:bg-[var(--status-error-soft)]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove credentials
              </Button>
            )}
          </div>
        </div>

        {testResult && (
          <div
            className={`p-3 rounded-[var(--radius-md)] border text-xs flex items-start gap-2 ${
              testResult.ok
                ? 'border-[var(--status-success)]/35 bg-[var(--status-success-soft)] text-[var(--status-success)]'
                : 'border-[var(--status-error)]/35 bg-[var(--status-error-soft)] text-[var(--status-error)]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{testResult.message}</span>
          </div>
        )}

        {/* Redirect URI */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2">
          <div className="text-xs font-medium text-[var(--text-2)]">
            Authorized Redirect URI (copy into {activeProvider.displayName} console)
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-xs font-mono text-[var(--text)] truncate">
              {activeProvider.redirectUri}
            </code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(activeProvider.redirectUri);
                setCopiedUri(true);
                setTimeout(() => setCopiedUri(false), 1800);
              }}
            >
              {copiedUri ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedUri ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        {/* Credentials & Policy */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <label htmlFor="oauth-enabled" className="text-sm font-medium text-[var(--text)] block">
                Enable {activeProvider.displayName} sign-in
              </label>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Shows &ldquo;Continue with {activeProvider.displayName}&rdquo; on the sign-in page.
              </p>
            </div>
            <Switch
              id="oauth-enabled"
              checked={draft.isEnabled}
              onCheckedChange={(val) => setDraft((p) => (p ? { ...p, isEnabled: val } : p))}
            />
          </div>

          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="oauth-client-id" className="block text-xs text-[var(--text-2)] mb-1">
                Client ID
              </label>
              <Input
                id="oauth-client-id"
                value={draft.clientId}
                onChange={(e) => setDraft((p) => (p ? { ...p, clientId: e.target.value } : p))}
                placeholder={`${activeProvider.displayName} Client ID`}
                className="font-mono"
              />
            </div>

            <div>
              <label htmlFor="oauth-client-secret" className="block text-xs text-[var(--text-2)] mb-1">
                Client Secret (encrypted at rest)
              </label>
              <Input
                id="oauth-client-secret"
                type="password"
                value={draft.clientSecret}
                onChange={(e) => setDraft((p) => (p ? { ...p, clientSecret: e.target.value } : p))}
                placeholder={
                  activeProvider.hasClientSecret
                    ? '•••••••• (enter new secret to replace)'
                    : 'Paste Client Secret'
                }
                className="font-mono"
              />
            </div>
          </div>

          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="oauth-scopes" className="block text-xs text-[var(--text-2)] mb-1">
                OAuth scopes
              </label>
              <Input
                id="oauth-scopes"
                value={draft.scopes}
                onChange={(e) => setDraft((p) => (p ? { ...p, scopes: e.target.value } : p))}
                className="font-mono"
              />
            </div>
            <div>
              <label htmlFor="oauth-role" className="block text-xs text-[var(--text-2)] mb-1">
                Default role for new users
              </label>
              <Select
                id="oauth-role"
                value={draft.defaultRole}
                onChange={(e) =>
                  setDraft((p) =>
                    p ? { ...p, defaultRole: e.target.value as 'user' | 'admin' } : p
                  )
                }
              >
                <option value="user">Standard user</option>
                <option value="admin">Administrator</option>
              </Select>
            </div>
          </div>

          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <label htmlFor="oauth-signup" className="text-sm font-medium text-[var(--text)] block">
                Allow new sign-ups via {activeProvider.displayName}
              </label>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                When off, only previously registered or linked users can sign in.
              </p>
            </div>
            <Switch
              id="oauth-signup"
              checked={draft.allowSignup}
              onCheckedChange={(val) => setDraft((p) => (p ? { ...p, allowSignup: val } : p))}
            />
          </div>

          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <label htmlFor="oauth-link" className="text-sm font-medium text-[var(--text)] block">
                Link by verified email
              </label>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Automatically attach {activeProvider.displayName} to an existing account with the
                same verified email.
              </p>
            </div>
            <Switch
              id="oauth-link"
              checked={draft.linkByVerifiedEmail}
              onCheckedChange={(val) =>
                setDraft((p) => (p ? { ...p, linkByVerifiedEmail: val } : p))
              }
            />
          </div>

          <div className="p-4 space-y-1.5">
            <label htmlFor="oauth-domains" className="block text-xs font-medium text-[var(--text-2)]">
              Allowed email domains (optional, comma-separated)
            </label>
            <Input
              id="oauth-domains"
              value={draft.allowedDomainsText}
              onChange={(e) =>
                setDraft((p) => (p ? { ...p, allowedDomainsText: e.target.value } : p))
              }
              placeholder="acme.com, example.org (leave blank for any domain)"
              className="font-mono"
            />
          </div>
        </div>

        {/* Custom Endpoints & OIDC Overrides */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <button
            type="button"
            onClick={() => setEndpointsOpen((v) => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-xs font-medium text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            <span>Custom Endpoints & Discovery {activeProvider.id === 'oidc' ? '(Required for OIDC)' : '(Optional)'}</span>
            {endpointsOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {endpointsOpen && (
            <div className="p-4 border-t border-[var(--border)] space-y-3">
              <p className="text-xs text-[var(--text-muted)]">
                Override the default authorization and token endpoints for single-tenant enterprise setups or generic OIDC providers.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-2)] mb-1">
                    Authorization Endpoint URL
                  </label>
                  <Input
                    value={draft.authorizationEndpoint}
                    onChange={(e) => setDraft((p) => (p ? { ...p, authorizationEndpoint: e.target.value } : p))}
                    placeholder="https://auth.example.com/oauth2/authorize"
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-2)] mb-1">
                    Token Endpoint URL
                  </label>
                  <Input
                    value={draft.tokenEndpoint}
                    onChange={(e) => setDraft((p) => (p ? { ...p, tokenEndpoint: e.target.value } : p))}
                    placeholder="https://auth.example.com/oauth2/token"
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-2)] mb-1">
                    Userinfo Endpoint URL
                  </label>
                  <Input
                    value={draft.userinfoEndpoint}
                    onChange={(e) => setDraft((p) => (p ? { ...p, userinfoEndpoint: e.target.value } : p))}
                    placeholder="https://auth.example.com/oauth2/userinfo"
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-2)] mb-1">
                    JWKS Certs Endpoint URL (Optional)
                  </label>
                  <Input
                    value={draft.jwksEndpoint}
                    onChange={(e) => setDraft((p) => (p ? { ...p, jwksEndpoint: e.target.value } : p))}
                    placeholder="https://auth.example.com/.well-known/jwks.json"
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Setup Guide */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <button
            type="button"
            onClick={() => setGuideOpen((v) => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-xs font-medium text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            <span>How to configure {activeProvider.displayName}</span>
            {guideOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {guideOpen && (
            <ol className="px-4 pb-4 pt-1 space-y-1.5 list-decimal list-inside text-xs text-[var(--text-2)]">
              {activeProvider.setupSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
        </div>

        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title={`Remove ${activeProvider.displayName} OAuth credentials?`}
          description={`Disable ${activeProvider.displayName} login and delete saved Client ID and Client Secret? Existing user accounts remain untouched.`}
          confirmLabel="Remove credentials"
          onConfirm={async () => {
            setConfirmRemove(false);
            await handleDeleteConfig();
          }}
        />

        {/* Dry-run Test Inspector Modal */}
        <DialogModal
          open={inspectorOpen}
          onOpenChange={setInspectorOpen}
          title="OAuth Dry-Run Inspector"
          description="Live profile attributes returned by the OAuth provider. No user account or session was created."
          maxWidthClass="max-w-xl"
        >
          <div className="space-y-4 pt-2">
            {inspectorError ? (
              <div className="p-4 rounded-[var(--radius-md)] border border-[var(--status-error)]/30 bg-[var(--status-error-soft)] text-xs text-[var(--status-error)] flex items-start gap-3">
                <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm">Sign-in Test Failed</div>
                  <div className="mt-1">{inspectorError}</div>
                </div>
              </div>
            ) : inspectorData ? (
              <div className="space-y-3">
                <div className="p-3 rounded-[var(--radius-md)] border border-[var(--status-success)]/30 bg-[var(--status-success-soft)] text-xs text-[var(--status-success)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    <span className="font-medium">Authentication Handshake Successful</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--border)] text-[10px] uppercase font-mono tracking-wider text-[var(--text)]">
                    Dry Run
                  </span>
                </div>

                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] divide-y divide-[var(--border)] text-xs">
                  <div className="p-3 flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Provider</span>
                    <span className="font-medium text-[var(--text)] capitalize">{inspectorData.provider || inspectorProvider}</span>
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Provider User ID (sub)</span>
                    <code className="font-mono text-[var(--text)]">{inspectorData.providerUserId || 'None'}</code>
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Display Name</span>
                    <span className="font-medium text-[var(--text)]">{inspectorData.displayName || 'None'}</span>
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Email</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[var(--text)]">{inspectorData.email || 'None'}</span>
                      {inspectorData.email && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                            inspectorData.emailVerified
                              ? 'bg-[var(--status-success-soft)] border-[var(--status-success)]/30 text-[var(--status-success)]'
                              : 'bg-[var(--status-warning-soft)] border-[var(--status-warning)]/30 text-[var(--status-warning)]'
                          }`}
                        >
                          {inspectorData.emailVerified ? 'Verified' : 'Unverified'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Domain Policy Check</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                        inspectorData.domainStatus === 'matched'
                          ? 'bg-[var(--status-success-soft)] border-[var(--status-success)]/30 text-[var(--status-success)]'
                          : inspectorData.domainStatus === 'blocked'
                            ? 'bg-[var(--status-error-soft)] border-[var(--status-error)]/30 text-[var(--status-error)]'
                            : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)]'
                      }`}
                    >
                      {inspectorData.domainStatus === 'matched'
                        ? 'Permitted (Domain allowed)'
                        : inspectorData.domainStatus === 'blocked'
                          ? 'Blocked (Domain not in whitelist)'
                          : 'Open (No domain restriction)'}
                    </span>
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowRawJson((prev) => !prev)}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>{showRawJson ? 'Hide' : 'Show'} raw profile payload</span>
                  </button>
                  {showRawJson && (
                    <pre className="mt-2 p-3 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-[11px] font-mono text-[var(--text)] overflow-x-auto max-h-48">
                      {inspectorRaw}
                    </pre>
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <Button onClick={() => setInspectorOpen(false)}>Close Inspector</Button>
            </div>
          </div>
        </DialogModal>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-setting-row="admin-oauth-cards">
      <p className="text-xs text-[var(--text-muted)]">
        Configure single sign-on providers with PKCE. Client secrets are encrypted at rest and never
        returned to browsers.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => openProvider(p)}
            className="text-left rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] p-4 space-y-3 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-center">
                  <OAuthProviderMark provider={p.iconKey} className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--text)]">{p.displayName}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {p.hasClientSecret ? 'Credentials saved' : 'Not configured'}
                  </div>
                </div>
              </div>

              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                  p.isEnabled
                    ? 'bg-[var(--status-success-soft)] border-[var(--status-success)]/30 text-[var(--status-success)]'
                    : 'bg-[var(--surface-raised)] border-[var(--border)] text-[var(--text-muted)]'
                }`}
              >
                {p.isEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--text-2)]">
              <span className="truncate font-mono">{p.clientId || 'Click to configure'}</span>
              <ChevronRight className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
            </div>
          </button>
        ))}
      </div>

      {/* Dry-run Test Inspector Modal */}
      <DialogModal
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        title="OAuth Dry-Run Inspector"
        description="Live profile attributes returned by the OAuth provider. No user account or session was created."
        maxWidthClass="max-w-xl"
      >
        <div className="space-y-4 pt-2">
          {inspectorError ? (
            <div className="p-4 rounded-[var(--radius-md)] border border-[var(--status-error)]/30 bg-[var(--status-error-soft)] text-xs text-[var(--status-error)] flex items-start gap-3">
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sm">Sign-in Test Failed</div>
                <div className="mt-1">{inspectorError}</div>
              </div>
            </div>
          ) : inspectorData ? (
            <div className="space-y-3">
              <div className="p-3 rounded-[var(--radius-md)] border border-[var(--status-success)]/30 bg-[var(--status-success-soft)] text-xs text-[var(--status-success)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="font-medium">Authentication Handshake Successful</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--border)] text-[10px] uppercase font-mono tracking-wider text-[var(--text)]">
                  Dry Run
                </span>
              </div>

              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] divide-y divide-[var(--border)] text-xs">
                <div className="p-3 flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Provider</span>
                  <span className="font-medium text-[var(--text)] capitalize">{inspectorData.provider || inspectorProvider}</span>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Provider User ID (sub)</span>
                  <code className="font-mono text-[var(--text)]">{inspectorData.providerUserId || 'None'}</code>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Display Name</span>
                  <span className="font-medium text-[var(--text)]">{inspectorData.displayName || 'None'}</span>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Email</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[var(--text)]">{inspectorData.email || 'None'}</span>
                    {inspectorData.email && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                          inspectorData.emailVerified
                            ? 'bg-[var(--status-success-soft)] border-[var(--status-success)]/30 text-[var(--status-success)]'
                            : 'bg-[var(--status-warning-soft)] border-[var(--status-warning)]/30 text-[var(--status-warning)]'
                        }`}
                      >
                        {inspectorData.emailVerified ? 'Verified' : 'Unverified'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Domain Policy Check</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                      inspectorData.domainStatus === 'matched'
                        ? 'bg-[var(--status-success-soft)] border-[var(--status-success)]/30 text-[var(--status-success)]'
                        : inspectorData.domainStatus === 'blocked'
                          ? 'bg-[var(--status-error-soft)] border-[var(--status-error)]/30 text-[var(--status-error)]'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)]'
                    }`}
                  >
                    {inspectorData.domainStatus === 'matched'
                      ? 'Permitted (Domain allowed)'
                      : inspectorData.domainStatus === 'blocked'
                        ? 'Blocked (Domain not in whitelist)'
                        : 'Open (No domain restriction)'}
                  </span>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowRawJson((prev) => !prev)}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] inline-flex items-center gap-1.5 transition-colors"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>{showRawJson ? 'Hide' : 'Show'} raw profile payload</span>
                </button>
                {showRawJson && (
                  <pre className="mt-2 p-3 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-[11px] font-mono text-[var(--text)] overflow-x-auto max-h-48">
                    {inspectorRaw}
                  </pre>
                )}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button onClick={() => setInspectorOpen(false)}>Close Inspector</Button>
          </div>
        </div>
      </DialogModal>
    </div>
  );
};
