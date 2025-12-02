export function normalizeTextLower(text: string | null | undefined): string {
  const s = (text ?? "").toLowerCase();
  // basic unaccent
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}


