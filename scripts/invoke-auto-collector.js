#!/usr/bin/env node
// Dispara a edge function auto-collector via HTTP, usando variáveis do .env.

const https = require('https')
const { URL } = require('url')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env' })

const {
  SUPABASE_FUNCTION_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  AUTO_COLLECTOR_PAYLOAD,
} = process.env

if (!SUPABASE_FUNCTION_URL) {
  console.error('❌ SUPABASE_FUNCTION_URL não configurada (.env)')
  process.exit(1)
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não configurada (.env)')
  process.exit(1)
}

let payload = { action: 'run_collection' }
if (AUTO_COLLECTOR_PAYLOAD) {
  try {
    payload = JSON.parse(AUTO_COLLECTOR_PAYLOAD)
  } catch (err) {
    console.warn('⚠️ AUTO_COLLECTOR_PAYLOAD inválido, usando payload padrão { action: "run_collection" }')
  }
}

async function invoke() {
  const url = new URL(SUPABASE_FUNCTION_URL)
  const body = JSON.stringify(payload)

  const requestOptions = {
    method: 'POST',
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Length': Buffer.byteLength(body),
    },
  }

  console.log('▶️ Invocando auto-collector em', SUPABASE_FUNCTION_URL)

  const startedAt = Date.now()

  const response = await new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      })
    })

    req.on('error', (err) => reject(err))
    req.write(body)
    req.end()
  })

  const durationMs = Date.now() - startedAt
  console.log(`✅ Auto-collector respondeu (${response.statusCode}) em ${durationMs}ms`)

  const outputDir = path.join(process.cwd(), 'tmp_apify_samples')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `auto_collector_run_${Date.now()}.json`)
  const richPayload = {
    requestedAt: new Date(startedAt).toISOString(),
    durationMs,
    requestPayload: payload,
    response,
  }
  fs.writeFileSync(outputPath, JSON.stringify(richPayload, null, 2))
  console.log('📝 Resposta registrada em', outputPath)

  if (response.statusCode >= 400) {
    console.error('❌ Função retornou erro:', response.body)
    process.exit(1)
  }
}

invoke().catch((err) => {
  console.error('❌ Falha ao invocar auto-collector:', err.message)
  process.exit(1)
})


