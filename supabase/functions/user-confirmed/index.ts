// Deno Deploy Runtime - Edge Function: user-confirmed
// Crea/actualiza usuario en tablas cuando confirma correo y desbloquea su email
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const payload = await req.json().catch(() => ({}));
    const record = payload?.record || payload?.user || payload;

    const uid: string | undefined = record?.id;
    const email: string | undefined = record?.email;
    const m = (record?.user_metadata || {}) as Record<string, unknown>;

    if (!uid || !email) {
      return new Response(JSON.stringify({ ok: false, error: "payload inválido" }), { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // Upsert en usuarios
    const { error: upsertUserErr } = await supabase
      .from("usuarios")
      .upsert({
        uid,
        nombre: (m.nombre as string) || "",
        apellidos: (m.apellidos as string) || "",
        matricula: (m.matricula as string) || "",
        carrera: (m.carrera as string) || "",
        facultad: (m.facultad as string) || "",
        correo: email,
        fechanacimiento: (m.fechanacimiento as string) || null,
        fecharegistro: nowIso,
        ultimoacceso: nowIso,
        activo: true,
      }, { onConflict: "uid" });

    if (upsertUserErr) throw upsertUserErr;

    // Índice por matrícula
    if (m.matricula) {
      await supabase
        .from("usuarios_por_matricula")
        .upsert({ uid, matricula: m.matricula as string }, { onConflict: "matricula" });
    }

    // Desbloquear correo
    await supabase
      .from("correos_bloqueados")
      .delete()
      .eq("correo", email);

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500 });
  }
});
