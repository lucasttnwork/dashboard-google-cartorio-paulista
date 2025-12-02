import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (req.method === 'GET') {
      return new Response(JSON.stringify({
        message: "DataForSEO Lookup funcionando",
        timestamp: new Date().toISOString(),
        endpoints: {
          search_business: "POST /search-business",
          get_reviews: "POST /get-reviews"
        }
      }), { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*'
        } 
      });
    }

    if (req.method === 'POST') {
      const { action, keyword } = await req.json();
      
      // Temporariamente usar credenciais hardcoded para teste
      const authHeader = 'aWFAY2FydG9yaW9wYXVsaXN0YS5jb20uYnI6ZmE2YmQxOGMyNTBmOTY5Mg==';

      switch (action) {
        case 'search_business':
          return await searchBusiness(keyword, authHeader);
        case 'get_reviews':
          return await getReviews(keyword, authHeader);
        default:
          return new Response(JSON.stringify({
            error: "Ação não reconhecida. Use 'search_business' ou 'get_reviews'"
          }), { 
            status: 400,
            headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' }
          });
      }
    }

    return new Response('Method Not Allowed', { status: 405 });

  } catch (error) {
    console.error('Erro na Edge Function:', error);
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' }
    });
  }
});

async function searchBusiness(keyword: string, authHeader: string) {
  const response = await fetch(`${DATAFORSEO_BASE}/business_data/google/locations/search/live/advanced`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([{
      keyword: keyword,
      language_name: 'Portuguese',
      location_name: 'Brazil'
    }])
  });

  const data = await response.json();
  
  return new Response(JSON.stringify({
    success: response.ok,
    data: data,
    timestamp: new Date().toISOString()
  }), {
    status: response.ok ? 200 : 400,
    headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' }
  });
}

async function getReviews(keyword: string, authHeader: string) {
  const response = await fetch(`${DATAFORSEO_BASE}/business_data/google/reviews/live/advanced`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([{
      keyword: keyword,
      language_name: 'Portuguese',
      location_name: 'Brazil'
    }])
  });

  const data = await response.json();
  
  return new Response(JSON.stringify({
    success: response.ok,
    data: data,
    timestamp: new Date().toISOString()
  }), {
    status: response.ok ? 200 : 400,
    headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' }
  });
}


