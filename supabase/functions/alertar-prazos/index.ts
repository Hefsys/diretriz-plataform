// Monitoramento → Prazos Acordados
// Roda 1x por dia (pg_cron). Junta as atividades com prazo vencido, ainda não
// concluídas e ainda não avisadas, e manda UM e-mail para o supervisor.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const DESTINO = Deno.env.get("PRAZOS_ALERTA_EMAIL") ?? "antonio@diretriz.cnt.br";
const APP_URL = Deno.env.get("APP_URL") || "https://diretriz-monitor-fiscal.vercel.app";
const LOGO_URL = "https://awdfeqxagqplpotjwant.supabase.co/storage/v1/object/public/obrigacoes-docs/logomarca2.jpg";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fmtData = (d: string) => d.split("-").reverse().join("/");

serve(async () => {
  // "Hoje" no fuso de Brasília (YYYY-MM-DD)
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  const { data, error } = await supabase
    .from("monitor_prazos")
    .select("id, atividade, prazo, responsavel_nome, empresas(razao_social)")
    .eq("concluido", false)
    .is("alerta_enviado_em", null)
    .lt("prazo", hoje)
    .order("prazo");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!data?.length) return new Response(JSON.stringify({ enviados: 0 }));

  const diasAtraso = (p: string) => Math.round((Date.parse(hoje) - Date.parse(p)) / 86_400_000);
  const linhas = data.map((r: any) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${esc(r.empresas?.razao_social ?? "—")}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${esc(r.atividade)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${esc(r.responsavel_nome ?? "—")}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${fmtData(r.prazo)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#ed3237;font-weight:bold;white-space:nowrap">${diasAtraso(r.prazo)} dia(s)</td>
    </tr>`).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;background:#f4f6fb;padding:24px;border-radius:12px">
      <div style="background:#10143d;padding:20px;border-radius:8px 8px 0 0;text-align:center">
        <img src="${LOGO_URL}" alt="Diretriz Contabilidade" style="height:80px;display:block;margin:0 auto" />
      </div>
      <div style="background:#fff;padding:24px 28px;border-radius:0 0 8px 8px;border:1px solid #dde3f0">
        <h2 style="color:#10143d;margin-top:0;border-bottom:3px solid #ed3237;padding-bottom:12px">Prazos acordados vencidos</h2>
        <p style="color:#374151">${data.length} atividade(s) passaram do prazo combinado e ainda não foram concluídas:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827">
          <thead><tr style="background:#f3f4f6;text-align:left">
            <th style="padding:8px">Empresa</th><th style="padding:8px">Atividade</th><th style="padding:8px">Colaborador</th><th style="padding:8px">Prazo</th><th style="padding:8px">Atraso</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        <div style="text-align:center;margin:28px 0 8px">
          <a href="${APP_URL}/prazos" style="background:#10143d;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir Prazos Acordados</a>
        </div>
      </div>
    </div>`;

  if (!RESEND_API_KEY) return new Response(JSON.stringify({ error: "RESEND_API_KEY ausente" }), { status: 500 });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: "Diretriz <noreply@diretriz.cnt.br>",
      to: DESTINO,
      subject: `[Diretriz] ${data.length} prazo(s) acordado(s) vencido(s)`,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    return new Response(JSON.stringify({ error: err }), { status: 502 });
  }

  // Só marca como avisado depois que o e-mail saiu
  await supabase.from("monitor_prazos").update({ alerta_enviado_em: new Date().toISOString() }).in("id", data.map((r: any) => r.id));
  return new Response(JSON.stringify({ enviados: data.length }));
});
