import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://ooolj.fun",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export function supabaseForRequest(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Missing Authorization header");
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
  });
}

export function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export async function requireMember(req: Request) {
  const client = supabaseForRequest(req);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  const { data: membership } = await client.from("memberships").select("role, is_active").eq("user_id", user.id).single();
  if (!membership?.is_active) throw new Error("Forbidden");
  return { client, user, role: membership.role as "owner" | "contributor" };
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
