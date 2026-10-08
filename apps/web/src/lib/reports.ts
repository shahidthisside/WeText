import { api } from './api';

export type ReportTargetType = 'post' | 'user';

export type ReportReason = 'spam' | 'abuse' | 'hate' | 'sexual' | 'violence' | 'self_harm' | 'impersonation' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: 'spam', label: 'Spam or scam', hint: 'Unwanted ads, fake offers, repetitive posting' },
  { value: 'abuse', label: 'Harassment or bullying', hint: 'Targeted insults, threats, intimidation' },
  { value: 'hate', label: 'Hate speech', hint: 'Attacks based on identity or protected traits' },
  { value: 'sexual', label: 'Sexual content', hint: 'Explicit or non-consensual sexual material' },
  { value: 'violence', label: 'Violence or threats', hint: 'Glorifying or threatening harm' },
  { value: 'self_harm', label: 'Self-harm', hint: 'Encouraging suicide or self-injury' },
  { value: 'impersonation', label: 'Impersonation', hint: 'Pretending to be someone else' },
  { value: 'other', label: 'Something else', hint: 'Tell us what’s wrong below' },
];

export interface ReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
}

export const REPORT_DETAILS_MAX = 500;

/** POST /api/reports — server contract shared with general_server. */
export function submitReport(input: ReportInput) {
  const body: ReportInput = {
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
  };
  const details = input.details?.trim();
  if (details) body.details = details.slice(0, REPORT_DETAILS_MAX);
  return api.post<{ ok: true }>('/reports', body);
}
