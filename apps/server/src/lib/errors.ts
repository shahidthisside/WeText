export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, code = 'bad_request') => new HttpError(400, msg, code);
export const unauthorized = (msg = 'Sign in to continue') => new HttpError(401, msg, 'unauthorized');
export const forbidden = (msg = "You can't do that") => new HttpError(403, msg, 'forbidden');
export const notFound = (msg = 'Not found') => new HttpError(404, msg, 'not_found');
export const conflict = (msg: string, code = 'conflict') => new HttpError(409, msg, code);

/**
 * A write can still race another request between the "is it taken?" check and
 * the INSERT/UPDATE, and lose on the UNIQUE index. SQLite surfaces that as a
 * message containing "UNIQUE constraint failed: <table>.<column>". Map it to a
 * 409 with the usual code instead of letting it bubble up as a 500.
 */
export function isUniqueViolation(err: unknown, column?: string): boolean {
  const msg = (err as { message?: string } | undefined)?.message ?? '';
  if (!/UNIQUE constraint failed/i.test(msg)) return false;
  return column ? new RegExp(`\\.${column}\\b`, 'i').test(msg) : true;
}
