-- Phase 3.5 — F7: Link collaborators to auth.users
-- Allows collaborators to see their own performance metrics.

ALTER TABLE public.collaborators
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Only one collaborator per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_collaborators_user_id
  ON public.collaborators(user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.collaborators.user_id IS
  'Links this collaborator to an auth.users account for the "Meu Desempenho" feature.';
