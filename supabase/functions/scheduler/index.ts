import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  try {
    console.log('⏰ Scheduler executando...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const headers = {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    };

    // Chamada para o auto-collector
    console.log('▶️ Iniciando auto-collector...');
    const autoCollectorPromise = fetch(`${supabaseUrl}/functions/v1/auto-collector`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'run_collection' })
    }).then(r => r.json()).catch(e => ({ error: e.message }));

    // Chamada para o processador de jobs de colaboradores (reviews)
    // Limite de 100 jobs por execução para não estourar tempo
    console.log('▶️ Iniciando review-collaborator-jobs...');
    const reviewJobsPromise = fetch(`${supabaseUrl}/functions/v1/review-collaborator-jobs?limit=100`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    }).then(r => r.json()).catch(e => ({ error: e.message }));

    const [autoCollectorResult, reviewJobsResult] = await Promise.all([
      autoCollectorPromise,
      reviewJobsPromise
    ]);
    
    console.log('✅ Execuções concluídas:', { autoCollectorResult, reviewJobsResult });
    
    return new Response(JSON.stringify({
      scheduler_run: true,
      auto_collector_result: autoCollectorResult,
      review_jobs_result: reviewJobsResult,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('❌ Erro no scheduler:', error);
    
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
