import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db as supabase } from "@/lib/dp/db";
import { useUserRole } from "@/components/fronteira/compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const REGIMES = ["ST", "ANTECIPACAO", "DIFAL", "NORMAL", "ISENTO"];
const hoje = () => new Date().toISOString().slice(0, 10);
const vig = (r: { vigencia_inicio: string; vigencia_fim: string | null }, d = hoje()) =>
  r.vigencia_inicio <= d && (r.vigencia_fim == null || r.vigencia_fim >= d);
const casa = (ncm: string, alvo: string) => alvo.startsWith(ncm.replace(/\D/g, ""));

export function NcmsRegimesTab() {
  const { isAdminOrFiscal } = useUserRole();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState({ ncm: "", regime: "ST", mva: "", aliquota: "", inicio: "", base: "" });
  const { data } = useQuery({
    queryKey: ["ncms-regimes-tab"],
    queryFn: async () => {
      const [r, m, a] = await Promise.all([
        supabase.from("ff_ncms_regimes").select("*").order("ncm"),
        supabase.from("ff_mvas").select("*").order("ncm"),
        supabase.from("ff_aliquotas_internas").select("*").order("ncm"),
      ]);
      if (r.error || m.error || a.error) throw new Error("Não foi possível carregar os NCMs");
      return { regimes: r.data, mvas: m.data, aliquotas: a.data };
    },
  });
  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (data?.regimes ?? [])
      .map((r) => {
        const mva = data!.mvas.find((m) => casa(m.ncm, r.ncm.replace(/\D/g, "")) && vig(m, r.vigencia_fim ?? hoje()));
        const aliq = data!.aliquotas.find((x) => x.ncm && casa(x.ncm, r.ncm.replace(/\D/g, "")));
        return { r, mva, aliq, stSemMva: r.regime.toUpperCase().startsWith("ST") && vig(r) && !mva };
      })
      .filter(({ r }) => !t || [r.ncm, r.base_legal ?? "", r.vigencia_inicio, r.vigencia_fim ?? ""].some((x) => x.toLowerCase().includes(t)));
  }, [data, busca]);

  const salvar = async () => {
    const ncm = novo.ncm.replace(/\D/g, "");
    const mva = novo.mva ? Number(novo.mva.replace(",", ".")) : null;
    const aliq = novo.aliquota ? Number(novo.aliquota.replace(",", ".")) : null;
    if (!/^\d{2,8}$/.test(ncm) || !novo.inicio || novo.base.trim().length < 3) return toast.error("Informe NCM, início da vigência e base legal");
    if (novo.regime === "ST" && mva == null) return toast.error("Informe a MVA para NCM em ST");
    const c = { ncm, vigencia_inicio: novo.inicio, base_legal: novo.base.trim() };
    const r1 = await supabase.from("ff_ncms_regimes").insert({ ...c, regime: novo.regime });
    if (r1.error) return toast.error(r1.error.message);
    if (novo.regime === "ST" && mva != null) {
      const r2 = await supabase.from("ff_mvas").insert({ ...c, mva_original: mva });
      if (r2.error) return toast.error(r2.error.message);
    }
    if (aliq != null) {
      const r3 = await supabase.from("ff_aliquotas_internas").insert({ ...c, aliquota: aliq });
      if (r3.error) return toast.error(r3.error.message);
    }
    toast.success("NCM cadastrado");
    setNovo({ ncm: "", regime: "ST", mva: "", aliquota: "", inicio: "", base: "" });
    await qc.invalidateQueries();
  };

  return (
    <div className="space-y-4">
      <Input placeholder="Buscar por NCM, vigência ou base legal" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md" />
      {isAdminOrFiscal && (
        <div className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-7">
          <Input placeholder="NCM" value={novo.ncm} onChange={(e) => setNovo({ ...novo, ncm: e.target.value })} />
          <Select value={novo.regime} onValueChange={(v) => setNovo({ ...novo, regime: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{REGIMES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="MVA %" value={novo.mva} onChange={(e) => setNovo({ ...novo, mva: e.target.value })} disabled={novo.regime !== "ST"} />
          <Input placeholder="Alíq. interna %" value={novo.aliquota} onChange={(e) => setNovo({ ...novo, aliquota: e.target.value })} />
          <Input type="date" aria-label="Início da vigência" value={novo.inicio} onChange={(e) => setNovo({ ...novo, inicio: e.target.value })} />
          <Input placeholder="Base legal" value={novo.base} onChange={(e) => setNovo({ ...novo, base: e.target.value })} />
          <Button onClick={salvar}>Cadastrar</Button>
        </div>
      )}
      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum NCM cadastrado. Eles entram pelo painel “NCMs a classificar” da auditoria ou pelo cadastro acima.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>NCM</TableHead><TableHead>Regime</TableHead><TableHead>MVA</TableHead>
              <TableHead>Alíq. interna</TableHead><TableHead>Vigência</TableHead><TableHead>Base legal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map(({ r, mva, aliq, stSemMva }) => (
              <TableRow key={r.id} className={stSemMva ? "bg-destructive/10" : undefined}>
                <TableCell className="font-mono">{r.ncm}</TableCell>
                <TableCell>{r.regime} {stSemMva && <Badge variant="destructive">ST sem MVA vigente</Badge>}</TableCell>
                <TableCell>{mva ? `${Number(mva.mva_original)}%` : "—"}</TableCell>
                <TableCell>{aliq ? `${Number(aliq.aliquota)}%` : "padrão do perfil"}</TableCell>
                <TableCell>{r.vigencia_inicio.split("-").reverse().join("/")} – {r.vigencia_fim ? r.vigencia_fim.split("-").reverse().join("/") : "atual"}</TableCell>
                <TableCell className="max-w-sm truncate" title={r.base_legal ?? ""}>{r.base_legal ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
