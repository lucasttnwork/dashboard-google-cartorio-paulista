const fs = require('fs')
const path = require('path')

function countWhenDatesForSeptember2025(baseDir) {
  const scraperDir = path.resolve(baseDir, 'scraper')
  if (!fs.existsSync(scraperDir)) {
    throw new Error(`Diretório não encontrado: ${scraperDir}`)
  }

  const files = fs.readdirSync(scraperDir).filter(f => f.endsWith('.json'))
  const re = /"When":"(\d{4})-(\d{1,2})-(\d{1,2})"/g
  const counts = {}

  for (const f of files) {
    const p = path.join(scraperDir, f)
    let txt
    try {
      txt = fs.readFileSync(p, 'utf8')
    } catch (e) {
      continue
    }
    let m
    while ((m = re.exec(txt))) {
      const y = Number(m[1])
      const mo = Number(m[2])
      const da = Number(m[3])
      if (y === 2025 && mo === 9) {
        const key = `2025-09-${String(da).padStart(2, '0')}`
        counts[key] = (counts[key] || 0) + 1
      }
    }
  }

  const days = Array.from({ length: 30 }, (_, i) => `2025-09-${String(i + 1).padStart(2, '0')}`)
  let total = 0
  const lines = days.map(d => {
    const c = counts[d] || 0
    total += c
    return `${d}: ${c}`
  })
  lines.push(`Total 2025-09 (scraper When): ${total}`)
  return lines
}

function main() {
  const baseDir = process.cwd()
  const lines = countWhenDatesForSeptember2025(baseDir)
  const outPath = path.resolve(baseDir, 'daily_counts_from_scraper_When_2025-09.txt')
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8')
  console.log(`✅ Arquivo salvo: ${outPath}`)
  console.log(lines.join('\n'))
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error('Erro:', err.message)
    process.exit(1)
  }
}


