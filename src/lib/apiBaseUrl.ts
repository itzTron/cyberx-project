const LOCAL_API_BASE_URL = 'http://localhost:3001';

const inferRuntimeApiBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    return LOCAL_API_BASE_URL;
  }

  const { hostname, origin } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1'
    ? LOCAL_API_BASE_URL
    : origin;
};

const configuredBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  import.meta.env.VITE_SERVER_URL?.trim() ||
  inferRuntimeApiBaseUrl();

export const API_BASE_URL = configuredBaseUrl.replace(/\/$/, '');
