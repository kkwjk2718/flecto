import { createContext, useCallback, useContext, useEffect, useState, type MouseEvent, type ReactNode } from 'react';

export interface RouteLocation {
  path: string;
  search: string;
}

interface RouterValue extends RouteLocation {
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

function readLocation(): RouteLocation {
  return { path: window.location.pathname || '/', search: window.location.search };
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<RouteLocation>(readLocation);

  useEffect(() => {
    const onPopState = () => setLocation(readLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string, options: { replace?: boolean } = {}) => {
    const current = window.location.pathname + window.location.search;
    if (options.replace) window.history.replaceState(null, '', to);
    else if (to !== current) window.history.pushState(null, '', to);
    setLocation(readLocation());
    window.scrollTo(0, 0);
  }, []);

  return <RouterContext.Provider value={{ ...location, navigate }}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error('useRouter outside RouterProvider');
  return value;
}

export function Link({ to, children, className, onNavigate, ...rest }: {
  to: string;
  children: ReactNode;
  className?: string;
  onNavigate?: () => void;
  'aria-current'?: 'page' | 'step' | undefined;
}) {
  const { navigate } = useRouter();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate?.();
    navigate(to);
  };
  return (
    <a href={to} className={className} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}
