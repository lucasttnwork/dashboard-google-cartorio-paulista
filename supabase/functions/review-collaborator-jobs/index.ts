import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { createLogger } from "../_shared/logger.ts"
import { getServiceClient } from "../_shared/db.ts"

const logger = createLogger("review-collaborator-jobs")

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabase = getServiceClient()
    const url = new URL(req.url)
    const limitParam = url.searchParams.get("limit")
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 100

    const { data, error } = await supabase.rpc("process_review_collaborator_jobs", {
      p_limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
    })

    if (error) {
      logger.error("Erro ao processar jobs", { error })
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    logger.info("Jobs processados", { result: data })
    return new Response(JSON.stringify({ result: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido"
    logger.error("Falha na função review-collaborator-jobs", { error: message })
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})

