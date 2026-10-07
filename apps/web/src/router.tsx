import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { AppLayout } from './components/Layout';
import { PageSpinner, LogoMark } from './components/ui';
import { useMe } from './lib/auth';

const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Signup })));
const ForgotPassword = lazy(() => import('./pages/Auth').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/Auth').then((m) => ({ default: m.ResetPassword })));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Home = lazy(() => import('./pages/Home'));
const PostPage = lazy(() => import('./pages/PostPage'));
const ProfilePage = lazy(() => import('./pages/Profile'));
const FollowListPage = lazy(() => import('./pages/FollowList'));
const Explore = lazy(() => import('./pages/Explore'));
const TagPage = lazy(() => import('./pages/Tag'));
const Connect = lazy(() => import('./pages/Connect'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Bookmarks = lazy(() => import('./pages/Bookmarks'));
const Messages = lazy(() => import('./pages/Messages'));
const Settings = lazy(() => import('./pages/Settings'));
const About = lazy(() => import('./pages/About'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <LogoMark className="size-16 animate-pulse" />
    </div>
  );
}

/** Requires a session; sends brand-new accounts through onboarding first. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useMe();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!me.onboarded && location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { me, loading } = useMe();
  if (loading) return <Splash />;
  if (me) return <Navigate to={me.onboarded ? '/home' : '/onboarding'} replace />;
  return <>{children}</>;
}

function Root() {
  return (
    <>
      <ScrollRestoration getKey={(l) => l.pathname} />
      <Suspense fallback={<Splash />}>
        <Outlet />
      </Suspense>
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <GuestOnly><Landing /></GuestOnly> },
      { path: '/login', element: <GuestOnly><Login /></GuestOnly> },
      { path: '/signup', element: <GuestOnly><Signup /></GuestOnly> },
      { path: '/forgot-password', element: <GuestOnly><ForgotPassword /></GuestOnly> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '/onboarding', element: <RequireAuth><Onboarding /></RequireAuth> },
      { path: '/about', element: <About /> },
      {
        element: <RequireAuth><AppLayout /></RequireAuth>,
        children: [
          { path: '/home', element: <Home /> },
          { path: '/discover', element: <Explore /> },
          { path: '/tag/:tag', element: <TagPage /> },
          { path: '/connect', element: <Connect /> },
          { path: '/activity', element: <Notifications /> },
          { path: '/saved', element: <Bookmarks /> },
          { path: '/chats', element: <Messages /> },
          { path: '/chats/:id', element: <Messages /> },
          { path: '/explore', element: <Navigate to="/discover" replace /> },
          { path: '/notifications', element: <Navigate to="/activity" replace /> },
          { path: '/bookmarks', element: <Navigate to="/saved" replace /> },
          { path: '/messages', element: <Navigate to="/chats" replace /> },
          { path: '/settings', element: <Settings /> },
          { path: '/settings/:section', element: <Settings /> },
          { path: '/post/:id', element: <PostPage /> },
          { path: '/:username', element: <ProfilePage /> },
          { path: '/:username/followers', element: <FollowListPage kind="followers" /> },
          { path: '/:username/following', element: <FollowListPage kind="following" /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);

export { PageSpinner };
