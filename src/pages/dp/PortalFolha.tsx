import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CelulaValor } from "@/components/dp/CelulaValor";
import { PublicShell } from "@/components/dp/PublicShell";
import { db } from "@/lib/dp/db";
import { clientePodeEditar, fmtMoeda } from "@/lib/dp/folha";

type Portal = {
  competencia: string; status: string; submitted_at: string | null;
  empresa: { nome: string; cnpj: string | null; codigo: string | null };
  rubricas: { id: string; nome: string; codigo: string }[];
  funcionarios: { id: string; nome: string; codigo: string }[];
  lancamentos: { funcionario_id: string; rubrica_id: string; valor: number }[];
};

/** Página aberta pelo cliente (sem login) para preencher as variáveis da folha. */
export default function PortalFolha() {
  const { token = "" } = useParams();
  const qc = useQueryClient();
  const key = ["dp-portal", token];
  const [salvando, setSalvando] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await db.rpc("dp_portal_obter", { p_token: token });
      if (error) throw error;
      return data as Portal;
    },
    retry: false,
  });
  const valores = useMemo(() => new Map((data?.lancamentos ?? []).map((l) => [`${l.funcionario_id}:${l.rubrica_id}`, Number(l.valor)])), [data]);

  if (isLoading) return <PublicShell><div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div></PublicShell>;
  if (error || !data) return <PublicShell><Card><CardContent className="p-10 text-center text-lg">Link inválido ou expirado. Fale com a Diretriz.</CardContent></Card></PublicShell>;

  const editavel = clientePodeEditar(data.status);

  async function commit(fid: string, rid: string, v: number | null) {
    setSalvando((n) => n + 1);
    try {
      const { error } = await db.rpc("dp_portal_salvar", { p_token: token, p_funcionario: fid, p_rubrica: rid, p_valor: v });
      if (error) throw new Error(error.message);
      qc.setQueryData<Portal>(key, (old) => old && {
        ...old,
        lancamentos: [...old.lancamentos.filter((x) => !(x.funcionario_id === fid && x.rubrica_id === rid)), ...(v === null ? [] : [{ funcionario_id: fid, rubrica_id: rid, valor: v }])],
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando((n) => n - 1);
    }
  }

  return (
    <PublicShell subtitulo="Variáveis da folha">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-[#ED3237]">Relação de valores para folha de pagamento</p>
          <h1 className="text-2xl font-semibold text-[#10143D]">{data.empresa.nome}</h1>
          <p className="text-sm text-muted-foreground">CNPJ {data.empresa.cnpj || "—"} · Competência <b className="text-foreground">{data.competencia}</b></p>
        </div>
        <span className="text-xs text-muted-foreground">{salvando > 0 ? "Salvando…" : editavel ? "Alterações salvas automaticamente" : ""}</span>
      </div>

      {!editavel && (
        <Card className="mt-6 border-emerald-300">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            <div>
              <p className="font-medium">{data.status === "rascunho" ? "Planilha aguardando liberação pela Diretriz." : "Valores enviados para a Diretriz. Obrigado!"}</p>
              <p className="text-sm text-muted-foreground">{data.status === "rascunho" ? "O preenchimento ainda não está disponível." : "Se precisar alterar algo, fale com a equipe Diretriz."}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#10143D] text-white">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Código</th>
                <th className="px-3 py-2 text-left font-medium">Colaborador</th>
                {data.rubricas.map((r) => <th key={r.id} className="min-w-36 px-2 py-2 text-right font-medium">{r.nome}<div className="text-xs opacity-70">{r.codigo}</div></th>)}
              </tr>
            </thead>
            <tbody>
              {data.funcionarios.map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="px-3 py-1 text-muted-foreground">{f.codigo}</td>
                  <td className="px-3 py-1 font-medium">{f.nome}</td>
                  {data.rubricas.map((r) => <td key={r.id} className="p-1"><CelulaValor value={valores.get(`${f.id}:${r.id}`)} disabled={!editavel} onCommit={(v) => commit(f.id, r.id, v)} /></td>)}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-muted font-semibold">
              <tr>
                <td className="px-3 py-2" colSpan={2}>TOTAL · {data.funcionarios.length} colaboradores</td>
                {data.rubricas.map((r) => <td key={r.id} className="px-2 py-2 text-right tabular-nums">{fmtMoeda(data.funcionarios.reduce((s, f) => s + (valores.get(`${f.id}:${r.id}`) ?? 0), 0))}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {editavel && (
        <div className="mt-6 flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="lg" disabled={salvando > 0} className="bg-[#ED3237] hover:bg-[#d42a2f]"><CheckCircle2 className="mr-2 h-5 w-5" />Confirmar e enviar</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar envio?</AlertDialogTitle>
                <AlertDialogDescription>Depois de confirmar, os valores ficam travados e não poderão mais ser alterados por aqui.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction onClick={async () => {
                  const { error } = await db.rpc("dp_portal_confirmar", { p_token: token });
                  if (error) { toast.error(error.message); return; }
                  toast.success("Enviado para a Diretriz!");
                  qc.invalidateQueries({ queryKey: key });
                }}>Confirmar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </PublicShell>
  );
}
