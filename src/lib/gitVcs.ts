/**
 * Git VCS Engine — lightweight, browser-native Git semantics.
 *
 * Produces Git-compatible SHA-1 hashes for blobs, trees, and commits.
 * All objects are persisted in Supabase (git_file_snapshots, git_refs, repo_commits).
 * No external dependencies — uses the Web Crypto API for hashing.
 */

import { getSupabaseClient } from '@/lib/supabase';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type GitAuthor = {
  name: string;
  email: string;
};

export type GitCommit = {
  hash: string;
  parentHash: string | null;
  treeHash: string;
  message: string;
  author: GitAuthor;
  timestamp: string;
  filesChanged: number;
};

export type GitBranch = {
  name: string;
  targetHash: string;
  updatedAt: string;
};

export type GitFileSnapshot = {
  path: string;
  blobHash: string;
  content: string;
  sizeBytes: number;
  language: string;
};

export type GitDiffEntry = {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  oldContent: string;
  newContent: string;
};

/* ------------------------------------------------------------------ */
/*  SHA-1 Hashing (Git-compatible)                                     */
/* ------------------------------------------------------------------ */

const textEncoder = new TextEncoder();

const sha1Hex = async (data: Uint8Array): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest('SHA-1', data.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Compute Git blob hash: SHA-1 of "blob <size>\0<content>"
 */
export const computeBlobHash = async (content: string): Promise<string> => {
  const contentBytes = textEncoder.encode(content);
  const header = textEncoder.encode(`blob ${contentBytes.length}\0`);
  const fullData = new Uint8Array(header.length + contentBytes.length);
  fullData.set(header, 0);
  fullData.set(contentBytes, header.length);
  return sha1Hex(fullData);
};

/**
 * Compute Git tree hash from sorted file entries.
 * Simplified tree format: "tree <size>\0<entries>"
 * Each entry: "<mode> <path>\0<20-byte sha>"
 */
export const computeTreeHash = async (
  entries: Array<{ path: string; blobHash: string }>,
): Promise<string> => {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));

  const entryBuffers: Uint8Array[] = [];
  for (const entry of sorted) {
    const mode = '100644'; // regular file
    const modeAndPath = textEncoder.encode(`${mode} ${entry.path}\0`);
    const shaBytes = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
      shaBytes[i] = parseInt(entry.blobHash.slice(i * 2, i * 2 + 2), 16);
    }
    const entryBuffer = new Uint8Array(modeAndPath.length + 20);
    entryBuffer.set(modeAndPath, 0);
    entryBuffer.set(shaBytes, modeAndPath.length);
    entryBuffers.push(entryBuffer);
  }

  const totalEntrySize = entryBuffers.reduce((sum, buf) => sum + buf.length, 0);
  const body = new Uint8Array(totalEntrySize);
  let offset = 0;
  for (const buf of entryBuffers) {
    body.set(buf, offset);
    offset += buf.length;
  }

  const header = textEncoder.encode(`tree ${body.length}\0`);
  const fullData = new Uint8Array(header.length + body.length);
  fullData.set(header, 0);
  fullData.set(body, header.length);
  return sha1Hex(fullData);
};

/**
 * Compute Git commit hash.
 * Format: "commit <size>\0tree <hash>\nparent <hash>\nauthor ...\ncommitter ...\n\n<message>\n"
 */
export const computeCommitHash = async ({
  treeHash,
  parentHash,
  author,
  message,
  timestamp,
}: {
  treeHash: string;
  parentHash: string | null;
  author: GitAuthor;
  message: string;
  timestamp: number;
}): Promise<string> => {
  const tz = '+0000';
  const authorLine = `${author.name} <${author.email}> ${timestamp} ${tz}`;
  const lines = [`tree ${treeHash}`];
  if (parentHash) {
    lines.push(`parent ${parentHash}`);
  }
  lines.push(`author ${authorLine}`);
  lines.push(`committer ${authorLine}`);
  lines.push('');
  lines.push(message);
  lines.push('');

  const body = lines.join('\n');
  const bodyBytes = textEncoder.encode(body);
  const header = textEncoder.encode(`commit ${bodyBytes.length}\0`);
  const fullData = new Uint8Array(header.length + bodyBytes.length);
  fullData.set(header, 0);
  fullData.set(bodyBytes, header.length);
  return sha1Hex(fullData);
};

/* ------------------------------------------------------------------ */
/*  Language detection (mirrors hubApi.ts)                             */
/* ------------------------------------------------------------------ */

const extensionLanguageMap: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  json: 'json', html: 'html', css: 'css', scss: 'scss',
  md: 'markdown', py: 'python', java: 'java', c: 'c',
  cpp: 'cpp', cs: 'csharp', go: 'go', rs: 'rust',
  sql: 'sql', yml: 'yaml', yaml: 'yaml', xml: 'xml',
  sh: 'shell', txt: 'plaintext',
};

const detectLanguage = (path: string) => {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return extensionLanguageMap[ext] || 'plaintext';
};

/* ------------------------------------------------------------------ */
/*  Supabase helpers                                                   */
/* ------------------------------------------------------------------ */

const getAuthenticatedClient = async () => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('Authentication required.');
  }
  return { supabase, user: data.user };
};

/* ------------------------------------------------------------------ */
/*  Git VCS API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Initialize a Git repository — creates the initial commit on `main` branch.
 * Called after creating a repository in the database.
 */
export const initGitRepo = async ({
  repoId,
  files,
  author,
}: {
  repoId: string;
  files: Array<{ path: string; content: string }>;
  author: GitAuthor;
}): Promise<GitCommit> => {
  const { supabase } = await getAuthenticatedClient();

  // Compute blob hashes for all files
  const fileEntries: Array<{ path: string; blobHash: string; content: string; sizeBytes: number; language: string }> = [];
  for (const file of files) {
    const blobHash = await computeBlobHash(file.content);
    fileEntries.push({
      path: file.path,
      blobHash,
      content: file.content,
      sizeBytes: new TextEncoder().encode(file.content).length,
      language: detectLanguage(file.path),
    });
  }

  // Compute tree hash
  const treeHash = await computeTreeHash(fileEntries.map((f) => ({ path: f.path, blobHash: f.blobHash })));

  // Compute commit hash
  const timestamp = Math.floor(Date.now() / 1000);
  const commitHash = await computeCommitHash({
    treeHash,
    parentHash: null,
    author,
    message: 'Initial commit',
    timestamp,
  });

  const isoTimestamp = new Date(timestamp * 1000).toISOString();

  // Store file snapshots
  if (fileEntries.length > 0) {
    const { error: snapshotError } = await supabase.from('git_file_snapshots').insert(
      fileEntries.map((f) => ({
        repo_id: repoId,
        commit_hash: commitHash,
        path: f.path,
        blob_hash: f.blobHash,
        content: f.content,
        size_bytes: f.sizeBytes,
        language: f.language,
      })),
    );
    if (snapshotError) {
      throw new Error(snapshotError.message);
    }
  }

  // Create branch ref (main)
  const { error: refError } = await supabase.from('git_refs').upsert(
    {
      repo_id: repoId,
      ref_name: 'refs/heads/main',
      target_hash: commitHash,
    },
    { onConflict: 'repo_id,ref_name' },
  );
  if (refError) {
    throw new Error(refError.message);
  }

  return {
    hash: commitHash,
    parentHash: null,
    treeHash,
    message: 'Initial commit',
    author,
    timestamp: isoTimestamp,
    filesChanged: fileEntries.length,
  };
};

/**
 * Create a Git commit — stages all provided files, computes hashes, stores snapshot.
 */
export const commitChanges = async ({
  repoId,
  files,
  message,
  author,
  branch = 'main',
}: {
  repoId: string;
  files: Array<{ path: string; content: string }>;
  message: string;
  author: GitAuthor;
  branch?: string;
}): Promise<GitCommit> => {
  const { supabase } = await getAuthenticatedClient();
  const refName = `refs/heads/${branch}`;

  // Get current branch HEAD
  const { data: refData } = await supabase
    .from('git_refs')
    .select('target_hash')
    .eq('repo_id', repoId)
    .eq('ref_name', refName)
    .maybeSingle();

  const parentHash = refData?.target_hash || null;

  // Get parent commit's file snapshots and merge with new files
  let existingFiles: Array<{ path: string; content: string }> = [];
  if (parentHash) {
    const { data: parentSnapshots } = await supabase
      .from('git_file_snapshots')
      .select('path, content')
      .eq('repo_id', repoId)
      .eq('commit_hash', parentHash);
    existingFiles = (parentSnapshots || []).map((s: any) => ({ path: s.path, content: s.content }));
  }

  // Merge: new files override existing, keep unmodified files
  const fileMap = new Map<string, string>();
  for (const f of existingFiles) {
    fileMap.set(f.path, f.content);
  }
  for (const f of files) {
    fileMap.set(f.path, f.content);
  }

  // Compute blob hashes for all files in the tree
  const fileEntries: Array<{ path: string; blobHash: string; content: string; sizeBytes: number; language: string }> = [];
  for (const [path, content] of fileMap) {
    const blobHash = await computeBlobHash(content);
    fileEntries.push({
      path,
      blobHash,
      content,
      sizeBytes: new TextEncoder().encode(content).length,
      language: detectLanguage(path),
    });
  }

  // Compute tree and commit hashes
  const treeHash = await computeTreeHash(fileEntries.map((f) => ({ path: f.path, blobHash: f.blobHash })));
  const timestamp = Math.floor(Date.now() / 1000);
  const commitHash = await computeCommitHash({
    treeHash,
    parentHash,
    author,
    message,
    timestamp,
  });

  const isoTimestamp = new Date(timestamp * 1000).toISOString();

  // Store file snapshots for this commit
  if (fileEntries.length > 0) {
    const { error: snapshotError } = await supabase.from('git_file_snapshots').insert(
      fileEntries.map((f) => ({
        repo_id: repoId,
        commit_hash: commitHash,
        path: f.path,
        blob_hash: f.blobHash,
        content: f.content,
        size_bytes: f.sizeBytes,
        language: f.language,
      })),
    );
    if (snapshotError) {
      throw new Error(snapshotError.message);
    }
  }

  // Update branch ref to point to new commit
  const { error: refError } = await supabase.from('git_refs').upsert(
    {
      repo_id: repoId,
      ref_name: refName,
      target_hash: commitHash,
    },
    { onConflict: 'repo_id,ref_name' },
  );
  if (refError) {
    throw new Error(refError.message);
  }

  return {
    hash: commitHash,
    parentHash,
    treeHash,
    message,
    author,
    timestamp: isoTimestamp,
    filesChanged: files.length,
  };
};

/**
 * Get commit history for a branch by walking parent chain.
 */
export const getCommitHistory = async ({
  repoId,
  branch = 'main',
  limit = 50,
}: {
  repoId: string;
  branch?: string;
  limit?: number;
}): Promise<GitCommit[]> => {
  const { supabase } = await getAuthenticatedClient();

  const { data, error } = await supabase
    .from('repo_commits')
    .select('id, repo_id, author_id, message, files_changed, created_at, git_hash, parent_hash')
    .eq('repo_id', repoId)
    .not('git_hash', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((c: any) => ({
    hash: c.git_hash || '',
    parentHash: c.parent_hash || null,
    treeHash: '',
    message: c.message,
    author: { name: '', email: '' },
    timestamp: c.created_at,
    filesChanged: c.files_changed,
  }));
};

/**
 * Get file content at a specific commit.
 */
export const getFileAtCommit = async ({
  repoId,
  commitHash,
  filePath,
}: {
  repoId: string;
  commitHash: string;
  filePath: string;
}): Promise<GitFileSnapshot | null> => {
  const { supabase } = await getAuthenticatedClient();

  const { data, error } = await supabase
    .from('git_file_snapshots')
    .select('path, blob_hash, content, size_bytes, language')
    .eq('repo_id', repoId)
    .eq('commit_hash', commitHash)
    .eq('path', filePath)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return {
    path: data.path,
    blobHash: data.blob_hash,
    content: data.content,
    sizeBytes: data.size_bytes,
    language: data.language,
  };
};

/**
 * List all files at a specific commit.
 */
export const listFilesAtCommit = async ({
  repoId,
  commitHash,
}: {
  repoId: string;
  commitHash: string;
}): Promise<GitFileSnapshot[]> => {
  const { supabase } = await getAuthenticatedClient();

  const { data, error } = await supabase
    .from('git_file_snapshots')
    .select('path, blob_hash, content, size_bytes, language')
    .eq('repo_id', repoId)
    .eq('commit_hash', commitHash)
    .order('path', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((s: any) => ({
    path: s.path,
    blobHash: s.blob_hash,
    content: s.content,
    sizeBytes: s.size_bytes,
    language: s.language,
  }));
};

/**
 * List all branches for a repository.
 */
export const listBranches = async (repoId: string): Promise<GitBranch[]> => {
  const { supabase } = await getAuthenticatedClient();

  const { data, error } = await supabase
    .from('git_refs')
    .select('ref_name, target_hash, updated_at')
    .eq('repo_id', repoId)
    .like('ref_name', 'refs/heads/%')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((r: any) => ({
    name: (r.ref_name as string).replace('refs/heads/', ''),
    targetHash: r.target_hash,
    updatedAt: r.updated_at,
  }));
};

/**
 * Create a new branch from an existing ref.
 */
export const createBranch = async ({
  repoId,
  branchName,
  fromBranch = 'main',
}: {
  repoId: string;
  branchName: string;
  fromBranch?: string;
}): Promise<GitBranch> => {
  const { supabase } = await getAuthenticatedClient();

  // Get source branch HEAD
  const { data: sourceRef, error: sourceError } = await supabase
    .from('git_refs')
    .select('target_hash')
    .eq('repo_id', repoId)
    .eq('ref_name', `refs/heads/${fromBranch}`)
    .single();

  if (sourceError || !sourceRef) {
    throw new Error(`Branch "${fromBranch}" does not exist.`);
  }

  const targetHash = sourceRef.target_hash as string;
  const newRefName = `refs/heads/${branchName}`;

  // Check if branch already exists
  const { data: existingRef } = await supabase
    .from('git_refs')
    .select('id')
    .eq('repo_id', repoId)
    .eq('ref_name', newRefName)
    .maybeSingle();

  if (existingRef) {
    throw new Error(`Branch "${branchName}" already exists.`);
  }

  // Create new branch ref pointing to same commit
  const { error: insertError } = await supabase.from('git_refs').insert({
    repo_id: repoId,
    ref_name: newRefName,
    target_hash: targetHash,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    name: branchName,
    targetHash,
    updatedAt: new Date().toISOString(),
  };
};

/**
 * Merge source branch into target branch (fast-forward merge).
 * For simplicity, this performs a file-level merge:
 * - Takes all files from source branch HEAD
 * - Merges them into target branch as a new commit
 */
export const mergeBranch = async ({
  repoId,
  sourceBranch,
  targetBranch = 'main',
  author,
}: {
  repoId: string;
  sourceBranch: string;
  targetBranch?: string;
  author: GitAuthor;
}): Promise<GitCommit> => {
  const { supabase } = await getAuthenticatedClient();

  // Get both branch HEADs
  const { data: refs, error: refsError } = await supabase
    .from('git_refs')
    .select('ref_name, target_hash')
    .eq('repo_id', repoId)
    .in('ref_name', [`refs/heads/${sourceBranch}`, `refs/heads/${targetBranch}`]);

  if (refsError) {
    throw new Error(refsError.message);
  }

  const sourceRef = (refs || []).find((r: any) => r.ref_name === `refs/heads/${sourceBranch}`);
  const targetRef = (refs || []).find((r: any) => r.ref_name === `refs/heads/${targetBranch}`);

  if (!sourceRef) {
    throw new Error(`Branch "${sourceBranch}" does not exist.`);
  }
  if (!targetRef) {
    throw new Error(`Branch "${targetBranch}" does not exist.`);
  }

  const sourceHash = sourceRef.target_hash as string;
  const targetHash = targetRef.target_hash as string;

  if (sourceHash === targetHash) {
    throw new Error('Branches are already up to date, nothing to merge.');
  }

  // Get files from both branches
  const [{ data: sourceFiles }, { data: targetFiles }] = await Promise.all([
    supabase.from('git_file_snapshots').select('path, content').eq('repo_id', repoId).eq('commit_hash', sourceHash),
    supabase.from('git_file_snapshots').select('path, content').eq('repo_id', repoId).eq('commit_hash', targetHash),
  ]);

  // Merge file trees: source files override target files
  const fileMap = new Map<string, string>();
  for (const f of (targetFiles || []) as any[]) {
    fileMap.set(f.path, f.content);
  }
  for (const f of (sourceFiles || []) as any[]) {
    fileMap.set(f.path, f.content);
  }

  // Build merged file entries
  const fileEntries: Array<{ path: string; blobHash: string; content: string; sizeBytes: number; language: string }> = [];
  for (const [path, content] of fileMap) {
    const blobHash = await computeBlobHash(content);
    fileEntries.push({
      path,
      blobHash,
      content,
      sizeBytes: new TextEncoder().encode(content).length,
      language: detectLanguage(path),
    });
  }

  // Compute merge commit
  const treeHash = await computeTreeHash(fileEntries.map((f) => ({ path: f.path, blobHash: f.blobHash })));
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `Merge branch '${sourceBranch}' into ${targetBranch}`;
  const commitHash = await computeCommitHash({
    treeHash,
    parentHash: targetHash,
    author,
    message,
    timestamp,
  });

  const isoTimestamp = new Date(timestamp * 1000).toISOString();

  // Store merged file snapshots
  if (fileEntries.length > 0) {
    const { error: snapshotError } = await supabase.from('git_file_snapshots').insert(
      fileEntries.map((f) => ({
        repo_id: repoId,
        commit_hash: commitHash,
        path: f.path,
        blob_hash: f.blobHash,
        content: f.content,
        size_bytes: f.sizeBytes,
        language: f.language,
      })),
    );
    if (snapshotError) {
      throw new Error(snapshotError.message);
    }
  }

  // Update target branch ref
  const { error: refError } = await supabase.from('git_refs').upsert(
    {
      repo_id: repoId,
      ref_name: `refs/heads/${targetBranch}`,
      target_hash: commitHash,
    },
    { onConflict: 'repo_id,ref_name' },
  );
  if (refError) {
    throw new Error(refError.message);
  }

  return {
    hash: commitHash,
    parentHash: targetHash,
    treeHash,
    message,
    author,
    timestamp: isoTimestamp,
    filesChanged: fileEntries.length,
  };
};

/**
 * Compute diff between a commit and its parent.
 */
export const getCommitDiff = async ({
  repoId,
  commitHash,
}: {
  repoId: string;
  commitHash: string;
}): Promise<GitDiffEntry[]> => {
  const { supabase } = await getAuthenticatedClient();

  // Get this commit's files
  const { data: currentFiles, error: currentError } = await supabase
    .from('git_file_snapshots')
    .select('path, blob_hash, content')
    .eq('repo_id', repoId)
    .eq('commit_hash', commitHash);

  if (currentError) {
    throw new Error(currentError.message);
  }

  // Get parent hash from repo_commits
  const { data: commitData } = await supabase
    .from('repo_commits')
    .select('parent_hash')
    .eq('repo_id', repoId)
    .eq('git_hash', commitHash)
    .maybeSingle();

  const parentHash = commitData?.parent_hash || null;

  // Get parent commit's files (if any)
  let parentFiles: Array<{ path: string; blob_hash: string; content: string }> = [];
  if (parentHash) {
    const { data } = await supabase
      .from('git_file_snapshots')
      .select('path, blob_hash, content')
      .eq('repo_id', repoId)
      .eq('commit_hash', parentHash);
    parentFiles = (data || []) as any[];
  }

  // Build diff
  const parentMap = new Map(parentFiles.map((f) => [f.path, f]));
  const currentMap = new Map((currentFiles || []).map((f: any) => [f.path, f]));
  const diff: GitDiffEntry[] = [];

  // Check for added and modified files
  for (const [path, file] of currentMap) {
    const parentFile = parentMap.get(path);
    if (!parentFile) {
      diff.push({ path, status: 'added', oldContent: '', newContent: (file as any).content });
    } else if ((parentFile as any).blob_hash !== (file as any).blob_hash) {
      diff.push({ path, status: 'modified', oldContent: (parentFile as any).content, newContent: (file as any).content });
    }
  }

  // Check for deleted files
  for (const [path, file] of parentMap) {
    if (!currentMap.has(path)) {
      diff.push({ path, status: 'deleted', oldContent: (file as any).content, newContent: '' });
    }
  }

  return diff.sort((a, b) => a.path.localeCompare(b.path));
};

/**
 * Delete a branch (cannot delete main).
 */
export const deleteBranch = async ({
  repoId,
  branchName,
}: {
  repoId: string;
  branchName: string;
}): Promise<void> => {
  if (branchName === 'main') {
    throw new Error('Cannot delete the main branch.');
  }

  const { supabase } = await getAuthenticatedClient();

  const { error } = await supabase
    .from('git_refs')
    .delete()
    .eq('repo_id', repoId)
    .eq('ref_name', `refs/heads/${branchName}`);

  if (error) {
    throw new Error(error.message);
  }
};
