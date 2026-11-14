import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { db as supabase } from "@/lib/dp/db";
import { useUserRole } from "@/components/fronteira/compat";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FonteLegal } from "@/components/fronteira/FonteLegal";
import { formatDateShort } from "@/lib/fronteira/format";
import { cn } from "@/lib/utils";

interface Fundamento {
  informativo: string;
  item: string;
  dispositivo: string;
}

interface Regra {
  id: string;
  nome: string;
  tipo: string;
  status: string;
  codigo_receita: string | null;
  implementada_no_motor: boolean;
  descricao: string;
  condicoes: unknown;
  formula: string | null;
  parametros: unknown;
  exemplos_oficiais: string[];
  observacoes: string | null;
  fundamentos: unknown;
  validado_por: string | null;
  validado_em: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
}

const STATUS_VARIANT: Record<string, string> = {
  VALIDADA: "border-emerald-400 text-emerald-700 dark:text-emerald-400",
  RASCUNHO: "border-amber-400 text-amber-700 dark:text-amber-400",
  INATIVA: "border-muted-foreground/40 text-muted-foreground",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("text-[11px]", STATUS_VARIANT[status])}>
      {status}
    </Badge>
  );
}

/** Renderiza tabelas de parâmetros (ex.: cargas do Simples) como tabela HTML. */
function ParametrosView({ parametros }: { parametros: unknown }) {
  if (!parametros || typeof parametros !== "object") return null;
  const entradas = Object.entries(parametros as Record<string, unknown>);
  return (
    <div className="space-y-3">
      {entradas.map(([chave, valor]) => {
        if (valor && typeof valor === "object" && !Array.isArray(valor)) {
          const linhas = Object.entries(valor as Record<string, unknown>);
          const ehTabela = linhas.every(([, v]) => v && typeof v === "object" && !Array.isArray(v));
          if (ehTabela) {
            const colunas = [...new Set(linhas.flatMap(([, v]) => Object.keys(v as Record<string, unknown>)))];
            return (
              <div key={chave}>
                <div className="mb-1 text-xs font-medium">{chave}</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-7 text-xs">Alíquota interna</TableHead>
                      {colunas.map((c) => (
                        <TableHead key={c} className="h-7 text-xs">Inter {c}%</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map(([lin, vals]) => (
                      <TableRow key={lin}>
                        <TableCell className="py-1 text-xs font-medium">{lin}%</TableCell>
                        {colunas.map((c) => (
                          <TableCell key={c} className="py-1 text-xs tabular-nums">
                            {String((vals as Record<string, unknown>)[c] ?? "—")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          }
        }
        return (
          <div key={chave} className="text-xs">
            <span className="font-medium">{chave}:</span>{" "}
            <span className="text-muted-foreground">
              {typeof valor === "object" ? JSON.stringify(valor) : String(valor)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CondicoesView({ condicoes }: { condicoes: unknown }) {
  if (!condicoes) return null;
  if (Array.isArray(condicoes)) {
    return (
      <ul className="list-disc space-y-1 pl-4 text-sm">
        {condicoes.map((c, i) => (
          <li key={i}>{typeof c === "string" ? c : JSON.stringify(c)}</li>
        ))}
      </ul>
    );
  }
  return (
    <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-xs">
      {JSON.stringify(condicoes, null, 2)}
    </pre>
  );
}

export function RegrasPage() {
  const { isAdminOrFiscal } = useUserRole();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("TODOS");
  const [status, setStatus] = useState("TODOS");
  const [selecionada, setSelecionada] = useState<Regra | null>(null);
  const [gravando, setGravando] = useState(false);

  const { data: regras, isLoading } = useQuery({
    queryKey: ["regras-fiscais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ff_regras_fiscais")
        .select("*")
        .order("id");
      if (error) throw error;
      return data as Regra[];
    },
  });

  const tipos = useMemo(
    () => [...new Set((regras ?? []).map((r) => r.tipo))].sort(),
    [regras],
  );

  const filtradas = (regras ?? []).filter((r) => {
    if (tipo !== "TODOS" && r.tipo !== tipo) return false;
    if (status !== "TODOS" && r.status !== status) return false;
    if (busca && !`${r.id} ${r.nome}`.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  async function mudarStatus(novo: "VALIDADA" | "INATIVA") {
    if (!selecionada || !user) return;
    setGravando(true);
    try {
      const { error } = await supabase
        .from("ff_regras_fiscais")
        .update({
          status: novo,
          validado_por: novo === "VALIDADA" ? user.id : selecionada.validado_por,
          validado_em: novo === "VALIDADA" ? new Date().toISOString() : selecionada.validado_em,
        })
        .eq("id", selecionada.id);
      if (error) throw error;
      toast.success(`Regra ${selecionada.id} marcada como ${novo}.`);
      setSelecionada(null);
      queryClient.invalidateQueries({ queryKey: ["regras-fiscais"] });
    } catch (e) {
      toast.error("Erro ao atualizar: " + (e instanceof Error ? e.message : "desconhecido"));
    } finally {
      setGravando(false);
    }
  }

  const fundamentos = (selecionada?.fundamentos ?? []) as Fundamento[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Regras pré-cadastradas</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo de regras fiscais do ICMS Fronteira, com fundamentos legais e validação técnica.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por código ou nome…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos os tipos</SelectItem>
            {tipos.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos os status</SelectItem>
            <SelectItem value="RASCUNHO">Rascunho</SelectItem>
            <SelectItem value="VALIDADA">Validada</SelectItem>
            <SelectItem value="INATIVA">Inativa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando regras…</p>
      ) : filtradas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma regra encontrada. Importe o catálogo pelo Acervo legal (passo 4).
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regra</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Código de receita</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>No motor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => setSelecionada(r)}
                >
                  <TableCell>
                    <div className="font-mono text-xs text-muted-foreground">{r.id}</div>
                    <div className="text-sm font-medium">{r.nome}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.tipo}</TableCell>
                  <TableCell className="font-mono text-sm">{r.codigo_receita ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-sm">
                    {r.implementada_no_motor ? "Sim" : "Não"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet open={!!selecionada} onOpenChange={(v) => !v && setSelecionada(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {selecionada && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selecionada.nome}
                  <StatusBadge status={selecionada.status} />
                </SheetTitle>
                <SheetDescription>
                  <span className="font-mono">{selecionada.id}</span> · {selecionada.tipo}
                  {selecionada.codigo_receita && ` · código ${selecionada.codigo_receita}`}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descrição</h3>
                  <p className="whitespace-pre-wrap text-sm">{selecionada.descricao}</p>
                </section>

                {!!selecionada.condicoes && (
                  <section>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condições</h3>
                    <CondicoesView condicoes={selecionada.condicoes} />
                  </section>
                )}

                {selecionada.formula && (
                  <section>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fórmula</h3>
                    <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 font-mono text-xs">{selecionada.formula}</pre>
                  </section>
                )}

                {!!selecionada.parametros && (
                  <section>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Parâmetros</h3>
                    <ParametrosView parametros={selecionada.parametros} />
                  </section>
                )}

                {selecionada.exemplos_oficiais.length > 0 && (
                  <section>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exemplos oficiais</h3>
                    <ul className="list-disc space-y-1 pl-4 text-sm">
                      {selecionada.exemplos_oficiais.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {selecionada.observacoes && (
                  <section>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observações</h3>
                    <p className="whitespace-pre-wrap text-sm">{selecionada.observacoes}</p>
                  </section>
                )}

                {fundamentos.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fundamentos legais</h3>
                    <div className="flex flex-col items-start gap-2">
                      {fundamentos.map((f, i) => (
                        <FonteLegal
                          key={i}
                          informativo={f.informativo}
                          item={f.item}
                          dispositivo={f.dispositivo}
                        />
                      ))}
                    </div>
                  </section>
                )}

                <section className="text-xs text-muted-foreground">
                  {selecionada.vigencia_inicio && (
                    <div>
                      Vigência: {formatDateShort(selecionada.vigencia_inicio)}
                      {selecionada.vigencia_fim ? ` a ${formatDateShort(selecionada.vigencia_fim)}` : " em diante"}
                    </div>
                  )}
                  {selecionada.validado_em && (
                    <div>Validada em {formatDateShort(selecionada.validado_em)}</div>
                  )}
                </section>

                {isAdminOrFiscal && selecionada.status !== "INATIVA" && (
                  <div className="flex gap-2 border-t pt-4">
                    {selecionada.status !== "VALIDADA" && (
                      <Button onClick={() => mudarStatus("VALIDADA")} disabled={gravando}>
                        {gravando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                        Marcar como validada
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => mudarStatus("INATIVA")} disabled={gravando}>
                      <CircleOff className="mr-1.5 h-4 w-4" />
                      Inativar
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
