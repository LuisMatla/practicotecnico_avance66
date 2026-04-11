// Deno Deploy Runtime - Edge Function: cleanup-unverified
// Desbloquea correos de usuarios no verificados usando la RPC SQL
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async () => {
  try {
    const { data, error } = await supabase.rpc("desbloquear_correos_no_verificados");
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, desbloqueados: data ?? 0 }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500 });
  }
});
