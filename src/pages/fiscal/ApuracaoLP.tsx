import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Calculator, ChevronRight, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/dp/db";
import { CAMPOS_ENTRADA, brl, calcularAno, mesVazio, type MesEntrada } from "@/lib/fiscal/lucro-presumido";

type Empresa = { id: string; razao_social: string; cnpj: string; regime_tributario: string | null; aliquota_iss: number | null };

export default function ApuracaoLP() {
  const navigate = useNavigate();
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [busca, setBusca] = useState("");
  const [todas, setTodas] = useState(false);

  const empresas = useQuery({
    queryKey: ["fiscal-empresas"],
    queryFn: async () => {
      const { data, error } = await db.from("empresas").select("id, razao_social, cnpj, regime_tributario, aliquota_iss").eq("ativa", true).order("razao_social");
      if (error) throw error;
      return (data ?? []) as Empresa[];
    },
  });

  const lancamentos = useQuery({
    queryKey: ["fiscal-apuracao-ano", ano],
    queryFn: async () => {
      const { data, error } = await db.from("fiscal_apuracao_lp").select("*").eq("ano", ano);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totais = useMemo(() => {
    const porEmpresa = new Map<string, MesEntrada[]>();
    for (const row of lancamentos.data ?? []) {
      const ms = porEmpresa.get(row.empresa_id) ?? Array.from({ length: 12 }, mesVazio);
      const m = ms[row.mes - 1];
      for (const c of CAMPOS_ENTRADA) m[c.key] = Number(row[c.key]) || 0;
      porEmpresa.set(row.empresa_id, ms);
    }
    const out = new Map<string, ReturnType<typeof calcularAno>["totais"]>();
    for (const e of empresas.data ?? []) {
      const ms = porEmpresa.get(e.id);
      if (ms) out.set(e.id, calcularAno(ms, Number(e.aliquota_iss ?? 0.03)).totais);
    }
    return out;
  }, [lancamentos.data, empresas.data]);

  const lista = (empresas.data ?? []).filter((e) =>
    (todas || e.regime_tributario === "presumido" || totais.has(e.id)) &&
    (!busca || e.razao_social.toLowerCase().includes(busca.toLowerCase()) || e.cnpj.includes(busca)),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Calculator className="h-6 w-6 text-primary" />Apuração Lucro Presumido</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">IRPJ e CSLL trimestrais, PIS, COFINS e ISS mensais, com relatório em PDF para o cliente.</p>
        </div>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{Array.from({ length: 6 }, (_, i) => anoAtual - 3 + i).map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-64 max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar empresa ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={todas} onCheckedChange={setTodas} />Mostrar empresas de outros regimes
        </label>
      </div>

      {empresas.isLoading || lancamentos.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : lancamentos.error ? (
        <p className="text-sm text-destructive">Não foi possível carregar. Verifique se a migração da apuração foi aplicada.</p>
      ) : lista.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">
          Nenhuma empresa no Lucro Presumido. Defina o regime em Configuração → Empresas ou ative “Mostrar empresas de outros regimes”.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lista.map((e) => {
            const t = totais.get(e.id);
            return (
              <button key={e.id} type="button" onClick={() => navigate(`/fiscal/apuracao-lp/${e.id}/${ano}`)}
                className="flex items-center gap-4 rounded-lg border bg-card p-4 text-left transition hover:border-primary">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{e.razao_social}</p>
                  <p className="text-xs text-muted-foreground">CNPJ {e.cnpj || "—"} · ISS {((Number(e.aliquota_iss ?? 0.03)) * 100).toLocaleString("pt-BR")}%</p>
                  {t ? (
                    <p className="mt-1 text-sm">Impostos {ano}: <b>{brl(t.impostos)}</b> · carga {(t.carga * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">Sem lançamentos em {ano}</p>
                  )}
                </div>
                {e.regime_tributario !== "presumido" && <Badge variant="outline">{e.regime_tributario ?? "sem regime"}</Badge>}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
