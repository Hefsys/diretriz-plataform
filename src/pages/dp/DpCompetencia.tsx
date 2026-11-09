import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, Download, Eye, Loader2, Lock, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CelulaValor } from "@/components/dp/CelulaValor";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/dp/db";
import { STATUS_FOLHA, competenciaValida, exportarPlanilha, fmtMoeda, gerarTxtDominio } from "@/lib/dp/folha";

type Rubrica = { id: string; nome: string; codigo: string; posicao: number };
type Funcionario = { id: string; tipo_calculo: string; codigo: string; nome: string; posicao: number };

export default function DpCompetencia() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, temModulo, podeExcluir } = useAuth();
  const key = ["dp-competencia", id];
  const [novaRub, setNovaRub] = useState({ nome: "", codigo: "" });

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: comp, error } = await db.from("dp_folha_competencias")
        .select("*, empresas(id, razao_social, cnpj, codigo_dominio)").eq("id", id).single();
      if (error) throw error;
      const [{ data: rubricas }, { data: funcionarios }] = await Promise.all([
        db.from("dp_folha_rubricas").select("*").eq("competencia_id", id).order("posicao"),
        db.from("dp_folha_funcionarios").select("*").eq("competencia_id", id).order("posicao"),
      ]);
      const ids = (funcionarios ?? []).map((f) => f.id);
      const { data: lancamentos } = ids.length
        ? await db.from("dp_folha_lancamentos").select("*").in("funcionario_id", ids)
        : { data: [] as { funcionario_id: string; rubrica_id: string; valor: number }[] };
      return { comp, rubricas: (rubricas ?? []) as Rubrica[], funcionarios: (funcionarios ?? []) as Funcionario[], lancamentos: lancamentos ?? [] };
    },
  });
  const valores = useMemo(() => new Map((data?.lancamentos ?? []).map((l) => [`${l.funcionario_id}:${l.rubrica_id}`, Number(l.valor)])), [data]);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (error || !data) return <p className="text-sm text-muted-foreground">Competência não encontrada.</p>;

  const { comp, rubricas, funcionarios } = data;
  const empresa = comp.empresas as { id: string; razao_social: string; cnpj: string; codigo_dominio: string | null };
  const vr = comp.modulo === "vr";
  if (!temModulo(vr ? "dp:vr" : "dp:variaveis")) return <p className="text-sm text-muted-foreground">Você não tem acesso a este módulo.</p>;
  const voltar = vr ? "/dp/vr" : "/dp/variaveis";
  const linkCliente = `${window.location.origin}/folha/${comp.token}`;

  const setStatus = async (status: string) => {
    const patch: Record<string, unknown> = { status };
    if (status === "enviado" || status === "reaberto") { patch.enviado_por = user?.id; patch.enviado_por_email = user?.email ?? null; }
    const { error } = await db.from("dp_folha_competencias").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
    qc.invalidateQueries({ queryKey: ["dp-competencias"] });
  };
  const salvar = async (fid: string, rid: string, v: number | null) => {
    const { error } = v === null
      ? await db.from("dp_folha_lancamentos").delete().eq("funcionario_id", fid).eq("rubrica_id", rid)
      : await db.from("dp_folha_lancamentos").upsert({ funcionario_id: fid, rubrica_id: rid, valor: v });
    if (error) toast.error("Não foi possível salvar o valor.");
    refresh();
  };
  const updFunc = async (fid: string, patch: Partial<Funcionario>) => { await db.from("dp_folha_funcionarios").update(patch).eq("id", fid); refresh(); };

  const exportarTxt = () => {
    const r = gerarTxtDominio({ codigoEmpresa: empresa.codigo_dominio ?? "", competencia: comp.competencia, rubricas, funcionarios, valores });
    if (r.problemas.length && !confirm(`Atenção:\n- ${r.problemas.join("\n- ")}\n\nEsses lançamentos ficarão de fora. Gerar mesmo assim?`)) return;
    if (!r.linhas) { toast.error("Nenhum lançamento para exportar."); return; }
    const url = URL.createObjectURL(new Blob([r.texto], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = r.nome; a.click(); URL.revokeObjectURL(url);
    toast.success(`${r.linhas} lançamentos gerados. No Domínio: Utilitários → Importação → de Arquivo Texto → de Lançamentos.`);
  };

  const editarCodigoDominio = async () => {
    const novo = window.prompt("Código da empresa no Domínio", empresa.codigo_dominio ?? "")?.trim();
    if (novo === undefined || novo === (empresa.codigo_dominio ?? "")) return;
    const { error } = await db.from("empresas").update({ codigo_dominio: novo || null }).eq("id", empresa.id);
    if (error) { toast.error(error.message); return; }
    refresh(); qc.invalidateQueries({ queryKey: ["dp-empresas"] });
  };

  const editarCompetencia = async () => {
    const nova = window.prompt("Nova competência (MM/AAAA)", comp.competencia)?.trim();
    if (!nova || nova === comp.competencia) return;
    if (!competenciaValida(nova)) { toast.error("Use o formato MM/AAAA."); return; }
    const { error } = await db.from("dp_folha_competencias").update({ competencia: nova }).eq("id", id);
    if (error) { toast.error(error.code === "23505" ? "Essa competência já existe para a empresa." : error.message); return; }
    refresh(); qc.invalidateQueries({ queryKey: ["dp-competencias"] });
  };

  return (
    <div className="space-y-6">
      <Link to={voltar} className="inline-flex items-center text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="mr-1 h-4 w-4" />Voltar para {vr ? "VR" : "Variáveis da Folha"}</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{empresa.razao_social}</h1>
          <p className="text-sm text-muted-foreground">
            CNPJ {empresa.cnpj || "—"} · Cód. Domínio{" "}
            <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={editarCodigoDominio}>{empresa.codigo_dominio || "definir"}</button>
            {" "}· Competência <b className="text-foreground">{comp.competencia}</b>
            <button type="button" title="Editar competência" className="ml-1 inline-flex align-middle text-muted-foreground hover:text-primary" onClick={editarCompetencia}><Pencil className="h-3.5 w-3.5" /></button>
          </p>
          {!vr && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className={STATUS_FOLHA[comp.status]?.cls}>{STATUS_FOLHA[comp.status]?.label ?? comp.status}</Badge>
              {comp.submitted_at && <span>Confirmado pelo cliente em {new Date(comp.submitted_at).toLocaleString("pt-BR")}</span>}
              {comp.enviado_por_email && <span>· Enviado por {comp.enviado_por_email}</span>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!vr && (
            <>
              <Button variant="outline" onClick={() => window.open(linkCliente, "_blank", "noopener")}><Eye className="mr-2 h-4 w-4" />Visão do cliente</Button>
              <Button onClick={async () => {
                await navigator.clipboard.writeText(linkCliente);
                if (comp.status === "rascunho") await setStatus("enviado");
                toast.success("Link copiado! Envie para o cliente preencher.");
              }}><Copy className="mr-2 h-4 w-4" />Copiar link do cliente</Button>
              {comp.status === "preenchido" ? (
                <Button variant="outline" onClick={() => setStatus("reaberto")}><RotateCcw className="mr-2 h-4 w-4" />Reabrir para o cliente</Button>
              ) : comp.status !== "rascunho" ? (
                <Button variant="outline" onClick={() => setStatus("preenchido")}><Lock className="mr-2 h-4 w-4" />Travar</Button>
              ) : null}
            </>
          )}
          <Button variant="outline" onClick={() => exportarPlanilha({ codigoEmpresa: empresa.codigo_dominio ?? "", razaoSocial: empresa.razao_social, cnpj: empresa.cnpj ?? "", competencia: comp.competencia, rubricas, funcionarios, valores })}>
            <Download className="mr-2 h-4 w-4" />Excel
          </Button>
          <Button variant="outline" onClick={exportarTxt}><Download className="mr-2 h-4 w-4" />TXT Domínio</Button>
          {podeExcluir && (
            <Button variant="ghost" size="icon" title="Excluir competência" onClick={async () => {
              if (!confirm("Excluir esta competência e todos os valores?")) return;
              await db.from("dp_folha_competencias").delete().eq("id", id);
              qc.invalidateQueries({ queryKey: ["dp-competencias"] });
              navigate(voltar);
            }}><Trash2 className="h-4 w-4" /></Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rubricas (colunas)</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {rubricas.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">
                {r.nome} <span className="text-muted-foreground">{r.codigo}</span>
                <button className="ml-1 hover:text-destructive" title="Remover rubrica" onClick={async () => {
                  if (confirm(`Remover ${r.nome}? Os valores dessa coluna serão apagados.`)) { await db.from("dp_folha_rubricas").delete().eq("id", r.id); refresh(); }
                }}><X className="h-3.5 w-3.5" /></button>
              </span>
            ))}
            <form className="flex gap-1" onSubmit={async (e) => {
              e.preventDefault();
              if (!novaRub.nome.trim()) return;
              await db.from("dp_folha_rubricas").insert({ ...novaRub, competencia_id: id, posicao: rubricas.length });
              setNovaRub({ nome: "", codigo: "" }); refresh();
            }}>
              <Input className="h-8 w-44" placeholder="Nome (ex.: COMISSÃO)" value={novaRub.nome} onChange={(e) => setNovaRub({ ...novaRub, nome: e.target.value.toUpperCase() })} />
              <Input className="h-8 w-20" placeholder="Cód." value={novaRub.codigo} onChange={(e) => setNovaRub({ ...novaRub, codigo: e.target.value })} />
              <Button size="sm" variant="outline" title="Adicionar rubrica"><Plus className="h-4 w-4" /></Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#10143D] text-white">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Tipo</th>
                <th className="px-2 py-2 text-left font-medium">Código</th>
                <th className="px-2 py-2 text-left font-medium">Colaborador</th>
                {rubricas.map((r) => <th key={r.id} className="min-w-32 px-2 py-2 text-right font-medium">{r.nome}<div className="text-xs opacity-70">{r.codigo}</div></th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {funcionarios.map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="w-16 p-1"><Input className="h-8" defaultValue={f.tipo_calculo} onBlur={(e) => e.target.value !== f.tipo_calculo && updFunc(f.id, { tipo_calculo: e.target.value })} /></td>
                  <td className="w-24 p-1"><Input className="h-8" defaultValue={f.codigo} onBlur={(e) => e.target.value !== f.codigo && updFunc(f.id, { codigo: e.target.value })} /></td>
                  <td className="min-w-64 p-1"><Input className="h-8" defaultValue={f.nome} onBlur={(e) => e.target.value !== f.nome && updFunc(f.id, { nome: e.target.value.toUpperCase() })} /></td>
                  {rubricas.map((r) => <td key={r.id} className="p-1"><CelulaValor value={valores.get(`${f.id}:${r.id}`)} onCommit={(v) => salvar(f.id, r.id, v)} /></td>)}
                  <td className="p-1">
                    <Button size="icon" variant="ghost" title="Remover funcionário" onClick={async () => {
                      if (confirm(`Remover ${f.nome}?`)) { await db.from("dp_folha_funcionarios").delete().eq("id", f.id); refresh(); }
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
              {funcionarios.length === 0 && (
                <tr><td colSpan={rubricas.length + 4} className="p-8 text-center text-muted-foreground">Nenhum funcionário. Adicione abaixo ou importe ao criar a competência.</td></tr>
              )}
            </tbody>
            <tfoot className="border-t-2 bg-muted font-semibold">
              <tr>
                <td className="px-2 py-2" colSpan={3}>TOTAL · {funcionarios.length} funcionários</td>
                {rubricas.map((r) => <td key={r.id} className="px-2 py-2 text-right tabular-nums">{fmtMoeda(funcionarios.reduce((s, f) => s + (valores.get(`${f.id}:${r.id}`) ?? 0), 0))}</td>)}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="border-t p-3">
          <Button size="sm" variant="outline" onClick={async () => {
            await db.from("dp_folha_funcionarios").insert({ competencia_id: id, nome: "NOVO FUNCIONÁRIO", posicao: funcionarios.length });
            refresh();
          }}><Plus className="mr-1 h-4 w-4" />Adicionar funcionário</Button>
        </div>
      </Card>
    </div>
  );
}
