/**
 * Script de conversão de CSV para JSON para datasets do Apify Google Maps Scraper.
 * Layer 3 (Execution) - Deterministic data transformation.
 *
 * Uso:
 *   node execution/convert-csv-to-json.js path/to/dataset.csv
 *
 * Output:
 *   Cria arquivo .json no mesmo diretório com nome correspondente.
 */

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

/**
 * Parse CSV line handling quoted fields with commas and newlines
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current);

  return result;
}

/**
 * Convert value to appropriate type
 */
function convertValue(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  // Remove BOM if present
  value = value.replace(/^\uFEFF/, '');

  // Remove quotes if present
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }

  // Try to parse as number
  if (!isNaN(value) && value.trim() !== '') {
    const num = Number(value);
    if (!isNaN(num)) {
      return num;
    }
  }

  // Boolean values
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;

  return value;
}

async function convertCSVToJSON(csvPath) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Arquivo não encontrado: ${csvPath}`);
  }

  console.log(`📖 Lendo CSV: ${csvPath}`);

  const fileStream = fs.createReadStream(csvPath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let headers = [];
  let records = [];
  let lineBuffer = '';
  let inQuotedField = false;
  let isFirstLine = true;

  for await (const line of rl) {
    // Handle multi-line fields (text with line breaks inside quotes)
    const quoteCount = (line.match(/"/g) || []).length;

    // If we're in a quoted field or this line has odd number of quotes, continue buffering
    if (inQuotedField || (quoteCount % 2 !== 0 && lineBuffer === '')) {
      lineBuffer += (lineBuffer ? '\n' : '') + line;
      inQuotedField = !inQuotedField;
      continue;
    }

    // Complete line (either standalone or end of multi-line field)
    const completeLine = lineBuffer ? lineBuffer + '\n' + line : line;
    lineBuffer = '';
    inQuotedField = false;

    const fields = parseCSVLine(completeLine);

    if (isFirstLine) {
      // Parse headers
      headers = fields.map(h => convertValue(h));
      isFirstLine = false;
      console.log(`📋 Headers: ${headers.length} colunas encontradas`);
    } else {
      // Parse data row
      const record = {};
      for (let i = 0; i < headers.length; i++) {
        const key = headers[i];
        const value = convertValue(fields[i]);
        record[key] = value;
      }
      records.push(record);
    }
  }

  console.log(`✅ ${records.length} registros lidos do CSV`);

  // Generate output filename
  const parsedPath = path.parse(csvPath);
  const outputPath = path.join(parsedPath.dir, `${parsedPath.name}.json`);

  // Write JSON file
  console.log(`💾 Salvando JSON: ${outputPath}`);
  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2), 'utf8');

  console.log(`🎉 Conversão concluída! Arquivo salvo: ${outputPath}`);
  return outputPath;
}

async function main() {
  const csvPath = process.argv[2];

  if (!csvPath) {
    console.error('❌ Uso: node execution/convert-csv-to-json.js path/to/dataset.csv');
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), csvPath);

  try {
    await convertCSVToJSON(resolvedPath);
  } catch (error) {
    console.error('❌ Erro durante conversão:', error.message);
    process.exit(1);
  }
}

main();
