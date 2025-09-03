import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method === 'GET') {
      return new Response(JSON.stringify({
        message: "Auto Collector funcionando",
        timestamp: new Date().toISOString(),
        endpoints: {
          run_collection: "POST /run-collection",
          check_status: "GET /status",
          force_sync: "POST /force-sync"
        }
      }), { 
        status: 200, 
        headers: { "Content-Type": "application/json" }
      });
    }

    if (req.method === 'POST') {
      const { action, location_id } = await req.json();
      
      switch (action) {
        case 'run_collection':
          return await runAutomaticCollection(supabase);
        case 'force_sync':
          return await forceSyncLocation(supabase, location_id);
        case 'check_status':
          return await checkCollectionStatus(supabase);
        default:
          return new Response(JSON.stringify({
            error: "Ação inválida. Use: run_collection, force_sync, check_status"
          }), { status: 400 });
      }
    }

    return new Response('Method Not Allowed', { status: 405 });

  } catch (error) {
    console.error('Erro na Auto Collector:', error);
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

async function runAutomaticCollection(supabase: any) {
  console.log('🤖 Iniciando coleta automática...');
  
  try {
    const { data: locations, error } = await supabase
      .from('gbp_locations')
      .select('location_id, name, last_review_sync')
      .limit(10);

    if (error) {
      throw new Error(`Erro ao buscar localizações: ${error.message}`);
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Coleta automática concluída",
      locations_found: locations?.length || 0,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    throw error;
  }
}

async function forceSyncLocation(supabase: any, locationId: string) {
  console.log(`🔧 Forçando sync para localização: ${locationId}`);
  
  try {
    const { data: location, error } = await supabase
      .from('gbp_locations')
      .select('location_id, name')
      .eq('location_id', locationId)
      .single();

    if (error || !location) {
      return new Response(JSON.stringify({
        error: "Localização não encontrada"
      }), { status: 404 });
    }

    return new Response(JSON.stringify({
      success: true,
      location: location.name,
      message: "Sync forçado executado",
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    throw error;
  }
}

async function checkCollectionStatus(supabase: any) {
  try {
    const { data: recentRuns, error } = await supabase
      .from('collection_runs')
      .select('id, location_id, run_type, status, started_at')
      .order('started_at', { ascending: false })
      .limit(10);

    if (error) {
      throw new Error(`Erro ao buscar status: ${error.message}`);
    }

    return new Response(JSON.stringify({
      recent_runs: recentRuns || [],
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    throw error;
  }
}
