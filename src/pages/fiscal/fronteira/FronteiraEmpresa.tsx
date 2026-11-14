import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PerfilFiscalTab } from "@/components/fronteira/perfil/PerfilFiscalTab";
import { HistoricoAuditorias } from "@/components/fronteira/HistoricoAuditorias";
import { db } from "@/lib/dp/db";
import { formatCNPJ } from "@/lib/fronteira/format";

/** Empresa no contexto da Fronteira: perfil fiscal (com vigências) e auditorias salvas. */
export default function FronteiraEmpresa() {
  const { empresaId = "" } = useParams();
  const { data: empresa, isLoading } = useQuery({
    queryKey: ["ff-empresa", empresaId],
    queryFn: async () => {
      const { data, error } = await db.from("empresas").select("id, razao_social, cnpj, inscricao_estadual, municipio, uf").eq("id", empresaId).maybeSingle();
      if (error) throw error;
      return data as { id: string; razao_social: string; cnpj: string | null; inscricao_estadual: string | null; municipio: string | null; uf: string | null } | null;
    },
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!empresa) {
    return (
      <Card><CardContent className="p-10 text-center">
        <p className="font-medium">Empresa não encontrada.</p>
        <Link to="/fiscal/fronteira/empresas" className="text-sm text-primary hover:underline">Voltar para Perfis fiscais</Link>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/fiscal/fronteira/empresas" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Perfis fiscais</Link>
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Building2 className="h-6 w-6" /></div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{empresa.razao_social}</h1>
            <p className="text-xs text-muted-foreground">
              CNPJ {formatCNPJ(empresa.cnpj)}
              {empresa.inscricao_estadual ? ` · IE ${empresa.inscricao_estadual}` : " · sem IE cadastrada"}
              {empresa.municipio ? ` · ${empresa.municipio}${empresa.uf ? `/${empresa.uf}` : ""}` : ""}
            </p>
          </div>
        </div>
      </div>
      <Tabs defaultValue="perfil">
        <TabsList>
          <TabsTrigger value="perfil">Perfil fiscal</TabsTrigger>
          <TabsTrigger value="historico">Histórico de auditorias</TabsTrigger>
        </TabsList>
        <TabsContent value="perfil" className="mt-6"><PerfilFiscalTab empresaId={empresa.id} /></TabsContent>
        <TabsContent value="historico" className="mt-6"><HistoricoAuditorias empresaId={empresa.id} /></TabsContent>
      </Tabs>
    </div>
  );
}
