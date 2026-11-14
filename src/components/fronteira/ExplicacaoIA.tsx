import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { explicarCalculo, type Citacao, type PassoExplicacao } from "@/lib/fronteira/ia";

/**
 * Explica, com IA, um cálculo já feito pelo motor: os números vêm do trace;
 * a IA só diz por que cada passo existe, citando o Acervo legal do escritório.
 */
export function ExplicacaoIA({ passos, avisos, valor, dataRef }: { passos: PassoExplicacao[]; avisos: string[]; valor: number; dataRef?: string }) {
  const [pergunta, setPergunta] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<{ texto?: string; citacoes?: Citacao[]; erro?: string | null } | null>(null);

  async function gerar() {
    setCarregando(true);
    setResultado(null);
    try {
      setResultado(await explicarCalculo({ passos, avisos, valor, data_ref: dataRef, pergunta: pergunta.trim() || undefined }));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
        <Sparkles className="h-3.5 w-3.5" /> Explicação com IA
      </div>
      <p className="text-xs text-muted-foreground">A IA não refaz contas: explica os passos acima com base nos informativos do Acervo legal.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Pergunta opcional (ex.: por que o divisor é 0,795?)" className="h-8 text-xs" maxLength={1000} />
        <Button size="sm" onClick={gerar} disabled={carregando} className="shrink-0">
          {carregando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
          {resultado?.texto ? "Explicar de novo" : "Explicar com IA"}
        </Button>
      </div>
      {resultado?.erro && <p className="text-xs text-amber-700">{resultado.erro}</p>}
      {resultado?.texto && (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{resultado.texto}</p>
          {!!resultado.citacoes?.length && (
            <ol className="space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
              {resultado.citacoes.map((c) => <li key={c.n}>[{c.n}] {c.fonte} — item {c.item} ({c.titulo})</li>)}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
