/**
 * GitHub API integration layer.
 *
 * Handles secure storage of the GitHub provider_token that Supabase returns
 * after OAuth login, and provides typed wrappers around the GitHub REST API
 * for fetching user repositories and README content.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  private: boolean;
  fork: boolean;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  default_branch: string;
  owner: {
    login: string;
    avatar_url: string;
  };
};

export type GitHubRepoImportInput = {
  name: string;
  description: string;
  githubUrl: string;
  visibility: 'public' | 'private';
  readmeContent: string;
  owner: string;
  defaultBranch: string;
};

/* ------------------------------------------------------------------ */
/*  Token management (sessionStorage)                                  */
/* ------------------------------------------------------------------ */

const GITHUB_TOKEN_KEY = 'cyberx_github_provider_token';

/**
 * Extracts the GitHub provider_token from a Supabase session and stores it
 * in sessionStorage for the duration of the browser tab.
 *
 * Supabase only surfaces the provider_token once — immediately after the
 * OAuth callback — so we must capture it right away.
 */
export const extractAndStoreGitHubToken = (session: {
  provider_token?: string | null;
} | null): boolean => {
  const token = session?.provider_token;
  if (!token) {
    return false;
  }

  try {
    sessionStorage.setItem(GITHUB_TOKEN_KEY, token);
  } catch {
    // sessionStorage may be unavailable (e.g. private browsing quota)
    console.warn('Unable to persist GitHub token to sessionStorage.');
  }

  return true;
};

/** Retrieve the stored GitHub provider token, or null if missing. */
export const getGitHubToken = (): string | null => {
  try {
    return sessionStorage.getItem(GITHUB_TOKEN_KEY);
  } catch {
    return null;
  }
};

/** Returns true if a GitHub provider token is available. */
export const hasGitHubToken = (): boolean => Boolean(getGitHubToken());

/** Remove the stored GitHub provider token (call on sign-out). */
export const clearGitHubToken = (): void => {
  try {
    sessionStorage.removeItem(GITHUB_TOKEN_KEY);
  } catch {
    // ignore
  }
};

/* ------------------------------------------------------------------ */
/*  GitHub REST API helpers                                            */
/* ------------------------------------------------------------------ */

const GITHUB_API_BASE = 'https://api.github.com';

const githubFetch = async <T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> => {
  const url = path.startsWith('http') ? path : `${GITHUB_API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearGitHubToken();
      throw new Error(
        'GitHub session expired. Please sign in with GitHub again to reconnect.',
      );
    }

    if (response.status === 403) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        const resetAt = response.headers.get('x-ratelimit-reset');
        const resetDate = resetAt
          ? new Date(Number(resetAt) * 1000).toLocaleTimeString()
          : 'a few minutes';
        throw new Error(
          `GitHub API rate limit exceeded. Try again after ${resetDate}.`,
        );
      }
      throw new Error('GitHub API access denied. Check your permissions.');
    }

    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `GitHub API error (${response.status}): ${errorBody || response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
};

/**
 * Fetches repositories for the authenticated GitHub user.
 * Returns up to 100 repos sorted by most recently updated.
 */
export const fetchGitHubRepos = async (): Promise<GitHubRepo[]> => {
  const token = getGitHubToken();
  if (!token) {
    throw new Error('No GitHub token available. Sign in with GitHub first.');
  }

  // Fetch up to 100 repos (GitHub max per page), sorted by recently updated
  const repos = await githubFetch<GitHubRepo[]>(
    '/user/repos?per_page=100&sort=updated&direction=desc&type=all',
    token,
  );

  return repos;
};

/**
 * Fetches the README content for a specific GitHub repository.
 * Returns the decoded README markdown, or an empty string if none exists.
 */
export const fetchGitHubRepoReadme = async (
  owner: string,
  repo: string,
): Promise<string> => {
  const token = getGitHubToken();
  if (!token) {
    throw new Error('No GitHub token available. Sign in with GitHub first.');
  }

  try {
    const data = await githubFetch<{ content: string; encoding: string }>(
      `/repos/${owner}/${repo}/readme`,
      token,
    );

    if (data.encoding === 'base64' && data.content) {
      // GitHub returns base64-encoded content — decode it
      const binaryString = atob(data.content.replace(/\n/g, ''));
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    }

    return data.content || '';
  } catch (error) {
    // 404 means no README — that's fine
    if (
      error instanceof Error &&
      error.message.includes('404')
    ) {
      return '';
    }
    throw error;
  }
};

/**
 * Fetches the authenticated GitHub user's profile info.
 */
export const fetchGitHubUser = async (): Promise<{
  login: string;
  avatar_url: string;
  name: string | null;
}> => {
  const token = getGitHubToken();
  if (!token) {
    throw new Error('No GitHub token available. Sign in with GitHub first.');
  }

  return githubFetch('/user', token);
};

/**
 * Fetches the ZIP archive of the repository's specified branch.
 * Returns the raw binary ArrayBuffer.
 */
export const fetchGitHubRepoZip = async (
  owner: string,
  repo: string,
  branch: string,
  isPublic: boolean,
): Promise<ArrayBuffer> => {
  const token = getGitHubToken();
  if (!token) {
    throw new Error('No GitHub token available. Sign in with GitHub first.');
  }

  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/zipball/${branch}`;

  const headers: HeadersInit = {};

  // GitHub's codeload domain rejects browser CORS requests that include custom 
  // headers like Authorization or X-GitHub-Api-Version. For public repos we can 
  // safely omit all custom headers to force a 'simple request' and bypass CORS preflight.
  if (!isPublic) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-GitHub-Api-Version'] = '2022-11-28';
  }

  const response = await fetch(url, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to download repository archive (Status: ${response.status}).`);
  }

  return response.arrayBuffer();
};
