import { supabase } from "@/integrations/supabase/client";

/** Chama a função fronteira-ia e devolve o corpo (ou o erro amigável que ela mandou). */
async function chamar<T extends { erro?: string | null }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("fronteira-ia", { body });
  if (error) {
    // Erros HTTP da função trazem { erro } no corpo
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try { const corpo = await ctx.json(); if (corpo?.erro) return corpo as T; } catch { /* corpo não-JSON */ }
    }
    const msg = /not found|404/i.test(error.message)
      ? "A função de IA (fronteira-ia) ainda não foi publicada no Supabase."
      : "Não foi possível falar com a IA. Tente novamente.";
    return { erro: msg } as T;
  }
  return data as T;
}

export function lerDanfe(texto: string) {
  return chamar<{ xml: string | null; erro: string | null }>({ acao: "danfe", texto });
}

export type Citacao = { n: number; fonte: string; fonte_chave?: string; item: string; titulo: string };
export type PassoExplicacao = { passo: string; valor?: number; detalhe?: string; fundamento?: { informativo: string; item: string; dispositivo: string } };

export function explicarCalculo(entrada: { passos: PassoExplicacao[]; avisos: string[]; valor: number; data_ref?: string; pergunta?: string }) {
  return chamar<{ texto?: string; citacoes?: Citacao[]; erro?: string | null }>({ acao: "explicar", ...entrada });
}
