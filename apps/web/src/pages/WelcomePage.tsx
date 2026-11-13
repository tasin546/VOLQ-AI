import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BackdropLayout } from '../components/layout/BackdropLayout';
import { WelcomeHero } from '../components/welcome/WelcomeHero';
import { WelcomeTopBar } from '../components/welcome/WelcomeTopBar';
import { apiFetch } from '../lib/api';
import type { PublicAppInfo } from '../../../server/src/routes/info';
import { useAuthStore } from '../stores/authStore';

export interface WelcomePageProps {
  onTransitionToAuth?: (mode: 'login' | 'register') => void;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({ onTransitionToAuth }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'true';

  const user = useAuthStore((s) => s.user);
  const authStatus = useAuthStore((s) => s.status);

  const [appInfo, setAppInfo] = useState<PublicAppInfo | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<PublicAppInfo>('/api/info')
      .then((data) => {
        if (active) setAppInfo(data);
      })
      .catch(() => {
        // Fallback gracefully to default copy on network or endpoint failure
      });
    return () => {
      active = false;
    };
  }, []);

  const markWelcomeSeen = () => {
    try {
      localStorage.setItem('volq.welcomeSeen', 'true');
    } catch {
      // Storage unavailable or disabled
    }
  };

  const handleGetStarted = () => {
    markWelcomeSeen();
    if (onTransitionToAuth) {
      onTransitionToAuth('register');
    } else {
      navigate('/login?mode=register');
    }
  };

  const handleSignIn = () => {
    markWelcomeSeen();
    if (onTransitionToAuth) {
      onTransitionToAuth('login');
    } else {
      navigate('/login?mode=login');
    }
  };

  const isFreshInstall =
    appInfo !== null ? !appInfo.hasUsers : authStatus?.needsSetup ?? false;
  const signupsDisabled =
    appInfo !== null ? !appInfo.openSignups : authStatus?.signupMode === 'disabled';

  return (
    <BackdropLayout variant="welcome">
      {/* Top Bar with Logo and Theme Switcher */}
      <WelcomeTopBar />

      {/* Admin Preview Floating Indicator (if viewing with ?preview=true) */}
      {isPreview && user?.role === 'admin' && (
        <div className="mx-auto my-2 px-4 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 backdrop-blur-md text-amber-200 text-xs font-medium flex items-center gap-3 shadow-sm">
          <span>Admin Preview Mode</span>
          <button
            type="button"
            onClick={() => navigate('/?settings=admin-general')}
            className="underline hover:text-white"
          >
            Exit Preview
          </button>
        </div>
      )}

      {/* Hero Body */}
      <WelcomeHero
        onGetStarted={handleGetStarted}
        onSignIn={handleSignIn}
        isFreshInstall={isFreshInstall}
        signupsDisabled={signupsDisabled}
        customHeadline={appInfo?.welcome.headline}
        customDescription={appInfo?.welcome.description}
      />
    </BackdropLayout>
  );
};

export default WelcomePage;
