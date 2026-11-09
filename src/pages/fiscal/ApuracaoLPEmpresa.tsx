import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, FileDown, FileUp, Loader2, Save } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/dp/db";
import {
  CAMPOS_ENTRADA, MESES, brl, calcularAno, importarPlanilha, mesVazio, num, type MesEntrada, type ResultadoTrimestre,
} from "@/lib/fiscal/lucro-presumido";

const CORES = ["#10143D", "#ED3237", "#3B82F6", "#F59E0B", "#10B981"];

export default function ApuracaoLPEmpresa() {
  const { empresaId = "", ano: anoStr = "" } = useParams();
  const ano = Number(anoStr);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { ownerUserId, user } = useAuth();

  const dados = useQuery({
    queryKey: ["fiscal-apuracao", empresaId, ano],
    queryFn: async () => {
      const [{ data: empresa, error }, { data: linhas, error: e2 }] = await Promise.all([
        db.from("empresas").select("id, razao_social, cnpj, aliquota_iss").eq("id", empresaId).single(),
        db.from("fiscal_apuracao_lp").select("*").eq("empresa_id", empresaId).eq("ano", ano),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      const meses = Array.from({ length: 12 }, (_, i) => {
        const m = mesVazio();
        const row = (linhas ?? []).find((l) => l.mes === i + 1);
        if (row) for (const c of CAMPOS_ENTRADA) m[c.key] = Number(row[c.key]) || 0;
        return m;
      });
      return { empresa: empresa as { id: string; razao_social: string; cnpj: string | null; aliquota_iss: number | null }, meses };
    },
  });

  const [meses, setMeses] = useState<MesEntrada[]>(() => Array.from({ length: 12 }, mesVazio));
  const [iss, setIss] = useState("3");
  const [alterado, setAlterado] = useState(false);
  const [status, setStatus] = useState<"salvo" | "salvando" | "erro">("salvo");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dados.data) return;
    setMeses(dados.data.meses);
    setIss(String(Number(dados.data.empresa.aliquota_iss ?? 0.03) * 100).replace(".", ","));
    setAlterado(false); setStatus("salvo");
  }, [dados.data]);

  const aliq = (Number(iss.replace(",", ".")) || 0) / 100;
  const r = useMemo(() => calcularAno(meses, aliq), [meses, aliq]);

  const salvar = async () => {
    if (!dados.data || !ownerUserId) return false;
    setStatus("salvando"); setAlterado(false);
    try {
      const rows = meses.map((m, i) => ({ escritorio_id: ownerUserId, empresa_id: empresaId, ano, mes: i + 1, ...m, updated_by: user?.id, updated_at: new Date().toISOString() }));
      const { error } = await db.from("fiscal_apuracao_lp").upsert(rows, { onConflict: "empresa_id,ano,mes" });
      if (error) throw error;
      if (Math.abs(aliq - Number(dados.data.empresa.aliquota_iss ?? 0.03)) > 1e-9) {
        const { error: e } = await db.from("empresas").update({ aliquota_iss: aliq }).eq("id", empresaId);
        if (e) throw e;
      }
      qc.invalidateQueries({ queryKey: ["fiscal-apuracao-ano", ano] });
      qc.invalidateQueries({ queryKey: ["fiscal-empresas"] });
      setStatus("salvo");
      return true;
    } catch (e) {
      setAlterado(true); setStatus("erro");
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
      return false;
    }
  };
  const salvarRef = useRef(salvar);
  salvarRef.current = salvar;

  // Salvamento automático 1,5 s depois da última edição
  useEffect(() => {
    if (!alterado) return;
    const t = setTimeout(() => salvarRef.current(), 1500);
    return () => clearTimeout(t);
  }, [alterado, meses, iss]);

  if (dados.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (dados.error || !dados.data) return <p className="text-sm text-destructive">Não foi possível carregar a apuração. Verifique se a migração foi aplicada.</p>;
  const { empresa } = dados.data;

  const editar = (i: number, k: keyof MesEntrada, v: string) => {
    const n = Number(v.replace(/\./g, "").replace(",", ".")) || 0;
    setMeses((ms) => ms.map((m, j) => (j === i ? { ...m, [k]: n } : m)));
    setAlterado(true);
  };

  const importar = async (f: File) => {
    try {
      const { meses: novos } = await importarPlanilha(f);
      setMeses(novos); setAlterado(true);
      toast.success("Planilha importada. Salvando…");
    } catch {
      toast.error("Não foi possível ler a planilha.");
    }
  };

  const exportarPdf = async () => {
    if ((alterado || status === "erro") && !(await salvar())) { toast.error("Não foi possível salvar. O relatório não foi gerado."); return; }
    const { gerarRelatorioApuracao } = await import("@/lib/fiscal/apuracao-pdf");
    gerarRelatorioApuracao({ empresa, ano, aliquotaIss: aliq, meses }).save(`Apuracao_LP_${empresa.razao_social.replace(/[^\w]+/g, "_")}_${ano}.pdf`);
  };

  const anos = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i);
  const graficoMensal = r.mensal.map((m, i) => {
    const t = r.trimestral[Math.floor(i / 3)];
    const fim = i % 3 === 2;
    return { mes: MESES[i], IRPJ: fim ? t.irPagar : 0, CSLL: fim ? t.csllPagar : 0, PIS: m.pis, COFINS: m.cofins, ISS: m.iss };
  });
  const composicao = [
    { name: "IRPJ", value: r.totais.irpj }, { name: "CSLL", value: r.totais.csll },
    { name: "PIS", value: r.totais.pis }, { name: "COFINS", value: r.totais.cofins }, { name: "ISS", value: r.totais.iss },
  ];
  const receitaTri = r.trimestral.map((t, i) => ({ tri: `${i + 1}º Tri`, Mercadorias: t.receitaMercadorias, Serviços: t.receitaServicos }));
  const kfmt = (v: number) => (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "k";

  return (
    <div className="space-y-6">
      <Link to="/fiscal/apuracao-lp" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="mr-1 h-4 w-4" />Apuração Lucro Presumido</Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Apuração Lucro Presumido</p>
          <h1 className="text-2xl font-bold">{empresa.razao_social}</h1>
          <p className="text-sm text-muted-foreground">CNPJ {empresa.cnpj || "—"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={anoStr} onValueChange={(v) => navigate(`/fiscal/apuracao-lp/${empresaId}/${v}`)}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex items-center gap-1 rounded-md border bg-card px-2">
            <span className="text-sm text-muted-foreground">ISS %</span>
            <Input className="h-8 w-14 border-0 px-1 shadow-none focus-visible:ring-0" value={iss} onChange={(e) => { setIss(e.target.value); setAlterado(true); }} />
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = ""; }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><FileUp className="mr-2 h-4 w-4" />Importar Excel</Button>
          <Button onClick={exportarPdf} disabled={status === "salvando"}><FileDown className="mr-2 h-4 w-4" />Relatório PDF</Button>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {status === "erro" ? <span className="text-destructive">Erro ao salvar</span>
              : alterado || status === "salvando" ? <><Save className="h-3.5 w-3.5" />Salvando…</>
              : <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />Tudo salvo</>}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Receita total" valor={brl(r.totais.receita)} />
        <Kpi titulo="Total de impostos" valor={brl(r.totais.impostos)} destaque />
        <Kpi titulo="Carga tributária" valor={(r.totais.carga * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%"} />
        <Kpi titulo="IRPJ + CSLL" valor={brl(r.totais.irpj + r.totais.csll)} />
      </div>

      <Tabs defaultValue="lancamentos">
        <TabsList>
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="tabela">Demonstrativos</TabsTrigger>
        </TabsList>

        <TabsContent value="lancamentos" className="mt-4">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#10143D] text-white">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-56 bg-[#10143D] px-3 py-2 text-left font-medium">Lançamento</th>
                    {MESES.map((m) => <th key={m} className="min-w-28 px-2 py-2 text-right font-medium">{m}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {CAMPOS_ENTRADA.map((c) => (
                    <tr key={c.key} className="border-t">
                      <td className="sticky left-0 z-10 bg-card px-3 py-1.5">{c.label}</td>
                      {meses.map((m, i) => <td key={i} className="px-1 py-1"><CelulaNumero valor={m[c.key]} onChange={(v) => editar(i, c.key, v)} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">Valores em reais. Retenções e PERSE de IR/CSLL são somados no trimestre. Os dados são salvos automaticamente.</p>
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4 grid gap-4 lg:grid-cols-3">
          <Painel titulo="Impostos por mês" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={graficoMensal}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" fontSize={12} />
                <YAxis fontSize={11} tickFormatter={kfmt} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Legend />
                {["IRPJ", "CSLL", "PIS", "COFINS", "ISS"].map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={CORES[i]} />)}
              </BarChart>
            </ResponsiveContainer>
          </Painel>
          <Painel titulo="Composição dos impostos">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={composicao} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {composicao.map((_, i) => <Cell key={i} fill={CORES[i]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => brl(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Painel>
          <Painel titulo="Receita por trimestre" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={receitaTri}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tri" fontSize={12} />
                <YAxis fontSize={11} tickFormatter={kfmt} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Legend />
                <Bar dataKey="Mercadorias" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Serviços" fill="#10143D" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Painel>
          <Painel titulo="Totais do ano">
            <ul className="space-y-2 text-sm">
              {composicao.map((c, i) => (
                <li key={c.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CORES[i] }} />{c.name}</span>
                  <span className="font-medium tabular-nums">{brl(c.value)}</span>
                </li>
              ))}
              <li className="flex justify-between border-t pt-2 font-semibold"><span>Total</span><span className="tabular-nums text-primary">{brl(r.totais.impostos)}</span></li>
            </ul>
          </Painel>
        </TabsContent>

        <TabsContent value="tabela" className="mt-4 space-y-6">
          <TabelaTrimestral tri={r.trimestral} />
          <TabelaMensal r={r} aliq={aliq} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CelulaNumero({ valor, onChange }: { valor: number; onChange: (v: string) => void }) {
  const [txt, setTxt] = useState(valor ? num(valor) : "");
  const [foco, setFoco] = useState(false);
  useEffect(() => { if (!foco) setTxt(valor ? num(valor) : ""); }, [valor, foco]);
  return (
    <input
      className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-right tabular-nums outline-none hover:border-input focus:border-primary focus:bg-background"
      value={txt}
      inputMode="decimal"
      onFocus={() => setFoco(true)}
      onBlur={() => { setFoco(false); if (txt !== (valor ? num(valor) : "")) onChange(txt); }}
      onChange={(e) => setTxt(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function Kpi({ titulo, valor, destaque }: { titulo: string; valor: string; destaque?: boolean }) {
  return (
    <Card className={destaque ? "border-0 bg-[#ED3237] text-white" : ""}>
      <CardContent className="p-5">
        <p className={destaque ? "text-sm opacity-90" : "text-sm text-muted-foreground"}>{titulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      </CardContent>
    </Card>
  );
}

function Painel({ titulo, children, className = "" }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2"><CardTitle className="text-base">{titulo}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const LINHAS_TRI: { k: keyof ResultadoTrimestre; label: string; forte?: boolean; grupo?: string }[] = [
  { k: "receitaMercadorias", label: "Receita acumulada no trimestre - Mercadorias", grupo: "IRPJ" },
  { k: "receitaServicos", label: "Receita acumulada no trimestre - Serviços" },
  { k: "receitaTotal", label: "Total receitas acumuladas no trimestre", forte: true },
  { k: "ateLimite", label: "Receita até R$ 1.250.000,00" },
  { k: "excedente", label: "Excedente R$ 1.250.000,00" },
  { k: "excedenteComercio", label: "Excedente - Comércio" },
  { k: "excedenteServico", label: "Excedente - Serviço" },
  { k: "bcIr32", label: "BC IR 32% - Serviços" },
  { k: "bcIr352", label: "BC IR 35,2% - Serviços" },
  { k: "bcIr8", label: "BC IR 8% - Comércio" },
  { k: "bcIr88", label: "BC IR 8,8% - Comércio" },
  { k: "outrasReceitas", label: "Outras receitas" },
  { k: "baseIr", label: "Base de cálculo presumida do IR", forte: true },
  { k: "irpj15", label: "IRPJ 15%" },
  { k: "baseAdicional", label: "Base de cálculo adicional IR 10%" },
  { k: "adicional10", label: "Adicional IR 10%" },
  { k: "totalIr", label: "Total IR a provisionar" },
  { k: "perseIr", label: "PERSE Lei 14.148/2021" },
  { k: "retencaoIr", label: "Retenção" },
  { k: "irPagar", label: "IR a pagar (quota única) - DARF 2089", forte: true },
  { k: "csllMercadorias", label: "Lucro presumido CSLL 12% - Mercadorias", grupo: "CSLL" },
  { k: "csllServicos", label: "Lucro presumido CSLL 32% - Serviços" },
  { k: "outrasReceitas", label: "Outras receitas" },
  { k: "baseCsll", label: "Base de cálculo presumida da CSLL", forte: true },
  { k: "csll9", label: "CSLL 9%" },
  { k: "perseCsll", label: "PERSE Lei 14.148/2021" },
  { k: "retencaoCsll", label: "CSLL a deduzir" },
  { k: "csllPagar", label: "CSLL a pagar (quota única) - DARF 2372", forte: true },
];

function TabelaTrimestral({ tri }: { tri: ResultadoTrimestre[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#10143D] text-white">
            <tr>
              <th className="px-3 py-2 text-left font-medium">IRPJ e CSLL trimestral</th>
              {tri.map((_, i) => <th key={i} className="px-3 py-2 text-right font-medium">{i + 1}º Trimestre</th>)}
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {LINHAS_TRI.map((l, idx) => (
              <Fragment key={idx}>
                {l.grupo && <tr className="bg-muted"><td colSpan={6} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#ED3237]">{l.grupo}</td></tr>}
                <tr className={"border-t " + (l.forte ? "font-semibold" : "")}>
                  <td className="px-3 py-1.5">{l.label}</td>
                  {tri.map((t, i) => <td key={i} className="px-3 py-1.5 text-right tabular-nums">{num(t[l.k])}</td>)}
                  <td className="px-3 py-1.5 text-right tabular-nums">{num(tri.reduce((s, t) => s + t[l.k], 0))}</td>
                </tr>
              </Fragment>
            ))}
            <tr className="border-t bg-muted/60">
              <td className="px-3 py-1.5">IR em 3 quotas (cada)</td>
              {tri.map((t, i) => <td key={i} className="px-3 py-1.5 text-right tabular-nums">{num(t.irPagar / 3)}</td>)}
              <td />
            </tr>
            <tr className="border-t bg-muted/60">
              <td className="px-3 py-1.5">CSLL em 3 quotas (cada)</td>
              {tri.map((t, i) => <td key={i} className="px-3 py-1.5 text-right tabular-nums">{num(t.csllPagar / 3)}</td>)}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TabelaMensal({ r, aliq }: { r: ReturnType<typeof calcularAno>; aliq: number }) {
  const linhas: { label: string; v: (i: number) => number; forte?: boolean }[] = [
    { label: "Total receitas vendas", v: (i) => r.mensal[i].totalReceitas },
    { label: "Base de cálculo PIS/COFINS", v: (i) => r.mensal[i].basePis },
    { label: "PIS 0,65% - DARF 8109", v: (i) => r.mensal[i].pis, forte: true },
    { label: "COFINS 3% - DARF 2172", v: (i) => r.mensal[i].cofins, forte: true },
    { label: "Base de cálculo ISS", v: (i) => r.mensal[i].baseIss },
    { label: `ISS ${(aliq * 100).toLocaleString("pt-BR")}%`, v: (i) => r.mensal[i].iss, forte: true },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#10143D] text-white">
            <tr>
              <th className="sticky left-0 min-w-56 bg-[#10143D] px-3 py-2 text-left font-medium">PIS, COFINS e ISS mensal</th>
              {MESES.map((m) => <th key={m} className="min-w-28 px-3 py-2 text-right font-medium">{m}</th>)}
              <th className="min-w-32 px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.label} className={"border-t " + (l.forte ? "font-semibold" : "")}>
                <td className="sticky left-0 bg-card px-3 py-1.5">{l.label}</td>
                {MESES.map((_, i) => <td key={i} className="px-3 py-1.5 text-right tabular-nums">{num(l.v(i))}</td>)}
                <td className="px-3 py-1.5 text-right tabular-nums">{num(MESES.reduce((s, _, i) => s + l.v(i), 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
