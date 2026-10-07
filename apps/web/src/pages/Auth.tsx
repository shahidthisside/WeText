import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Logo, TextInput } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { setMe } from '../lib/auth';
import type { Me } from '../lib/types';

function AuthShell({ title, sub, children, footer }: { title: string; sub?: string; children: React.ReactNode; footer: React.ReactNode }) {
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
      setMe(r.user);
      const next = params.get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/home', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back." sub="Pick up where you left off." footer={<>Don’t have an account? <Link to="/signup" className="text-accent hover:underline">Sign up</Link></>}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <TextInput label="Username or email" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus required />
        <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
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
      setMe(r.user);
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
    <AuthShell title="Join WeText." sub="It takes a minute. You can change everything later." footer={<>Have an account already? <Link to="/login" className="text-accent hover:underline">Sign in</Link></>}>
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
