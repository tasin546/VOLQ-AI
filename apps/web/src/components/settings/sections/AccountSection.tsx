import React, { useRef, useState } from 'react';
import { Camera, CheckCircle2, KeyRound, Save, Trash2 } from 'lucide-react';
import { OAuthProviderMark } from '../../oauth/ProviderMarks';
import { AvatarCropDialog } from '../AvatarCropDialog';
import { UserAvatar } from '../../ui/UserAvatar';
import { Badge, Button, ConfirmDialog, Input } from '../../ui/Primitives';
import { getCsrfToken } from '../../../lib/api';
import { useAuthStore } from '../../../stores/authStore';
import { useUiStore } from '../../../stores/uiStore';

const ALLOWED_AVATAR_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export const AccountSection: React.FC = () => {
  const { user, updateProfile, setAvatar } = useAuthStore();
  const pushToast = useUiStore((s) => s.pushToast);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const openCropForFile = (file: File) => {
    if (!ALLOWED_AVATAR_TYPES.has(file.type) && !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
      pushToast('Please choose a PNG, JPG, WEBP, or GIF image.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      pushToast('Profile pictures must be 5 MB or smaller.', 'error');
      return;
    }
    const url = URL.createObjectURL(file);
    setCropSrc(url);
  };

  const handleRemoveAvatar = async () => {
    try {
      const csrf = getCsrfToken();
      const res = await fetch('/api/me/avatar', {
        method: 'DELETE',
        headers: csrf ? { 'X-CSRF-Token': csrf } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to remove profile picture');
      }
      setAvatar(false, null);
      pushToast('Profile picture removed');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to remove photo', 'error');
    }
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      await updateProfile({ displayName: displayName.trim() });
      pushToast('Account name updated');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to update account', 'error');
    } finally {
      setSaving(false);
    }
  };

  const providers = user.authMethods?.providers ?? [];
  const hasPassword = user.authMethods?.hasPassword ?? true;

  return (
    <div className="space-y-6">
      {/* Profile Picture */}
      <section
        data-setting-row="account-avatar"
        className={`rounded-[var(--radius-lg)] border p-4 sm:p-5 transition-colors ${
          dragOver
            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
            : 'border-[var(--border)] bg-[var(--surface)]'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) openCropForFile(f);
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <UserAvatar user={user} size="lg" />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-[var(--text)]">Profile picture</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                PNG, JPG, WEBP, or GIF up to 5 MB. Drag &amp; drop or choose an image.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) openCropForFile(f);
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="w-3.5 h-3.5" />
              {user.hasAvatar ? 'Change photo' : 'Upload photo'}
            </Button>
            {user.hasAvatar && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmRemoveOpen(true)}
                className="text-[var(--status-error)] hover:bg-[var(--status-error-soft)]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Display Name & Identity */}
      <form
        data-setting-row="account-name"
        onSubmit={handleSaveName}
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]"
      >
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <label htmlFor="account-display-name" className="text-sm font-medium text-[var(--text)] block">
              Display name
            </label>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Shown alongside your messages and in the sidebar.
            </p>
          </div>
          <div className="w-full sm:w-72 flex items-center gap-2">
            <Input
              id="account-display-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <Button type="submit" variant="primary" size="sm" disabled={saving}>
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving' : 'Save'}
            </Button>
          </div>
        </div>

        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-[var(--text)]">Email address</div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Used for sign-in and OAuth verified-email matching.
            </p>
          </div>
          <div className="text-sm text-[var(--text-2)] font-mono truncate">{user.email}</div>
        </div>

        <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[var(--text)]">Workspace role</div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Admins can configure connections, models, OAuth, and limits.
            </p>
          </div>
          <Badge>{user.role}</Badge>
        </div>
      </form>

      {/* Linked Sign-In Methods */}
      <section
        data-setting-row="account-methods"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 space-y-3"
      >
        <div>
          <h3 className="text-sm font-medium text-[var(--text)]">Linked sign-in methods</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Authentication providers connected to your VOLQ AI account.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)]">
            <div className="flex items-center gap-2.5">
              <KeyRound className="w-4 h-4 text-[var(--text-2)]" />
              <div>
                <div className="text-sm font-medium text-[var(--text)]">Email &amp; password</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {hasPassword ? 'Local password enabled' : 'OAuth-only account'}
                </div>
              </div>
            </div>
            {hasPassword ? (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--status-success)]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Active
              </span>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">Not set</span>
            )}
          </div>

          {providers.map((linked) => (
            <div
              key={`${linked.provider}:${linked.createdAt}`}
              className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <OAuthProviderMark provider={linked.provider} className="w-4 h-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--text)] capitalize">
                    {linked.provider}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] truncate">
                    {linked.email ?? 'Connected SSO account'}
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-xs text-[var(--status-success)] shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Linked
              </span>
            </div>
          ))}
        </div>
      </section>

      <AvatarCropDialog
        open={Boolean(cropSrc)}
        imageSrc={cropSrc}
        onClose={() => {
          if (cropSrc) URL.revokeObjectURL(cropSrc);
          setCropSrc(null);
        }}
        onUploaded={(res) => {
          setAvatar(res.hasAvatar, res.avatarVersion);
          if (cropSrc) URL.revokeObjectURL(cropSrc);
          setCropSrc(null);
          pushToast('Profile picture updated');
        }}
        onError={(msg) => pushToast(msg, 'error')}
      />

      <ConfirmDialog
        open={confirmRemoveOpen}
        onOpenChange={setConfirmRemoveOpen}
        title="Remove profile picture?"
        description="Your uploaded photo will be removed and replaced with your initials."
        confirmLabel="Remove photo"
        onConfirm={async () => {
          setConfirmRemoveOpen(false);
          await handleRemoveAvatar();
        }}
      />
    </div>
  );
};
