import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, DatabaseZap, Loader2, LogIn } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { formatCNPJ } from "@/lib/fronteira/format";
import { casarEmpresas, clienteLegado, importarTudo, type Casamento, type ResumoImportacao } from "@/lib/fronteira/importar-legado";

/**
 * Traz os dados do sistema Fronteira antigo (fórmulas, NCMs/MVAs, perfis
 * fiscais, histórico) para a plataforma. Só administradores.
 */
export default function FronteiraImportar() {
  const { isAdmin } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [legado, setLegado] = useState<SupabaseClient | null>(null);
  const [casamentos, setCasamentos] = useState<Casamento[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [resumo, setResumo] = useState<ResumoImportacao | null>(null);

  const semPar = useMemo(() => (casamentos ?? []).filter((c) => !c.empresaId), [casamentos]);

  if (!isAdmin) return <Navigate to="/fiscal/fronteira" replace />;

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      const sb = clienteLegado();
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
      setSenha("");
      if (error) throw new Error(error.message === "Invalid login credentials" ? "E-mail ou senha do sistema antigo incorretos" : error.message);
      setLegado(sb);
      setCasamentos(await casarEmpresas(sb));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function recasar() {
    if (!legado) return;
    setOcupado(true);
    try { setCasamentos(await casarEmpresas(legado)); } catch (err) { toast.error((err as Error).message); } finally { setOcupado(false); }
  }

  async function importar() {
    if (!legado || !casamentos) return;
    setOcupado(true);
    setResumo(null);
    try {
      setResumo(await importarTudo(legado, casamentos, setProgresso));
      toast.success("Importação concluída");
    } catch (err) {
      toast.error("Erro na importação", { description: (err as Error).message });
    } finally {
      setOcupado(false);
      setProgresso("");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link to="/fiscal/fronteira" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Auditoria</Link>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Fiscal · Fronteira</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><DatabaseZap className="h-6 w-6 text-primary" />Importar do sistema antigo</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Copia fórmulas, NCMs, MVAs, alíquotas, pautas, anexos de CNAE, campos do XML, perfis fiscais e o histórico de auditorias do Fronteira antigo para a plataforma.
          Pode rodar de novo quando quiser: nada é duplicado.
        </p>
      </div>

      {!legado && (
        <Card>
          <CardHeader><CardTitle className="text-base">1. Entre com o seu login do Fronteira antigo</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={entrar} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1.5"><Label htmlFor="legado-email">E-mail</Label><Input id="legado-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label htmlFor="legado-senha">Senha</Label><Input id="legado-senha" type="password" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} required /></div>
              <Button type="submit" disabled={ocupado}>{ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}Conectar</Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">A senha vai direto para o sistema antigo e não é guardada na plataforma.</p>
          </CardContent>
        </Card>
      )}

      {casamentos && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">2. Empresas: sistema antigo → plataforma</CardTitle>
            <Button variant="outline" size="sm" onClick={recasar} disabled={ocupado}>Conferir de novo</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              <b>{casamentos.length - semPar.length}</b> de {casamentos.length} empresas encontradas na plataforma.
              {semPar.length > 0 && <> As <b>{semPar.length}</b> sem par terão perfil fiscal e histórico ignorados — cadastre-as em Configurações → Empresas (mesmo CNPJ) e clique em “Conferir de novo”.</>}
            </p>
            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                  <tr><th className="px-3 py-2 font-medium">Empresa (sistema antigo)</th><th className="px-3 py-2 font-medium">CNPJ</th><th className="px-3 py-2 font-medium">Na plataforma</th></tr>
                </thead>
                <tbody>
                  {casamentos.map((c) => (
                    <tr key={c.legado.id} className="border-t">
                      <td className="px-3 py-1.5">{c.legado.razao_social}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{formatCNPJ(c.legado.cnpj)}</td>
                      <td className="px-3 py-1.5">
                        {c.empresaId
                          ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Encontrada ({c.criterio === "cnpj" ? "CNPJ" : "IE"})</Badge>
                          : <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Sem par</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-3">
              {progresso && <span className="text-sm text-muted-foreground">{progresso}</span>}
              <Button onClick={importar} disabled={ocupado}>{ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseZap className="mr-2 h-4 w-4" />}3. Importar dados</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {resumo && (
        <Card className="border-emerald-300">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5 text-emerald-600" />Importação concluída</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-1 font-medium">Tabela</th><th className="py-1 text-right font-medium">Importadas</th><th className="py-1 text-right font-medium">Ignoradas (empresa sem par)</th></tr></thead>
              <tbody>
                {resumo.map((r) => (
                  <tr key={r.tabela} className="border-t"><td className="py-1.5">{r.tabela.replace(/_/g, " ")}</td><td className="py-1.5 text-right tabular-nums">{r.importadas}</td><td className="py-1.5 text-right tabular-nums">{r.ignoradas || "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
