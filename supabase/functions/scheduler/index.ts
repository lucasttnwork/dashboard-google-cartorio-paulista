import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  try {
    console.log('⏰ Scheduler executando...');
    
    // Chamada para o auto-collector a cada 6 horas
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/auto-collector`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'run_collection' })
    });

    const result = await response.json();
    
    console.log('✅ Auto-collector executado:', result);
    
    return new Response(JSON.stringify({
      scheduler_run: true,
      auto_collector_result: result,
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
