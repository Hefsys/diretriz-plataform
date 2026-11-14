import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Calculator, Pencil, Copy, Power, Trash2, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useUserRole } from "@/components/fronteira/compat";
import { LOGICAS_PRE_CADASTRADAS } from "@/lib/fronteira/fiscal-pe/logicas-pre-cadastradas";
import { instalarLogicasPreCadastradas } from "@/lib/fronteira/logicas-pre";
import { toast } from "sonner";
import { PageHeader } from "@/components/fronteira/compat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { db as supabase } from "@/lib/dp/db";
import type { LogicaCalculo } from "@/lib/fronteira/logicas-calculo";
import { labelNo, parseFluxo, simboloOperador } from "@/lib/fronteira/fluxo-calculo";


async function fetchLogicas(): Promise<LogicaCalculo[]> {
  const { data, error } = await supabase
    .from("ff_logicas_calculo")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as LogicaCalculo[];
}

type Params = { codigo?: string; pre_cadastrada?: boolean; modificada?: boolean } | null;
const paramsDe = (l: LogicaCalculo) => (l.parametros ?? null) as Params;
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Marca no texto original os trechos que batem com as palavras buscadas (sem diferenciar acentos). */
function Destaque({ texto, palavras }: { texto: string; palavras: string[] }) {
  if (palavras.length === 0) return <>{texto}</>;
  // Texto normalizado caractere a caractere, guardando a posição de origem de cada um.
  let norm = "";
  const origem: number[] = [];
  Array.from(texto).reduce((pos, c) => {
    for (const n of semAcento(c)) {
      norm += n;
      origem.push(pos);
    }
    return pos + c.length;
  }, 0);
  const marcado = new Array<boolean>(texto.length).fill(false);
  for (const p of palavras) {
    for (let i = norm.indexOf(p); i !== -1; i = norm.indexOf(p, i + 1)) {
      const fim = i + p.length < origem.length ? origem[i + p.length] : texto.length;
      for (let j = origem[i]; j < fim; j++) marcado[j] = true;
    }
  }
  const partes: { t: string; m: boolean }[] = [];
  for (let j = 0; j < texto.length; j++) {
    const ultima = partes[partes.length - 1];
    if (ultima && ultima.m === marcado[j]) ultima.t += texto[j];
    else partes.push({ t: texto[j], m: marcado[j] });
  }
  return (
    <>
      {partes.map((p, i) =>
        p.m ? (
          <mark key={i} className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/40">
            {p.t}
          </mark>
        ) : (
          p.t
        ),
      )}
    </>
  );
}
const ORDEM_PRE = new Map(LOGICAS_PRE_CADASTRADAS.map((l, i) => [l.codigo, i]));
const GRUPOS = [
  { valor: "TODOS", label: "Todas" },
  { valor: "AT", label: "AT · Antecipação" },
  { valor: "DA", label: "DA · Diferencial de alíquotas" },
  { valor: "SN", label: "SN · Simples Nacional" },
  { valor: "AI", label: "AI · Antecipação interna" },
];

function ResumoFluxo({ fluxo }: { fluxo: unknown }) {
  const nos = parseFluxo(fluxo);
  if (nos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Fórmula fixa (sem fluxograma montado).
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {nos.map((no, i) =>
        no.tipo === "operador" ? (
          <span
            key={no.id + i}
            className="flex h-5 w-5 items-center justify-center rounded bg-[oklch(0.55_0.19_25)] text-[11px] font-bold text-white"
          >
            {simboloOperador(no.op)}
          </span>
        ) : (
          <span
            key={no.id + i}
            className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium"
          >
            {labelNo(no)}
          </span>
        ),
      )}
    </div>
  );
}

export default function CalculosListPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["logicas-calculo"],
    queryFn: fetchLogicas,
  });

  useEffect(() => {
    if (error) toast.error("Erro ao carregar lógicas", { description: error.message });
  }, [error]);

  const toggleAtiva = useMutation({
    mutationFn: async (l: LogicaCalculo) => {
      const { error } = await supabase
        .from("ff_logicas_calculo")
        .update({ ativa: !l.ativa })
        .eq("id", l.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logicas-calculo"] });
      toast.success("Status atualizado");
    },
    onError: (e) => toast.error("Erro", { description: (e as Error).message }),
  });

  const duplicar = useMutation({
    mutationFn: async (l: LogicaCalculo) => {
      const { error } = await supabase.from("ff_logicas_calculo").insert({
        nome: `${l.nome} (cópia)`,
        descricao: l.descricao,
        formula_codigo: l.formula_codigo,
        parametros: l.parametros as never,
        campos_usuario: l.campos_usuario as never,
        fluxo: (parseFluxo(l.fluxo) as unknown) as never,
        ativa: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logicas-calculo"] });
      toast.success("Lógica duplicada");
    },
    onError: (e) => toast.error("Erro", { description: (e as Error).message }),
  });

  const excluir = useMutation({
    mutationFn: async (l: LogicaCalculo) => {
      await supabase.from("ff_logica_ncm_legislacao").delete().eq("logica_id", l.id);
      const { data, error } = await supabase
        .from("ff_logicas_calculo")
        .delete()
        .eq("id", l.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Nenhum registro removido — verifique suas permissões.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logicas-calculo"] });
      toast.success("Lógica excluída");
    },
    onError: (e) => toast.error("Erro ao excluir", { description: (e as Error).message }),
  });

  const { isAdminOrFiscal } = useUserRole();
  const [grupo, setGrupo] = useState("TODOS");
  const [busca, setBusca] = useState("");
  const codigosExistentes = useMemo(
    () => new Set((data ?? []).map((l) => paramsDe(l)?.codigo).filter(Boolean)),
    [data],
  );
  const qtdNovas = LOGICAS_PRE_CADASTRADAS.filter((l) => !codigosExistentes.has(l.codigo)).length;
  const instalar = useMutation({
    mutationFn: () => instalarLogicasPreCadastradas(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["logicas-calculo"] });
      qc.invalidateQueries({ queryKey: ["ff-campos-xml"] });
      toast.success("Lógicas pré-cadastradas instaladas", {
        description: `Campos do XML: ${r.camposInseridos} inseridos, ${r.camposExistentes} já existiam. Lógicas: ${r.logicasInseridas} inseridas, ${r.logicasExistentes} já existiam.`,
      });
    },
    onError: (e) => toast.error("Erro ao instalar", { description: (e as Error).message }),
  });

  const palavras = useMemo(() => semAcento(busca).split(/\s+/).filter(Boolean), [busca]);
  const buscaNaDescricao = (l: LogicaCalculo) =>
    palavras.some((p) => semAcento(l.descricao ?? "").includes(p));
  const logicas = useMemo(() => {
    const ordem = (l: LogicaCalculo) => {
      const c = paramsDe(l)?.codigo;
      return c != null ? ORDEM_PRE.get(c) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    };
    return (data ?? [])
      .map((l, i) => ({ l, i }))
      .sort((a, b) => ordem(a.l) - ordem(b.l) || a.i - b.i)
      .map((x) => x.l)
      .filter((l) => grupo === "TODOS" || (paramsDe(l)?.codigo ?? "").startsWith(grupo + "-"))
      .filter((l) => {
        // Todas as palavras digitadas precisam aparecer no título ou na descrição.
        const texto = semAcento(`${l.nome} ${l.descricao ?? ""}`);
        return palavras.every((p) => texto.includes(p));
      });
  }, [data, grupo, palavras]);
  const isEmpty = !isLoading && (data ?? []).length === 0;

  return (
    <>
      <PageHeader
        title="Lógicas de Cálculo"
        description="Monte visualmente como o ICMS deve ser calculado em cada auditoria."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/fiscal/fronteira/campos">Campos do XML</Link>
            </Button>
            {isAdminOrFiscal && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={instalar.isPending}>
                    <Download className="mr-1.5 h-4 w-4" />
                    {instalar.isPending ? "Instalando..." : "Instalar lógicas pré-cadastradas"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Instalar lógicas pré-cadastradas?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {qtdNovas > 0
                        ? `Serão instaladas ${qtdNovas} lógica(s) nova(s) de ${LOGICAS_PRE_CADASTRADAS.length}, conferidas com os exemplos oficiais da SEFAZ-PE, e os campos do XML que faltarem. Nada do que já existe será alterado.`
                        : "Todas as lógicas pré-cadastradas já estão instaladas. Só os campos do XML que faltarem serão incluídos."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => instalar.mutate()}>Instalar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button asChild size="sm">
              <Link to="/fiscal/fronteira/formulas/nova">
                <Plus className="mr-1.5 h-4 w-4" />
                Nova Lógica
              </Link>
            </Button>
          </div>
        }
      />

      {!isEmpty && (
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por palavras do título ou da descrição"
            aria-label="Buscar lógicas de cálculo"
            className="pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {(data ?? []).some((l) => paramsDe(l)?.codigo) && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {GRUPOS.map((g) => (
            <Button key={g.valor} size="sm" variant={grupo === g.valor ? "default" : "outline"} onClick={() => setGrupo(g.valor)}>
              {g.label}
            </Button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Calculator className="h-8 w-8" strokeWidth={1.75} />
          </div>
          <h2 className="mt-5 text-lg font-semibold">Nenhuma lógica cadastrada</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Crie sua primeira lógica de cálculo em fluxograma.
          </p>
          <Button asChild size="sm" className="mt-5">
            <Link to="/fiscal/fronteira/formulas/nova">
              <Plus className="mr-1.5 h-4 w-4" />
              Nova Lógica
            </Link>
          </Button>
        </div>
      ) : logicas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhuma lógica encontrada{busca.trim() ? ` para "${busca.trim()}"` : " neste grupo"}.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {logicas.map((l) => (
            <div
              key={l.id}
              className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  {(paramsDe(l)?.pre_cadastrada || paramsDe(l)?.modificada) && (
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      {paramsDe(l)?.pre_cadastrada ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Pré-cadastrada</span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Modificada</span>
                      )}
                      <span className="font-mono text-[10px] text-muted-foreground">{paramsDe(l)?.codigo}</span>
                    </div>
                  )}
                  <h3 className="font-semibold leading-tight">
                    <Destaque texto={l.nome} palavras={palavras} />
                  </h3>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    l.ativa
                      ? "bg-[oklch(0.58_0.15_160)]/10 text-[oklch(0.45_0.15_160)]"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {l.ativa ? "Ativa" : "Inativa"}
                </span>
              </div>

              {/* Descrição recolhida: só aparece ao clicar no cálculo ou quando a busca a encontra */}
              <details
                key={buscaNaDescricao(l) ? "aberto" : "fechado"}
                open={buscaNaDescricao(l)}
                className="group rounded-md border bg-muted/20 p-2.5"
              >
                <summary
                  className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                  title="Clique para ver a descrição do cálculo"
                >
                  <ResumoFluxo fluxo={l.fluxo} />
                  <span className="mt-2 block text-[11px] text-muted-foreground">
                    <span className="group-open:hidden">Ver descrição ▾</span>
                    <span className="hidden group-open:inline">Ocultar descrição ▴</span>
                  </span>
                </summary>
                <p className="mt-2 whitespace-pre-wrap border-t pt-2 text-xs text-muted-foreground">
                  {l.descricao ? <Destaque texto={l.descricao} palavras={palavras} /> : "Sem descrição"}
                </p>
              </details>

              <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t pt-3">
                <Button asChild size="sm" variant="outline">
                  <Link to={`/fiscal/fronteira/formulas/${l.id}`}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Editar
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => duplicar.mutate(l)}
                  disabled={duplicar.isPending}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Duplicar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleAtiva.mutate(l)}
                  disabled={toggleAtiva.isPending}
                >
                  <Power className="mr-1 h-3.5 w-3.5" />
                  {l.ativa ? "Desativar" : "Ativar"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={excluir.isPending}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Excluir
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir “{l.nome}”?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita. A lógica e suas legislações por NCM
                        serão removidas permanentemente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => excluir.mutate(l)}
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
