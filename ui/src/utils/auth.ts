declare global {
  interface Window {
    __PLANCOP_TOKEN__?: string;
  }
}

export function getAuthToken(): string {
  return (typeof window !== 'undefined' && window.__PLANCOP_TOKEN__) || '';
}

export function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Authorization': `Bearer ${getAuthToken()}`,
    ...extra,
  };
}
