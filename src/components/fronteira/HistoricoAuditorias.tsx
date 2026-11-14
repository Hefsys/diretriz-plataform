import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Inbox, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { db as supabase } from "@/lib/dp/db";
import { formatBRL, formatCNPJ, formatDateShort, formatPeriodoFiscal } from "@/lib/fronteira/format";
import { exportarConferenciaXLSX, type ConferenciaNotaExport } from "@/lib/fronteira/exportar";
import { cn } from "@/lib/utils";

interface SessaoHistoricoRow {
  id: string;
  created_at: string;
  periodo_fiscal: string;
  numero_extrato: string | null;
  status: string;
  total_casos: number;
  valor_recuperavel: number | null;
  empresa: { id: string; razao_social: string; inscricao_estadual: string | null } | null;
}

interface NotaSessaoRow {
  nnf: string;
  cnpj_emitente: string;
  nome_emitente: string | null;
  valor_nf: number | null;
  icms_sefaz: number | null;
  icms_calculado: number | null;
  diferenca: number | null;
  icms_xml_editado: number | null;
  motivo_edicao: string | null;
}

/**
 * Auditorias salvas no histórico. Com `empresaId`, mostra só as da empresa;
 * sem ele, mostra todas as do escritório com a coluna Empresa.
 */
export function HistoricoAuditorias({ empresaId }: { empresaId?: string }) {
  const { podeExcluir } = useAuth();
  const [sessaoAberta, setSessaoAberta] = useState<SessaoHistoricoRow | null>(null);
  const [sessaoExcluir, setSessaoExcluir] = useState<SessaoHistoricoRow | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["ff-historico-sessoes", empresaId ?? "todas"],
    queryFn: async (): Promise<SessaoHistoricoRow[]> => {
      let q = supabase
        .from("ff_sessoes_auditoria")
        .select("id, created_at, periodo_fiscal, numero_extrato, status, total_casos, valor_recuperavel, empresa:empresas(id, razao_social, inscricao_estadual)")
        .order("created_at", { ascending: false });
      if (empresaId) q = q.eq("empresa_id", empresaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SessaoHistoricoRow[];
    },
  });

  useEffect(() => {
    if (error) toast.error("Erro ao carregar histórico", { description: error.message });
  }, [error]);

  async function carregarNotas(sessaoId: string): Promise<NotaSessaoRow[]> {
    const { data, error } = await supabase
      .from("ff_conferencia_notas")
      .select("nnf,cnpj_emitente,nome_emitente,valor_nf,icms_sefaz,icms_calculado,diferenca,icms_xml_editado,motivo_edicao")
      .eq("sessao_id", sessaoId)
      .order("nnf");
    if (error) throw error;
    return (data ?? []) as NotaSessaoRow[];
  }

  async function exportarSessao(sessao: SessaoHistoricoRow) {
    const razaoSocial = sessao.empresa?.razao_social ?? "";
    const ie = sessao.empresa?.inscricao_estadual ?? null;
    try {
      const notas = await carregarNotas(sessao.id);
      const exportRows: ConferenciaNotaExport[] = notas.map((n) => ({
        nNF: n.nnf,
        cnpjEmitente: n.cnpj_emitente,
        vNF: Number(n.valor_nf ?? 0),
        icmsSefaz: Number(n.icms_sefaz ?? 0),
        icmsCalculado: Number(n.icms_calculado ?? 0),
        diferenca: Number(n.diferenca ?? 0),
        icmsXmlEditado: n.icms_xml_editado != null ? Number(n.icms_xml_editado) : null,
        motivoEdicao: n.motivo_edicao,
      }));
      await exportarConferenciaXLSX(exportRows, {
        razaoSocial,
        inscricaoEstadual: ie ?? undefined,
        periodoFiscal: sessao.periodo_fiscal,
        totalIcmsSefaz: exportRows.reduce((s, r) => s + r.icmsSefaz, 0),
        totalIcmsCalculado: exportRows.reduce((s, r) => s + r.icmsCalculado, 0),
        totalDiferenca: exportRows.reduce((s, r) => s + r.diferenca, 0),
        tituloArquivo: `conferencia_${sessao.periodo_fiscal.replace("/", "-")}`,
      });
      toast.success("Excel gerado");
    } catch (e) {
      toast.error("Erro ao exportar", { description: String(e) });
    }
  }

  async function excluirSessao(sessao: SessaoHistoricoRow) {
    setExcluindo(true);
    try {
      const { error: errNotas } = await supabase
        .from("ff_conferencia_notas")
        .delete()
        .eq("sessao_id", sessao.id);
      if (errNotas) throw errNotas;
      const { error: errSessao } = await supabase
        .from("ff_sessoes_auditoria")
        .delete()
        .eq("id", sessao.id);
      if (errSessao) throw errSessao;
      toast.success("Auditoria excluída");
      setSessaoExcluir(null);
      await queryClient.invalidateQueries({ queryKey: ["ff-historico-sessoes"] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao excluir", { description: msg });
    } finally {
      setExcluindo(false);
    }
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const sessoes = data ?? [];
  if (sessoes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
        <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 text-sm font-semibold text-foreground">Nenhuma auditoria salva ainda</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Faça uma conferência e clique em "Salvar no histórico".
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">Auditorias salvas</h3>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 text-left font-medium">Data</th>
              {!empresaId && <th className="px-5 py-2.5 text-left font-medium">Empresa</th>}
              <th className="px-5 py-2.5 text-left font-medium">Período</th>
              <th className="px-5 py-2.5 text-right font-medium">Notas</th>
              <th className="px-5 py-2.5 text-right font-medium">Diferença</th>
              <th className="px-5 py-2.5 text-left font-medium">Status</th>
              <th className="px-5 py-2.5 text-right font-medium w-32">Ações</th>
            </tr>
          </thead>
          <tbody>
            {sessoes.map((s) => (
              <tr
                key={s.id}
                className="border-b border-border/60 last:border-0 hover:bg-muted/30 cursor-pointer"
                onClick={() => setSessaoAberta(s)}
              >
                <td className="px-5 py-3 text-xs">{formatDateShort(s.created_at)}</td>
                {!empresaId && (
                  <td className="px-5 py-3 text-xs">
                    {s.empresa ? <Link className="hover:underline" to={`/fiscal/fronteira/empresas/${s.empresa.id}`} onClick={(e) => e.stopPropagation()}>{s.empresa.razao_social}</Link> : "—"}
                  </td>
                )}
                <td className="px-5 py-3 text-foreground font-medium">{formatPeriodoFiscal(s.periodo_fiscal)}</td>
                <td className="px-5 py-3 text-right tabular text-xs">{s.total_casos}</td>
                <td
                  className={cn(
                    "px-5 py-3 text-right tabular text-xs font-semibold",
                    Number(s.valor_recuperavel ?? 0) > 0 && "text-emerald-600",
                    Number(s.valor_recuperavel ?? 0) === 0 && "text-muted-foreground",
                    Number(s.valor_recuperavel ?? 0) < 0 && "text-destructive",
                  )}
                >
                  {formatBRL(Number(s.valor_recuperavel ?? 0))}
                </td>
                <td className="px-5 py-3 text-xs">{s.status}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSessaoAberta(s)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => void exportarSessao(s)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {podeExcluir && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => setSessaoExcluir(s)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <SessaoNotasDialog
        sessao={sessaoAberta}
        onClose={() => setSessaoAberta(null)}
        onExport={(s) => exportarSessao(s)}
      />

      <AlertDialog open={sessaoExcluir !== null} onOpenChange={(o) => !o && !excluindo && setSessaoExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir auditoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá permanentemente a auditoria
              {sessaoExcluir ? ` de ${formatPeriodoFiscal(sessaoExcluir.periodo_fiscal)}` : ""}
              {" "}e todas as notas conferidas vinculadas. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={excluindo}
              onClick={(e) => {
                e.preventDefault();
                if (sessaoExcluir) void excluirSessao(sessaoExcluir);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SessaoNotasDialog({
  sessao,
  onClose,
  onExport,
}: {
  sessao: SessaoHistoricoRow | null;
  onClose: () => void;
  onExport: (s: SessaoHistoricoRow) => void;
}) {
  const open = sessao !== null;
  const { data: notas, isLoading } = useQuery({
    queryKey: ["sessao-notas", sessao?.id],
    queryFn: async (): Promise<NotaSessaoRow[]> => {
      if (!sessao) return [];
      const { data, error } = await supabase
        .from("ff_conferencia_notas")
        .select("nnf,cnpj_emitente,nome_emitente,valor_nf,icms_sefaz,icms_calculado,diferenca,icms_xml_editado,motivo_edicao")
        .eq("sessao_id", sessao.id)
        .order("nnf");
      if (error) throw error;
      return (data ?? []) as NotaSessaoRow[];
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Auditoria — {sessao ? formatPeriodoFiscal(sessao.periodo_fiscal) : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex justify-end">
            {sessao && (
              <Button size="sm" variant="outline" onClick={() => onExport(sessao)}>
                <Download className="mr-1.5 h-4 w-4" /> Exportar Excel
              </Button>
            )}
          </div>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-[11px] uppercase">
                    <th className="px-3 py-2 text-left font-medium">nNF</th>
                    <th className="px-3 py-2 text-left font-medium">CNPJ</th>
                    <th className="px-3 py-2 text-right font-medium">Valor NF</th>
                    <th className="px-3 py-2 text-right font-medium">SEFAZ</th>
                    <th className="px-3 py-2 text-right font-medium">XML</th>
                    <th className="px-3 py-2 text-right font-medium">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {(notas ?? []).map((n, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 font-mono">{n.nnf}</td>
                      <td className="px-3 py-2 font-mono">{formatCNPJ(n.cnpj_emitente)}</td>
                      <td className="px-3 py-2 text-right tabular">{formatBRL(Number(n.valor_nf ?? 0))}</td>
                      <td className="px-3 py-2 text-right tabular">{formatBRL(Number(n.icms_sefaz ?? 0))}</td>
                      <td className="px-3 py-2 text-right tabular">
                        {formatBRL(Number(n.icms_calculado ?? 0))}
                        {n.icms_xml_editado != null && (
                          <span className="ml-1 text-[10px] text-muted-foreground">(editado)</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular font-medium",
                          Number(n.diferenca ?? 0) > 0 && "text-emerald-600",
                          Number(n.diferenca ?? 0) < 0 && "text-destructive",
                        )}
                      >
                        {formatBRL(Number(n.diferenca ?? 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
