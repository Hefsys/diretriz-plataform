import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, ClipboardList, Copy, Download, Eye, FileText, Inbox, Loader2, Search, Trash2, UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { BUCKET_ADMISSOES, db } from "@/lib/dp/db";
import {
  STATUS_ADMISSAO, clsStatus, fmtData, labelStatus, labelTipoDocumento, type Admissao,
} from "@/lib/dp/admissao";

type Arquivo = { id: string; tipo: string; nome_arquivo: string; storage_path: string; tamanho: number | null };
type Nota = { id: string; autor_nome: string | null; texto: string | null; status_novo: string | null; created_at: string };

function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={clsStatus(status)}>{labelStatus(status)}</Badge>;
}

export default function DpAdmissoes() {
  const { ownerUserId } = useAuth();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [empresa, setEmpresa] = useState("todas");
  const [aberta, setAberta] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ["dp-admissoes"],
    queryFn: async () => {
      const { data, error } = await db
        .from("dp_admissoes")
        .select("id, protocolo, status, empresa_id, empresa_nome, nome_completo, funcao, cpf, created_at, dp_admissao_arquivos(count)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((l) => ({ ...l, arquivos: (l.dp_admissao_arquivos as { count: number }[])?.[0]?.count ?? 0 })) as (Admissao & { arquivos: number; cpf: string | null })[];
    },
  });

  const empresas = useMemo(() => [...new Set((lista.data ?? []).map((a) => a.empresa_nome))].sort(), [lista.data]);
  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (lista.data ?? []).filter((a) =>
      (status === "todos" || a.status === status) &&
      (empresa === "todas" || a.empresa_nome === empresa) &&
      (!t || [a.nome_completo, a.protocolo, a.empresa_nome, a.cpf ?? ""].some((c) => c.toLowerCase().includes(t))),
    );
  }, [lista.data, busca, status, empresa]);

  const contagem = (s: string) => (lista.data ?? []).filter((a) => a.status === s).length;
  const linkPublico = `${window.location.origin}/admissao/${ownerUserId ?? ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><UserPlus className="h-6 w-6 text-primary" />Admissões</h1>
          <p className="text-sm text-muted-foreground">Fichas de admissão enviadas pelos clientes, com os documentos anexados.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open(linkPublico, "_blank", "noopener")}>
            <Eye className="mr-2 h-4 w-4" />Ver formulário
          </Button>
          <Button onClick={async () => { await navigator.clipboard.writeText(linkPublico); toast.success("Link copiado! Envie ao cliente para preencher a ficha."); }}>
            <Copy className="mr-2 h-4 w-4" />Copiar link para o cliente
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { s: "recebido", icon: Inbox, cor: "text-slate-600" },
          { s: "em_analise", icon: ClipboardList, cor: "text-amber-600" },
          { s: "pendencia", icon: AlertTriangle, cor: "text-red-600" },
          { s: "concluido", icon: CheckCircle2, cor: "text-emerald-600" },
        ].map(({ s, icon: Icon, cor }) => (
          <Card key={s} className={`cursor-pointer transition hover:border-primary ${status === s ? "border-primary" : ""}`} onClick={() => setStatus(status === s ? "todos" : s)}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">{labelStatus(s)}</p>
                <p className="text-2xl font-bold">{contagem(s)}</p>
              </div>
              <Icon className={`h-6 w-6 ${cor}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome, CPF, empresa ou protocolo" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {STATUS_ADMISSAO.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={empresa} onValueChange={setEmpresa}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as empresas</SelectItem>
            {empresas.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {lista.isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : lista.error ? (
            <p className="p-8 text-center text-sm text-destructive">Não foi possível carregar as admissões. Verifique se a migração do Departamento Pessoal foi aplicada.</p>
          ) : filtradas.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted-foreground">Nenhuma admissão encontrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="hidden lg:table-cell">Recebida</TableHead>
                  <TableHead className="hidden lg:table-cell text-center">Anexos</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => setAberta(a.id)}>
                    <TableCell>
                      <p className="font-medium">{a.nome_completo}</p>
                      <p className="text-xs text-muted-foreground">{a.funcao || "—"} · {a.protocolo}</p>
                    </TableCell>
                    <TableCell className="max-w-64 truncate">{a.empresa_nome}</TableCell>
                    <TableCell className="hidden lg:table-cell">{fmtData(a.created_at)}</TableCell>
                    <TableCell className="hidden lg:table-cell text-center">{a.arquivos}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {aberta && <DetalheAdmissao id={aberta} onExcluida={() => setAberta(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetalheAdmissao({ id, onExcluida }: { id: string; onExcluida: () => void }) {
  const qc = useQueryClient();
  const { user, displayName, podeExcluir } = useAuth();
  const [nota, setNota] = useState("");

  const det = useQuery({
    queryKey: ["dp-admissao", id],
    queryFn: async () => {
      const [{ data: a, error }, { data: arquivos }, { data: notas }] = await Promise.all([
        db.from("dp_admissoes").select("*").eq("id", id).single(),
        db.from("dp_admissao_arquivos").select("id, tipo, nome_arquivo, storage_path, tamanho").eq("admissao_id", id).order("created_at"),
        db.from("dp_admissao_notas").select("id, autor_nome, texto, status_novo, created_at").eq("admissao_id", id).order("created_at", { ascending: false }),
      ]);
      if (error) throw error;
      return { a: a as Admissao, arquivos: (arquivos ?? []) as Arquivo[], notas: (notas ?? []) as Nota[] };
    },
  });

  const atualizar = useMutation({
    mutationFn: async (p: { status?: string; texto?: string }) => {
      if (p.status) {
        const { error } = await db.from("dp_admissoes").update({ status: p.status }).eq("id", id);
        if (error) throw error;
      }
      const { error } = await db.from("dp_admissao_notas").insert({
        admissao_id: id, autor_id: user?.id, autor_nome: displayName || user?.email, texto: p.texto ?? null, status_novo: p.status ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNota("");
      qc.invalidateQueries({ queryKey: ["dp-admissao", id] });
      qc.invalidateQueries({ queryKey: ["dp-admissoes"] });
      toast.success("Atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const abrirArquivo = async (f: Arquivo, baixar = false) => {
    const { data, error } = await db.storage.from(BUCKET_ADMISSOES).createSignedUrl(f.storage_path, 300, baixar ? { download: f.nome_arquivo } : undefined);
    if (error || !data) { toast.error("Não foi possível abrir o arquivo."); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  if (det.isLoading || !det.data) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  const { a, arquivos, notas } = det.data;

  const gerarPdf = async (baixar: boolean) => {
    const { gerarPdfAdmissao } = await import("@/lib/dp/admissao-pdf");
    const doc = gerarPdfAdmissao(a, arquivos);
    if (baixar) doc.save(`${a.protocolo}-${String(a.nome_completo).split(" ")[0]}.pdf`);
    else window.open(doc.output("bloburl").toString(), "_blank");
  };

  const excluir = async () => {
    if (!confirm(`Excluir a admissão de ${a.nome_completo}? Os documentos anexados também serão apagados.`)) return;
    if (arquivos.length) await db.storage.from(BUCKET_ADMISSOES).remove(arquivos.map((f) => f.storage_path));
    const { error } = await db.from("dp_admissoes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["dp-admissoes"] });
    toast.success("Admissão excluída.");
    onExcluida();
  };

  const info = (rotulo: string, valor: unknown) => (
    <div key={rotulo}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="text-sm font-medium">{valor === null || valor === undefined || valor === "" ? "—" : String(valor)}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">{a.nome_completo} <StatusBadge status={a.status} /></SheetTitle>
        <p className="text-sm text-muted-foreground">{a.empresa_nome} · protocolo <span className="font-medium text-primary">{a.protocolo}</span> · recebida em {fmtData(a.created_at)}</p>
      </SheetHeader>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => gerarPdf(false)}><Eye className="mr-2 h-4 w-4" />Abrir ficha PDF</Button>
        <Button variant="outline" size="sm" onClick={() => gerarPdf(true)}><FileText className="mr-2 h-4 w-4" />Baixar ficha PDF</Button>
        {podeExcluir && <Button variant="ghost" size="sm" className="text-destructive" onClick={excluir}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>}
      </div>

      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        {info("Função", a.funcao)}
        {info("Departamento", a.departamento)}
        {info("Data de admissão", fmtData(a.data_admissao))}
        {info("Salário", a.salario != null ? Number(a.salario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null)}
        {info("Experiência", a.contrato_experiencia ? `Sim (${a.contrato_experiencia_dias ?? "—"} dias)` : "Não")}
        {info("Vale transporte", a.vale_transporte ? "Sim" : "Não")}
        {info("CPF", a.cpf)}
        {info("Identidade", a.identidade_numero)}
        {info("PIS", a.pis_numero)}
        {info("CTPS", `${a.ctps_numero ?? "—"} / ${a.ctps_serie ?? "—"} ${a.ctps_uf ?? ""}`)}
        {info("Nascimento", fmtData(a.data_nascimento))}
        {info("Estado civil", a.estado_civil)}
        {info("Telefone", a.telefone)}
        {info("E-mail", a.email)}
        <div className="sm:col-span-2">{info("Endereço", [a.endereco_rua, a.endereco_numero, a.endereco_complemento, a.endereco_bairro, a.endereco_cidade, a.endereco_cep].filter(Boolean).join(", "))}</div>
        {a.observacoes_cliente ? <div className="sm:col-span-2">{info("Observações do cliente", a.observacoes_cliente)}</div> : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Documentos anexados ({arquivos.length})</h3>
          {arquivos.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => arquivos.forEach((f, i) => setTimeout(() => abrirArquivo(f, true), i * 400))}>
              <Download className="mr-2 h-4 w-4" />Baixar todos
            </Button>
          )}
        </div>
        {arquivos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum arquivo enviado.</p> : (
          <ul className="space-y-2">
            {arquivos.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{labelTipoDocumento(f.tipo)}</p>
                  <p className="truncate text-xs text-muted-foreground">{f.nome_arquivo}</p>
                </div>
                <Button size="icon" variant="ghost" title="Abrir" onClick={() => abrirArquivo(f)}><Eye className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" title="Baixar" onClick={() => abrirArquivo(f, true)}><Download className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">Acompanhamento</h3>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={a.status} onValueChange={(s) => atualizar.mutate({ status: s })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_ADMISSAO.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Observação interna</Label>
          <Textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: falta o ASO, cliente avisado por WhatsApp" />
          <Button size="sm" disabled={!nota.trim() || atualizar.isPending} onClick={() => atualizar.mutate({ texto: nota.trim() })}>Salvar observação</Button>
        </div>
        <ul className="space-y-3 border-t pt-3">
          {notas.length === 0 && <li className="text-sm text-muted-foreground">Sem histórico ainda.</li>}
          {notas.map((n) => (
            <li key={n.id} className="text-sm">
              <p className="text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString("pt-BR")} · {n.autor_nome ?? "equipe"}
                {n.status_novo ? ` · status: ${labelStatus(n.status_novo)}` : ""}
              </p>
              {n.texto && <p>{n.texto}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
