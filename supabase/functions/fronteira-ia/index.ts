/**
 * Edge Function: fronteira-ia
 * IA do módulo Fiscal → Fronteira. Duas ações:
 *  - "danfe":    texto extraído de um DANFE (PDF) → XML mínimo de NF-e
 *  - "explicar": explica um cálculo JÁ FEITO pelo motor, citando trechos do
 *                Acervo legal do escritório (não refaz contas).
 * Roda com o JWT do usuário: as consultas ao acervo respeitam o RLS.
 */
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const MODELO = "claude-opus-5-5";

const anthropic = new Anthropic(); // lê ANTHROPIC_API_KEY

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const PROMPT_DANFE = `Você recebe o TEXTO extraído de um DANFE (PDF de NF-e brasileira).
Reconstrua um XML de NF-e mínimo e válido contendo APENAS os dados presentes no texto.
Estrutura obrigatória (use exatamente estas tags, números com ponto decimal, sem separador de milhar):
<nfeProc><NFe><infNFe Id="NFe{chave44digitos}">
<ide><nNF/><dhEmi/></ide>
<emit><CNPJ/><xNome/><enderEmit><UF/></enderEmit><CRT/></emit>
<dest><CNPJ/><xNome/></dest>
<det nItem="1"><prod><xProd/><NCM/><CEST/><CFOP/><qCom/><vProd/><vFrete/><vSeg/><vDesc/><vOutro/></prod><imposto><ICMS><ICMS00><orig/><CST/><vBC/><pICMS/><vICMS/></ICMS00></ICMS><IPI><IPITrib><vIPI/></IPITrib></IPI></imposto><infAdProd/></det> (um <det> por item)
<total><ICMSTot><vBC/><vICMS/><vBCST/><vST/><vProd/><vFrete/><vSeg/><vDesc/><vIPI/><vOutro/><vNF/></ICMSTot></total>
<transp><vol><qVol/><pesoB/><pesoL/></vol></transp>
<infAdic><infCpl/></infAdic>
</infNFe></NFe></nfeProc>
Regras: nNF sem zeros à esquerda; CNPJ só dígitos; datas em AAAA-MM-DD; valores ausentes = 0; em infAdProd copie o texto adicional do item (ex.: "#13.5KG#") se existir.
Na tabela "DADOS DO PRODUTO/SERVIÇO", cada linha tem as colunas "BC ICMS", "VALOR ICMS", "VALOR IPI" e "ALÍQ. ICMS": copie-as para vBC, vICMS, vIPI e pICMS DENTRO do <det> daquele item (valor do próprio item, nunca o total da nota).
Responda SOMENTE com o XML, sem markdown e sem comentários.`;

const PROMPT_EXPLICAR = `Você é um assistente fiscal especializado em ICMS de Pernambuco.
Sua tarefa é EXPLICAR um cálculo que JÁ FOI FEITO pelo sistema. Regras obrigatórias:
1. Não refaça contas e não proponha outro valor. Os números corretos são os do TRACE.
2. Para cada passo relevante, diga por que ele existe e onde está previsto, citando os trechos fornecidos no formato [n].
3. Use SOMENTE os trechos fornecidos. Se nenhum trecho sustentar um passo, escreva "fundamento não localizado no acervo" para aquele passo.
4. Sempre que citar, mencione o dispositivo legal (lei/decreto/artigo) que aparece no trecho ou no fundamento do passo.
5. Repita os AVISOS do cálculo ao final, se houver.
6. Responda em português do Brasil, em texto corrido e objetivo, sem inventar informação e sem usar markdown.`;

type Fundamento = { informativo: string; item: string; dispositivo: string };
type Passo = { passo: string; valor?: number; detalhe?: string; fundamento?: Fundamento };
type Trecho = {
  trecho_id: string; fonte_chave?: string; fonte_titulo?: string; atualizado_em?: string | null;
  item: string; titulo: string; fundamento?: string | null; texto: string;
};

/** Texto final da resposta; erro amigável em recusa ou corte. */
function textoDaResposta(r: Anthropic.Beta.BetaMessage): string {
  if (r.stop_reason === "refusal") throw new Error("A IA não pôde atender este pedido.");
  const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  if (!texto) throw new Error("A IA não retornou conteúdo.");
  return texto;
}

async function perguntar(system: string, entrada: string, effort: "low" | "medium" | "high", maxTokens: number) {
  const stream = anthropic.beta.messages.stream({
    model: MODELO,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort },
    system,
    messages: [{ role: "user", content: entrada }],
  });
  return textoDaResposta(await stream.finalMessage());
}

/** "2.3.1.2 / 2.3.2.2" → ["2.3.1.2","2.3.2.2"]; "2.3.10.1, Importante 4" → ["2.3.10.1"] */
const itensDoFundamento = (item: string) =>
  item.split(/[\/;]| e /).map((s) => s.trim().match(/^\d+(?:\.\d+)*/)?.[0]).filter((s): s is string => Boolean(s));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ erro: "Sessão expirada. Entre de novo na plataforma." }, 401);

    const corpo = await req.json();

    if (corpo.acao === "danfe") {
      const texto = String(corpo.texto ?? "");
      if (texto.replace(/\s/g, "").length < 50) return json({ xml: null, erro: "PDF sem texto (escaneado) — não é possível ler." });
      if (texto.length > 200_000) return json({ xml: null, erro: "PDF grande demais para leitura automática." });
      let xml = await perguntar(PROMPT_DANFE, texto, "low", 16000);
      xml = xml.replace(/^```(?:xml)?\s*/i, "").replace(/```\s*$/, "").trim();
      if (!xml.includes("<infNFe")) return json({ xml: null, erro: "Não foi possível reconhecer o DANFE." });
      return json({ xml, erro: null });
    }

    if (corpo.acao === "explicar") {
      const passos: Passo[] = Array.isArray(corpo.passos) ? corpo.passos.slice(0, 80) : [];
      const avisos: string[] = Array.isArray(corpo.avisos) ? corpo.avisos.slice(0, 20).map(String) : [];
      const pergunta = corpo.pergunta ? String(corpo.pergunta).slice(0, 1000) : "";
      const dataRef = /^\d{4}-\d{2}-\d{2}$/.test(corpo.data_ref ?? "") ? corpo.data_ref : new Date().toISOString().slice(0, 10);

      // Trechos exatos de cada fundamento citado no trace
      const pares = new Map<string, { fonte: string; item: string }>();
      for (const f of passos.map((p) => p.fundamento)) {
        if (!f?.informativo || !f.item) continue;
        for (const it of itensDoFundamento(f.item)) pares.set(`${f.informativo}|${it}`, { fonte: f.informativo, item: it });
      }
      const trechos: Trecho[] = [];
      for (const { fonte, item } of pares.values()) {
        const r = await sb.rpc("ff_trechos_do_item", { fonte_chave: fonte, item_prefixo: item });
        for (const t of (r.data ?? []).slice(0, 3)) trechos.push({ ...t, fonte_chave: fonte });
      }
      if (pergunta) {
        const r = await sb.rpc("ff_buscar_trechos_legais", { consulta: pergunta, data_ref: dataRef, limite: 6 });
        trechos.push(...(r.data ?? []));
      }
      const unicos = [...new Map(trechos.map((t) => [t.trecho_id, t])).values()].slice(0, 20);
      const blocoTrechos = unicos
        .map((t, i) => `[${i + 1}] ${t.fonte_titulo ?? t.fonte_chave} — item ${t.item} (${t.titulo})` +
          `${t.fundamento ? `\nFundamento: ${t.fundamento}` : ""}\n${t.texto.slice(0, 1800)}`)
        .join("\n\n");
      const blocoTrace = passos
        .map((p, i) => `${i + 1}. ${p.passo}: ${p.valor ?? ""}${p.detalhe ? ` (${p.detalhe})` : ""}` +
          `${p.fundamento ? ` — fundamento: ${p.fundamento.informativo}, item ${p.fundamento.item}, ${p.fundamento.dispositivo}` : ""}`)
        .join("\n");

      const entrada = `DATA DE REFERÊNCIA: ${dataRef}
VALOR CALCULADO: R$ ${Number(corpo.valor ?? 0).toFixed(2)}
TRACE:
${blocoTrace || "(trace vazio)"}
AVISOS: ${avisos.join(" | ") || "nenhum"}
${pergunta ? `\nPERGUNTA DO USUÁRIO: ${pergunta}\n` : ""}
TRECHOS DO ACERVO:
${blocoTrechos || "(nenhum trecho encontrado)"}`;

      const texto = await perguntar(PROMPT_EXPLICAR, entrada, "medium", 16000);
      // Só devolve citações que o texto usou e que existem
      const usados = new Set([...texto.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
      const citacoes = unicos
        .map((t, i) => ({ n: i + 1, fonte: t.fonte_titulo ?? t.fonte_chave, fonte_chave: t.fonte_chave, item: t.item, titulo: t.titulo }))
        .filter((c) => usados.has(c.n));
      const invalidas = [...usados].filter((n) => n < 1 || n > unicos.length);
      return json({ texto, citacoes, erro: invalidas.length ? `Citações inexistentes ignoradas: ${invalidas.join(", ")}` : null });
    }

    return json({ erro: "Ação inválida" }, 400);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ erro: "Limite de uso da IA atingido. Tente em instantes." }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ erro: "Chave da IA inválida no servidor (ANTHROPIC_API_KEY)." }, 500);
    if (e instanceof Anthropic.APIError) return json({ erro: `Erro da IA (${e.status}). Tente novamente.` }, 502);
    return json({ erro: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
