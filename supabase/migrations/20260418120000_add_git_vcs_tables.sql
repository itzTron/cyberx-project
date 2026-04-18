-- ============================================================
-- Git VCS Tables — file snapshots, refs (branches/tags), and
-- commit hash tracking for real version control semantics.
-- ============================================================

-- 1. Add git_hash and parent_hash to existing repo_commits table
ALTER TABLE public.repo_commits
  ADD COLUMN IF NOT EXISTS git_hash text,
  ADD COLUMN IF NOT EXISTS parent_hash text;

CREATE INDEX IF NOT EXISTS idx_repo_commits_git_hash
  ON public.repo_commits (repo_id, git_hash);

-- 2. File snapshots — stores the full file tree at each commit
CREATE TABLE IF NOT EXISTS public.git_file_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  commit_hash text NOT NULL,
  path text NOT NULL,
  blob_hash text NOT NULL,
  content text NOT NULL DEFAULT '',
  size_bytes integer NOT NULL DEFAULT 0,
  language text NOT NULL DEFAULT 'plaintext',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_git_file_snapshots_commit
  ON public.git_file_snapshots (repo_id, commit_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_git_file_snapshots_commit_path
  ON public.git_file_snapshots (repo_id, commit_hash, path);

-- 3. Git refs — branches and tags
CREATE TABLE IF NOT EXISTS public.git_refs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  ref_name text NOT NULL,
  target_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (repo_id, ref_name)
);

CREATE INDEX IF NOT EXISTS idx_git_refs_repo
  ON public.git_refs (repo_id);

-- 4. Enable RLS
ALTER TABLE public.git_file_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.git_refs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for git_file_snapshots (same owner/public pattern as repo_files)
DROP POLICY IF EXISTS "git_file_snapshots_select_visible_repo" ON public.git_file_snapshots;
CREATE POLICY "git_file_snapshots_select_visible_repo"
ON public.git_file_snapshots
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.repositories r
    WHERE r.id = git_file_snapshots.repo_id
      AND (r.visibility = 'public' OR r.owner_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "git_file_snapshots_insert_owner" ON public.git_file_snapshots;
CREATE POLICY "git_file_snapshots_insert_owner"
ON public.git_file_snapshots
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.repositories r
    WHERE r.id = git_file_snapshots.repo_id
      AND r.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "git_file_snapshots_delete_owner" ON public.git_file_snapshots;
CREATE POLICY "git_file_snapshots_delete_owner"
ON public.git_file_snapshots
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.repositories r
    WHERE r.id = git_file_snapshots.repo_id
      AND r.owner_id = auth.uid()
  )
);

-- 6. RLS Policies for git_refs
DROP POLICY IF EXISTS "git_refs_select_visible_repo" ON public.git_refs;
CREATE POLICY "git_refs_select_visible_repo"
ON public.git_refs
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.repositories r
    WHERE r.id = git_refs.repo_id
      AND (r.visibility = 'public' OR r.owner_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "git_refs_insert_owner" ON public.git_refs;
CREATE POLICY "git_refs_insert_owner"
ON public.git_refs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.repositories r
    WHERE r.id = git_refs.repo_id
      AND r.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "git_refs_update_owner" ON public.git_refs;
CREATE POLICY "git_refs_update_owner"
ON public.git_refs
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.repositories r
    WHERE r.id = git_refs.repo_id
      AND r.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.repositories r
    WHERE r.id = git_refs.repo_id
      AND r.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "git_refs_delete_owner" ON public.git_refs;
CREATE POLICY "git_refs_delete_owner"
ON public.git_refs
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.repositories r
    WHERE r.id = git_refs.repo_id
      AND r.owner_id = auth.uid()
  )
);

-- 7. Grants
GRANT SELECT ON public.git_file_snapshots TO anon, authenticated;
GRANT INSERT, DELETE ON public.git_file_snapshots TO authenticated;

GRANT SELECT ON public.git_refs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.git_refs TO authenticated;
