import React, { useEffect, useId, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
  X,
} from 'lucide-react';
import { BrandMark } from '../components/brand/BrandMark';
import { OAuthProviderMark } from '../components/oauth/ProviderMarks';
import { GlassPanel } from '../components/ui/Glass';
import { BackdropLayout } from '../components/layout/BackdropLayout';
import { ApiError, apiFetch } from '../lib/api';
import type { PublicOAuthProvider } from '../lib/types';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

const OAUTH_ERROR_LABELS: Record<string, string> = {
  provider_disabled: 'That OAuth provider is currently disabled.',
  invalid_state: 'Sign-in session expired or could not be verified. Please try again.',
  email_unverified: 'Your account email at that provider is not verified.',
  email_missing: 'That provider did not share an email address with VOLQ AI.',
  domain_not_allowed: 'Your email domain is not permitted for OAuth sign-in on this workspace.',
  account_exists_link_disabled:
    'An account with that email already exists. Sign in with your password instead.',
  account_disabled: 'Your account has been deactivated by an administrator.',
  signup_disabled: 'New signups via this OAuth provider are currently disabled.',
  oauth_failed: 'Single sign-on could not be completed. Please try again.',
};

export const AuthPage: React.FC = () => {
  const { status, login, register } = useAuthStore();
  const branding = useUiStore((s) => s.branding);
  const reduceMotion = useUiStore((s) => s.reduceMotion);
  const needsSetup = status?.needsSetup ?? false;
  const signupAllowed = needsSetup || status?.signupMode === 'open';

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedMode = searchParams.get('mode');

  const [mode, setMode] = useState<'login' | 'register'>(() => {
    if (needsSetup) return 'register';
    if (requestedMode === 'register' && signupAllowed) return 'register';
    return 'login';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<PublicOAuthProvider[]>([]);

  const emailId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();
  const nameId = useId();

  useEffect(() => {
    if (needsSetup) setMode('register');
  }, [needsSetup]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthErr = params.get('oauth_error');
    if (oauthErr) {
      setError(OAUTH_ERROR_LABELS[oauthErr] ?? oauthErr);
      params.delete('oauth_error');
      const nextUrl =
        window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState(null, '', nextUrl);
    }

    if (!needsSetup) {
      void apiFetch<{ providers: PublicOAuthProvider[] }>('/api/auth/oauth/providers')
        .then((res) => setOauthProviders(res.providers))
        .catch(() => {});
    }
  }, [needsSetup]);

  const hasMinLength = password.length >= 8;
  const hasSymbolOrNumber = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  const passwordsMatch = useMemo(() => {
    if (mode !== 'register') return true;
    if (!confirmPassword) return true;
    return password === confirmPassword;
  }, [mode, password, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (mode === 'register' && !hasMinLength) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSubmitting(true);

    try {
      if (mode === 'register') {
        const res = await register(email, password, displayName);
        if (res && 'requiresVerification' in res && res.requiresVerification) {
          navigate(`/check-inbox?email=${encodeURIComponent(res.email || email)}`);
          return;
        }
      } else {
        await login(email, password);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'email_not_verified') {
          navigate(`/check-inbox?email=${encodeURIComponent(email)}`);
          return;
        }
        setError(err.message);
      } else {
        setError('Unable to reach server');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const tagline = branding.tagline?.trim() || 'Self-hosted AI workspace';

  return (
    <BackdropLayout variant="auth">
      <div className="min-h-dvh w-full flex items-center justify-center p-4">
        <motion.main
          initial={{ opacity: 0, y: reduceMotion ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0.15 : 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-[428px]"
        >
          <GlassPanel strong refract className="p-6 sm:p-8 rounded-[24px] border border-[var(--glass-border)] shadow-[var(--shadow)]">
            <div className="relative z-10">
              {/* Brand Header */}
              <div className="flex flex-col items-center text-center gap-3 mb-6">
                <Link
                  to="/welcome"
                  title="Back to welcome screen"
                  className="inline-flex rounded-xl p-1 transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <BrandMark size={38} showName={false} />
                </Link>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text)]">
                    {needsSetup ? 'Initial Setup' : branding.siteName || 'VOLQ AI'}
                  </h1>
                  <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1">
                    {needsSetup ? 'Create the Administrator Account' : tagline}
                  </p>
                </div>
              </div>

            {needsSetup ? (
              <div className="mb-5 flex items-start gap-2.5 px-3.5 py-3 rounded-[12px] bg-[var(--surface-active)] border border-[var(--border)] text-xs text-[var(--text)] leading-relaxed">
                <ShieldCheck className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                <span>
                  Welcome to VOLQ AI. This first account is granted full instance administrator
                  privileges to configure models and workspace policies.
                </span>
              </div>
            ) : (
              signupAllowed && (
                /* Pill Tab Segmented Control */
                <div
                  role="tablist"
                  aria-label="Authentication mode"
                  className="mb-6 p-1 rounded-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] grid grid-cols-2 gap-1"
                >
                  <button
                    type="button"
                    role="tab"
                    id="tab-login"
                    aria-selected={mode === 'login'}
                    aria-controls="panel-auth"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                    }}
                    className={`relative py-2 rounded-full text-xs sm:text-sm font-medium transition-colors select-none min-h-[40px] flex items-center justify-center ${
                      mode === 'login' ? 'text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {mode === 'login' && (
                      <motion.span
                        layoutId="auth-pill-active"
                        transition={{ type: 'spring', duration: reduceMotion ? 0 : 0.24, bounce: 0 }}
                        className="absolute inset-0 rounded-full bg-[var(--surface-active)] border border-[var(--border)] shadow-sm"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-10">Sign in</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    id="tab-register"
                    aria-selected={mode === 'register'}
                    aria-controls="panel-auth"
                    onClick={() => {
                      setMode('register');
                      setError(null);
                    }}
                    className={`relative py-2 rounded-full text-xs sm:text-sm font-medium transition-colors select-none min-h-[40px] flex items-center justify-center ${
                      mode === 'register' ? 'text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {mode === 'register' && (
                      <motion.span
                        layoutId="auth-pill-active"
                        transition={{ type: 'spring', duration: reduceMotion ? 0 : 0.24, bounce: 0 }}
                        className="absolute inset-0 rounded-full bg-[var(--surface-active)] border border-[var(--border)] shadow-sm"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-10">Create account</span>
                  </button>
                </div>
              )
            )}

            {!needsSetup && !signupAllowed && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>Public registration is disabled on this server.</span>
              </div>
            )}

            {/* Server Error Banner */}
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-4 px-3.5 py-2.5 rounded-[12px] bg-[var(--status-error-soft)] border border-[var(--status-error)]/30 text-xs text-[var(--status-error)] flex items-center gap-2"
              >
                <X className="w-4 h-4 shrink-0" />
                <span className="flex-1 min-w-0">{error}</span>
              </div>
            )}

            <form id="panel-auth" onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label
                    htmlFor={nameId}
                    className="block text-xs font-medium text-[var(--text-subtle)] mb-1.5"
                  >
                    Display name
                  </label>
                  <input
                    id={nameId}
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Alex Rivera"
                    autoComplete="name"
                    className="w-full h-11 px-3.5 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-base md:text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--focus-ring)] transition-colors"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor={emailId}
                  className="block text-xs font-medium text-[var(--text-subtle)] mb-1.5"
                >
                  Email
                </label>
                <input
                  id={emailId}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.local"
                  className="w-full h-11 px-3.5 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-base md:text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--focus-ring)] transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor={passwordId}
                    className="block text-xs font-medium text-[var(--text-subtle)]"
                  >
                    Password
                  </label>
                </div>
                <div className="relative">
                  <input
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={mode === 'register' ? 8 : 1}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
                    className="w-full h-11 pl-3.5 pr-10 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-base md:text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--focus-ring)] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Strength Checklist (Create account only) */}
                {mode === 'register' && password.length > 0 && (
                  <div className="mt-2.5 p-3 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border-subtle)] space-y-1.5 text-xs">
                    <div
                      className={`flex items-center gap-2 ${
                        hasMinLength ? 'text-[var(--status-success)] font-medium' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      <Check className={`w-3.5 h-3.5 ${hasMinLength ? 'opacity-100' : 'opacity-30'}`} />
                      <span>At least 8 characters</span>
                    </div>
                    <div
                      className={`flex items-center gap-2 ${
                        hasSymbolOrNumber ? 'text-[var(--status-success)]' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      <Check
                        className={`w-3.5 h-3.5 ${hasSymbolOrNumber ? 'opacity-100' : 'opacity-30'}`}
                      />
                      <span>Contains number or symbol (recommended)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password (Create account only) */}
              {mode === 'register' && (
                <div>
                  <label
                    htmlFor={confirmPasswordId}
                    className="block text-xs font-medium text-[var(--text-subtle)] mb-1.5"
                  >
                    Confirm password
                  </label>
                  <div className="relative">
                    <input
                      id={confirmPasswordId}
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      aria-invalid={!passwordsMatch}
                      className={`w-full h-11 pl-3.5 pr-10 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border text-base md:text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)] transition-colors ${
                        !passwordsMatch && confirmPassword
                          ? 'border-[var(--status-error)]'
                          : 'border-[var(--border)] focus:border-[var(--border-strong)]'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {!passwordsMatch && confirmPassword && (
                    <p className="text-xs text-[var(--status-error)] mt-1.5">
                      Passwords do not match.
                    </p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || (mode === 'register' && (!passwordsMatch || !hasMinLength))}
                className="w-full h-11 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-ink)] font-medium text-sm flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Working...</span>
                  </>
                ) : (
                  <>
                    <span>
                      {needsSetup
                        ? 'Create Admin Account'
                        : mode === 'register'
                          ? 'Create Account'
                          : 'Sign in'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* OAuth Divider & Provider Buttons */}
            {!needsSetup && oauthProviders.length > 0 && (
              <div className="mt-6">
                <div className="relative flex items-center justify-center my-4">
                  <div className="w-full border-t border-[var(--border)]" />
                  <span className="px-3 text-xs text-[var(--text-muted)] bg-[var(--surface)] whitespace-nowrap">
                    or continue with
                  </span>
                  <div className="w-full border-t border-[var(--border)]" />
                </div>
                <div
                  className={
                    oauthProviders.length <= 3
                      ? 'grid gap-2.5'
                      : 'grid grid-cols-1 sm:grid-cols-2 gap-2'
                  }
                >
                  {oauthProviders.map((provider) => (
                    <a
                      key={provider.id}
                      href={`/api/auth/oauth/${provider.id}/start?next=${encodeURIComponent('/')}`}
                      className="h-11 px-3.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] text-xs sm:text-sm font-medium text-[var(--text)] inline-flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] truncate"
                      title={`Continue with ${provider.displayName}`}
                    >
                      <OAuthProviderMark provider={provider.iconKey} className="w-4 h-4 shrink-0" />
                      <span className="truncate">
                        {oauthProviders.length <= 3
                          ? `Continue with ${provider.displayName}`
                          : provider.displayName}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </GlassPanel>
      </motion.main>
    </div>
  </BackdropLayout>
);
};
export default AuthPage;
