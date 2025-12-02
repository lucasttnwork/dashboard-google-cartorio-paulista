#!/usr/bin/env node

/**
 * Synthetic dataset generator for validating review persistence counts.
 *
 * Usage examples:
 *   node scripts/generate-synthetic-reviews.js \
 *     --base ../tmp_apify_samples/sample_normalized_1758731825196.json \
 *     --new 2 --updated 2
 *
 *   node scripts/generate-synthetic-reviews.js --help
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_NEW_COUNT = 2;
const DEFAULT_UPDATED_COUNT = 2;
const OUTPUT_DIR = path.resolve(__dirname, "../tmp_apify_samples");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    base: null,
    newCount: DEFAULT_NEW_COUNT,
    updatedCount: DEFAULT_UPDATED_COUNT,
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      case "--base":
      case "-b":
        options.base = args[++i];
        break;
      case "--new":
      case "-n":
        options.newCount = Number(args[++i]);
        break;
      case "--updated":
      case "-u":
        options.updatedCount = Number(args[++i]);
        break;
      case "--output":
      case "-o":
        options.output = args[++i];
        break;
      default:
        if (!options.base) {
          options.base = arg;
        } else {
          console.warn(`Ignoring unknown argument: ${arg}`);
        }
    }
  }

  if (!options.base) {
    throw new Error(
      "Base dataset not provided. Use --base <path> or pass the file as first argument.",
    );
  }

  return options;
}

function printHelp() {
  console.log(`Synthetic review generator\n\n`);
  console.log(`Options:`);
  console.log(
    `  --base, -b <path>      JSON com reviews normalizados para usar como base`,
  );
  console.log(
    `  --new, -n <number>     Quantidade de reviews novas a gerar (default ${DEFAULT_NEW_COUNT})`,
  );
  console.log(
    `  --updated, -u <number> Quantidade de reviews atualizadas a gerar (default ${DEFAULT_UPDATED_COUNT})`,
  );
  console.log(
    `  --output, -o <path>    Caminho para salvar o arquivo gerado (default tmp_apify_samples/)`,
  );
  console.log(`  --help, -h             Mostra esta ajuda`);
}

function loadBaseDataset(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(absolutePath, "utf-8");
  const data = JSON.parse(raw);

  if (!Array.isArray(data)) {
    throw new Error("Base dataset needs to be an array of normalized reviews.");
  }

  if (data.length === 0) {
    throw new Error(
      "Base dataset está vazio. Forneça um arquivo com reviews normalizados.",
    );
  }

  return { absolutePath, data };
}

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function cloneReview(review) {
  return JSON.parse(JSON.stringify(review));
}

function normalizeString(value, fallback) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function generateSyntheticDataset(baseReviews, options) {
  const now = new Date().toISOString();
  const newReviews = [];
  const updatedReviews = [];
  const existingReviews = [];

  let baseIndex = 0;

  // Generate updated reviews (same review_id, different comment/rating)
  for (let i = 0; i < options.updatedCount; i++) {
    const baseReview = cloneReview(baseReviews[baseIndex % baseReviews.length]);
    baseIndex++;

    const existingReview = {
      review_id: baseReview.review_id,
      rating: baseReview.rating ?? 5,
      comment: normalizeString(
        baseReview.comment,
        `Comentário existente ${i + 1}`,
      ),
      response_text: normalizeString(
        baseReview.response_text,
        "Resposta anterior",
      ),
      last_seen_at: baseReview.last_seen_at ?? now,
    };

    const updatedReview = {
      ...baseReview,
      comment: `${existingReview.comment} (atualizado ${now})`,
      rating: Math.min(5, Math.max(1, (existingReview.rating || 5) - 1)),
      response_text: "Resposta atualizada pelo script sintético",
      last_seen_at: now,
      update_time: now,
      create_time: baseReview.create_time ?? now,
    };

    updatedReviews.push(updatedReview);
    existingReviews.push(existingReview);
  }

  // Generate new reviews (new review_id)
  for (let i = 0; i < options.newCount; i++) {
    const baseReview = cloneReview(baseReviews[baseIndex % baseReviews.length]);
    baseIndex++;

    const syntheticId = `${baseReview.review_id}-synthetic-new-${Date.now()}-${i}`;

    const newReview = {
      ...baseReview,
      review_id: syntheticId,
      comment: normalizeString(
        baseReview.comment,
        `Comentário sintético novo ${i + 1}`,
      ),
      rating: baseReview.rating ?? 5,
      response_text: null,
      last_seen_at: now,
      create_time: now,
      update_time: now,
    };

    newReviews.push(newReview);
  }

  const incomingReviews = [...newReviews, ...updatedReviews];

  return {
    metadata: {
      generated_at: now,
      base_total: baseReviews.length,
      new_count: newReviews.length,
      updated_count: updatedReviews.length,
      incoming_total: incomingReviews.length,
    },
    incoming_reviews: incomingReviews,
    existing_reviews: existingReviews,
    summary: {
      instructions: {
        persist_existing_first:
          "Insira existing_reviews em reviews/reviews_raw para simular dados já persistidos antes de rodar o pipeline.",
        then_run_pipeline:
          "Execute o endpoint /collect ou scripts/collector com incoming_reviews para validar contagens de novos/atualizados.",
      },
    },
  };
}

function saveSyntheticDataset(dataset, basePath, options) {
  ensureOutputDir();

  const outputPath = options.output
    ? path.resolve(process.cwd(), options.output)
    : path.join(
        OUTPUT_DIR,
        `synthetic_reviews_${Date.now()}_${options.newCount}new_${options.updatedCount}upd.json`,
      );

  const payload = {
    source: {
      base_file: path.relative(process.cwd(), basePath),
      new_count: dataset.metadata.new_count,
      updated_count: dataset.metadata.updated_count,
    },
    ...dataset,
  };

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  return outputPath;
}

function main() {
  try {
    const options = parseArgs();
    const { absolutePath, data } = loadBaseDataset(options.base);

    if (options.newCount < 0 || options.updatedCount < 0) {
      throw new Error("Valores de --new e --updated devem ser >= 0.");
    }

    if (options.newCount + options.updatedCount === 0) {
      throw new Error(
        "É necessário gerar pelo menos uma review nova ou atualizada.",
      );
    }

    const dataset = generateSyntheticDataset(data, options);
    const outputPath = saveSyntheticDataset(dataset, absolutePath, options);

    console.log("✅ Dataset sintético gerado com sucesso!\n");
    console.log(`Base utilizada: ${absolutePath}`);
    console.log(`Arquivo de saída: ${outputPath}`);
    console.log("Resumo:");
    console.table(dataset.metadata);
    console.log("\nPróximos passos sugeridos:");
    console.log(
      "1. Opcional: inserir existing_reviews manualmente na base para simular dados históricos.",
    );
    console.log(
      "2. Executar pipeline (/collect ou test-collector.js) alimentando incoming_reviews para validar contagens.",
    );
    console.log(
      "3. Conferir collection_runs.reviews_new / reviews_updated e comparar com os valores esperados.",
    );
  } catch (error) {
    console.error("❌ Falha ao gerar dataset sintético:");
    console.error(error.message);
    process.exit(1);
  }
}

main();
