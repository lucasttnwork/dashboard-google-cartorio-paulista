import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import * as postgres from "https://deno.land/x/postgres@v0.17.0/mod.ts"
import { corsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    // Usar o secret customizado que definimos
    const serviceKey = Deno.env.get('SERVICE_KEY_CHECK')
    
    if (!authHeader || !serviceKey || !authHeader.includes(serviceKey)) {
        if (authHeader !== `Bearer ${serviceKey}` && authHeader !== serviceKey) {
             return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
        }
    }

    const { query } = await req.json()
    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing query param' }), { status: 400, headers: corsHeaders })
    }

    let dbUrl = Deno.env.get('SUPABASE_DB_URL')
    if (!dbUrl) {
        const dbPass = Deno.env.get('DATABASE_PASSWORD') || 'Nogueira110!'
        const projectRef = Deno.env.get('SUPABASE_PROJECT_REF') || 'bugpetfkyoraidyxmzxu'
        // Edge functions internas usam o hostname 'supavisor' ou 'db.project.supabase.co'
        // A connection pooler geralmente é porta 6543 (transaction) ou 5432 (session)
        // Deno postgres driver suporta transaction mode? Sim.
        // Vamos tentar conectar direto no postgres interno se possível, mas não temos o IP interno exposto aqui.
        // Vamos usar o DNS público que deve resolver internamente para o IP correto na infra deles.
        dbUrl = `postgres://postgres:${dbPass}@db.${projectRef}.supabase.co:5432/postgres`
    }

    const pool = new postgres.Pool(dbUrl, 1, true)
    const connection = await pool.connect()
    
    try {
        const result = await connection.queryObject(query)
        return new Response(JSON.stringify({ success: true, result }), { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
    } finally {
        connection.release()
        await pool.end()
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
