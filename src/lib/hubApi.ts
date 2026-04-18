import { getSupabaseClient } from '@/lib/supabase';
import { clearGitHubToken, fetchGitHubRepoReadme, fetchGitHubRepoZip, type GitHubRepoImportInput } from '@/lib/githubApi';
import JSZip from 'jszip';
import {
  initGitRepo,
  commitChanges as gitCommitChanges,
  listBranches as gitListBranches,
  createBranch as gitCreateBranch,
  mergeBranch as gitMergeBranch,
  deleteBranch as gitDeleteBranch,
  getCommitDiff as gitGetCommitDiff,
  getFileAtCommit as gitGetFileAtCommit,
  listFilesAtCommit as gitListFilesAtCommit,
  backfillRepoGitHistory,
  type GitAuthor,
  type GitBranch,
  type GitDiffEntry,
  type GitFileSnapshot,
} from '@/lib/gitVcs';

export type RepositoryVisibility = 'public' | 'private';

export type HubRepository = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  visibility: RepositoryVisibility;
  show_in_tool_list: boolean;
  readme_md: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  github_url: string | null;
  imported_from_github: boolean;
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
  git_hash?: string | null;
  parent_hash?: string | null;
};

export type HubActivityLog = {
  id: number;
  activity_type: string;
  activity_context: Record<string, unknown>;
  created_at: string;
};

export type HubUserProfile = {
  id: string;
  email: string;
  fullName: string;
  username: string;
  profileReadme: string;
  bio: string;
  phoneNumber: string;
  address: string;
  linkedinUrl: string;
  githubUrl: string;
  websiteUrl: string;
  locationLabel: string;
  locationLat: number | null;
  locationLng: number | null;
  avatarUrl: string;
};

export type DashboardBootstrap = {
  user: {
    id: string;
    email: string;
    fullName: string;
    username: string;
    bio: string;
    phoneNumber: string;
    address: string;
    linkedinUrl: string;
    githubUrl: string;
    websiteUrl: string;
    locationLabel: string;
    locationLat: number | null;
    locationLng: number | null;
    avatarUrl: string;
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
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const PROFILE_SELECT_COLUMNS_BASE = 'id, email, full_name, username, profile_readme, bio, phone_number, avatar_url';
const PROFILE_SELECT_COLUMNS_WITH_SOCIAL = `${PROFILE_SELECT_COLUMNS_BASE}, address, linkedin_url, github_url, website_url`;
const PROFILE_SELECT_COLUMNS_WITH_LOCATION = `${PROFILE_SELECT_COLUMNS_BASE}, location_label, location_lat, location_lng`;
const PROFILE_SELECT_COLUMNS_WITH_SOCIAL_AND_LOCATION = `${PROFILE_SELECT_COLUMNS_WITH_SOCIAL}, location_label, location_lat, location_lng`;
const REPOSITORY_SELECT_COLUMNS_BASE = 'id, owner_id, name, slug, description, visibility, readme_md, archived_at, created_at, updated_at';
const REPOSITORY_SELECT_COLUMNS_WITH_TOOL_LIST = `${REPOSITORY_SELECT_COLUMNS_BASE}, show_in_tool_list`;
const DEFAULT_PROFILE_REPOSITORY_DESCRIPTION = 'Default profile repository for dashboard README.';
let repositoriesHasToolListColumnCache: boolean | null = null;
let profileHasSocialColumnsCache: boolean | null = null;
let profileHasLocationColumnsCache: boolean | null = null;

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

const normalizeRepositoryPath = (value: string) =>
  value
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .split('/')
    .filter(Boolean)
    .join('/')
    .toLowerCase();

const normalizeZipFilePath = (value: string) =>
  value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .join('/');

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error(`Unable to read "${file.name}".`));
    reader.readAsDataURL(file);
  });

const isKnownTextMime = (mimeType: string) => {
  const normalized = (mimeType || '').toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith('text/')) {
    return true;
  }

  return [
    'application/json',
    'application/javascript',
    'application/xml',
    'application/x-sh',
    'image/svg+xml',
  ].some((mime) => normalized.includes(mime));
};

const hasNullByte = (buffer: ArrayBuffer) => {
  const view = new Uint8Array(buffer);
  const sampleSize = Math.min(view.length, 8192);
  for (let index = 0; index < sampleSize; index += 1) {
    if (view[index] === 0) {
      return true;
    }
  }

  return false;
};

const decodeDataUrlToBytes = (dataUrl: string) => {
  const separatorIndex = dataUrl.indexOf(',');
  if (separatorIndex === -1) {
    return new TextEncoder().encode(dataUrl);
  }

  const metadata = dataUrl.slice(0, separatorIndex);
  const payload = dataUrl.slice(separatorIndex + 1);

  if (/;base64/i.test(metadata)) {
    const binaryString = atob(payload);
    const bytes = new Uint8Array(binaryString.length);
    for (let index = 0; index < binaryString.length; index += 1) {
      bytes[index] = binaryString.charCodeAt(index);
    }
    return bytes;
  }

  return new TextEncoder().encode(decodeURIComponent(payload));
};

const shouldTreatAsBinary = ({ file, path, buffer }: { file: File; path: string; buffer: ArrayBuffer }) => {
  const extension = path.split('.').pop()?.toLowerCase() || '';
  const isKnownTextExtension = Boolean(extensionLanguageMap[extension]);

  if (isKnownTextMime(file.type) || isKnownTextExtension) {
    return false;
  }

  return hasNullByte(buffer) || Boolean(file.type && !file.type.startsWith('text/'));
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

const isMissingColumnError = (error: any, columnName: string) => {
  if (!error) {
    return false;
  }

  return (
    error.code === '42703' ||
    (typeof error.message === 'string' &&
      error.message.toLowerCase().includes('does not exist') &&
      error.message.toLowerCase().includes(columnName.toLowerCase()))
  );
};

const hasRepositoryToolListColumn = async (supabase: any, forceRefresh = false) => {
  if (!forceRefresh && repositoriesHasToolListColumnCache !== null) {
    return repositoriesHasToolListColumnCache;
  }

  const { error } = await supabase.from('repositories').select('show_in_tool_list' as any).limit(1);
  if (error) {
    if (isMissingColumnError(error, 'show_in_tool_list')) {
      repositoriesHasToolListColumnCache = false;
      return false;
    }

    throw new Error(error.message);
  }

  repositoriesHasToolListColumnCache = true;
  return true;
};

const getRepositorySelectColumns = async (supabase: any) => {
  const hasToolListColumn = await hasRepositoryToolListColumn(supabase);
  return hasToolListColumn ? REPOSITORY_SELECT_COLUMNS_WITH_TOOL_LIST : REPOSITORY_SELECT_COLUMNS_BASE;
};

const hasProfileSocialColumns = async (supabase: any, forceRefresh = false) => {
  if (!forceRefresh && profileHasSocialColumnsCache !== null) {
    return profileHasSocialColumnsCache;
  }

  const { error } = await supabase.from('user_profiles').select('address' as any).limit(1);
  if (error) {
    if (isMissingColumnError(error, 'address')) {
      profileHasSocialColumnsCache = false;
      return false;
    }

    throw new Error(error.message);
  }

  profileHasSocialColumnsCache = true;
  return true;
};

const hasProfileLocationColumns = async (supabase: any, forceRefresh = false) => {
  if (!forceRefresh && profileHasLocationColumnsCache !== null) {
    return profileHasLocationColumnsCache;
  }

  const { error } = await supabase.from('user_profiles').select('location_lat' as any).limit(1);
  if (error) {
    if (isMissingColumnError(error, 'location_lat')) {
      profileHasLocationColumnsCache = false;
      return false;
    }

    throw new Error(error.message);
  }

  profileHasLocationColumnsCache = true;
  return true;
};

const getProfileSelectColumns = ({
  hasSocialColumns,
  hasLocationColumns,
}: {
  hasSocialColumns: boolean;
  hasLocationColumns: boolean;
}) => {
  if (hasSocialColumns && hasLocationColumns) {
    return PROFILE_SELECT_COLUMNS_WITH_SOCIAL_AND_LOCATION;
  }

  if (hasSocialColumns) {
    return PROFILE_SELECT_COLUMNS_WITH_SOCIAL;
  }

  if (hasLocationColumns) {
    return PROFILE_SELECT_COLUMNS_WITH_LOCATION;
  }

  return PROFILE_SELECT_COLUMNS_BASE;
};

const mapRepositoryRecord = (record: any): HubRepository => ({
  ...(record || {}),
  show_in_tool_list: Boolean(record?.show_in_tool_list),
  github_url: record?.github_url || null,
  imported_from_github: Boolean(record?.imported_from_github),
});

const mapRepositoryList = (records: any[] | null | undefined): HubRepository[] => (records || []).map(mapRepositoryRecord);

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

type LocalProfileExtras = {
  address: string;
  linkedinUrl: string;
  githubUrl: string;
  websiteUrl: string;
  locationLabel: string;
  locationLat: number | null;
  locationLng: number | null;
};

const LOCAL_PROFILE_EXTRAS_KEY_PREFIX = 'cyberx_profile_extras_';

const readLocalProfileExtras = (userId: string): LocalProfileExtras => {
  if (typeof window === 'undefined') {
    return {
      address: '',
      linkedinUrl: '',
      githubUrl: '',
      websiteUrl: '',
      locationLabel: '',
      locationLat: null,
      locationLng: null,
    };
  }

  try {
    const raw = window.localStorage.getItem(`${LOCAL_PROFILE_EXTRAS_KEY_PREFIX}${userId}`);
    if (!raw) {
      return {
        address: '',
        linkedinUrl: '',
        githubUrl: '',
        websiteUrl: '',
        locationLabel: '',
        locationLat: null,
        locationLng: null,
      };
    }

    const parsed = JSON.parse(raw) as Partial<LocalProfileExtras>;
    return {
      address: typeof parsed.address === 'string' ? parsed.address : '',
      linkedinUrl: typeof parsed.linkedinUrl === 'string' ? parsed.linkedinUrl : '',
      githubUrl: typeof parsed.githubUrl === 'string' ? parsed.githubUrl : '',
      websiteUrl: typeof parsed.websiteUrl === 'string' ? parsed.websiteUrl : '',
      locationLabel: typeof parsed.locationLabel === 'string' ? parsed.locationLabel : '',
      locationLat: typeof parsed.locationLat === 'number' && Number.isFinite(parsed.locationLat) ? parsed.locationLat : null,
      locationLng: typeof parsed.locationLng === 'number' && Number.isFinite(parsed.locationLng) ? parsed.locationLng : null,
    };
  } catch {
    return {
      address: '',
      linkedinUrl: '',
      githubUrl: '',
      websiteUrl: '',
      locationLabel: '',
      locationLat: null,
      locationLng: null,
    };
  }
};

const writeLocalProfileExtras = (userId: string, extras: LocalProfileExtras) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(`${LOCAL_PROFILE_EXTRAS_KEY_PREFIX}${userId}`, JSON.stringify(extras));
  } catch {
    // ignore localStorage write failures
  }
};

const mergeProfileExtras = ({
  userId,
  profile,
}: {
  userId: string;
  profile: HubUserProfile;
}): HubUserProfile => {
  const local = readLocalProfileExtras(userId);
  return {
    ...profile,
    address: profile.address || local.address,
    linkedinUrl: profile.linkedinUrl || local.linkedinUrl,
    githubUrl: profile.githubUrl || local.githubUrl,
    websiteUrl: profile.websiteUrl || local.websiteUrl,
    locationLabel: profile.locationLabel || local.locationLabel,
    locationLat: profile.locationLat ?? local.locationLat,
    locationLng: profile.locationLng ?? local.locationLng,
  };
};

const mapProfileRecord = ({
  profile,
  fallbackEmail,
  fallbackName,
}: {
  profile: {
    id: string;
    email: string | null;
    full_name: string | null;
    username: string | null;
    profile_readme: string | null;
    bio: string | null;
    phone_number: string | null;
    address?: string | null;
    linkedin_url?: string | null;
    github_url?: string | null;
    website_url?: string | null;
    location_label?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
    avatar_url: string | null;
  };
  fallbackEmail: string;
  fallbackName: string;
}): HubUserProfile => ({
  id: profile.id,
  email: (profile.email || fallbackEmail || '').trim(),
  fullName: (profile.full_name || fallbackName || '').trim(),
  username: (profile.username || '').trim(),
  profileReadme: profile.profile_readme || '',
  bio: profile.bio || '',
  phoneNumber: profile.phone_number || '',
  address: profile.address || '',
  linkedinUrl: profile.linkedin_url || '',
  githubUrl: profile.github_url || '',
  websiteUrl: profile.website_url || '',
  locationLabel: profile.location_label || '',
  locationLat: typeof profile.location_lat === 'number' ? profile.location_lat : null,
  locationLng: typeof profile.location_lng === 'number' ? profile.location_lng : null,
  avatarUrl: profile.avatar_url || '',
});

const normalizeOptionalUrl = (value: string, label: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).toString();
  } catch {
    throw new Error(`Enter a valid ${label} URL.`);
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
}): Promise<any> => {
  const supabase = getSupabaseClient();
  const [hasSocialColumns, hasLocationColumns] = await Promise.all([
    hasProfileSocialColumns(supabase),
    hasProfileLocationColumns(supabase),
  ]);
  const profileSelectColumns = getProfileSelectColumns({
    hasSocialColumns,
    hasLocationColumns,
  });
  const { data, error } = await supabase
    .from('user_profiles')
    .select(profileSelectColumns as any)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    if (!(data as any).username) {
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
        .select(profileSelectColumns as any)
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

  const profileInsertDefaults = {
    id: userId,
    email: email.toLowerCase().trim(),
    full_name: fullName,
    username: initialUsername,
    profile_readme: '',
    bio: '',
    phone_number: '',
    avatar_url: '',
    ...(hasSocialColumns
      ? {
          address: '',
          linkedin_url: '',
          github_url: '',
          website_url: '',
        }
      : {}),
    ...(hasLocationColumns
      ? {
          location_label: '',
          location_lat: null,
          location_lng: null,
        }
      : {}),
  };

  const { data: inserted, error: insertError } = await supabase
    .from('user_profiles')
    .insert(profileInsertDefaults)
    .select(profileSelectColumns as any)
    .single();

  if (insertError && insertError.code === '23505') {
    const fallbackUsername = `${initialUsername}-${userId.slice(0, 6).toLowerCase()}`;
    const fallbackInsertDefaults = {
      id: userId,
      email: email.toLowerCase().trim(),
      full_name: fullName,
      username: fallbackUsername,
      profile_readme: '',
      bio: '',
      phone_number: '',
      avatar_url: '',
      ...(hasSocialColumns
        ? {
            address: '',
            linkedin_url: '',
            github_url: '',
            website_url: '',
          }
        : {}),
      ...(hasLocationColumns
        ? {
            location_label: '',
            location_lat: null,
            location_lng: null,
          }
        : {}),
    };

    const { data: fallbackInserted, error: fallbackError } = await supabase
      .from('user_profiles')
      .insert(fallbackInsertDefaults)
      .select(profileSelectColumns as any)
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
  const title = fullName || 'Cyberspace-X 2.0 Developer';
  return `# ${title}

## About
- Building secure software and tooling.
- Sharing code in public and private repositories.

## Current Focus
- Security engineering
- Full-stack product development
`;
};

const getProfileRepositoryName = (username: string, userId: string) => {
  const normalizedUsername = (username || '').trim();
  if (normalizedUsername) {
    return `${normalizedUsername}.md`;
  }

  return `user-${userId.slice(0, 6).toLowerCase()}.md`;
};

const getProfileRepositorySlug = (username: string, userId: string) =>
  normalizeRepoSlug(getProfileRepositoryName(username, userId));

const getLegacyProfileRepositorySlug = (username: string, userId: string) =>
  normalizeRepoSlug((username || '').trim() || `user-${userId.slice(0, 6).toLowerCase()}`);

const getProfileRepositoryFilePath = (username: string, userId: string) =>
  getProfileRepositoryName(username, userId);

const isProfileRepositoryForUser = ({
  repoName,
  repoSlug,
  username,
  userId,
}: {
  repoName: string;
  repoSlug: string;
  username: string;
  userId: string;
}) => {
  const expectedName = getProfileRepositoryName(username, userId).toLowerCase();
  const expectedSlug = getProfileRepositorySlug(username, userId);
  return repoName.toLowerCase() === expectedName || repoSlug === expectedSlug;
};

const upsertRepositoryFile = async ({
  supabase,
  repoId,
  userId,
  filePath,
  content,
}: {
  supabase: any;
  repoId: string;
  userId: string;
  filePath: string;
  content: string;
}) => {
  const language = filePath.toLowerCase().endsWith('.md') ? 'markdown' : detectLanguageFromPath(filePath);
  const { error: fileError } = await supabase.from('repo_files').upsert(
    {
      repo_id: repoId,
      path: filePath,
      language,
      content,
      size_bytes: new TextEncoder().encode(content).length,
      created_by: userId,
    },
    {
      onConflict: 'repo_id,path',
    },
  );

  if (fileError) {
    throw new Error(fileError.message);
  }
};

const readRepositoryFileByPath = async ({
  supabase,
  repoId,
  filePath,
}: {
  supabase: any;
  repoId: string;
  filePath: string;
}) => {
  const { data, error } = await supabase
    .from('repo_files')
    .select('path, content, language')
    .eq('repo_id', repoId)
    .eq('path', filePath)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as { path: string; content: string; language: string } | null;
};

const syncRepositoryProfileFiles = async ({
  supabase,
  repoId,
  userId,
  username,
  profileMarkdown,
  commitMessage,
  createCommit,
}: {
  supabase: any;
  repoId: string;
  userId: string;
  username: string;
  profileMarkdown: string;
  commitMessage: string;
  createCommit: boolean;
}) => {
  const profileFilePath = getProfileRepositoryFilePath(username, userId);

  const { error: repoUpdateError } = await supabase
    .from('repositories')
    .update({
      readme_md: profileMarkdown,
    })
    .eq('id', repoId);

  if (repoUpdateError) {
    throw new Error(repoUpdateError.message);
  }

  await upsertRepositoryFile({
    supabase,
    repoId,
    userId,
    filePath: profileFilePath,
    content: profileMarkdown,
  });

  await upsertRepositoryFile({
    supabase,
    repoId,
    userId,
    filePath: 'README.md',
    content: profileMarkdown,
  });

  if (!createCommit) {
    return;
  }

  const { error: commitError } = await supabase.from('repo_commits').insert({
    repo_id: repoId,
    author_id: userId,
    message: commitMessage,
    files_changed: 1,
  });

  if (commitError) {
    throw new Error(commitError.message);
  }
};

const ensureDefaultProfileRepository = async ({
  supabase,
  userId,
  username,
  profileMarkdown,
}: {
  supabase: any;
  userId: string;
  username: string;
  profileMarkdown: string;
}): Promise<{ repository: HubRepository; createdNow: boolean; profileFilePath: string }> => {
  const repoName = getProfileRepositoryName(username, userId);
  const repoSlug = getProfileRepositorySlug(username, userId);
  const legacyRepoSlug = getLegacyProfileRepositorySlug(username, userId);
  const profileFilePath = getProfileRepositoryFilePath(username, userId);
  const repositorySelectColumns = await getRepositorySelectColumns(supabase);

  const fetchBySlug = async (slug: string) => {
    const { data, error } = await supabase
      .from('repositories')
      .select(repositorySelectColumns as any)
      .eq('owner_id', userId)
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return (data || null) as HubRepository | null;
  };

  let existingRepository = await fetchBySlug(repoSlug);
  let createdNow = false;

  if (!existingRepository && legacyRepoSlug !== repoSlug) {
    const legacyRepository = await fetchBySlug(legacyRepoSlug);
    if (legacyRepository) {
      const { data: renamedRepository, error: renameError } = await supabase
        .from('repositories')
        .update({
          name: repoName,
          slug: repoSlug,
        })
        .eq('id', legacyRepository.id)
        .select(repositorySelectColumns as any)
        .single();

      if (renameError) {
        throw new Error(renameError.message);
      }

      existingRepository = renamedRepository as HubRepository;
    }
  }

  if (!existingRepository) {
    const { data, error } = await supabase
      .from('repositories')
      .insert({
        owner_id: userId,
        name: repoName,
        slug: repoSlug,
        description: DEFAULT_PROFILE_REPOSITORY_DESCRIPTION,
        visibility: 'public',
        readme_md: profileMarkdown,
      })
      .select(repositorySelectColumns as any)
      .single();

    if (error) {
      if (error.code !== '23505') {
        throw new Error(error.message);
      }

      existingRepository = await fetchBySlug(repoSlug);
      if (!existingRepository) {
        throw new Error('Unable to create default profile repository.');
      }
    } else {
      existingRepository = data as HubRepository;
      createdNow = true;
    }
  }

  if (!existingRepository) {
    throw new Error('Unable to resolve default profile repository.');
  }

  const existingProfileFile = await readRepositoryFileByPath({
    supabase,
    repoId: existingRepository.id,
    filePath: profileFilePath,
  });
  const existingReadmeFile = await readRepositoryFileByPath({
    supabase,
    repoId: existingRepository.id,
    filePath: 'README.md',
  });

  const shouldInitializeFiles =
    createdNow ||
    !existingProfileFile?.content?.trim() ||
    !existingReadmeFile?.content?.trim() ||
    !existingRepository.readme_md?.trim();

  if (createdNow) {
    await syncRepositoryProfileFiles({
      supabase,
      repoId: existingRepository.id,
      userId,
      username,
      profileMarkdown,
      commitMessage: 'Initial profile README',
      createCommit: true,
    });
  } else if (shouldInitializeFiles) {
    await syncRepositoryProfileFiles({
      supabase,
      repoId: existingRepository.id,
      userId,
      username,
      profileMarkdown,
      commitMessage: 'Initialize profile README',
      createCommit: false,
    });
  }

  return {
    repository: mapRepositoryRecord(existingRepository),
    createdNow,
    profileFilePath,
  };
};

export const getDashboardBootstrap = async (): Promise<DashboardBootstrap> => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const repositorySelectColumns = await getRepositorySelectColumns(supabase);
  const fullName = (user.user_metadata.full_name as string | undefined)?.trim() || 'Cyberspace-X 2.0 Developer';
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
  let resolvedProfileReadme = profile.profile_readme || buildDefaultProfileReadme(profile.full_name || fullName);

  const { repository: profileRepository, profileFilePath } = await ensureDefaultProfileRepository({
    supabase,
    userId: user.id,
    username: resolvedUsername,
    profileMarkdown: resolvedProfileReadme,
  });

  const profileFile = await readRepositoryFileByPath({
    supabase,
    repoId: profileRepository.id,
    filePath: profileFilePath,
  });

  if (profileFile?.content && profileFile.content !== resolvedProfileReadme) {
    resolvedProfileReadme = profileFile.content;
    const { error: profileReadmeSyncError } = await supabase
      .from('user_profiles')
      .update({
        profile_readme: resolvedProfileReadme,
      })
      .eq('id', user.id);

    if (profileReadmeSyncError) {
      throw new Error(profileReadmeSyncError.message);
    }
  }

  const [{ data: repositories, error: repositoriesError }, { data: activityLogs, error: activityError }] =
    await Promise.all([
      supabase
        .from('repositories')
        .select(repositorySelectColumns as any)
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

  const mergedProfile = mergeProfileExtras({
    userId: user.id,
    profile: mapProfileRecord({
      profile,
      fallbackEmail: user.email || '',
      fallbackName: fullName,
    }),
  });

  return {
    user: {
      id: user.id,
      email: mergedProfile.email,
      fullName: mergedProfile.fullName,
      username: resolvedUsername,
      bio: mergedProfile.bio,
      phoneNumber: mergedProfile.phoneNumber,
      address: mergedProfile.address,
      linkedinUrl: mergedProfile.linkedinUrl,
      githubUrl: mergedProfile.githubUrl,
      websiteUrl: mergedProfile.websiteUrl,
      locationLabel: mergedProfile.locationLabel,
      locationLat: mergedProfile.locationLat,
      locationLng: mergedProfile.locationLng,
      avatarUrl: mergedProfile.avatarUrl,
    },
    profileReadme: resolvedProfileReadme,
    repositories: mapRepositoryList(repositories),
    activityLogs: (activityLogs || []) as HubActivityLog[],
  };
};

export const getCurrentUserUsername = async () => {
  const { user } = await ensureAuthenticatedUser();
  const fullName = (user.user_metadata.full_name as string | undefined)?.trim() || 'Cyberspace-X 2.0 Developer';
  const profile = await ensureProfileRow({
    userId: user.id,
    email: user.email || '',
    fullName,
  });

  return profile.username as string;
};

export const getCurrentUserProfile = async (): Promise<HubUserProfile> => {
  const { user } = await ensureAuthenticatedUser();
  const fullName = (user.user_metadata.full_name as string | undefined)?.trim() || 'Cyberspace-X 2.0 Developer';
  const profile = await ensureProfileRow({
    userId: user.id,
    email: user.email || '',
    fullName,
  });

  return mergeProfileExtras({
    userId: user.id,
    profile: mapProfileRecord({
      profile,
      fallbackEmail: user.email || '',
      fallbackName: fullName,
    }),
  });
};

export const updateCurrentUserProfile = async ({
  fullName,
  bio,
  phoneNumber,
  address,
  linkedinUrl,
  githubUrl,
  websiteUrl,
  locationLabel,
  locationLat,
  locationLng,
  avatarUrl,
}: {
  fullName: string;
  bio: string;
  phoneNumber: string;
  address: string;
  linkedinUrl: string;
  githubUrl: string;
  websiteUrl: string;
  locationLabel: string;
  locationLat: number | null;
  locationLng: number | null;
  avatarUrl: string;
}): Promise<HubUserProfile> => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const [hasSocialColumns, hasLocationColumns] = await Promise.all([
    hasProfileSocialColumns(supabase, true),
    hasProfileLocationColumns(supabase, true),
  ]);
  const profileSelectColumns = getProfileSelectColumns({
    hasSocialColumns,
    hasLocationColumns,
  });
  const nextFullName = fullName.trim();
  const nextBio = bio.trim();
  const nextPhoneNumber = phoneNumber.trim();
  const nextAddress = address.trim();
  const nextLinkedinUrl = normalizeOptionalUrl(linkedinUrl, 'LinkedIn');
  const nextGithubUrl = normalizeOptionalUrl(githubUrl, 'GitHub');
  const nextWebsiteUrl = normalizeOptionalUrl(websiteUrl, 'website');
  const nextLocationLabel = locationLabel.trim();
  const hasValidCoordinates =
    typeof locationLat === 'number' &&
    typeof locationLng === 'number' &&
    Number.isFinite(locationLat) &&
    Number.isFinite(locationLng);
  const nextLocationLat = hasValidCoordinates ? locationLat : null;
  const nextLocationLng = hasValidCoordinates ? locationLng : null;
  const nextAvatarUrl = avatarUrl.trim();

  if (!nextFullName) {
    throw new Error('Full name is required.');
  }

  if (nextAvatarUrl && !nextAvatarUrl.startsWith('http') && !nextAvatarUrl.startsWith('data:image/')) {
    throw new Error('Avatar must be an image URL or an uploaded image.');
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .update({
      full_name: nextFullName,
      bio: nextBio,
      phone_number: nextPhoneNumber,
      ...(hasSocialColumns
        ? {
            address: nextAddress,
            linkedin_url: nextLinkedinUrl,
            github_url: nextGithubUrl,
            website_url: nextWebsiteUrl,
          }
        : {}),
      ...(hasLocationColumns
        ? {
            location_label: nextLocationLabel,
            location_lat: nextLocationLat,
            location_lng: nextLocationLng,
          }
        : {}),
      avatar_url: nextAvatarUrl,
    })
    .eq('id', user.id)
    .select(profileSelectColumns as any)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Unable to update profile.');
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      full_name: nextFullName,
    },
  });

  if (metadataError) {
    console.error('Unable to sync auth metadata full_name:', metadataError);
  }

  await pushActivity({
    userId: user.id,
    email: user.email || '',
    activityType: 'profile_updated',
    context: {
      has_bio: Boolean(nextBio),
      has_phone: Boolean(nextPhoneNumber),
      has_address: hasSocialColumns ? Boolean(nextAddress) : false,
      has_linkedin: hasSocialColumns ? Boolean(nextLinkedinUrl) : false,
      has_github: hasSocialColumns ? Boolean(nextGithubUrl) : false,
      has_website: hasSocialColumns ? Boolean(nextWebsiteUrl) : false,
      has_location: hasLocationColumns ? Boolean(nextLocationLat !== null && nextLocationLng !== null) : false,
      has_avatar: Boolean(nextAvatarUrl),
    },
  });

  const localExtras: LocalProfileExtras = {
    address: nextAddress,
    linkedinUrl: nextLinkedinUrl,
    githubUrl: nextGithubUrl,
    websiteUrl: nextWebsiteUrl,
    locationLabel: nextLocationLabel,
    locationLat: nextLocationLat,
    locationLng: nextLocationLng,
  };
  writeLocalProfileExtras(user.id, localExtras);

  return mergeProfileExtras({
    userId: user.id,
    profile: mapProfileRecord({
      profile: data as any,
      fallbackEmail: user.email || '',
      fallbackName: nextFullName,
    }),
  });
};

export const updateCurrentUserEmail = async (email: string) => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const nextEmail = email.trim().toLowerCase();

  if (!nextEmail) {
    throw new Error('Email is required.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
    throw new Error('Enter a valid email address.');
  }

  const { error: authError } = await supabase.auth.updateUser({
    email: nextEmail,
  });

  if (authError) {
    throw new Error(authError.message);
  }

  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({
      email: nextEmail,
    })
    .eq('id', user.id);

  if (profileError) {
    throw new Error(profileError.message);
  }

  await pushActivity({
    userId: user.id,
    email: user.email || '',
    activityType: 'profile_email_update_requested',
    context: {
      email: nextEmail,
    },
  });

  return {
    message: 'Email update requested. Check your inbox to confirm the new email address.',
  };
};

export const updateProfileReadme = async (profileReadme: string) => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const nextReadme = profileReadme;
  const { data, error } = await supabase
    .from('user_profiles')
    .update({
      profile_readme: nextReadme,
    })
    .eq('id', user.id)
    .select('id, username, full_name')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const fallbackUsername = buildUsernameCandidate({
    fullName: data.full_name || (user.user_metadata.full_name as string | undefined)?.trim() || 'Cyberspace-X 2.0 Developer',
    email: user.email || '',
    userId: user.id,
  });
  const resolvedUsername = (data.username as string | null) || fallbackUsername;

  const { repository: defaultRepo, createdNow } = await ensureDefaultProfileRepository({
    supabase,
    userId: user.id,
    username: resolvedUsername,
    profileMarkdown: nextReadme,
  });

  if (!createdNow && defaultRepo.readme_md !== nextReadme) {
    await syncRepositoryProfileFiles({
      supabase,
      repoId: defaultRepo.id,
      userId: user.id,
      username: resolvedUsername,
      profileMarkdown: nextReadme,
      commitMessage: 'Update profile README',
      createCommit: true,
    });
  }

  await pushActivity({
    userId: user.id,
    email: user.email || '',
    activityType: 'profile_readme_updated',
    context: {
      length: nextReadme.length,
      repo_id: defaultRepo.id,
    },
  });

  return data;
};

export const listRepositories = async () => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const repositorySelectColumns = await getRepositorySelectColumns(supabase);
  const { data, error } = await supabase
    .from('repositories')
    .select(repositorySelectColumns as any)
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return mapRepositoryList(data);
};

export const listPushableRepositories = async () => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const repositorySelectColumns = await getRepositorySelectColumns(supabase);
  const { data, error } = await supabase
    .from('repositories')
    .select(repositorySelectColumns as any)
    .or(`owner_id.eq.${user.id},visibility.eq.public`)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return mapRepositoryList(data);
};

export const listPublicToolRepositories = async () => {
  const supabase = getSupabaseClient();
  const hasToolListColumn = await hasRepositoryToolListColumn(supabase, true);
  if (!hasToolListColumn) {
    return [];
  }

  const repositorySelectColumns = await getRepositorySelectColumns(supabase);
  const { data, error } = await supabase
    .from('repositories')
    .select(repositorySelectColumns as any)
    .eq('visibility', 'public')
    .eq('show_in_tool_list', true)
    .is('archived_at', null)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return mapRepositoryList(data);
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
  const hasToolListColumn = await hasRepositoryToolListColumn(supabase);
  const repositorySelectColumns = await getRepositorySelectColumns(supabase);
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
      ...(hasToolListColumn ? { show_in_tool_list: false } : {}),
      readme_md: defaultReadme,
    })
    .select(repositorySelectColumns as any)
    .single();

  if (error || !data) {
    if (error?.code === '23505') {
      throw new Error('Repository with this name already exists.');
    }

    throw new Error(error?.message || 'Failed to create repository.');
  }

  const repoData = data as any;

  if (defaultReadme) {
    const { error: readmeError } = await supabase.from('repo_files').upsert(
      {
        repo_id: repoData.id,
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

  // Create Git VCS commit with proper SHA hash
  let gitHash: string | null = null;
  try {
    const gitAuthor: GitAuthor = {
      name: (user.user_metadata?.full_name as string | undefined)?.trim() || 'Unknown',
      email: user.email || '',
    };
    const initialFiles = defaultReadme ? [{ path: 'README.md', content: defaultReadme }] : [];
    const gitCommit = await initGitRepo({ repoId: repoData.id, files: initialFiles, author: gitAuthor });
    gitHash = gitCommit.hash;
  } catch (gitError) {
    console.error('Git VCS init failed (non-blocking):', gitError);
  }

  const { error: commitError } = await supabase.from('repo_commits').insert({
    repo_id: repoData.id,
    author_id: user.id,
    message: 'Initial commit',
    files_changed: defaultReadme ? 1 : 0,
    git_hash: gitHash,
    parent_hash: null,
  });

  if (commitError) {
    throw new Error(commitError.message);
  }

  await pushActivity({
    userId: user.id,
    email: user.email || '',
    activityType: 'repo_created',
    context: {
      repo_id: repoData.id,
      repo_name: repoData.name,
      visibility: repoData.visibility,
    },
  });

  return mapRepositoryRecord(repoData);
};

export const updateRepositoryVisibility = async ({
  repoId,
  visibility,
}: {
  repoId: string;
  visibility: RepositoryVisibility;
}) => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const hasToolListColumn = await hasRepositoryToolListColumn(supabase);
  const repositorySelectColumns = await getRepositorySelectColumns(supabase);
  const { data, error } = await supabase
    .from('repositories')
    .update({
      visibility,
      ...(hasToolListColumn && visibility === 'private' ? { show_in_tool_list: false } : {}),
    })
    .eq('id', repoId)
    .select(repositorySelectColumns as any)
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

  return mapRepositoryRecord(data);
};

export const updateRepositoryToolListVisibility = async ({
  repoId,
  showInToolList,
}: {
  repoId: string;
  showInToolList: boolean;
}) => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const hasToolListColumn = await hasRepositoryToolListColumn(supabase, true);
  if (!hasToolListColumn) {
    throw new Error('Public tool list publishing is unavailable until the show_in_tool_list migration is applied.');
  }

  const repositorySelectColumns = await getRepositorySelectColumns(supabase);
  const { data: existingRepositoryRaw, error: existingRepositoryError } = await supabase
    .from('repositories')
    .select('id, owner_id, name, visibility, show_in_tool_list' as any)
    .eq('id', repoId)
    .single();

  if (existingRepositoryError) {
    throw new Error(existingRepositoryError.message);
  }

  const existingRepository = existingRepositoryRaw as any;

  if (existingRepository.owner_id !== user.id) {
    throw new Error('Only repository owners can publish to the public tool list.');
  }

  if (showInToolList && existingRepository.visibility !== 'public') {
    throw new Error('Make the repository public before publishing it to the public tool list.');
  }

  const { data, error } = await supabase
    .from('repositories')
    .update({
      show_in_tool_list: showInToolList,
    })
    .eq('id', repoId)
    .select(repositorySelectColumns as any)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await pushActivity({
    userId: user.id,
    email: user.email || '',
    activityType: showInToolList ? 'repo_published_to_tool_list' : 'repo_unpublished_from_tool_list',
    context: {
      repo_id: repoId,
      show_in_tool_list: showInToolList,
    },
  });

  return mapRepositoryRecord(data);
};

export const setRepositoryArchiveState = async ({
  repoId,
  archive,
}: {
  repoId: string;
  archive: boolean;
}) => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const hasToolListColumn = await hasRepositoryToolListColumn(supabase);
  const repositorySelectColumns = await getRepositorySelectColumns(supabase);
  const fullName = (user.user_metadata.full_name as string | undefined)?.trim() || 'Cyberspace-X 2.0 Developer';
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
  const { data: targetRepositoryRaw, error: targetRepositoryError } = await supabase
    .from('repositories')
    .select('id, name, slug')
    .eq('id', repoId)
    .single();

  if (targetRepositoryError) {
    throw new Error(targetRepositoryError.message);
  }

  const targetRepository = targetRepositoryRaw as any;

  if (
    archive &&
    isProfileRepositoryForUser({
      repoName: targetRepository.name,
      repoSlug: targetRepository.slug,
      username: resolvedUsername,
      userId: user.id,
    })
  ) {
    throw new Error('Profile repository cannot be archived.');
  }

  const { data, error } = await supabase
    .from('repositories')
    .update({
      archived_at: archive ? new Date().toISOString() : null,
      ...(hasToolListColumn && archive ? { show_in_tool_list: false } : {}),
    })
    .eq('id', repoId)
    .select(repositorySelectColumns as any)
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

  return mapRepositoryRecord(data);
};

export const deleteRepository = async (repoId: string) => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const fullName = (user.user_metadata.full_name as string | undefined)?.trim() || 'Cyberspace-X 2.0 Developer';
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
  const { data: repoRaw, error: repoError } = await supabase
    .from('repositories')
    .select('id, name, slug')
    .eq('id', repoId)
    .single();

  if (repoError) {
    throw new Error(repoError.message);
  }

  const repo = repoRaw as any;

  if (
    isProfileRepositoryForUser({
      repoName: repo.name,
      repoSlug: repo.slug,
      username: resolvedUsername,
      userId: user.id,
    })
  ) {
    throw new Error('Profile repository cannot be deleted.');
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
  const { supabase, user } = await ensureAuthenticatedUser();
  const { data, error } = await supabase
    .from('repo_commits')
    .select('id, repo_id, author_id, message, files_changed, created_at, git_hash, parent_hash')
    .eq('repo_id', repoId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const commits = (data || []) as HubRepositoryCommit[];

  // Auto-backfill: if any commits lack git_hash, retroactively generate them
  const hasUnhashed = commits.some((c) => !c.git_hash);
  if (hasUnhashed) {
    try {
      const fullName = (user.user_metadata?.full_name as string | undefined)?.trim() || 'Unknown';
      const backfilled = await backfillRepoGitHistory({
        repoId,
        author: { name: fullName, email: user.email || '' },
      });
      if (backfilled > 0) {
        // Re-fetch commits with the newly generated hashes
        const { data: refreshed } = await supabase
          .from('repo_commits')
          .select('id, repo_id, author_id, message, files_changed, created_at, git_hash, parent_hash')
          .eq('repo_id', repoId)
          .order('created_at', { ascending: false })
          .limit(50);
        return (refreshed || []) as HubRepositoryCommit[];
      }
    } catch (backfillError) {
      console.error('Git hash backfill failed (non-blocking):', backfillError);
    }
  }

  return commits;
};

export const downloadRepositoryAsZip = async ({
  repoId,
  repoSlug,
}: {
  repoId: string;
  repoSlug: string;
}) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('repo_files')
    .select('path, language, content')
    .eq('repo_id', repoId)
    .order('path', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    throw new Error('No files found in this repository.');
  }

  const zip = new JSZip();
  for (const file of data) {
    const filePath = normalizeZipFilePath(file.path || '');
    if (!filePath) {
      continue;
    }

    const content = file.content || '';
    if ((file.language || '').startsWith('binary:')) {
      if (content.startsWith('data:')) {
        zip.file(filePath, decodeDataUrlToBytes(content));
      } else {
        zip.file(filePath, new TextEncoder().encode(content));
      }
      continue;
    }

    zip.file(filePath, content);
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6,
    },
  });

  const safeSlug = normalizeRepoSlug(repoSlug) || 'repository';
  const downloadUrl = URL.createObjectURL(zipBlob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = `${safeSlug}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(downloadUrl);
};

export const uploadRepositoryFiles = async ({ repoId, files, commitMessage }: UploadRepositoryFilesInput) => {
  const { supabase, user } = await ensureAuthenticatedUser();

  const { data: targetRepositoryRaw, error: targetRepositoryError } = await supabase
    .from('repositories')
    .select('id, owner_id, name, slug, visibility')
    .eq('id', repoId)
    .maybeSingle();

  if (targetRepositoryError) {
    throw new Error(targetRepositoryError.message);
  }

  if (!targetRepositoryRaw) {
    throw new Error('Repository not found or you do not have access.');
  }

  const targetRepository = targetRepositoryRaw as any;

  const isRepoOwner = targetRepository.owner_id === user.id;
  const isPublicRepository = targetRepository.visibility === 'public';
  if (!isRepoOwner && !isPublicRepository) {
    throw new Error('You can only push to your own repositories or public repositories.');
  }

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
      throw new Error(`"${file.name}" is larger than ${(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(1)} MB.`);
    }

    const path = (file.webkitRelativePath || file.name).trim();
    if (!path) {
      continue;
    }

    const buffer = await file.arrayBuffer();
    const binary = shouldTreatAsBinary({
      file,
      path,
      buffer,
    });
    const content = binary ? await readFileAsDataUrl(file) : await file.text();

    records.push({
      repo_id: repoId,
      path,
      language: binary ? `binary:${file.type || 'application/octet-stream'}` : detectLanguageFromPath(path),
      content,
      size_bytes: file.size,
      created_by: user.id,
    });
  }

  if (!records.length) {
    throw new Error('No files were found in your selection.');
  }

  const { error: uploadError } = await supabase.from('repo_files').upsert(records, {
    onConflict: 'repo_id,path',
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const message = commitMessage.trim() || `Upload ${records.length} file(s)`;

  // Create Git VCS commit with proper SHA hash
  let gitHash: string | null = null;
  let parentHash: string | null = null;
  try {
    const gitAuthor: GitAuthor = {
      name: (user.user_metadata?.full_name as string | undefined)?.trim() || 'Unknown',
      email: user.email || '',
    };
    const gitFiles = records.map((r) => ({ path: r.path, content: r.content }));
    const gitCommit = await gitCommitChanges({ repoId, files: gitFiles, message, author: gitAuthor });
    gitHash = gitCommit.hash;
    parentHash = gitCommit.parentHash;
  } catch (gitError) {
    console.error('Git VCS commit failed (non-blocking):', gitError);
  }

  const { error: commitError } = await supabase.from('repo_commits').insert({
    repo_id: repoId,
    author_id: user.id,
    message,
    files_changed: records.length,
    git_hash: gitHash,
    parent_hash: parentHash,
  });

  if (commitError) {
    throw new Error(commitError.message);
  }

  let resolvedUsername = '';
  let profileFileRecord: typeof records[number] | undefined;
  if (isRepoOwner) {
    const fullName = (user.user_metadata.full_name as string | undefined)?.trim() || 'Cyberspace-X 2.0 Developer';
    const profile = await ensureProfileRow({
      userId: user.id,
      email: user.email || '',
      fullName,
    });
    resolvedUsername = (profile.username as string | null) || buildUsernameCandidate({
      fullName: profile.full_name || fullName,
      email: user.email || '',
      userId: user.id,
    });
    const profileFilePath = getProfileRepositoryFilePath(resolvedUsername, user.id);
    const normalizedProfileFilePath = normalizeRepositoryPath(profileFilePath);
    profileFileRecord = records.find((record) => normalizeRepositoryPath(record.path) === normalizedProfileFilePath);
  }

  const readmeRecord = records.find((record) => record.path.toLowerCase() === 'readme.md');
  const dashboardProfileContent = profileFileRecord?.content || readmeRecord?.content || '';

  if (isRepoOwner && dashboardProfileContent) {
    const { error: repoReadmeUpdateError } = await supabase
      .from('repositories')
      .update({
        readme_md: dashboardProfileContent,
      })
      .eq('id', repoId);

    if (repoReadmeUpdateError) {
      throw new Error(repoReadmeUpdateError.message);
    }
  }

  if (
    isRepoOwner &&
    profileFileRecord &&
    isProfileRepositoryForUser({
      repoName: targetRepository.name,
      repoSlug: targetRepository.slug,
      username: resolvedUsername,
      userId: user.id,
    })
  ) {
    const { error: profileUpdateError } = await supabase
      .from('user_profiles')
      .update({
        profile_readme: profileFileRecord.content,
      })
      .eq('id', user.id);

    if (profileUpdateError) {
      throw new Error(profileUpdateError.message);
    }
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

  clearGitHubToken();

  if (error) {
    throw new Error(error.message);
  }
};

/* ------------------------------------------------------------------ */
/*  Git VCS — branch, merge, diff, file-at-commit API wrappers         */
/* ------------------------------------------------------------------ */

export const getRepositoryBranches = async (repoId: string): Promise<GitBranch[]> => {
  return gitListBranches(repoId);
};

export const createRepositoryBranch = async ({
  repoId,
  branchName,
  fromBranch,
}: {
  repoId: string;
  branchName: string;
  fromBranch?: string;
}): Promise<GitBranch> => {
  return gitCreateBranch({ repoId, branchName, fromBranch });
};

export const mergeRepositoryBranch = async ({
  repoId,
  sourceBranch,
  targetBranch,
}: {
  repoId: string;
  sourceBranch: string;
  targetBranch?: string;
}): Promise<void> => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const gitAuthor: GitAuthor = {
    name: (user.user_metadata?.full_name as string | undefined)?.trim() || 'Unknown',
    email: user.email || '',
  };

  const gitCommit = await gitMergeBranch({ repoId, sourceBranch, targetBranch, author: gitAuthor });

  // Record merge commit in repo_commits
  await supabase.from('repo_commits').insert({
    repo_id: repoId,
    author_id: user.id,
    message: gitCommit.message,
    files_changed: gitCommit.filesChanged,
    git_hash: gitCommit.hash,
    parent_hash: gitCommit.parentHash,
  });

  await pushActivity({
    userId: user.id,
    email: user.email || '',
    activityType: 'repo_branch_merged',
    context: { repo_id: repoId, source_branch: sourceBranch, target_branch: targetBranch || 'main' },
  });
};

export const deleteRepositoryBranch = async ({
  repoId,
  branchName,
}: {
  repoId: string;
  branchName: string;
}): Promise<void> => {
  return gitDeleteBranch({ repoId, branchName });
};

export const getRepositoryCommitDiff = async ({
  repoId,
  commitHash,
}: {
  repoId: string;
  commitHash: string;
}): Promise<GitDiffEntry[]> => {
  return gitGetCommitDiff({ repoId, commitHash });
};

export const getRepositoryFileAtCommit = async ({
  repoId,
  commitHash,
  filePath,
}: {
  repoId: string;
  commitHash: string;
  filePath: string;
}): Promise<GitFileSnapshot | null> => {
  return gitGetFileAtCommit({ repoId, commitHash, filePath });
};

export const getRepositoryFilesAtCommit = async ({
  repoId,
  commitHash,
}: {
  repoId: string;
  commitHash: string;
}): Promise<GitFileSnapshot[]> => {
  return gitListFilesAtCommit({ repoId, commitHash });
};
/* ------------------------------------------------------------------ */
/*  GitHub repo import                                                 */
/* ------------------------------------------------------------------ */

export const importGitHubRepository = async ({
  name,
  description,
  githubUrl,
  visibility,
  readmeContent,
  owner,
  defaultBranch,
}: GitHubRepoImportInput): Promise<HubRepository> => {
  const { supabase, user } = await ensureAuthenticatedUser();
  const slug = normalizeRepoSlug(name);
  const repositorySelectColumns = await getRepositorySelectColumns(supabase);

  // Check for duplicate
  const { data: existing } = await supabase
    .from('repositories')
    .select('id')
    .eq('owner_id', user.id)
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    throw new Error(`A repository named "${name}" already exists. Rename or delete it first.`);
  }

  // Insert Repository row
  const { data, error } = await supabase
    .from('repositories')
    .insert({
      owner_id: user.id,
      name,
      slug,
      description: description || '',
      visibility,
      readme_md: readmeContent || '',
      github_url: githubUrl,
      imported_from_github: true,
    })
    .select(repositorySelectColumns as any)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const repository = mapRepositoryRecord(data);
  const repoId = repository.id;

  const records: Array<{
    repo_id: string;
    path: string;
    language: string;
    content: string;
    size_bytes: number;
    created_by: string;
  }> = [];

  const gitFiles: Array<{ path: string; content: string }> = [];

  try {
    // 1. Fetch ZIP
    const zipArrayBuffer = await fetchGitHubRepoZip(owner, name, defaultBranch, visibility === 'public');

    // 2. Load with JSZip
    const zip = new JSZip();
    await zip.loadAsync(zipArrayBuffer);

    // 3. Process zip entries
    for (const zipPath of Object.keys(zip.files)) {
      const zipEntry = zip.files[zipPath];
      if (zipEntry.dir) continue;

      // GitHub zips have a top-level dir (e.g., owner-repo-sha/). Strip it.
      const pathParts = zipPath.split('/');
      pathParts.shift(); // Remove top level
      if (pathParts.length === 0) continue;

      const finalPath = normalizeZipFilePath(pathParts.join('/'));
      if (!finalPath) continue;

      const u8 = await zipEntry.async("uint8array");
      const buffer = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

      // Skip huge files
      if (u8.byteLength > 5 * 1024 * 1024) continue; // 5MB limit

      const extension = finalPath.split('.').pop()?.toLowerCase() || '';
      const isKnownTextExtension = Boolean(extensionLanguageMap[extension]);
      const isBinary = hasNullByte(buffer) && !isKnownTextExtension;

      let content = '';
      if (isBinary) {
        const blob = new Blob([buffer]);
        content = await readFileAsDataUrl(blob as any);
      } else {
        content = new TextDecoder().decode(buffer);
      }

      records.push({
        repo_id: repoId,
        path: finalPath,
        language: isBinary ? 'binary:application/octet-stream' : detectLanguageFromPath(finalPath),
        content,
        size_bytes: u8.byteLength,
        created_by: user.id,
      });

      gitFiles.push({ path: finalPath, content });
    }
  } catch (err) {
    console.warn('Zip import failed (likely CORS or Private Repo restriction), falling back to README...', err);
  }

  // Fallback: If zip is completely empty or errors, make sure we at least have README
  if (records.length === 0 && readmeContent.trim()) {
    records.push({
      repo_id: repoId,
      path: 'README.md',
      language: 'markdown',
      content: readmeContent,
      size_bytes: readmeContent.length,
      created_by: user.id,
    });
    gitFiles.push({ path: 'README.md', content: readmeContent });
  }

  // 4. Upsert files to database (chunking safely to avoid range errors if massive)
  const CHUNK_SIZE = 100;
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const { error: uploadError } = await supabase.from('repo_files').upsert(chunk, {
      onConflict: 'repo_id,path',
    });
    if (uploadError) {
      console.error('Failed to import chunk:', uploadError);
    }
  }

  // 5. Create initial Git commit
  let gitHash: string | null = null;
  try {
    const commitRes = await initGitRepo({
      repoId,
      files: gitFiles,
      author: {
        name: user.email?.split('@')[0] || 'User',
        email: user.email || 'user@example.com',
      },
    });
    gitHash = commitRes.hash;
  } catch (err) {
    console.error('Failed to initialize or commit Git repo during import:', err);
  }

  // Insert to repo_commits
  const { error: commitError } = await supabase.from('repo_commits').insert({
    repo_id: repoId,
    author_id: user.id,
    message: `Import from GitHub: ${githubUrl}`,
    files_changed: records.length,
    commit_hash: gitHash,
  });
  if (commitError) {
    console.error('Failed to log import commit to DB:', commitError);
  }

  // Log activity
  await pushActivity({
    userId: user.id,
    email: user.email || '',
    activityType: 'github_import',
    context: {
      repository_name: name,
      github_url: githubUrl,
    },
  });

  return repository;
};
