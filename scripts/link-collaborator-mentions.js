/**
 * Identifica menções de colaboradores nos comentários e registra novas correspondências
 * em `review_collaborators`. O script utiliza os aliases cadastrados e busca por
 * menções sem acento para aumentar a cobertura em português.
 *
 * Execution example:
 * TARGET_MONTH=2025-11 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/link-collaborator-mentions.js
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MONTH_ARG = process.argv[2] || process.env.TARGET_MONTH || "2025-11";
const FORCE_MATCHES = process.env.FORCE_COLLABORATOR_MATCHES === "true";
const BATCH_SIZE = Number(process.env.REVIEW_COLLABORATOR_BATCH_SIZE ?? "250");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const markRegex = /\p{M}/u;
const wordCharRegex = /[a-z0-9]/;
const SNIPPET_WINDOW = 40;

function normalizeWithMapping(text = "") {
  const normalizedChars = [];
  const mapping = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const decomposed = char.normalize("NFD");

    for (const part of decomposed) {
      if (markRegex.test(part)) continue;
      normalizedChars.push(part.toLowerCase());
      mapping.push(index);
    }
  }

  return { normalized: normalizedChars.join(""), mapping };
}

function buildSnippet(comment, startIndex, endIndex) {
  const snippetStart = Math.max(0, startIndex - SNIPPET_WINDOW);
  const snippetEnd = Math.min(comment.length, endIndex + SNIPPET_WINDOW);
  let snippet = comment.slice(snippetStart, snippetEnd).trim();

  if (snippetStart > 0) snippet = `...${snippet}`;
  if (snippetEnd < comment.length) snippet = `${snippet}...`;

  return snippet;
}

function parseMonth(monthString) {
  const [yearPart, monthPart] = monthString.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!(Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12)) {
    throw new Error("Formato inválido para o mês. Use YYYY-MM");
  }

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));

  return { label: `${year}-${month.toString().padStart(2, "0")}`, start, end };
}

function prepareAliasPatterns(collaborators) {
  return collaborators.map((collaborator) => {
    const variants = new Map();

    const pushVariant = (text, type) => {
      if (!text) return;
      const normalized = normalizeWithMapping(text).normalized.trim();
      if (!normalized || normalized.length < 2 || variants.has(normalized)) return;
      variants.set(normalized, { raw: text.trim(), type });
    };

    pushVariant(collaborator.full_name, "full");
    (collaborator.aliases || []).forEach((alias) => pushVariant(alias, "alias"));

    const patterns = [];
    for (const [normalized, variant] of variants.entries()) {
      const score =
        variant.type === "full"
          ? 0.97
          : variant.raw.includes(" ")
          ? 0.91
          : 0.85;

      patterns.push({
        normalized,
        original: variant.raw,
        type: variant.type,
        score,
      });
    }

    return { collaborator_id: collaborator.id, patterns };
  });
}

function hasWordBoundary(normalizedText, start, aliasLength) {
  const beforeChar = normalizedText[start - 1];
  const afterChar = normalizedText[start + aliasLength];
  if (beforeChar && wordCharRegex.test(beforeChar)) return false;
  if (afterChar && wordCharRegex.test(afterChar)) return false;
  return true;
}

async function main() {
  const { label, start, end } = parseMonth(MONTH_ARG);
  const rangeStart = start.toISOString();
  const rangeEnd = end.toISOString();

  console.log(`🔎 Procurando menções de colaboradores entre ${rangeStart} e ${rangeEnd}`);

  const collaboratorsResponse = await supabase
    .from("collaborators")
    .select("id, full_name, aliases")
    .eq("is_active", true);

  if (collaboratorsResponse.error) throw collaboratorsResponse.error;
  const collaborators = collaboratorsResponse.data ?? [];

  const reviewsResponse = await supabase
    .from("reviews")
    .select("review_id, comment")
    .gte("create_time", rangeStart)
    .lt("create_time", rangeEnd)
    .not("comment", "is", null)
    .order("create_time", { ascending: true });

  if (reviewsResponse.error) throw reviewsResponse.error;
  const reviewsData = reviewsResponse.data ?? [];
  const existingMentionsResponse = await supabase
    .from("review_collaborators")
    .select("review_id, collaborator_id")
;

  if (existingMentionsResponse.error) throw existingMentionsResponse.error;
  const existingMentions = existingMentionsResponse.data ?? [];

  const existingSet = new Set(
    existingMentions.map((mention) => `${mention.review_id}#${mention.collaborator_id}`),
  );

  const patterns = prepareAliasPatterns(collaborators);

  const newMatches = [];
  let reviewsWithNewMatches = 0;
  let reviewsWithPotentialHits = 0;

  for (const review of reviewsData) {
    const normalizedComment = normalizeWithMapping(review.comment);
    if (!normalizedComment.normalized) continue;
    const bestMatches = new Map();
    let potentialHit = false;

    for (const collaborator of patterns) {
      for (const variant of collaborator.patterns) {
        const aliasLength = variant.normalized.length;
        let index = normalizedComment.normalized.indexOf(variant.normalized);

        while (index >= 0) {
          if (!hasWordBoundary(normalizedComment.normalized, index, aliasLength)) {
            index = normalizedComment.normalized.indexOf(variant.normalized, index + 1);
            continue;
          }

          potentialHit = true;
          const key = `${review.review_id}#${collaborator.collaborator_id}`;
          if (!FORCE_MATCHES && existingSet.has(key)) break;

          const snippet = buildSnippet(
            review.comment,
            normalizedComment.mapping[index],
            normalizedComment.mapping[index + aliasLength - 1] + 1,
          );

          const previous = bestMatches.get(collaborator.collaborator_id);
          if (!previous || variant.score > previous.score) {
            bestMatches.set(collaborator.collaborator_id, {
              snippet,
              score: variant.score,
              alias: variant.original,
            });
          }

          break;
        }
      }
    }

    if (potentialHit) reviewsWithPotentialHits += 1;

    if (bestMatches.size > 0) {
      reviewsWithNewMatches += 1;
      for (const [collaborator_id, match] of bestMatches.entries()) {
        const key = `${review.review_id}#${collaborator_id}`;
        if (!FORCE_MATCHES && existingSet.has(key)) continue;

        newMatches.push({
          review_id: review.review_id,
          collaborator_id,
          mention_snippet: match.snippet,
          match_score: match.score,
        });
        existingSet.add(key);
      }
    }
  }

  if (newMatches.length === 0) {
    console.log("ℹ️ Nenhuma nova correspondência encontrada.");
    return;
  }

  console.log(
    `✏️ ${newMatches.length} menções prontas para inserção (em ${reviewsWithNewMatches} reviews, ${reviewsWithPotentialHits} com hits potenciais).`,
  );

  for (let i = 0; i < newMatches.length; i += BATCH_SIZE) {
    const chunk = newMatches.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("review_collaborators")
      .upsert(chunk, {
        onConflict: "review_id,collaborator_id",
        returning: "minimal",
      });

    if (error) {
      console.error("❌ Falha ao gravar menções:", error.message);
      process.exit(1);
    }

    console.log(`🗂️  Registradas ${chunk.length} menções (${i + chunk.length}/${newMatches.length}).`);
  }

  console.log("✅ Atualização concluída.");
}

main().catch((error) => {
  console.error("❌ Erro ao buscar menções:", error);
  process.exit(1);
});

