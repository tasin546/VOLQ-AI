import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, KeyRound, Mail, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { Badge, Button, Input, Switch } from '../../../ui/Primitives';
import { apiFetch } from '../../../../lib/api';
import { useAuthStore } from '../../../../stores/authStore';
import { useUiStore } from '../../../../stores/uiStore';
import type { AdminDirtyState } from '../../SettingsSearchIndex';

interface EmailSettingsResponse {
  configured: boolean;
  isEnvKey: boolean;
  hasKey: boolean;
  fromAddress: string;
  replyTo: string | null;
  requireVerification: boolean;
  tokenExpiryHours: number;
  resendCooldownSeconds: number;
  lastTestSucceededAt: string | null;
  canEnableVerification: boolean;
}

export const EmailSettingsSection: React.FC<{
  onDirtyStateChange?: (state: AdminDirtyState | null) => void;
}> = ({ onDirtyStateChange }) => {
  const user = useAuthStore((s) => s.user);
  const pushToast = useUiStore((s) => s.pushToast);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Stored state
  const [serverState, setServerState] = useState<EmailSettingsResponse | null>(null);

  // Form state
  const [apiKey, setApiKey] = useState('');
  const [fromAddress, setFromAddress] = useState('VOLQ AI <onboarding@resend.dev>');
  const [replyTo, setReplyTo] = useState('');
  const [requireVerification, setRequireVerification] = useState(false);
  const [tokenExpiryHours, setTokenExpiryHours] = useState(24);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(60);
  const [testRecipient, setTestRecipient] = useState(user?.email || '');

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<EmailSettingsResponse>('/api/admin/email');
      setServerState(data);
      setFromAddress(data.fromAddress || 'VOLQ AI <onboarding@resend.dev>');
      setReplyTo(data.replyTo || '');
      setRequireVerification(data.requireVerification);
      setTokenExpiryHours(data.tokenExpiryHours || 24);
      setResendCooldownSeconds(data.resendCooldownSeconds || 60);
      setApiKey('');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to load email settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const isDirty = Boolean(
    serverState &&
      (apiKey.trim().length > 0 ||
        fromAddress !== serverState.fromAddress ||
        replyTo !== (serverState.replyTo || '') ||
        requireVerification !== serverState.requireVerification ||
        tokenExpiryHours !== serverState.tokenExpiryHours ||
        resendCooldownSeconds !== serverState.resendCooldownSeconds)
  );

  const handleSave = useCallback(async () => {
    if (!serverState) return;
    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        fromAddress: fromAddress.trim(),
        replyTo: replyTo.trim().length > 0 ? replyTo.trim() : null,
        requireVerification,
        tokenExpiryHours,
        resendCooldownSeconds,
      };
      if (apiKey.trim().length > 0) {
        payload.apiKey = apiKey.trim();
      }

      await apiFetch('/api/admin/email', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      pushToast('Email settings saved');
      await loadSettings();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save email settings', 'error');
    } finally {
      setSaving(false);
    }
  }, [serverState, fromAddress, replyTo, requireVerification, tokenExpiryHours, resendCooldownSeconds, apiKey, pushToast, loadSettings]);

  const handleReset = useCallback(() => {
    if (!serverState) return;
    setFromAddress(serverState.fromAddress || 'VOLQ AI <onboarding@resend.dev>');
    setReplyTo(serverState.replyTo || '');
    setRequireVerification(serverState.requireVerification);
    setTokenExpiryHours(serverState.tokenExpiryHours || 24);
    setResendCooldownSeconds(serverState.resendCooldownSeconds || 60);
    setApiKey('');
  }, [serverState]);

  useEffect(() => {
    onDirtyStateChange?.(
      isDirty
        ? {
            dirty: true,
            saving,
            label: 'Save Email Settings',
            onSave: handleSave,
            onReset: handleReset,
          }
        : null
    );
  }, [isDirty, saving, handleSave, handleReset, onDirtyStateChange]);

  const handleSendTest = async () => {
    const trimmed = testRecipient.trim().toLowerCase();
    if (!trimmed) {
      pushToast('Please enter a recipient email address', 'error');
      return;
    }
    setTesting(true);
    setTestSuccess(null);
    setTestError(null);
    try {
      const res = await apiFetch<{ success: boolean; sentAt: string }>('/api/admin/email/test', {
        method: 'POST',
        body: JSON.stringify({ recipientEmail: trimmed }),
      });
      setTestSuccess(`Test email sent successfully at ${new Date(res.sentAt).toLocaleTimeString()}`);
      pushToast('Test email delivered via Resend');
      await loadSettings();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send test email';
      setTestError(msg);
      pushToast(msg, 'error');
    } finally {
      setTesting(false);
    }
  };

  if (loading && !serverState) {
    return (
      <div className="flex items-center justify-center p-12 text-[var(--text-muted)] text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading email settings...
      </div>
    );
  }

  const canToggleVerification = Boolean(serverState?.canEnableVerification);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--text)] flex items-center gap-2">
          <Mail className="w-5 h-5 text-[var(--accent)]" />
          Email & Verification
        </h2>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Configure Resend to send transactional account verification links and notifications.
        </p>
      </div>

      {/* Card 1: Credentials */}
      <div className="p-4 md:p-5 rounded-[var(--radius-lg)] bg-[var(--surface-raised)] border border-[var(--border)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-[var(--text)] flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[var(--text-subtle)]" />
            Resend API Key
          </div>
          {serverState?.isEnvKey ? (
            <Badge tone="default">Set via RESEND_API_KEY env</Badge>
          ) : serverState?.hasKey ? (
            <Badge tone="default">Key Configured</Badge>
          ) : (
            <Badge tone="warning">Key Missing</Badge>
          )}
        </div>

        <div>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              serverState?.hasKey
                ? '•••••••••••••••••••••••• (Leave blank to keep current key)'
                : 're_123456789...'
            }
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-[var(--text-subtle)] mt-1.5">
            Get your API key from the Resend Dashboard (resend.com/api-keys).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-[var(--text)] mb-1.5">
              Sender From Address
            </label>
            <Input
              type="text"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="VOLQ AI <onboarding@resend.dev>"
              className="text-xs"
            />
            <p className="text-[11px] text-[var(--text-subtle)] mt-1">
              Use <code className="text-[var(--text-muted)]">onboarding@resend.dev</code> for testing or your verified domain.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text)] mb-1.5">
              Reply-To Address (Optional)
            </label>
            <Input
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="support@yourdomain.com"
              className="text-xs"
            />
            <p className="text-[11px] text-[var(--text-subtle)] mt-1">
              Where user replies should be directed.
            </p>
          </div>
        </div>
      </div>

      {/* Card 2: Lockout Guard & Policy */}
      <div className="p-4 md:p-5 rounded-[var(--radius-lg)] bg-[var(--surface-raised)] border border-[var(--border)] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-[var(--text)]">Require Email Verification</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">
              New accounts must verify their email address before they can sign in.
            </div>
          </div>
          <Switch
            checked={requireVerification}
            onCheckedChange={(checked) => {
              if (checked && !canToggleVerification) {
                pushToast('Send a successful test email before enabling verification.', 'error');
                return;
              }
              setRequireVerification(checked);
            }}
            disabled={!canToggleVerification && !requireVerification}
          />
        </div>

        {!canToggleVerification && (
          <div className="p-3 rounded-[var(--radius-md)] bg-[var(--status-warning-soft)] border border-[var(--status-warning)]/30 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-[var(--status-warning)] shrink-0 mt-0.5" />
            <div className="text-xs text-[var(--text)]">
              <span className="font-semibold text-[var(--status-warning)]">Anti-Lockout Protection:</span> You must send a test email successfully below before you can enforce verification on new signups.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-[var(--border)]">
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-[var(--text)] mb-1.5">
              <span>Token Expiration</span>
              <span className="font-mono text-[var(--accent)]">{tokenExpiryHours} hours</span>
            </div>
            <input
              type="range"
              min={1}
              max={72}
              value={tokenExpiryHours}
              onChange={(e) => setTokenExpiryHours(Number(e.target.value))}
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-subtle)] mt-1">
              <span>1h</span>
              <span>24h (recommended)</span>
              <span>72h</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-medium text-[var(--text)] mb-1.5">
              <span>Resend Cooldown</span>
              <span className="font-mono text-[var(--accent)]">{resendCooldownSeconds} seconds</span>
            </div>
            <input
              type="range"
              min={15}
              max={300}
              step={15}
              value={resendCooldownSeconds}
              onChange={(e) => setResendCooldownSeconds(Number(e.target.value))}
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-subtle)] mt-1">
              <span>15s</span>
              <span>60s (recommended)</span>
              <span>300s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card 3: Test Email */}
      <div className="p-4 md:p-5 rounded-[var(--radius-lg)] bg-[var(--surface-raised)] border border-[var(--border)] space-y-4">
        <div>
          <div className="text-sm font-medium text-[var(--text)] flex items-center gap-2">
            <Send className="w-4 h-4 text-[var(--text-subtle)]" />
            Send Test Verification Email
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            Send a sample email to verify credentials, DNS SPF/DKIM records, and deliverability.
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <Input
            type="email"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 text-xs"
          />
          <Button
            variant="secondary"
            onClick={() => void handleSendTest()}
            disabled={testing || (!serverState?.hasKey && apiKey.trim().length === 0)}
            className="shrink-0 text-xs"
          >
            {testing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5 mr-1.5" />
                Send Test Email
              </>
            )}
          </Button>
        </div>

        {testSuccess && (
          <div className="p-3 rounded-[var(--radius-md)] bg-[var(--status-success-soft)] border border-[var(--status-success)]/30 flex items-center gap-2 text-xs text-[var(--text)]">
            <CheckCircle2 className="w-4 h-4 text-[var(--status-success)] shrink-0" />
            <span>{testSuccess}</span>
          </div>
        )}

        {testError && (
          <div className="p-3 rounded-[var(--radius-md)] bg-[var(--status-error-soft)] border border-[var(--status-error)]/30 flex items-center gap-2 text-xs text-[var(--status-error)]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{testError}</span>
          </div>
        )}

        {serverState?.lastTestSucceededAt && !testSuccess && (
          <div className="text-[11px] text-[var(--text-subtle)] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Last test succeeded at: {new Date(serverState.lastTestSucceededAt).toLocaleString()}
          </div>
        )}
      </div>

      {/* Save Button Bar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {isDirty && (
          <Button variant="ghost" onClick={handleReset} disabled={saving} className="text-xs">
            Cancel
          </Button>
        )}
        <Button
          variant="primary"
          onClick={() => void handleSave()}
          disabled={!isDirty || saving}
          className="text-xs"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};
