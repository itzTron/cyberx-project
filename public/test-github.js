(() => {
  // src/lib/githubApi.ts
  var GITHUB_TOKEN_KEY = "cyberx_github_provider_token";
  var extractAndStoreGitHubToken = (session) => {
    const token = session?.provider_token;
    if (!token) {
      return false;
    }
    try {
      sessionStorage.setItem(GITHUB_TOKEN_KEY, token);
    } catch {
      console.warn("Unable to persist GitHub token to sessionStorage.");
    }
    return true;
  };
  var getGitHubToken = () => {
    try {
      return sessionStorage.getItem(GITHUB_TOKEN_KEY);
    } catch {
      return null;
    }
  };
  var hasGitHubToken = () => Boolean(getGitHubToken());
  var clearGitHubToken = () => {
    try {
      sessionStorage.removeItem(GITHUB_TOKEN_KEY);
    } catch {
    }
  };
  var GITHUB_API_BASE = "https://api.github.com";
  var githubFetch = async (path, token, options) => {
    const url = path.startsWith("http") ? path : `${GITHUB_API_BASE}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...options?.headers || {}
      }
    });
    if (!response.ok) {
      if (response.status === 401) {
        clearGitHubToken();
        throw new Error(
          "GitHub session expired. Please sign in with GitHub again to reconnect."
        );
      }
      if (response.status === 403) {
        const remaining = response.headers.get("x-ratelimit-remaining");
        if (remaining === "0") {
          const resetAt = response.headers.get("x-ratelimit-reset");
          const resetDate = resetAt ? new Date(Number(resetAt) * 1e3).toLocaleTimeString() : "a few minutes";
          throw new Error(
            `GitHub API rate limit exceeded. Try again after ${resetDate}.`
          );
        }
        throw new Error("GitHub API access denied. Check your permissions.");
      }
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `GitHub API error (${response.status}): ${errorBody || response.statusText}`
      );
    }
    return response.json();
  };
  var fetchGitHubRepos = async () => {
    const token = getGitHubToken();
    if (!token) {
      throw new Error("No GitHub token available. Sign in with GitHub first.");
    }
    const repos = await githubFetch(
      "/user/repos?per_page=100&sort=updated&direction=desc&type=all",
      token
    );
    return repos;
  };
  var fetchGitHubRepoReadme = async (owner, repo) => {
    const token = getGitHubToken();
    if (!token) {
      throw new Error("No GitHub token available. Sign in with GitHub first.");
    }
    try {
      const data = await githubFetch(
        `/repos/${owner}/${repo}/readme`,
        token
      );
      if (data.encoding === "base64" && data.content) {
        const binaryString = atob(data.content.replace(/\n/g, ""));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
      }
      return data.content || "";
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        return "";
      }
      throw error;
    }
  };
  var fetchGitHubRepoZip = async (owner, repo, branch) => {
    const token = getGitHubToken();
    if (!token) {
      throw new Error("No GitHub token available. Sign in with GitHub first.");
    }
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/zipball/${branch}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
      // We expect a 302 redirect to codeload.github.com which fetch handles automatically.
    });
    if (!response.ok) {
      throw new Error(`Failed to download repository archive (Status: ${response.status}).`);
    }
    return response.arrayBuffer();
  };
  var fetchGitHubUser = async () => {
    const token = getGitHubToken();
    if (!token) {
      throw new Error("No GitHub token available. Sign in with GitHub first.");
    }
    return githubFetch("/user", token);
  };
})();
