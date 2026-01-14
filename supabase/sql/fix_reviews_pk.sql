-- Fix: Adicionar PRIMARY KEY na tabela reviews se não existir
-- Execute este script no Supabase SQL Editor

DO $$
BEGIN
  -- Verificar se já existe PRIMARY KEY
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'reviews' AND c.contype = 'p'
  ) THEN
    -- Adicionar PRIMARY KEY
    ALTER TABLE reviews ADD PRIMARY KEY (review_id);
    RAISE NOTICE 'PRIMARY KEY adicionado com sucesso';
  ELSE
    RAISE NOTICE 'PRIMARY KEY já existe';
  END IF;
END $$;

-- Verificar constraints
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'reviews'::regclass;
