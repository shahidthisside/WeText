export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
  ) {
    super(message);
  }
}

/**
 * Called whenever the API answers 401 (session expired / signed out elsewhere).
 * Registered once by the app shell to clear the cache and bounce to /login.
 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(`/api${url}`, init);
  } catch {
    throw new ApiError(0, 'You appear to be offline. Check your connection.', 'network');
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const d = data as { error?: string; code?: string } | null;
    // Session no longer valid: let the app clear state and redirect. The
    // auth endpoints handle their own 401s (bad password etc.) in-form.
    if (res.status === 401 && !url.startsWith('/auth/') && onUnauthorized) {
      onUnauthorized();
    }
    throw new ApiError(res.status, d?.error ?? `Request failed (${res.status})`, d?.code);
  }
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

export function qs(params: Record<string, string | number | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}

export interface Uploaded {
  url: string;
  width: number;
  height: number;
}

export function uploadImage(file: File, kind: 'avatar' | 'banner' | 'media' = 'media') {
  const fd = new FormData();
  fd.append('file', file);
  return request<Uploaded>('POST', `/uploads?kind=${kind}`, fd);
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong';
}
