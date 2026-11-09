import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ChevronRight, Loader2, Plus, Search, Ticket, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/dp/db";
import {
  STATUS_FOLHA, chaveCompetencia, competenciaValida, lerPlanilha, lerRelacaoEmpregados, proximaCompetencia, type ModuloFolha,
} from "@/lib/dp/folha";

type Competencia = { id: string; empresa_id: string; competencia: string; status: string; created_at: string };
type EmpresaDP = { id: string; razao_social: string; cnpj: string; codigo_dominio: string | null };

const TEXTOS: Record<ModuloFolha, { titulo: string; descricao: string; icon: typeof Wallet }> = {
  variaveis: {
    titulo: "Variáveis da Folha",
    descricao: "Monte a planilha de cada empresa, envie o link e o cliente preenche os valores (comissões, horas extras, faltas…).",
    icon: Wallet,
  },
  vr: {
    titulo: "VR",
    descricao: "Planilhas de vale-refeição preenchidas pela equipe, com exportação TXT para o Domínio.",
    icon: Ticket,
  },
};

function useEmpresasDP() {
  return useQuery({
    queryKey: ["dp-empresas"],
    queryFn: async () => {
      const { data, error } = await db.from("empresas").select("id, razao_social, cnpj, codigo_dominio").eq("ativa", true).order("razao_social");
      if (error) throw error;
      return (data ?? []) as EmpresaDP[];
    },
  });
}

export default function DpFolha({ modulo }: { modulo: ModuloFolha }) {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [novaAberta, setNovaAberta] = useState(false);
  const [empresaInicial, setEmpresaInicial] = useState<string | undefined>();
  const empresas = useEmpresasDP();
  const { titulo, descricao, icon: Icon } = TEXTOS[modulo];

  const comps = useQuery({
    queryKey: ["dp-competencias", modulo],
    queryFn: async () => {
      const { data, error } = await db.from("dp_folha_competencias").select("id, empresa_id, competencia, status, created_at").eq("modulo", modulo);
      if (error) throw error;
      return (data ?? []) as Competencia[];
    },
  });

  const grupos = useMemo(() => {
    const porEmpresa = new Map<string, Competencia[]>();
    for (const c of comps.data ?? []) porEmpresa.set(c.empresa_id, [...(porEmpresa.get(c.empresa_id) ?? []), c]);
    const t = busca.trim().toLowerCase();
    return (empresas.data ?? [])
      .filter((e) => porEmpresa.has(e.id))
      .filter((e) => !t || e.razao_social.toLowerCase().includes(t) || e.cnpj.includes(t))
      .map((e) => ({ empresa: e, comps: [...porEmpresa.get(e.id)!].sort((a, b) => chaveCompetencia(b.competencia).localeCompare(chaveCompetencia(a.competencia))) }));
  }, [comps.data, empresas.data, busca]);

  const pendentes = (comps.data ?? []).filter((c) => c.status === "enviado" || c.status === "reaberto").length;
  const preenchidas = (comps.data ?? []).filter((c) => c.status === "preenchido").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Icon className="h-6 w-6 text-primary" />{titulo}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{descricao}</p>
        </div>
        <Button onClick={() => { setEmpresaInicial(undefined); setNovaAberta(true); }}><Plus className="mr-2 h-4 w-4" />Nova competência</Button>
      </div>

      {modulo === "variaveis" && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Empresas</p><p className="text-2xl font-bold">{grupos.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Aguardando cliente</p><p className="text-2xl font-bold text-blue-600">{pendentes}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Preenchidas pelo cliente</p><p className="text-2xl font-bold text-emerald-600">{preenchidas}</p></CardContent></Card>
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar empresa ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {comps.isLoading || empresas.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : comps.error ? (
        <p className="text-sm text-destructive">Não foi possível carregar. Verifique se a migração do Departamento Pessoal foi aplicada.</p>
      ) : grupos.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">Nenhuma competência ainda. Clique em “Nova competência” para começar.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {grupos.map(({ empresa, comps: lista }) => (
            <Card key={empresa.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold leading-tight">{empresa.razao_social}</h2>
                      <p className="text-xs text-muted-foreground">Cód. Domínio {empresa.codigo_dominio || "—"} · CNPJ {empresa.cnpj || "—"}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setEmpresaInicial(empresa.id); setNovaAberta(true); }}><Plus className="mr-1 h-3.5 w-3.5" />Competência</Button>
                </div>
                <div className="mt-4 space-y-1.5">
                  {lista.slice(0, 6).map((c) => (
                    <button key={c.id} type="button" onClick={() => navigate(`/dp/competencia/${c.id}`)}
                      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition hover:border-primary">
                      <span className="font-medium">{c.competencia}</span>
                      <span className="flex items-center gap-2">
                        {modulo === "variaveis" && <Badge variant="outline" className={STATUS_FOLHA[c.status]?.cls}>{STATUS_FOLHA[c.status]?.label ?? c.status}</Badge>}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </span>
                    </button>
                  ))}
                  {lista.length > 6 && <p className="pt-1 text-xs text-muted-foreground">+ {lista.length - 6} competências anteriores</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NovaCompetencia
        aberta={novaAberta} onOpenChange={setNovaAberta} modulo={modulo}
        empresaInicial={empresaInicial} empresas={empresas.data ?? []} competencias={comps.data ?? []}
        onCriada={(id) => navigate(`/dp/competencia/${id}`)}
      />
    </div>
  );
}

type Origem = "copiar" | "branco" | "excel" | "pdf";

function NovaCompetencia({ aberta, onOpenChange, modulo, empresaInicial, empresas, competencias, onCriada }: {
  aberta: boolean; onOpenChange: (o: boolean) => void; modulo: ModuloFolha; empresaInicial?: string;
  empresas: EmpresaDP[]; competencias: Competencia[]; onCriada: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { ownerUserId } = useAuth();
  const [empresaId, setEmpresaId] = useState("");
  const [filtro, setFiltro] = useState("");
  const [comp, setComp] = useState("");
  const [origem, setOrigem] = useState<Origem>("copiar");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  const ultima = useMemo(() => competencias
    .filter((c) => c.empresa_id === empresaId)
    .sort((a, b) => chaveCompetencia(b.competencia).localeCompare(chaveCompetencia(a.competencia)))[0], [competencias, empresaId]);

  const abrir = (o: boolean) => {
    if (o) {
      const emp = empresaInicial ?? "";
      const ult = competencias.filter((c) => c.empresa_id === emp).sort((a, b) => chaveCompetencia(b.competencia).localeCompare(chaveCompetencia(a.competencia)))[0];
      setEmpresaId(emp); setFiltro(""); setComp(proximaCompetencia(ult?.competencia)); setOrigem(ult ? "copiar" : "branco"); setArquivo(null);
    }
    onOpenChange(o);
  };

  const empresasFiltradas = empresas.filter((e) => !filtro || e.razao_social.toLowerCase().includes(filtro.toLowerCase())).slice(0, 200);

  async function criar() {
    if (!empresaId) { toast.error("Selecione a empresa."); return; }
    if (!competenciaValida(comp)) { toast.error("Competência inválida. Use MM/AAAA."); return; }
    if ((origem === "excel" || origem === "pdf") && !arquivo) { toast.error("Selecione o arquivo."); return; }
    setSalvando(true);
    try {
      const { data: c, error } = await db.from("dp_folha_competencias")
        .insert({ escritorio_id: ownerUserId, empresa_id: empresaId, modulo, competencia: comp }).select("id").single();
      if (error) throw new Error(error.code === "23505" ? "Essa competência já existe para a empresa." : error.message);

      if (origem === "copiar" && ultima) {
        const [{ data: rubs }, { data: funcs }] = await Promise.all([
          db.from("dp_folha_rubricas").select("nome, codigo, posicao").eq("competencia_id", ultima.id),
          db.from("dp_folha_funcionarios").select("tipo_calculo, codigo, nome, posicao").eq("competencia_id", ultima.id),
        ]);
        if (rubs?.length) await db.from("dp_folha_rubricas").insert(rubs.map((r) => ({ ...r, competencia_id: c.id })));
        if (funcs?.length) await db.from("dp_folha_funcionarios").insert(funcs.map((f) => ({ ...f, competencia_id: c.id })));
      } else if (origem === "branco" && modulo === "vr") {
        await db.from("dp_folha_rubricas").insert({ competencia_id: c.id, nome: "VALE REFEIÇÃO", codigo: "0253", posicao: 0 });
      } else if (origem === "excel" && arquivo) {
        const p = await lerPlanilha(arquivo);
        const { data: rubs } = await db.from("dp_folha_rubricas").insert(p.rubricas.map((r, i) => ({ ...r, posicao: i, competencia_id: c.id }))).select("id, posicao");
        const { data: funcs } = await db.from("dp_folha_funcionarios").insert(p.funcionarios.map((f, i) => ({ tipo_calculo: f.tipo_calculo, codigo: f.codigo, nome: f.nome, posicao: i, competencia_id: c.id }))).select("id, posicao");
        const lanc: { funcionario_id: string; rubrica_id: string; valor: number }[] = [];
        p.funcionarios.forEach((f, i) => f.valores.forEach((v, k) => {
          const fid = funcs?.find((x) => x.posicao === i)?.id, rid = rubs?.find((x) => x.posicao === k)?.id;
          if (v != null && fid && rid) lanc.push({ funcionario_id: fid, rubrica_id: rid, valor: v });
        }));
        if (lanc.length) await db.from("dp_folha_lancamentos").insert(lanc);
        if (p.codigoEmpresa) {
          const emp = empresas.find((e) => e.id === empresaId);
          if (emp && !emp.codigo_dominio) await db.from("empresas").update({ codigo_dominio: p.codigoEmpresa }).eq("id", empresaId);
        }
        toast.success(`Importado: ${p.funcionarios.length} funcionários e ${p.rubricas.length} rubricas`);
      } else if (origem === "pdf" && arquivo) {
        const r = await lerRelacaoEmpregados(arquivo);
        if (!r.funcionarios.length) throw new Error("Nenhum funcionário encontrado. Use o PDF “Relação de Empregados” do Domínio.");
        if (ultima) {
          const { data: rubs } = await db.from("dp_folha_rubricas").select("nome, codigo, posicao").eq("competencia_id", ultima.id);
          if (rubs?.length) await db.from("dp_folha_rubricas").insert(rubs.map((x) => ({ ...x, competencia_id: c.id })));
        } else if (modulo === "vr") {
          await db.from("dp_folha_rubricas").insert({ competencia_id: c.id, nome: "VALE REFEIÇÃO", codigo: "0253", posicao: 0 });
        }
        await db.from("dp_folha_funcionarios").insert(r.funcionarios.map((f, i) => ({ tipo_calculo: "11", codigo: f.codigo, nome: f.nome, posicao: i, competencia_id: c.id })));
        toast.success(`Importado: ${r.funcionarios.length} funcionários`);
      }
      qc.invalidateQueries({ queryKey: ["dp-competencias", modulo] });
      qc.invalidateQueries({ queryKey: ["dp-empresas"] });
      onOpenChange(false);
      onCriada(c.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberta} onOpenChange={abrir}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nova competência — {modulo === "vr" ? "VR" : "Variáveis"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Select value={empresaId} onValueChange={(v) => {
              setEmpresaId(v);
              const ult = competencias.filter((c) => c.empresa_id === v).sort((a, b) => chaveCompetencia(b.competencia).localeCompare(chaveCompetencia(a.competencia)))[0];
              setComp(proximaCompetencia(ult?.competencia));
              setOrigem(ult ? "copiar" : "branco");
            }}>
              <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
              <SelectContent>
                <div className="p-1"><Input placeholder="Filtrar…" value={filtro} onChange={(e) => setFiltro(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="h-8" /></div>
                {empresasFiltradas.map((e) => <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">As empresas vêm do cadastro em Configuração → Empresas.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Competência (MM/AAAA)</Label>
            <Input value={comp} onChange={(e) => setComp(e.target.value)} placeholder="11/2026" />
          </div>
          <div className="space-y-1.5">
            <Label>Montar planilha a partir de</Label>
            <Select value={origem} onValueChange={(v) => { setOrigem(v as Origem); setArquivo(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ultima && <SelectItem value="copiar">Copiar funcionários e rubricas de {ultima.competencia}</SelectItem>}
                <SelectItem value="branco">Planilha em branco</SelectItem>
                <SelectItem value="excel">Importar planilha Excel</SelectItem>
                <SelectItem value="pdf">Importar PDF “Relação de Empregados” (Domínio)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(origem === "excel" || origem === "pdf") && (
            <Input type="file" accept={origem === "excel" ? ".xls,.xlsx" : ".pdf,application/pdf"} onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          )}
          <Button className="w-full" onClick={criar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar competência
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
