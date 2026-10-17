export function resolveSubagentAccountEndpoint(account?: string): string {
  return account === 'live' ? '/api/canvas-v2/account' : '/canvas-v2-e2e/codex/account';
}
