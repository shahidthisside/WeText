import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineBanner } from './components/OfflineBanner';
import { queryClient } from './lib/query';
import { router } from './router';
import { usePrefs } from './lib/prefs';

function Toasts() {
  const prefs = usePrefs();
  const dark = prefs.theme === 'dark' || prefs.theme === 'dim' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <Toaster
      position="bottom-center"
      theme={dark ? 'dark' : 'light'}
      offset={{ bottom: 80 }}
      mobileOffset={{ bottom: 80 }}
      toastOptions={{
        classNames: {
          toast: '!rounded-xl !border-0 !bg-accent !text-on-accent !shadow-lg !font-sans !text-[0.9375rem]',
          description: '!text-on-accent/80',
          actionButton: '!bg-transparent !text-on-accent !font-bold !underline',
          error: '!bg-danger !text-white',
        },
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <OfflineBanner />
        <Toasts />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
