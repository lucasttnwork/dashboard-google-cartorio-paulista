import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  return new Response("Hello World");
});
