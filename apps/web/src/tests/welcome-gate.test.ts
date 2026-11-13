import { describe, expect, it } from 'vitest';

export function evaluateWelcomeRoute(params: {
  isAuthenticated: boolean;
  isAdmin?: boolean;
  path: string;
  search?: string;
  welcomeSeenFlag: string | null;
  welcomeEnabled?: boolean;
  storageThrows?: boolean;
}): { destination: string; view: 'welcome' | 'auth' | 'chat' | 'redirect' } {
  const {
    isAuthenticated,
    isAdmin = false,
    path,
    search = '',
    welcomeSeenFlag,
    welcomeEnabled = true,
    storageThrows = false,
  } = params;

  // Authenticated users
  if (isAuthenticated) {
    if (path === '/welcome') {
      const searchParams = new URLSearchParams(search);
      const isPreview = searchParams.get('preview') === 'true';
      if (isAdmin && isPreview) {
        return { destination: '/welcome?preview=true', view: 'welcome' };
      }
      return { destination: '/', view: 'chat' };
    }
    return { destination: path, view: 'chat' };
  }

  // Unauthenticated users
  if (path === '/welcome') {
    return { destination: '/welcome', view: 'welcome' };
  }

  if (path === '/login' || path === '/register') {
    return { destination: path, view: 'auth' };
  }

  if (path === '/') {
    if (welcomeEnabled === false) {
      return { destination: '/login', view: 'auth' };
    }

    let isSeen = false;
    if (storageThrows) {
      // In private browsing mode where storage throws, fallback safely to showing welcome
      isSeen = false;
    } else {
      isSeen = welcomeSeenFlag === 'true';
    }

    if (isSeen) {
      return { destination: '/login', view: 'auth' };
    }
    return { destination: '/', view: 'welcome' };
  }

  // Any other path is a deep link (e.g. /chat/abc, /models)
  const returnTo = path + search;
  return {
    destination: `/login?returnTo=${encodeURIComponent(returnTo)}`,
    view: 'redirect',
  };
}

describe('welcome screen routing and gate logic (C1)', () => {
  it('shows welcome screen on "/" for first-time signed-out visitors when flag is not set', () => {
    const result = evaluateWelcomeRoute({
      isAuthenticated: false,
      path: '/',
      welcomeSeenFlag: null,
    });
    expect(result.view).toBe('welcome');
    expect(result.destination).toBe('/');
  });

  it('redirects to /login when welcomeSeen flag is set', () => {
    const result = evaluateWelcomeRoute({
      isAuthenticated: false,
      path: '/',
      welcomeSeenFlag: 'true',
    });
    expect(result.view).toBe('auth');
    expect(result.destination).toBe('/login');
  });

  it('handles localStorage errors gracefully without crashing (e.g. private browsing)', () => {
    const result = evaluateWelcomeRoute({
      isAuthenticated: false,
      path: '/',
      welcomeSeenFlag: null,
      storageThrows: true,
    });
    expect(result.view).toBe('welcome');
  });

  it('redirects straight to /login when welcome screen is disabled by admin', () => {
    const result = evaluateWelcomeRoute({
      isAuthenticated: false,
      path: '/',
      welcomeSeenFlag: null,
      welcomeEnabled: false,
    });
    expect(result.view).toBe('auth');
    expect(result.destination).toBe('/login');
  });

  it('preserves returnTo target on unauthenticated deep links', () => {
    const result = evaluateWelcomeRoute({
      isAuthenticated: false,
      path: '/chat/workspace-alpha',
      search: '?tab=files',
      welcomeSeenFlag: null,
    });
    expect(result.view).toBe('redirect');
    expect(result.destination).toBe('/login?returnTo=%2Fchat%2Fworkspace-alpha%3Ftab%3Dfiles');
  });

  it('always allows direct visit to /welcome for signed-out users', () => {
    const result = evaluateWelcomeRoute({
      isAuthenticated: false,
      path: '/welcome',
      welcomeSeenFlag: 'true',
    });
    expect(result.view).toBe('welcome');
    expect(result.destination).toBe('/welcome');
  });

  it('redirects authenticated non-admin visitors on /welcome to "/"', () => {
    const result = evaluateWelcomeRoute({
      isAuthenticated: true,
      isAdmin: false,
      path: '/welcome',
      search: '?preview=true',
      welcomeSeenFlag: 'true',
    });
    expect(result.view).toBe('chat');
    expect(result.destination).toBe('/');
  });

  it('allows authenticated admins with ?preview=true to preview welcome screen', () => {
    const result = evaluateWelcomeRoute({
      isAuthenticated: true,
      isAdmin: true,
      path: '/welcome',
      search: '?preview=true',
      welcomeSeenFlag: 'true',
    });
    expect(result.view).toBe('welcome');
    expect(result.destination).toBe('/welcome?preview=true');
  });
});
