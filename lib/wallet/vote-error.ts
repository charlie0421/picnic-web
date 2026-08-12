export function mapVoteEdgeError(
  status: number | undefined,
  body: unknown,
): { status: number; error: string } {
  const normalizedStatus = typeof status === 'number' && status >= 400 ? status : 500;
  if (body && typeof body === 'object') {
    const message = (body as { error?: unknown; message?: unknown }).error
      ?? (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return { status: normalizedStatus, error: message };
    }
  }
  return { status: normalizedStatus, error: 'VOTE_SUBMIT_FAILED' };
}
