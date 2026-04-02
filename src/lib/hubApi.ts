import { getSupabaseClient } from '@/lib/supabase';

export type RepositoryVisibility = 'public' | 'private';

export type HubRepository = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  visibility: RepositoryVisibility;
  readme_md: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HubRepositoryFile = {
  id: number;
  repo_id: string;
  path: string;
  language: string;
  content?: string;
  size_bytes: number;
  updated_at: string;
};

export type HubRepositoryCommit = {
  id: number;
  repo_id: string;
  author_id: string | null;
  message: string;
  files_changed: number;
  created_at: string;
};

export type HubActivityLog = {
  id: number;
  activity_type: string;
  activity_context: Record<string, unknown>;
  created_at: string;
};

export type DashboardBootstrap = {
  user: {
    id: string;
    email: string;
    fullName: string;
    username: string;
  };
  profileReadme: string;
  repositories: HubRepository[];
  activityLogs: HubActivityLog[];
};

export type CreateRepositoryInput = {
  name: string;
  description: string;
  visibility: RepositoryVisibility;
  initializeWithReadme: boolean;
};

export type UploadRepositoryFilesInput = {
  repoId: string;
  files: File[];
  commitMessage: string;
};

const MAX_FILES_PER_UPLOAD = 30;
const MAX_FILE_SIZE_BYTES = 350_000;

const extensionLanguageMap: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  json: 'json',
  html: 'html',
  css: 'css',
  scss: 'scss',
  md: 'markdown',
  py: 'python',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  sh: 'shell',
  txt: 'plaintext',
};

const normalizeRepoSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const detectLanguageFromPath = (path: string) => {
  const extension = path.split('.').pop()?.toLowerCase() || '';
  return extensionLanguageMap[extension] || 'plaintext';
};

const normalizeUsername = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const buildUsernameCandidate = ({ fullName, email, userId }: { fullName: string; email: string; userId: string }) => {
  const fromName = normalizeUsername(fullName);
  if (fromName) {
    return fromName;
  }

  const emailPrefix = normalizeUsername((email || '').split('@')[0] || '');
  if (emailPrefix) {
    return emailPrefix;
  }

  return `user-${userId.slice(0, 6).toLowerCase()}`;
};

const ensureAuthenticatedUser = async () => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error('You need to sign in first.');
  }

  return { supabase, user: data.user };
};

const pushActivity = async ({
  userId,
  email,
  activityType,
  context,
}: {
  userId: string;
  email: string;
  activityType: string;
  context: Record<string, unknown>;
}) => {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('activity_logs').insert({
      user_id: userId,
      email,
      activity_type: activityType,
      activity_context: context,
    });
  } catch (error) {
    console.error('Unable to push activity log:', error);
  }
};

const ensureProfileRow = async ({
  userId,
  email,
  fullName,
}: {
  userId: string;
  email: string;
  fullName: string;
}) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, username, profile_readme')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    if (!data.username) {
      const fallbackUsername = buildUsernameCandidate({
        fullName,
        email,
        userId,
      });

      const { data: updated, error: updateError } = await supabase
        .from('user_profiles')
        .update({
          username: fallbackUsername,
        })
        .eq('id', userId)
        .select('id, email, full_name, username, profile_readme')
        .single();

      if (!updateError && updated) {
        return updated;
      }
    }

    return data;
  }

  const initialUsername = buildUsernameCandidate({
    fullName,
    email,
    userId,
  });

  const { data: inserted, error: insertError } = await supabase
    .from('user_profiles')
    .insert({
      id: userId,
      email: email.toLowerCase().trim(),
      full_name: fullName,
      username: initialUsername,
      profile_readme: '',
    })
    .select('id, email, full_name, username, profile_readme')
    .single();

  if (insertError && insertError.code === '23505') {
    const fallbackUsername = `${initialUsername}-${userId.slice(0, 6).toLowerCase()}`;
    const { data: fallbackInserted, error: fallbackError } = await supabase
      .from('user_profiles')
      .insert({
        id: userId,
        email: email.toLowerCase().trim(),
        full_name: fullName,
        username: fallbackUsername,
        profile_readme: '',
      })
      .select('id, email, full_name, username, profile_readme')
      .single();

    if (fallbackError) {
      throw new Error(fallbackError.message);
    }

    return fallbackInserted;
  }

  if (insertError || !inserted) {
    throw new Error(insertError?.message || 'Unable to initialize user profile.');
  }

  return inserted;
};

const buildDefaultProfileReadme = (fullName: string) => {
  const title = fullName || 'CyberX Developer';
  return `# ${title}

## About
- Building secure software and tooling.
- Sharing code in public and private repositories.

## Current Focus
- Security engineering
- Full-stack product development
`;
};

export const getDashboardBootstrap = async (): Promise<DashboardBootstrap> => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const fullName = (user.user_metadata.full_name as string | undefined)?.trim() || 'CyberX Developer';
  const profile = await ensureProfileRow({
    userId: user.id,
    email: user.email || '',
    fullName,
  });
  const resolvedUsername = (profile.username as string | null) || buildUsernameCandidate({
    fullName: profile.full_name || fullName,
    email: user.email || '',
    userId: user.id,
  });

  const [{ data: repositories, error: repositoriesError }, { data: activityLogs, error: activityError }] =
    await Promise.all([
      supabase
        .from('repositories')
        .select('id, owner_id, name, slug, description, visibility, readme_md, archived_at, created_at, updated_at')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('activity_logs')
        .select('id, activity_type, activity_context, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

  if (repositoriesError) {
    throw new Error(repositoriesError.message);
  }

  if (activityError) {
    throw new Error(activityError.message);
  }

  return {
    user: {
      id: user.id,
      email: user.email || '',
      fullName: profile.full_name || fullName,
      username: resolvedUsername,
    },
    profileReadme: profile.profile_readme || buildDefaultProfileReadme(profile.full_name || fullName),
    repositories: (repositories || []) as HubRepository[],
    activityLogs: (activityLogs || []) as HubActivityLog[],
  };
};

export const getCurrentUserUsername = async () => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const fullName = (user.user_metadata.full_name as string | undefined)?.trim() || 'CyberX Developer';
  const profile = await ensureProfileRow({
    userId: user.id,
    email: user.email || '',
    fullName,
  });

  return profile.username as string;
};

export const updateProfileReadme = async (profileReadme: string) => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const { data, error } = await supabase
    .from('user_profiles')
    .update({
      profile_readme: profileReadme,
    })
    .eq('id', user.id)
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await pushActivity({
    userId: user.id,
    email: user.email || '',
    activityType: 'profile_readme_updated',
    context: {
      length: profileReadme.length,
    },
  });

  return data;
};

export const listRepositories = async () => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const { data, error } = await supabase
    .from('repositories')
    .select('id, owner_id, name, slug, description, visibility, readme_md, archived_at, created_at, updated_at')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as HubRepository[];
};

export const listActivityLogs = async () => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const { data, error } = await supabase
    .from('activity_logs')
    .select('id, activity_type, activity_context, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as HubActivityLog[];
};

export const createRepository = async (input: CreateRepositoryInput) => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const name = input.name.trim();
  const description = input.description.trim();

  if (!name) {
    throw new Error('Repository name is required.');
  }

  const slug = normalizeRepoSlug(name);
  if (!slug) {
    throw new Error('Repository name must contain letters or numbers.');
  }

  const defaultReadme = input.initializeWithReadme
    ? `# ${name}

${description || 'Describe your project here.'}
`
    : '';

  const { data, error } = await supabase
    .from('repositories')
    .insert({
      owner_id: user.id,
      name,
      slug,
      description,
      visibility: input.visibility,
      readme_md: defaultReadme,
    })
    .select('id, owner_id, name, slug, description, visibility, readme_md, archived_at, created_at, updated_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Repository with this name already exists.');
    }

    throw new Error(error.message);
  }

  if (defaultReadme) {
    const { error: readmeError } = await supabase.from('repo_files').upsert(
      {
        repo_id: data.id,
        path: 'README.md',
        language: 'markdown',
        content: defaultReadme,
        size_bytes: new TextEncoder().encode(defaultReadme).length,
        created_by: user.id,
      },
      {
        onConflict: 'repo_id,path',
      },
    );

    if (readmeError) {
      throw new Error(readmeError.message);
    }
  }

  const { error: commitError } = await supabase.from('repo_commits').insert({
    repo_id: data.id,
    author_id: user.id,
    message: 'Initial commit',
    files_changed: defaultReadme ? 1 : 0,
  });

  if (commitError) {
    throw new Error(commitError.message);
  }

  await pushActivity({
    userId: user.id,
    email: user.email || '',
    activityType: 'repo_created',
    context: {
      repo_id: data.id,
      repo_name: data.name,
      visibility: data.visibility,
    },
  });

  return data as HubRepository;
};

export const updateRepositoryVisibility = async ({
  repoId,
  visibility,
}: {
  repoId: string;
  visibility: RepositoryVisibility;
}) => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const { data, error } = await supabase
    .from('repositories')
    .update({
      visibility,
    })
    .eq('id', repoId)
    .select('id, owner_id, name, slug, description, visibility, readme_md, archived_at, created_at, updated_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await pushActivity({
    userId: user.id,
    email: user.email || '',
    activityType: 'repo_visibility_changed',
    context: {
      repo_id: repoId,
      visibility,
    },
  });

  return data as HubRepository;
};

export const setRepositoryArchiveState = async ({
  repoId,
  archive,
}: {
  repoId: string;
  archive: boolean;
}) => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const { data, error } = await supabase
    .from('repositories')
    .update({
      archived_at: archive ? new Date().toISOString() : null,
    })
    .eq('id', repoId)
    .select('id, owner_id, name, slug, description, visibility, readme_md, archived_at, created_at, updated_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await pushActivity({
    userId: user.id,
    email: user.email || '',
    activityType: archive ? 'repo_archived' : 'repo_unarchived',
    context: {
      repo_id: repoId,
    },
  });

  return data as HubRepository;
};

export const deleteRepository = async (repoId: string) => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const { data: repo, error: repoError } = await supabase
    .from('repositories')
    .select('id, name')
    .eq('id', repoId)
    .single();

  if (repoError) {
    throw new Error(repoError.message);
  }

  const { error } = await supabase.from('repositories').delete().eq('id', repoId);

  if (error) {
    throw new Error(error.message);
  }

  await pushActivity({
    userId: user.id,
    email: user.email || '',
    activityType: 'repo_deleted',
    context: {
      repo_id: repoId,
      repo_name: repo.name,
    },
  });
};

export const listRepositoryFiles = async (repoId: string) => {
  const { supabase } = await ensureAuthenticatedUser();
  const { data, error } = await supabase
    .from('repo_files')
    .select('id, repo_id, path, language, size_bytes, updated_at')
    .eq('repo_id', repoId)
    .order('path', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as HubRepositoryFile[];
};

export const getRepositoryFileContent = async (repoId: string, filePath: string) => {
  const { supabase } = await ensureAuthenticatedUser();
  const { data, error } = await supabase
    .from('repo_files')
    .select('id, repo_id, path, language, content, size_bytes, updated_at')
    .eq('repo_id', repoId)
    .eq('path', filePath)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as HubRepositoryFile;
};

export const listRepositoryCommits = async (repoId: string) => {
  const { supabase } = await ensureAuthenticatedUser();
  const { data, error } = await supabase
    .from('repo_commits')
    .select('id, repo_id, author_id, message, files_changed, created_at')
    .eq('repo_id', repoId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as HubRepositoryCommit[];
};

export const uploadRepositoryFiles = async ({ repoId, files, commitMessage }: UploadRepositoryFilesInput) => {
  const { supabase, user } = await ensureAuthenticatedUser();

  if (!files.length) {
    throw new Error('Select at least one file to upload.');
  }

  if (files.length > MAX_FILES_PER_UPLOAD) {
    throw new Error(`You can upload up to ${MAX_FILES_PER_UPLOAD} files at once.`);
  }

  const records: Array<{
    repo_id: string;
    path: string;
    language: string;
    content: string;
    size_bytes: number;
    created_by: string;
  }> = [];

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`"${file.name}" is larger than ${Math.floor(MAX_FILE_SIZE_BYTES / 1024)} KB.`);
    }

    const path = (file.webkitRelativePath || file.name).trim();
    if (!path) {
      continue;
    }

    const content = await file.text();

    if (content.includes('\u0000')) {
      throw new Error(`"${path}" appears to be a binary file. Upload only text/code files.`);
    }

    records.push({
      repo_id: repoId,
      path,
      language: detectLanguageFromPath(path),
      content,
      size_bytes: file.size,
      created_by: user.id,
    });
  }

  if (!records.length) {
    throw new Error('No readable code files were found in your selection.');
  }

  const { error: uploadError } = await supabase.from('repo_files').upsert(records, {
    onConflict: 'repo_id,path',
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const message = commitMessage.trim() || `Upload ${records.length} file(s)`;
  const { error: commitError } = await supabase.from('repo_commits').insert({
    repo_id: repoId,
    author_id: user.id,
    message,
    files_changed: records.length,
  });

  if (commitError) {
    throw new Error(commitError.message);
  }

  const readmeRecord = records.find((record) => record.path.toLowerCase() === 'readme.md');
  if (readmeRecord) {
    await supabase
      .from('repositories')
      .update({
        readme_md: readmeRecord.content,
      })
      .eq('id', repoId);
  }

  await pushActivity({
    userId: user.id,
    email: user.email || '',
    activityType: 'repo_files_uploaded',
    context: {
      repo_id: repoId,
      files_changed: records.length,
    },
  });

  return records.length;
};

export const signOutDashboardUser = async () => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
};
