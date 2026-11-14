import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlarmClock, Check, ChevronsUpDown, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/dp/db";
import { cn } from "@/lib/utils";

type Empresa = { id: string; razao_social: string };
type Prazo = {
  id: string; empresa_id: string; atividade: string; prazo: string;
  responsavel_id: string | null; responsavel_nome: string | null;
  concluido: boolean; concluido_em: string | null; alerta_enviado_em: string | null;
};
type Filtro = "abertos" | "vencidos" | "concluidos" | "todos";

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtData = (d: string) => d.split("-").reverse().join("/");

function situacao(p: Prazo, hoje: string) {
  if (p.concluido) return { label: "Concluído", cls: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" };
  if (p.prazo < hoje) return { label: "Vencido", cls: "bg-red-100 text-red-800 hover:bg-red-100" };
  if (p.prazo === hoje) return { label: "Vence hoje", cls: "bg-amber-100 text-amber-800 hover:bg-amber-100" };
  return { label: "No prazo", cls: "bg-blue-100 text-blue-800 hover:bg-blue-100" };
}

function EmpresaCombo({ empresas, value, onChange, className }: { empresas: Empresa[]; value: string; onChange: (id: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const atual = empresas.find((e) => e.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className={cn("justify-between font-normal", !atual && "text-muted-foreground", className)}>
          <span className="truncate">{atual?.razao_social ?? "Selecione a empresa"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar empresa…" />
          <CommandList>
            <CommandEmpty>Nenhuma empresa encontrada.</CommandEmpty>
            <CommandGroup>
              {empresas.map((e) => (
                <CommandItem key={e.id} value={e.razao_social} onSelect={() => { onChange(e.id); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", e.id === value ? "opacity-100" : "opacity-0")} />
                  {e.razao_social}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function PrazosAcordados() {
  const { user, displayName, podeExcluir } = useAuth();
  const qc = useQueryClient();
  const hoje = hojeISO();
  const [filtro, setFiltro] = useState<Filtro>("abertos");
  const [busca, setBusca] = useState("");
  const [soMeus, setSoMeus] = useState(false);
  const [novo, setNovo] = useState({ empresa_id: "", atividade: "", prazo: "" });

  const empresas = useQuery({
    queryKey: ["prazos-empresas"],
    queryFn: async () => {
      const { data, error } = await db.from("empresas").select("id, razao_social").eq("ativa", true).order("razao_social");
      if (error) throw error;
      return (data ?? []) as Empresa[];
    },
  });

  const prazos = useQuery({
    queryKey: ["monitor-prazos"],
    queryFn: async () => {
      const { data, error } = await db.from("monitor_prazos").select("*").order("concluido").order("prazo");
      if (error) throw error;
      return (data ?? []) as Prazo[];
    },
  });

  const nomeEmpresa = useMemo(() => new Map((empresas.data ?? []).map((e) => [e.id, e.razao_social])), [empresas.data]);

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("monitor_prazos").insert({ ...novo, atividade: novo.atividade.trim(), responsavel_nome: displayName || user?.email });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atividade registrada");
      setNovo({ empresa_id: "", atividade: "", prazo: "" });
      qc.invalidateQueries({ queryKey: ["monitor-prazos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Partial<Prazo> }) => {
      const { error } = await db.from("monitor_prazos").update(campos).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, campos }) => {
      qc.setQueryData<Prazo[]>(["monitor-prazos"], (old) => old?.map((p) => (p.id === id ? { ...p, ...campos } : p)));
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["monitor-prazos"] }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("monitor_prazos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Atividade excluída"); qc.invalidateQueries({ queryKey: ["monitor-prazos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const todos = prazos.data ?? [];
  const contagem = {
    abertos: todos.filter((p) => !p.concluido).length,
    vencidos: todos.filter((p) => !p.concluido && p.prazo < hoje).length,
    hoje: todos.filter((p) => !p.concluido && p.prazo === hoje).length,
    concluidos: todos.filter((p) => p.concluido).length,
  };

  const termo = busca.trim().toLowerCase();
  const lista = todos.filter((p) =>
    (filtro === "todos" ||
      (filtro === "abertos" && !p.concluido) ||
      (filtro === "vencidos" && !p.concluido && p.prazo < hoje) ||
      (filtro === "concluidos" && p.concluido)) &&
    (!soMeus || p.responsavel_id === user?.id) &&
    (!termo || p.atividade.toLowerCase().includes(termo) || (nomeEmpresa.get(p.empresa_id) ?? "").toLowerCase().includes(termo) || (p.responsavel_nome ?? "").toLowerCase().includes(termo)),
  );

  const podeCriar = novo.empresa_id && novo.atividade.trim() && novo.prazo;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><AlarmClock className="h-6 w-6 text-primary" />Prazos Acordados</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Atividades com prazo combinado entre colaborador e supervisor. Quando o prazo passa sem a atividade ser concluída, o supervisor recebe um aviso por e-mail.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Em aberto", valor: contagem.abertos, cor: "text-foreground" },
          { label: "Vencidos", valor: contagem.vencidos, cor: "text-red-600" },
          { label: "Vencem hoje", valor: contagem.hoje, cor: "text-amber-600" },
          { label: "Concluídos", valor: contagem.concluidos, cor: "text-emerald-600" },
        ].map((c) => (
          <Card key={c.label}><CardContent className="p-4"><p className="text-sm text-muted-foreground">{c.label}</p><p className={cn("text-2xl font-semibold", c.cor)}>{c.valor}</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <form
            className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_170px_auto]"
            onSubmit={(e) => { e.preventDefault(); if (podeCriar) criar.mutate(); }}
          >
            <EmpresaCombo empresas={empresas.data ?? []} value={novo.empresa_id} onChange={(id) => setNovo((n) => ({ ...n, empresa_id: id }))} className="w-full" />
            <Input placeholder="Atividade" value={novo.atividade} onChange={(e) => setNovo((n) => ({ ...n, atividade: e.target.value }))} />
            <Input type="date" aria-label="Prazo" value={novo.prazo} onChange={(e) => setNovo((n) => ({ ...n, prazo: e.target.value }))} />
            <Button type="submit" disabled={!podeCriar || criar.isPending}>
              {criar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Adicionar
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <TabsList>
            <TabsTrigger value="abertos">Em aberto</TabsTrigger>
            <TabsTrigger value="vencidos">Vencidos</TabsTrigger>
            <TabsTrigger value="concluidos">Concluídos</TabsTrigger>
            <TabsTrigger value="todos">Todos</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative min-w-56 max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar empresa, atividade ou colaborador" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground"><Switch checked={soMeus} onCheckedChange={setSoMeus} />Só os meus</label>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2" title="Concluído" />
                <th className="px-3 py-2 font-medium">Empresa</th>
                <th className="px-3 py-2 font-medium">Atividade</th>
                <th className="px-3 py-2 font-medium">Prazo</th>
                <th className="px-3 py-2 font-medium">Colaborador</th>
                <th className="px-3 py-2 font-medium">Situação</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {prazos.isLoading && (
                <tr><td colSpan={7} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              )}
              {!prazos.isLoading && lista.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Nenhuma atividade aqui.</td></tr>
              )}
              {lista.map((p) => {
                const s = situacao(p, hoje);
                const podeApagar = podeExcluir || p.responsavel_id === user?.id;
                return (
                  <tr key={p.id} className={cn("border-t", p.concluido && "text-muted-foreground")}>
                    <td className="px-3 py-1.5">
                      <Checkbox checked={p.concluido} aria-label="Concluído" onCheckedChange={(v) => atualizar.mutate({ id: p.id, campos: { concluido: v === true } })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <EmpresaCombo empresas={empresas.data ?? []} value={p.empresa_id} onChange={(id) => atualizar.mutate({ id: p.id, campos: { empresa_id: id } })} className="h-8 w-64 border-transparent shadow-none hover:border-input" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        key={p.atividade}
                        defaultValue={p.atividade}
                        className={cn("h-8 min-w-64 border-transparent shadow-none hover:border-input focus:border-input", p.concluido && "line-through")}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.atividade) atualizar.mutate({ id: p.id, campos: { atividade: v } }); else e.target.value = p.atividade; }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="date"
                        value={p.prazo}
                        title={fmtData(p.prazo)}
                        className="h-8 w-40 border-transparent shadow-none hover:border-input"
                        onChange={(e) => { if (e.target.value) atualizar.mutate({ id: p.id, campos: { prazo: e.target.value } }); }}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">{p.responsavel_nome ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <Badge className={s.cls}>{s.label}</Badge>
                      {!p.concluido && p.alerta_enviado_em && <span className="ml-2 text-xs text-muted-foreground">supervisor avisado</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      {podeApagar && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Excluir"
                          onClick={() => { if (confirm(`Excluir "${p.atividade}"?`)) excluir.mutate(p.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
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
