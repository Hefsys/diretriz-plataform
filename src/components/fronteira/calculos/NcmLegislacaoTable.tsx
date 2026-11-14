import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FluxoEditor } from "@/components/fronteira/calculos/FluxoEditor";
import { fluxoValido, parseFluxo, type Fluxo } from "@/lib/fronteira/fluxo-calculo";
import { db as supabase } from "@/lib/dp/db";

interface NcmRow {
  id?: string;
  ncm: string;
  descricao_produto: string;
  legislacao_valor: string;
  vigencia_inicio: string;
  vigencia_fim: string;
  /** Fórmula própria do NCM. null = usa o fluxograma padrão da lógica. */
  fluxo: unknown;
  _dirty?: boolean;
  _new?: boolean;
}

interface DbRow {
  id: string;
  ncm: string;
  descricao_produto: string | null;
  legislacao_valor: number;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  fluxo: unknown;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NcmLegislacaoTable({ logicaId }: { logicaId: string }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<NcmRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editandoIdx, setEditandoIdx] = useState<number | null>(null);
  const [fluxoEdit, setFluxoEdit] = useState<Fluxo>([]);
  const [excluindoIdx, setExcluindoIdx] = useState<number | null>(null);

  // Fluxograma padrão da lógica — usado como ponto de partida ao criar uma
  // fórmula própria e para o badge "Usa padrão da lógica".
  const { data: fluxoPadrao } = useQuery({
    queryKey: ["logica-fluxo-padrao", logicaId],
    queryFn: async (): Promise<Fluxo> => {
      const { data, error } = await supabase
        .from("ff_logicas_calculo")
        .select("fluxo")
        .eq("id", logicaId)
        .maybeSingle();
      if (error) throw error;
      return parseFluxo((data as { fluxo?: unknown } | null)?.fluxo);
    },
    enabled: !!logicaId && logicaId !== "nova",
  });

  const { data: dbRows, isLoading } = useQuery({
    queryKey: ["ncm-legislacao", logicaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ff_logica_ncm_legislacao")
        .select("id, ncm, descricao_produto, legislacao_valor, vigencia_inicio, vigencia_fim, fluxo")
        .eq("logica_id", logicaId)
        .order("ncm");
      if (error) throw error;
      const mapped: NcmRow[] = ((data ?? []) as DbRow[]).map((r) => ({
        id: r.id,
        ncm: r.ncm,
        descricao_produto: r.descricao_produto ?? "",
        legislacao_valor: String(r.legislacao_valor),
        vigencia_inicio: r.vigencia_inicio ?? today(),
        vigencia_fim: r.vigencia_fim ?? "",
        fluxo: r.fluxo ?? null,
      }));
      return mapped;
    },
    enabled: !!logicaId && logicaId !== "nova",
  });

  // Sincroniza o estado editável com o que veio do banco. Fica fora do queryFn
  // para funcionar também quando o React Query serve dados do cache (remontagem
  // da tela), caso em que o queryFn não roda e as linhas salvas desapareciam.
  useEffect(() => {
    if (!dbRows) return;
    setRows((prev) => {
      const pendentes = prev.filter((r) => r._new && !r.id);
      return [...dbRows, ...pendentes];
    });
    setLoaded(true);
  }, [dbRows]);

  const salvar = useMutation({
    mutationFn: async () => {
      const toUpsert = rows
        .filter((r) => r._dirty || r._new)
        .filter((r) => r.ncm.trim().length >= 4 && Number(r.legislacao_valor.replace(",", ".")) > 0);
      if (toUpsert.length === 0) {
        throw new Error("Nada para salvar — preencha NCM e legislação.");
      }
      const payload = toUpsert.map((r) => ({
        id: r.id,
        logica_id: logicaId,
        ncm: r.ncm.trim(),
        descricao_produto: r.descricao_produto.trim() || null,
        legislacao_valor: Number(r.legislacao_valor.replace(",", ".")),
        vigencia_inicio: r.vigencia_inicio || today(),
        vigencia_fim: r.vigencia_fim || null,
        unidade: "R$/kg",
        fluxo: (r.fluxo ?? null) as never,
      }));
      const { error } = await supabase
        .from("ff_logica_ncm_legislacao")
        .upsert(payload, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("NCMs salvos");
      // Remove as linhas novas já gravadas (voltam do banco com id) e limpa os
      // marcadores de alteração das linhas existentes, evitando duplicatas.
      setRows((prev) =>
        prev
          .filter(
            (r) =>
              r.id ||
              !(r.ncm.trim().length >= 4 && Number(r.legislacao_valor.replace(",", ".")) > 0),
          )
          .map((r) => (r.id ? { ...r, _dirty: false } : r)),
      );
      qc.invalidateQueries({ queryKey: ["ncm-legislacao", logicaId] });
    },
    onError: (e) => toast.error("Erro", { description: (e as Error).message }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("ff_logica_ncm_legislacao")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Nada foi removido — sem permissão para excluir este NCM.");
      }
    },
    onSuccess: () => {
      toast.success("NCM removido");
      qc.invalidateQueries({ queryKey: ["ncm-legislacao", logicaId] });
    },
    onError: (e) => toast.error("Erro", { description: (e as Error).message }),
  });

  /** Grava (ou limpa) a fórmula própria de uma linha já persistida. */
  const salvarFluxo = useMutation({
    mutationFn: async ({ id, fluxo }: { id: string; fluxo: unknown }) => {
      const { error } = await supabase
        .from("ff_logica_ncm_legislacao")
        .update({ fluxo } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ncm-legislacao", logicaId] });
    },
    onError: (e) => toast.error("Erro", { description: (e as Error).message }),
  });

  function updateRow(idx: number, patch: Partial<NcmRow>) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch, _dirty: true } : r)),
    );
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        ncm: "",
        descricao_produto: "",
        legislacao_valor: "",
        vigencia_inicio: today(),
        vigencia_fim: "",
        fluxo: null,
        _new: true,
        _dirty: true,
      },
    ]);
  }

  function removeRow(idx: number) {
    const row = rows[idx];
    if (row.id) {
      excluir.mutate(row.id);
    }
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function abrirEditorFluxo(idx: number) {
    const row = rows[idx];
    const proprio = parseFluxo(row.fluxo);
    setFluxoEdit(fluxoValido(proprio) ? proprio : (fluxoPadrao ?? []));
    setEditandoIdx(idx);
  }

  function aplicarFluxo(fluxo: unknown) {
    if (editandoIdx === null) return;
    const row = rows[editandoIdx];
    updateRow(editandoIdx, { fluxo });
    if (row.id) {
      salvarFluxo.mutate({ id: row.id, fluxo });
      toast.success(fluxo ? "Fórmula própria salva" : "Fórmula própria removida");
    } else {
      toast.info("Clique em \"Salvar NCMs\" para gravar esta linha");
    }
    setEditandoIdx(null);
  }

  if (logicaId === "nova") {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        Salve a lógica primeiro para cadastrar os NCMs aplicáveis.
      </div>
    );
  }

  if (isLoading || !loaded) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">NCM (8 dígitos)</th>
              <th className="px-3 py-2 text-left font-medium">Descrição do produto</th>
              <th className="px-3 py-2 text-left font-medium">Legislação (R$/kg)</th>
              <th className="px-3 py-2 text-left font-medium">Fórmula</th>
              <th className="sticky right-0 bg-muted/40 px-3 py-2 text-right font-medium">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum NCM cadastrado. Clique em "Adicionar NCM" para começar.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={r.id ?? `new-${idx}`} className="border-t">
                  <td className="px-2 py-1.5">
                    <Input
                      value={r.ncm}
                      onChange={(e) => updateRow(idx, { ncm: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                      placeholder="85071090"
                      className="h-8"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={r.descricao_produto}
                      onChange={(e) => updateRow(idx, { descricao_produto: e.target.value })}
                      placeholder="Bateria automotiva 60Ah"
                      className="h-8"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={r.legislacao_valor}
                      onChange={(e) => updateRow(idx, { legislacao_valor: e.target.value })}
                      placeholder="19.80"
                      className="h-8 w-28"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      {fluxoValido(parseFluxo(r.fluxo)) ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          Fórmula própria
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Usa padrão da lógica
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => abrirEditorFluxo(idx)}
                      >
                        <Workflow className="mr-1 h-3.5 w-3.5" />
                        Editar fórmula
                      </Button>
                    </div>
                  </td>
                  <td className="sticky right-0 bg-card px-2 py-1.5 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setExcluindoIdx(idx)}
                      disabled={excluir.isPending}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Excluir
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-4 w-4" />
          Adicionar NCM
        </Button>
        <Button
          size="sm"
          onClick={() => salvar.mutate()}
          disabled={salvar.isPending || !rows.some((r) => r._dirty || r._new)}
        >
          <Save className="mr-1 h-4 w-4" />
          {salvar.isPending ? "Salvando..." : "Salvar NCMs"}
        </Button>
      </div>

      <Dialog
        open={editandoIdx !== null}
        onOpenChange={(o) => !o && setEditandoIdx(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Fórmula própria — NCM {editandoIdx !== null ? rows[editandoIdx]?.ncm || "(sem NCM)" : ""}
            </DialogTitle>
            <DialogDescription>
              Monte uma fórmula exclusiva para este NCM. Sem fórmula própria, o
              cálculo usa o fluxograma padrão da lógica.
            </DialogDescription>
          </DialogHeader>

          <FluxoEditor fluxo={fluxoEdit} onChange={setFluxoEdit} />

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => aplicarFluxo(null)}
              disabled={salvarFluxo.isPending}
            >
              Remover fórmula própria
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditandoIdx(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => aplicarFluxo(fluxoEdit)}
                disabled={!fluxoValido(fluxoEdit) || salvarFluxo.isPending}
              >
                Salvar fórmula
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={excluindoIdx !== null}
        onOpenChange={(o) => !o && setExcluindoIdx(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir NCM?</AlertDialogTitle>
            <AlertDialogDescription>
              O NCM{" "}
              {excluindoIdx !== null
                ? rows[excluindoIdx]?.ncm || "(sem NCM)"
                : ""}{" "}
              será removido desta lógica, junto com sua legislação e fórmula
              própria. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (excluindoIdx !== null) removeRow(excluindoIdx);
                setExcluindoIdx(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}