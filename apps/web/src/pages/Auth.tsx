import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Logo, TextInput } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { setIdentity } from '../lib/auth';
import type { Me } from '../lib/types';
import { useDocumentTitle } from '../lib/useDocumentTitle';

function AuthShell({ title, sub, children, footer, docTitle }: { title: string; sub?: string; children: React.ReactNode; footer: React.ReactNode; docTitle: string }) {
  useDocumentTitle(docTitle);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[400px] animate-rise">
          <Link to="/" aria-label="WeText home">
            <Logo wordmark className="text-[1.05rem]" />
          </Link>
          <h1 className="mt-10 text-[2.4rem] font-extrabold leading-[1.02]">{title}</h1>
          {sub && <p className="mt-2 text-[1rem] text-fg-muted">{sub}</p>}
          <div className="mt-8">{children}</div>
          <p className="mt-10 text-[0.9375rem] text-fg-muted">{footer}</p>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden bg-whisper text-on-whisper lg:flex lg:flex-col lg:justify-end lg:p-14" aria-hidden>
        <div className="absolute right-14 top-14 size-40 rounded-full bg-accent" />
        <div className="absolute right-32 top-28 size-40 rounded-full bg-on-whisper/90 mix-blend-difference" />
        <p className="relative max-w-[460px] font-serif text-[3rem] leading-[1.05]">The things we almost don’t say are usually the ones worth hearing.</p>
        <p className="relative mt-5 text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-on-whisper-muted">A whisper on WeText</p>
      </aside>
    </div>
  );
}

function PasswordInput({ value, onChange, label = 'Password', error, autoComplete }: { value: string; onChange: (v: string) => void; label?: string; error?: string | null; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <TextInput label={label} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} error={error} autoComplete={autoComplete} required />
      <button
        type="button"
        className="absolute right-4 top-[22px] text-fg-muted hover:text-fg"
        aria-label={show ? 'Hide password' : 'Show password'}
        onClick={() => setShow((s) => !s)}
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

export function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ user: Me }>('/auth/login', { login, password });
      setIdentity(r.user);
      const next = params.get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/home', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell docTitle="Sign in" title="Welcome back." sub="Pick up where you left off." footer={<>Don’t have an account? <Link to="/signup" className="text-accent hover:underline">Sign up</Link></>}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <TextInput label="Username or email" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus required />
        <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
        <p className="-mt-2 text-right text-[0.875rem]">
          <Link to="/forgot-password" className="font-semibold text-accent hover:underline">
            Forgot password?
          </Link>
        </p>
        {error && (
          <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-2.5 text-[0.9375rem] text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" variant="inverse" block loading={busy} disabled={!login || !password}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

export function Signup() {
  const [form, setForm] = useState({ displayName: '', username: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const uname = form.username.trim();
  const availability = useQuery({
    queryKey: ['username-available', uname],
    queryFn: () => api.get<{ available: boolean; reason?: string }>(`/auth/username-available?username=${encodeURIComponent(uname)}`),
    enabled: uname.length >= 3,
    staleTime: 30_000,
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!form.displayName.trim()) e.displayName = 'What should we call you?';
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(uname)) e.username = '3–20 letters, numbers or underscores';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email';
    if (form.password.length < 8 || !/[a-zA-Z]/.test(form.password) || !/\d/.test(form.password)) e.password = 'At least 8 characters with a letter and a number';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ user: Me }>('/auth/signup', { ...form, username: uname });
      setIdentity(r.user);
      navigate('/onboarding', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'username_taken') setErrors({ username: err.message });
      else if (err instanceof ApiError && err.code === 'email_taken') setErrors({ email: err.message });
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const unameHint =
    uname.length >= 3 && availability.data
      ? availability.data.available
        ? <span className="text-repost">@{uname} is available</span>
        : null
      : 'You can change this later';
  const unameError = errors.username ?? (availability.data && !availability.data.available ? availability.data.reason : null);

  return (
    <AuthShell docTitle="Join" title="Join WeText." sub="It takes a minute. You can change everything later." footer={<>Have an account already? <Link to="/login" className="text-accent hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <TextInput label="Name" value={form.displayName} onChange={(e) => set('displayName')(e.target.value)} error={errors.displayName} counter={50} autoComplete="name" autoFocus />
        <TextInput
          label="Username"
          value={form.username}
          onChange={(e) => set('username')(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          error={unameError}
          hint={unameHint}
          counter={20}
          autoComplete="username"
          autoCapitalize="none"
        />
        <TextInput label="Email" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} error={errors.email} autoComplete="email" />
        <PasswordInput value={form.password} onChange={set('password')} error={errors.password} autoComplete="new-password" />
        {error && (
          <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-2.5 text-[0.9375rem] text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" variant="inverse" block loading={busy}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/forgot', { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      docTitle="Forgot password"
      title={sent ? 'Check your email.' : 'Forgot your password?'}
      sub={sent ? undefined : 'Enter the email you signed up with and we’ll send you a link to choose a new one.'}
      footer={<>Remembered it? <Link to="/login" className="text-accent hover:underline">Sign in</Link></>}
    >
      {sent ? (
        <div className="space-y-4 text-[1rem] text-fg-muted" role="status">
          <p>
            If there’s an account for <b className="text-fg">{email}</b>, a reset link is on its way. It works for 30 minutes.
          </p>
          <p>Nothing arrived? Check your spam folder, or wait a minute and try again.</p>
          <Button variant="outline" onClick={() => setSent(false)}>
            Use a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required />
          {error && (
            <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-2.5 text-[0.9375rem] text-danger">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" variant="inverse" block loading={busy} disabled={!email.includes('@')}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell docTitle="Reset password" title="This link isn’t valid." sub="Reset links come from the email we send. Request a new one to continue." footer={<Link to="/login" className="text-accent hover:underline">Back to sign in</Link>}>
        <Link to="/forgot-password">
          <Button size="lg" variant="inverse" block>Get a new link</Button>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      docTitle="Reset password"
      title={done ? 'Password changed.' : 'Choose a new password.'}
      sub={done ? 'You’ve been signed out everywhere. Sign in with your new password.' : 'At least 8 characters, with a letter and a number.'}
      footer={<Link to="/login" className="text-accent hover:underline">Back to sign in</Link>}
    >
      {done ? (
        <Link to="/login">
          <Button size="lg" variant="inverse" block>Sign in</Button>
        </Link>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <PasswordInput label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
          {error && (
            <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-2.5 text-[0.9375rem] text-danger">
              {error}{' '}
              <Link to="/forgot-password" className="font-semibold underline">
                Get a new link
              </Link>
            </p>
          )}
          <Button type="submit" size="lg" variant="inverse" block loading={busy} disabled={password.length < 8}>
            Change password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
