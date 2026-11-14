import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/fronteira/compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { db as supabase } from "@/lib/dp/db";
import { useCamposXml } from "@/lib/fronteira/useCamposXml";
import {
  AGREGACOES_CAMPO,
  ESCOPOS_CAMPO,
  TIPOS_CAMPO,
  padroesDoCampo,
  validarRegexSegura,
  type AgregacaoCampo,
  type CampoXmlDef,
  type EscopoCampo,
  type EstrategiaCampo,
  type TipoCampo,
} from "@/lib/fronteira/campos-xml";
import { parseXmlDoc, type XmlNode } from "@/lib/fronteira/xml-doc";
import { resolverCampo } from "@/lib/fronteira/resolver-campos-xml";
import { ArrowLeft, Lock, Pencil, Plus, Trash2, Upload } from "lucide-react";


interface FormCampo {
  codigo: string;
  label: string;
  descricao: string;
  escopo: EscopoCampo;
  tipo: TipoCampo;
  estrategia: EstrategiaCampo;
  caminho: string;
  origem_texto: string;
  padrao_regex: string;
  grupo_captura: string;
  agregacao: AgregacaoCampo;
  campo_fallback_id: string;
  valor_esperado: string;
  ativo: boolean;
}

const FORM_VAZIO: FormCampo = {
  codigo: "",
  label: "",
  descricao: "",
  escopo: "nota",
  tipo: "moeda",
  estrategia: "caminho",
  caminho: "",
  origem_texto: "",
  padrao_regex: "",
  grupo_captura: "1",
  agregacao: "soma",
  campo_fallback_id: "",
  valor_esperado: "",
  ativo: true,
};

function slugCodigo(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

/** Caminhos únicos (a>b>c) presentes numa amostra, para escolha guiada. */
function caminhosDaAmostra(raiz: XmlNode): string[] {
  const out = new Set<string>();
  const anda = (no: XmlNode, prefixo: string[]) => {
    for (const f of no.filhos) {
      const cam = [...prefixo, f.nome];
      out.add(cam.join(">"));
      anda(f, cam);
    }
  };
  anda(raiz, []);
  return Array.from(out).sort();
}

export default function CamposXmlPage() {
  const qc = useQueryClient();
  const { data: campos = [], isLoading } = useCamposXml(false);

  const [aberto, setAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormCampo>(FORM_VAZIO);
  const [excluir, setExcluir] = useState<CampoXmlDef | null>(null);

  const [amostraNome, setAmostraNome] = useState("");
  const [amostraDoc, setAmostraDoc] = useState<XmlNode | null>(null);
  const [filtroCaminho, setFiltroCaminho] = useState("");

  const caminhos = useMemo(
    () => (amostraDoc ? caminhosDaAmostra(amostraDoc) : []),
    [amostraDoc],
  );
  const caminhosFiltrados = useMemo(() => {
    const f = filtroCaminho.trim().toLowerCase();
    const base = f ? caminhos.filter((c) => c.toLowerCase().includes(f)) : caminhos;
    return base.slice(0, 40);
  }, [caminhos, filtroCaminho]);

  function abrirNovo() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setAberto(true);
  }

  function abrirEdicao(c: CampoXmlDef) {
    setEditandoId(c.id);
    setForm({
      codigo: c.codigo,
      label: c.label,
      descricao: c.descricao ?? "",
      escopo: c.escopo,
      tipo: c.tipo,
      estrategia: c.estrategia === "derivado" ? "caminho" : c.estrategia,
      caminho: c.caminho ?? "",
      origem_texto: c.origem_texto ?? "",
      padrao_regex: padroesDoCampo(c.padrao_regex).join("\n"),
      grupo_captura: String(c.grupo_captura ?? 1),
      agregacao: c.agregacao ?? "soma",
      campo_fallback_id: c.campo_fallback_id ?? "",
      valor_esperado: c.valor_esperado != null ? String(c.valor_esperado) : "",
      ativo: c.ativo,
    });
    setAberto(true);
  }

  async function carregarAmostra(file: File | undefined) {
    if (!file) return;
    try {
      const texto = await file.text();
      setAmostraDoc(parseXmlDoc(texto));
      setAmostraNome(file.name);
      toast.success("Amostra carregada", {
        description: "Escolha o caminho do valor na lista.",
      });
    } catch {
      toast.error("Não foi possível ler este arquivo XML.");
    }
  }

  /** Monta o objeto CampoXmlDef parcial para teste/gravação. */
  const candidato: CampoXmlDef = {
    id: editandoId ?? "novo",
    codigo: form.codigo.trim() || slugCodigo(form.label),
    label: form.label.trim(),
    descricao: form.descricao.trim() || null,
    escopo: form.escopo,
    tipo: form.tipo,
    estrategia: form.estrategia,
    caminho: form.estrategia === "caminho" ? form.caminho.trim() || null : null,
    origem_texto: form.estrategia === "texto_livre" ? form.origem_texto.trim() || null : null,
    padrao_regex:
      form.estrategia === "texto_livre"
        ? JSON.stringify(
            form.padrao_regex.split("\n").map((p) => p.trim()).filter(Boolean),
          )
        : null,
    grupo_captura: Number(form.grupo_captura) || 1,
    agregacao: form.escopo === "item" ? form.agregacao : null,
    campo_fallback_id: form.campo_fallback_id || null,
    xml_amostra_path: amostraNome || null,
    valor_esperado: form.valor_esperado ? Number(form.valor_esperado.replace(",", ".")) : null,
    sistema: false,
    ativo: form.ativo,
    ordem: 100,
  };

  const valorTeste = useMemo(() => {
    if (!amostraDoc) return null;
    try {
      return resolverCampo(candidato, amostraDoc, campos);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amostraDoc, campos, JSON.stringify(candidato)]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!candidato.label) throw new Error("Informe o nome do campo.");
      if (!candidato.codigo) throw new Error("Informe o código do campo.");
      if (form.estrategia === "caminho" && !candidato.caminho) {
        throw new Error("Informe o caminho do valor no XML.");
      }
      if (form.estrategia === "texto_livre") {
        if (!candidato.origem_texto) {
          throw new Error("Informe de qual trecho do XML o texto será lido.");
        }
        const padroes = padroesDoCampo(candidato.padrao_regex);
        if (!padroes.length) throw new Error("Informe ao menos um padrão de busca.");
        for (const p of padroes) {
          const erro = validarRegexSegura(p);
          if (erro) throw new Error(erro);
        }
      }
      const payload = {
        codigo: candidato.codigo,
        label: candidato.label,
        descricao: candidato.descricao,
        escopo: candidato.escopo,
        tipo: candidato.tipo,
        estrategia: candidato.estrategia,
        caminho: candidato.caminho,
        origem_texto: candidato.origem_texto,
        padrao_regex: candidato.padrao_regex,
        grupo_captura: candidato.grupo_captura,
        agregacao: candidato.agregacao,
        campo_fallback_id: candidato.campo_fallback_id,
        xml_amostra_path: candidato.xml_amostra_path,
        valor_esperado: candidato.valor_esperado,
        ativo: candidato.ativo,
      };
      if (editandoId) {
        const { error } = await supabase
          .from("ff_campos_xml")
          .update(payload)
          .eq("id", editandoId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ff_campos_xml").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ff-campos-xml"] });
      toast.success(editandoId ? "Campo atualizado" : "Campo criado");
      setAberto(false);
    },
    onError: (e) => toast.error("Não foi possível salvar", { description: (e as Error).message }),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ff_campos_xml").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ff-campos-xml"] });
      toast.success("Campo excluído");
      setExcluir(null);
    },
    onError: (e) =>
      toast.error("Não foi possível excluir", { description: (e as Error).message }),
  });

  return (
    <>
      <PageHeader
        title="Campos do XML"
        description="Estes são os valores que você pode usar nas fórmulas. Cadastre novos campos sem depender de programação."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/fiscal/fronteira/formulas">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar para cálculos
          </Link>
        </Button>
        <Button size="sm" onClick={abrirNovo}>
          <Plus className="mr-1.5 h-4 w-4" />
          Novo campo
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Campo</th>
              <th className="px-4 py-2.5 font-medium">Onde está no XML</th>
              <th className="px-4 py-2.5 font-medium">Abrangência</th>
              <th className="px-4 py-2.5 font-medium">Situação</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            )}
            {!isLoading &&
              campos.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 font-medium">
                      {c.label}
                      {c.sistema && (
                        <Lock className="h-3 w-3 text-muted-foreground" aria-label="Campo padrão" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{c.codigo}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {c.estrategia === "texto_livre"
                      ? `${c.origem_texto ?? ""} (texto)`
                      : c.estrategia === "derivado"
                        ? `calculado: ${c.caminho ?? ""}`
                        : (c.caminho ?? "")}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.escopo === "item" ? "Por produto" : "Nota inteira"}
                    {c.agregacao && (
                      <span className="text-muted-foreground">
                        {" "}
                        ·{" "}
                        {AGREGACOES_CAMPO.find((a) => a.valor === c.agregacao)?.label ??
                          c.agregacao}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.ativo ? "Ativo" : "Inativo"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar campo"
                        onClick={() => abrirEdicao(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Excluir campo"
                        disabled={c.sistema}
                        onClick={() => setExcluir(c)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            {!isLoading && campos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum campo cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar campo" : "Novo campo"}</DialogTitle>
            <DialogDescription>
              Diga onde o valor aparece na nota. Se quiser conferir, carregue uma nota
              de exemplo e veja o valor encontrado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome do campo</Label>
                <Input
                  value={form.label}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      label: e.target.value,
                      codigo: editandoId ? s.codigo : slugCodigo(e.target.value),
                    }))
                  }
                  placeholder="Ex.: Peso da embalagem"
                />
              </div>
              <div className="space-y-2">
                <Label>Código interno</Label>
                <Input
                  value={form.codigo}
                  onChange={(e) => setForm((s) => ({ ...s, codigo: slugCodigo(e.target.value) }))}
                  placeholder="peso_embalagem"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Explicação (opcional)</Label>
              <Textarea
                rows={2}
                value={form.descricao}
                onChange={(e) => setForm((s) => ({ ...s, descricao: e.target.value }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Tipo de valor</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm((s) => ({ ...s, tipo: v as TipoCampo }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_CAMPO.map((t) => (
                      <SelectItem key={t.valor} value={t.valor}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Abrangência</Label>
                <Select
                  value={form.escopo}
                  onValueChange={(v) => setForm((s) => ({ ...s, escopo: v as EscopoCampo }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESCOPOS_CAMPO.map((e) => (
                      <SelectItem key={e.valor} value={e.valor}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.escopo === "item" && (
                <div className="space-y-2">
                  <Label>Como combinar</Label>
                  <Select
                    value={form.agregacao}
                    onValueChange={(v) =>
                      setForm((s) => ({ ...s, agregacao: v as AgregacaoCampo }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGREGACOES_CAMPO.map((a) => (
                        <SelectItem key={a.valor} value={a.valor}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Como o valor é encontrado</Label>
              <Select
                value={form.estrategia}
                onValueChange={(v) =>
                  setForm((s) => ({ ...s, estrategia: v as EstrategiaCampo }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="caminho">O valor tem lugar próprio na nota</SelectItem>
                  <SelectItem value="texto_livre">
                    O valor está escrito dentro de um texto
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.estrategia === "caminho" ? (
              <div className="space-y-2">
                <Label>Caminho do valor</Label>
                <Input
                  value={form.caminho}
                  onChange={(e) => setForm((s) => ({ ...s, caminho: e.target.value }))}
                  placeholder="total>ICMSTot>vFrete"
                  className="font-mono text-xs"
                />
              </div>
            ) : (
              <div className="space-y-4 rounded-md border bg-muted/20 p-4">
                <div className="space-y-2">
                  <Label>Onde está o texto</Label>
                  <Input
                    value={form.origem_texto}
                    onChange={(e) => setForm((s) => ({ ...s, origem_texto: e.target.value }))}
                    placeholder="det>infAdProd"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Padrões de busca (um por linha)</Label>
                  <Textarea
                    rows={3}
                    value={form.padrao_regex}
                    onChange={(e) => setForm((s) => ({ ...s, padrao_regex: e.target.value }))}
                    placeholder={"#\\s*([0-9.,]+)\\s*KG#\nPESO\\s*UNITARIO[^0-9]{0,10}([0-9.,]+)"}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    O primeiro padrão que encontrar um número é usado.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Número do trecho capturado</Label>
                  <Input
                    value={form.grupo_captura}
                    onChange={(e) => setForm((s) => ({ ...s, grupo_captura: e.target.value }))}
                    className="w-24"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Se não encontrar, usar o campo</Label>
              <Select
                value={form.campo_fallback_id || "nenhum"}
                onValueChange={(v) =>
                  setForm((s) => ({ ...s, campo_fallback_id: v === "nenhum" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum</SelectItem>
                  {campos
                    .filter((c) => c.id !== editandoId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>Conferir com uma nota de exemplo (opcional)</Label>
                  <p className="text-xs text-muted-foreground">
                    {amostraNome || "Nenhum arquivo carregado"}
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <label className="cursor-pointer">
                    <Upload className="mr-1.5 h-4 w-4" />
                    Carregar XML
                    <input
                      type="file"
                      accept=".xml"
                      className="hidden"
                      onChange={(e) => carregarAmostra(e.target.files?.[0])}
                    />
                  </label>
                </Button>
              </div>

              {amostraDoc && (
                <>
                  <Input
                    value={filtroCaminho}
                    onChange={(e) => setFiltroCaminho(e.target.value)}
                    placeholder="Procurar no XML (ex.: peso, vFrete)"
                  />
                  <div className="max-h-44 space-y-1 overflow-y-auto rounded border bg-muted/20 p-2">
                    {caminhosFiltrados.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() =>
                          setForm((s) =>
                            s.estrategia === "caminho"
                              ? { ...s, caminho: c }
                              : { ...s, origem_texto: c },
                          )
                        }
                        className="block w-full truncate rounded px-2 py-1 text-left font-mono text-[11px] hover:bg-accent"
                      >
                        {c}
                      </button>
                    ))}
                    {caminhosFiltrados.length === 0 && (
                      <p className="px-2 py-1 text-xs text-muted-foreground">
                        Nada encontrado nesta nota.
                      </p>
                    )}
                  </div>
                  <div className="flex items-baseline justify-between rounded bg-card p-3 text-sm">
                    <span className="text-xs text-muted-foreground">
                      Valor encontrado na nota de exemplo
                    </span>
                    <span className="font-semibold">
                      {valorTeste != null ? valorTeste.toLocaleString("pt-BR") : "—"}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Campos inativos não aparecem nas fórmulas.
                </p>
              </div>
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => setForm((s) => ({ ...s, ativo: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{excluir?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Fórmulas que usam este campo deixarão de calcular até serem ajustadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => excluir && remover.mutate(excluir.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
