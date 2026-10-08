import { ApiError } from './api';

export const MAX_RECORDING_MS = 3 * 60 * 1000;

/** First MediaRecorder-supported mime from our preferred list, or null. */
export function pickAudioMime(): string | null {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
  for (const m of candidates) if (MediaRecorder.isTypeSupported(m)) return m;
  return null;
}

export function isRecordingSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && pickAudioMime() !== null;
}

export interface Uploaded {
  url: string;
  width: number;
  height: number;
}

/** Upload a recorded audio blob to /uploads?kind=audio. */
export async function uploadAudio(blob: Blob, filename = 'voice'): Promise<Uploaded> {
  const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  const fd = new FormData();
  fd.append('file', new File([blob], `${filename}.${ext}`, { type: blob.type }));
  let res: Response;
  try {
    res = await fetch('/api/uploads?kind=audio', { method: 'POST', credentials: 'same-origin', body: fd });
  } catch {
    throw new ApiError(0, 'You appear to be offline. Check your connection.', 'network');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = data as { error?: string; code?: string } | null;
    throw new ApiError(res.status, d?.error ?? `Upload failed (${res.status})`, d?.code);
  }
  return data as Uploaded;
}

export type RecorderError = 'denied' | 'unsupported' | 'failed';

/**
 * A tiny MediaRecorder wrapper. Resolves `start()` once recording actually
 * begins; `stop()` returns the recorded blob (or null if nothing captured).
 */
export class VoiceRecorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private mime = '';
  startedAt = 0;

  async start(): Promise<void> {
    const mime = pickAudioMime();
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      const err: RecorderError = 'unsupported';
      throw err;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const err: RecorderError = (e as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'failed';
      throw err;
    }
    this.mime = mime;
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, { mimeType: mime });
    this.rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) this.chunks.push(ev.data);
    };
    this.rec.start(250);
    this.startedAt = Date.now();
  }

  /** Stop and resolve the recorded blob, or null if empty. */
  stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const rec = this.rec;
      if (!rec || rec.state === 'inactive') {
        this.cleanup();
        resolve(null);
        return;
      }
      rec.onstop = () => {
        const blob = this.chunks.length ? new Blob(this.chunks, { type: this.mime }) : null;
        this.cleanup();
        resolve(blob);
      };
      rec.stop();
    });
  }

  /** Abort without producing a blob. */
  cancel() {
    if (this.rec && this.rec.state !== 'inactive') {
      this.rec.onstop = null;
      try {
        this.rec.stop();
      } catch {
        /* ignore */
      }
    }
    this.cleanup();
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
  }
}
