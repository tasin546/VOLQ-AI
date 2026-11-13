import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { BrandMark } from '../components/brand/BrandMark';
import { BackdropLayout } from '../components/layout/BackdropLayout';
import { Button } from '../components/ui/Primitives';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const pushToast = useUiStore((s) => s.pushToast);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  const [state, setState] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMessage('No verification token provided in URL.');
      return;
    }

    let isCancelled = false;

    const verify = async () => {
      try {
        await apiFetch<{ success: boolean }>('/api/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });

        if (isCancelled) return;
        setState('success');
        pushToast('Email verified successfully!');
        await bootstrap();
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 1800);
      } catch (err) {
        if (isCancelled) return;
        setState('error');
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Verification link is invalid or has expired.'
        );
      }
    };

    void verify();

    return () => {
      isCancelled = true;
    };
  }, [token, navigate, pushToast, bootstrap]);

  return (
    <BackdropLayout variant="auth">
      <div className="min-h-dvh w-full flex items-center justify-center p-4">
        <div className="w-full max-w-[440px] p-6 md:p-8 rounded-[var(--radius-xl)] bg-[var(--surface-raised)] border border-[var(--border-strong)] shadow-[var(--shadow)] text-center space-y-6">
          <div className="flex justify-center">
            <BrandMark size={44} />
          </div>

        {state === 'verifying' && (
          <div className="space-y-4 py-4">
            <Loader2 className="w-10 h-10 animate-spin text-[var(--accent)] mx-auto" />
            <div>
              <h1 className="text-lg font-semibold text-[var(--text)]">Verifying your email</h1>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Please wait while we confirm your account...
              </p>
            </div>
          </div>
        )}

        {state === 'success' && (
          <div className="space-y-4 py-4">
            <div className="w-12 h-12 rounded-full bg-[var(--status-success-soft)] text-[var(--status-success)] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[var(--text)]">Email Verified!</h1>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Your account is now activated. Redirecting you to VOLQ AI...
              </p>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="space-y-5 py-2">
            <div className="w-12 h-12 rounded-full bg-[var(--status-error-soft)] text-[var(--status-error)] flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[var(--text)]">Verification Failed</h1>
              <p className="text-xs text-[var(--status-error)] mt-1 font-medium">
                {errorMessage}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-2">
                Verification links expire after 24 hours or can only be used once.
              </p>
            </div>

            <div className="pt-2">
              <Link to="/auth">
                <Button variant="primary" className="w-full text-xs h-10">
                  Return to Sign In
                </Button>
              </Link>
            </div>
          </div>
        )}
        </div>
      </div>
    </BackdropLayout>
  );
};
