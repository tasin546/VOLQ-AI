import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Mail, RefreshCw, Send } from 'lucide-react';
import { BrandMark } from '../components/brand/BrandMark';
import { BackdropLayout } from '../components/layout/BackdropLayout';
import { Button } from '../components/ui/Primitives';
import { apiFetch } from '../lib/api';
import { useUiStore } from '../stores/uiStore';

export const CheckInboxPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';
  const pushToast = useUiStore((s) => s.pushToast);

  const [cooldown, setCooldown] = useState(60);
  const [sending, setSending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (!email || cooldown > 0 || sending) return;
    setSending(true);
    setResendSuccess(false);
    try {
      await apiFetch('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setResendSuccess(true);
      setCooldown(60);
      pushToast('Verification link resent to your email');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to resend email', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <BackdropLayout variant="auth">
      <div className="min-h-dvh w-full flex items-center justify-center p-4">
        <div className="w-full max-w-[440px] p-6 md:p-8 rounded-[var(--radius-xl)] bg-[var(--surface-raised)] border border-[var(--border-strong)] shadow-[var(--shadow)] text-center space-y-6">
          <div className="flex justify-center">
            <BrandMark size={44} />
          </div>

        <div className="w-14 h-14 mx-auto rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)]">
          <Mail className="w-7 h-7" />
        </div>

        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Check your inbox</h1>
          <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
            We sent a verification link to{' '}
            <strong className="text-[var(--text)] font-semibold break-all">
              {email || 'your email address'}
            </strong>
            . Please click the link to confirm your account and sign in.
          </p>
        </div>

        {resendSuccess && (
          <div className="p-3 rounded-[var(--radius-md)] bg-[var(--status-success-soft)] border border-[var(--status-success)]/30 text-xs text-[var(--text)] flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[var(--status-success)] shrink-0" />
            <span>New verification email sent!</span>
          </div>
        )}

        <div className="space-y-3 pt-2">
          <Button
            variant="secondary"
            onClick={() => void handleResend()}
            disabled={cooldown > 0 || sending || !email}
            className="w-full text-xs h-10"
          >
            {sending ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" />
                Sending...
              </>
            ) : cooldown > 0 ? (
              <>
                <Send className="w-3.5 h-3.5 mr-2 opacity-50" />
                Resend in {cooldown}s
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5 mr-2" />
                Resend verification email
              </>
            )}
          </Button>

          <Link
            to="/auth"
            className="inline-flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors py-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
      </div>
    </BackdropLayout>
  );
};
