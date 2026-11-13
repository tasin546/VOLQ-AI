import React, { Suspense, lazy, useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ObsidianBackdrop } from './components/ui/ObsidianBackdrop';
import { Skeleton, TooltipProvider } from './components/ui/Primitives';
import { ChatPage } from './pages/ChatPage';
import { useAuthStore } from './stores/authStore';
import { useChatStore } from './stores/chatStore';
import { useUiStore } from './stores/uiStore';

const WelcomePage = lazy(() => import('./pages/WelcomePage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const CheckInboxPage = lazy(() =>
  import('./pages/CheckInboxPage').then((m) => ({ default: m.CheckInboxPage }))
);
const VerifyEmailPage = lazy(() =>
  import('./pages/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage }))
);
const FirstRunSetupModal = lazy(() =>
  import('./components/onboarding/FirstRunSetupModal').then((m) => ({
    default: m.FirstRunSetupModal,
  }))
);

const PromptsPage = lazy(() =>
  import('./pages/PromptsPage').then((m) => ({ default: m.PromptsPage }))
);
const ModelsPage = lazy(() =>
  import('./pages/ModelsPage').then((m) => ({ default: m.ModelsPage }))
);

const PageFallback: React.FC = () => (
  <div className="flex-1 p-6 md:p-10 max-w-4xl mx-auto w-full space-y-4">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-32 w-full rounded-[var(--radius-lg)]" />
    <Skeleton className="h-24 w-full rounded-[var(--radius-lg)]" />
  </div>
);

const WelcomeGate: React.FC = () => {
  const isSeen = (() => {
    try {
      return localStorage.getItem('volq.welcomeSeen') === 'true';
    } catch {
      return false;
    }
  })();

  if (isSeen) {
    return <Navigate to="/login" replace />;
  }
  return <WelcomePage />;
};

const DeepLinkRedirect: React.FC = () => {
  const location = useLocation();
  const returnTo = location.pathname + location.search;
  return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
};

const AuthenticatedWelcome: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'true';

  if (user?.role === 'admin' && isPreview) {
    return <WelcomePage />;
  }
  return <Navigate to="/" replace />;
};

export const App: React.FC = () => {
  const { user, initialized, bootstrap, completeOnboarding } = useAuthStore();
  const loadInitialData = useChatStore((s) => s.loadInitialData);
  const brandingLoaded = useUiStore((s) => s.brandingLoaded);
  const reduceMotion = useUiStore((s) => s.reduceMotion);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (user) {
      void loadInitialData(user.preferences.defaultModel).catch(() => {});
    }
  }, [user, loadInitialData]);

  if (!initialized || !brandingLoaded) {
    return (
      <div className="relative h-dvh w-full flex items-center justify-center bg-[var(--bg)] text-[var(--text-muted)]">
        <ObsidianBackdrop />
        <div className="relative z-10 w-64 space-y-3 p-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)]">
          <div className="h-4 w-28 rounded-full bg-[var(--surface-hover)] animate-pulse" />
          <div className="h-3 w-full rounded-full bg-[var(--surface-hover)] animate-pulse" />
          <div className="h-3 w-3/4 rounded-full bg-[var(--surface-hover)] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
      <TooltipProvider delayDuration={300}>
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
            {!user ? (
              <Routes>
                <Route path="/" element={<WelcomeGate />} />
                <Route path="/welcome" element={<WelcomePage />} />
                <Route path="/login" element={<AuthPage />} />
                <Route path="/register" element={<AuthPage />} />
                <Route path="/check-inbox" element={<CheckInboxPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="*" element={<DeepLinkRedirect />} />
              </Routes>
            ) : (
              <AppShell>
                {user.onboardingCompletedAt === null && (
                  <Suspense fallback={null}>
                    <FirstRunSetupModal open onComplete={completeOnboarding} />
                  </Suspense>
                )}
                <Routes>
                  <Route path="/" element={<ChatPage />} />
                  <Route path="/verify-email" element={<VerifyEmailPage />} />
                  <Route path="/check-inbox" element={<CheckInboxPage />} />
                  <Route path="/welcome" element={<AuthenticatedWelcome />} />
                  <Route path="/prompts" element={<PromptsPage />} />
                  <Route path="/models" element={<ModelsPage />} />
                  <Route path="/settings" element={<Navigate to="/?settings=account" replace />} />
                  <Route
                    path="/admin/knowledge"
                    element={
                      user.role === 'admin' ? (
                        <Navigate to="/?settings=admin-knowledge" replace />
                      ) : (
                        <Navigate to="/" replace />
                      )
                    }
                  />
                  <Route
                    path="/admin/models"
                    element={
                      user.role === 'admin' ? (
                        <Navigate to="/?settings=admin-models" replace />
                      ) : (
                        <Navigate to="/" replace />
                      )
                    }
                  />
                  <Route
                    path="/admin/*"
                    element={
                      user.role === 'admin' ? (
                        <Navigate to="/?settings=admin-general" replace />
                      ) : (
                        <Navigate to="/" replace />
                      )
                    }
                  />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AppShell>
            )}
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </MotionConfig>
  );
};

export default App;
