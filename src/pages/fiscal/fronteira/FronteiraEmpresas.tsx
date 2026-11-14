import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, ChevronRight, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/lib/dp/db";
import { formatCNPJ } from "@/lib/fronteira/format";

type Empresa = { id: string; razao_social: string; cnpj: string | null; inscricao_estadual: string | null; uf: string | null };
type Perfil = { empresa_id: string; regime: string | null; porte: string | null; cnae: string | null; vigencia_fim: string | null };

/** Empresas do escritório com a situação do perfil fiscal usado pela auditoria de Fronteira. */
export default function FronteiraEmpresas() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "com" | "sem">("todas");

  const empresas = useQuery({
    queryKey: ["ff-empresas"],
    queryFn: async () => {
      const { data, error } = await db.from("empresas").select("id, razao_social, cnpj, inscricao_estadual, uf").eq("ativa", true).order("razao_social");
      if (error) throw error;
      return (data ?? []) as Empresa[];
    },
  });
  const perfis = useQuery({
    queryKey: ["ff-perfis-vigentes"],
    queryFn: async () => {
      const { data, error } = await db.from("ff_perfis_fiscais").select("empresa_id, regime, porte, cnae, vigencia_fim").is("vigencia_fim", null);
      if (error) throw error;
      return (data ?? []) as Perfil[];
    },
  });

  const perfilPorEmpresa = useMemo(() => new Map((perfis.data ?? []).map((p) => [p.empresa_id, p])), [perfis.data]);
  const termo = busca.trim().toLowerCase();
  const digitos = busca.replace(/\D/g, "");
  const lista = (empresas.data ?? []).filter((e) => {
    const tem = perfilPorEmpresa.has(e.id);
    if (filtro === "com" && !tem) return false;
    if (filtro === "sem" && tem) return false;
    if (!termo) return true;
    return e.razao_social.toLowerCase().includes(termo) || (!!digitos && ((e.cnpj ?? "").includes(digitos) || (e.inscricao_estadual ?? "").replace(/\D/g, "").includes(digitos)));
  });
  const totalCom = (empresas.data ?? []).filter((e) => perfilPorEmpresa.has(e.id)).length;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/fiscal/fronteira" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Auditoria</Link>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Fiscal · Fronteira</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Building2 className="h-6 w-6 text-primary" />Perfis fiscais</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          O cálculo oficial usa o perfil fiscal da empresa destinatária vigente na data da nota (regime, porte, CNAE, benefícios). Empresas sem perfil ficam com o cálculo pendente.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-64 max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por razão social, CNPJ ou IE" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
          <TabsList>
            <TabsTrigger value="todas">Todas</TabsTrigger>
            <TabsTrigger value="com">Com perfil ({totalCom})</TabsTrigger>
            <TabsTrigger value="sem">Sem perfil ({(empresas.data?.length ?? 0) - totalCom})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Empresa</th>
                <th className="px-4 py-2 font-medium">CNPJ</th>
                <th className="px-4 py-2 font-medium">IE</th>
                <th className="px-4 py-2 font-medium">Perfil fiscal vigente</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {(empresas.isLoading || perfis.isLoading) && (
                <tr><td colSpan={5} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              )}
              {!empresas.isLoading && lista.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">Nenhuma empresa encontrada.</td></tr>
              )}
              {lista.map((e) => {
                const p = perfilPorEmpresa.get(e.id);
                return (
                  <tr key={e.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => navigate(`/fiscal/fronteira/empresas/${e.id}`)}>
                    <td className="px-4 py-2.5 font-medium">{e.razao_social}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{formatCNPJ(e.cnpj)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{e.inscricao_estadual || "—"}</td>
                    <td className="px-4 py-2.5">
                      {p ? (
                        <div className="flex flex-wrap gap-1">
                          {p.regime && <Badge variant="secondary">{p.regime === "SIMPLES_NACIONAL" ? "Simples Nacional" : p.regime === "NORMAL" ? "Regime normal" : p.regime}</Badge>}
                          {p.porte && <Badge variant="outline">{p.porte.replace(/_/g, " ").toLowerCase()}</Badge>}
                          {p.cnae && <Badge variant="outline">CNAE {p.cnae}</Badge>}
                        </div>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Sem perfil</Badge>
                      )}
                    </td>
                    <td className="px-2"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
