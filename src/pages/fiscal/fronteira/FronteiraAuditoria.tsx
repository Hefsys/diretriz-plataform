import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  FileText, FileArchive, Loader2, RotateCcw, CheckCircle2, AlertCircle, Search, Play, Pencil, Download, Save, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { calcularNotasOficiais } from "@/lib/fronteira/contexto";
import { FonteLegal } from "@/components/fronteira/FonteLegal";
import { ExplicacaoIA } from "@/components/fronteira/ExplicacaoIA";
import { useCamposXml } from "@/lib/fronteira/useCamposXml";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  processar,
  parseArquivosXML,
  listarNCMsPendentes,
  parseExtratoPDF,
  type ResultadoConferencia,
  type LinhaConferencia,
  type NotaXML,
  type PendenciaNCM,
} from "@/lib/fronteira/fronteiraFiscal";
import { db as supabase } from "@/lib/dp/db";
import type { LogicaCalculo, NcmLegislacao } from "@/lib/fronteira/logicas-calculo";
import { parseInputNumber } from "@/lib/fronteira/logicas-calculo";
import { exportarConferenciaXLSX, type ConferenciaNotaExport } from "@/lib/fronteira/exportar";


const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtNum = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtCNPJ = (c: string) => {
  const d = c.replace(/\D/g, "").padStart(14, "0");
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

function getErrorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const err = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    return [err.message, err.details, err.hint, err.code]
      .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
      .join(" · ") || JSON.stringify(e);
  }
  return "Erro desconhecido";
}

function normalizarPeriodoFiscal(valor: string) {
  const periodo = valor.trim();
  if (/^\d{2}\/\d{4}$/.test(periodo)) return periodo;

  const meses: Record<string, string> = {
    janeiro: "01",
    fevereiro: "02",
    marco: "03",
    março: "03",
    abril: "04",
    maio: "05",
    junho: "06",
    julho: "07",
    agosto: "08",
    setembro: "09",
    outubro: "10",
    novembro: "11",
    dezembro: "12",
  };

  const match = periodo.toLowerCase().match(/^([a-zá-úç]+)\/(\d{4})$/i);
  if (!match) return null;
  const mes = meses[match[1]];
  return mes ? `${mes}/${match[2]}` : null;
}

export default function FronteiraAuditoria() {
  const { isAdmin } = useAuth();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [xmlFiles, setXmlFiles] = useState<File[]>([]);
  const [resultado, setResultado] = useState<ResultadoConferencia | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [logicaId, setLogicaId] = useState<string>("");
  const [xmlsParsed, setXmlsParsed] = useState<NotaXML[]>([]);
  const [validandoXml, setValidandoXml] = useState(false);
  // Chaves "nNF|cnpj" presentes no extrato SEFAZ (matching)
  const [sefazChaves, setSefazChaves] = useState<Set<string> | null>(null);
  const [lendoPDF, setLendoPDF] = useState(false);
  // Overrides digitados pelo usuário: ncm → R$/kg (uma vez por NCM)
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // Para cada NCM pendente: salvar permanentemente na lógica?
  const [salvarNaLogica, setSalvarNaLogica] = useState<Record<string, boolean>>({});

  // Catálogo de campos do XML usado pelas fórmulas em fluxograma.
  const { data: camposXml } = useCamposXml();


  const { data: logicas } = useQuery({
    queryKey: ["logicas-ativas"],
    queryFn: async (): Promise<LogicaCalculo[]> => {
      const { data, error } = await supabase
        .from("ff_logicas_calculo")
        .select("*")
        .eq("ativa", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as LogicaCalculo[];
    },
  });

  const logica = useMemo(
    () => logicas?.find((l) => l.id === logicaId) ?? null,
    [logicas, logicaId],
  );

  // Carrega NCMs cadastrados para a lógica selecionada
  const { data: ncmsCadastrados } = useQuery({
    queryKey: ["logica-ncms", logicaId],
    queryFn: async (): Promise<NcmLegislacao[]> => {
      const { data, error } = await supabase
        .from("ff_logica_ncm_legislacao")
        .select("*")
        .eq("logica_id", logicaId);
      if (error) throw error;
      return (data ?? []) as unknown as NcmLegislacao[];
    },
    enabled: !!logicaId,
  });

  const ncmLegisMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of ncmsCadastrados ?? []) {
      m.set(n.ncm, Number(n.legislacao_valor));
    }
    return m;
  }, [ncmsCadastrados]);

  // Uso e Consumo não usa NCM/peso/legislação — só DIFAL na lógica
  const isUsoConsumo = logica?.formula_codigo === "USO_E_CONSUMO";
  const isIcmsAntecipado = logica?.formula_codigo === "ICMS_ANTECIPADO";
  const isFluxoVisual = logica?.formula_codigo === "FLUXO_VISUAL";
  const isSemLegislacaoNCM = isUsoConsumo || isIcmsAntecipado || isFluxoVisual;
  const difalPctLogica = Number(
    (logica?.parametros as { difal_percentual?: number } | undefined)?.difal_percentual ?? 0,
  );
  const aliquotaInternaLogica = Number(
    (logica?.parametros as { aliquota_interna?: number } | undefined)?.aliquota_interna ?? 0,
  );

  // Parse XMLs assim que o usuário envia
  useEffect(() => {
    if (xmlFiles.length === 0) {
      setXmlsParsed([]);
      return;
    }
    let cancelado = false;
    (async () => {
      setValidandoXml(true);
      try {
        const parsed = await parseArquivosXML(xmlFiles);
        if (!cancelado) setXmlsParsed(parsed);
      } catch (e) {
        if (!cancelado) toast.error("Erro ao ler XMLs", { description: String(e) });
      } finally {
        if (!cancelado) setValidandoXml(false);
      }
    })();
    return () => { cancelado = true; };
  }, [xmlFiles]);

  // Parse do PDF para descobrir QUAIS NFs estão no extrato SEFAZ
  useEffect(() => {
    if (!pdfFile) {
      setSefazChaves(null);
      return;
    }
    let cancelado = false;
    (async () => {
      setLendoPDF(true);
      try {
        const extrato = await parseExtratoPDF(pdfFile);
        if (cancelado) return;
        const set = new Set<string>();
        for (const n of extrato.notas) set.add(`${n.nNF}|${n.cnpjEmitente}`);
        setSefazChaves(set);
      } catch (e) {
        if (!cancelado) {
          toast.error("Erro ao ler PDF do extrato", { description: String(e) });
          setSefazChaves(new Set());
        }
      } finally {
        if (!cancelado) setLendoPDF(false);
      }
    })();
    return () => { cancelado = true; };
  }, [pdfFile]);

  // XMLs que efetivamente casam com alguma linha do extrato SEFAZ
  const xmlsCasados = useMemo(() => {
    if (!sefazChaves || xmlsParsed.length === 0) return [];
    return xmlsParsed.filter((x) => sefazChaves.has(`${x.nNF}|${x.cnpjEmitente}`));
  }, [xmlsParsed, sefazChaves]);

  // Pendências cruas: uma entrada (NF,NCM) — só dos XMLs CASADOS
  const pendenciasRaw: PendenciaNCM[] = useMemo(() => {
    if (!logica || isSemLegislacaoNCM || xmlsCasados.length === 0) return [];
    return listarNCMsPendentes(xmlsCasados, ncmLegisMap);
  }, [logica, isSemLegislacaoNCM, xmlsCasados, ncmLegisMap]);

  // Agrupa por NCM único → 1 linha por NCM com lista de NFs afetadas
  type PendNCM = { ncm: string; descricaoProduto: string; nfsAfetadas: string[] };
  const pendenciasPorNCM: PendNCM[] = useMemo(() => {
    const map = new Map<string, PendNCM>();
    for (const p of pendenciasRaw) {
      const cur = map.get(p.ncm);
      if (cur) {
        if (!cur.nfsAfetadas.includes(p.nNF)) cur.nfsAfetadas.push(p.nNF);
        if (!cur.descricaoProduto && p.descricaoProduto) cur.descricaoProduto = p.descricaoProduto;
      } else {
        map.set(p.ncm, {
          ncm: p.ncm,
          descricaoProduto: p.descricaoProduto,
          nfsAfetadas: [p.nNF],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.ncm.localeCompare(b.ncm));
  }, [pendenciasRaw]);

  const pendenciasResolvidas = pendenciasPorNCM.every((p) => {
    const v = overrides[p.ncm];
    return v !== undefined && v !== "" && Number(parseInputNumber(v)) > 0;
  });

  const podeProcessar =
    !!pdfFile && xmlFiles.length > 0 && !!logica && !lendoPDF && pendenciasResolvidas;

  async function processarAgora() {
    if (!pdfFile || !logica) return;
    setProcessando(true);
    setErro(null);
    try {
      // Expande os overrides por NCM → mapa por NF (chave nNF|cnpj) das NFs casadas
      const overridesMap = new Map<string, Map<string, number>>();
      for (const x of xmlsCasados) {
        const chaveNF = `${x.nNF}|${x.cnpjEmitente}`;
        const inner = new Map<string, number>();
        for (const it of x.itens ?? []) {
          const v = overrides[it.ncm];
          if (!v) continue;
          const n = parseInputNumber(v);
          if (Number.isFinite(n) && n > 0) inner.set(it.ncm, n);
        }
        if (inner.size > 0) overridesMap.set(chaveNF, inner);
      }

      // Persiste NCMs marcados para salvar permanentemente na lógica
      const paraSalvar: Array<{ ncm: string; legislacao_valor: number; descricao_produto: string | null }> = [];
      for (const p of pendenciasPorNCM) {
        if (!salvarNaLogica[p.ncm]) continue;
        const v = overrides[p.ncm];
        const n = v ? parseInputNumber(v) : NaN;
        if (Number.isFinite(n) && n > 0) {
          paraSalvar.push({ ncm: p.ncm, legislacao_valor: n, descricao_produto: p.descricaoProduto || null });
        }
      }
      if (paraSalvar.length > 0) {
        const { error: errIns } = await supabase
          .from("ff_logica_ncm_legislacao")
          .insert(paraSalvar.map(p => ({
            logica_id: logicaId,
            ncm: p.ncm,
            descricao_produto: p.descricao_produto,
            legislacao_valor: p.legislacao_valor,
            unidade: "R$/kg",
          })));
        if (errIns) toast.warning("Não foi possível salvar NCMs na lógica", { description: errIns.message });
        else toast.success(`${paraSalvar.length} NCM(s) salvos na lógica`);
      }

      const oficial = logica.formula_codigo === "ICMS_ANTECIPADO" || logica.formula_codigo === "USO_E_CONSUMO";
      const memoriasOficiais = oficial ? await calcularNotasOficiais(logica.formula_codigo as "ICMS_ANTECIPADO" | "USO_E_CONSUMO", xmlsCasados) : undefined;
      const r = await processar(pdfFile, xmlFiles, {
        memoriasOficiais,
        logica: {
          formula_codigo: logica.formula_codigo,
          parametros: logica.parametros,
          fluxo: (logica as unknown as { fluxo?: unknown }).fluxo ?? null,
        },
        ncmLegislacoes: ncmLegisMap,
        fluxosPorNcm: (ncmsCadastrados ?? []).map((n) => ({
          ncm: n.ncm,
          fluxo: (n as unknown as { fluxo?: unknown }).fluxo ?? null,
          vigencia_inicio: n.vigencia_inicio,
          vigencia_fim: n.vigencia_fim,
        })),
        legislacoesManuaisPorNF: overridesMap,
        camposXml: camposXml ?? [],

      });
      setResultado(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErro(msg);
      toast.error("Erro ao processar", { description: msg });
    } finally {
      setProcessando(false);
    }
  }

  function limpar() {
    setPdfFile(null);
    setXmlFiles([]);
    setResultado(null);
    setErro(null);
    setXmlsParsed([]);
    setOverrides({});
    setSalvarNaLogica({});
  }

  function onPdf(files: File[]) {
    setResultado(null);
    setErro(null);
    setPdfFile(files[0]);
  }

  function onXmls(files: File[]) {
    setResultado(null);
    setErro(null);
    setXmlFiles(files);
  }

  const statusPdf = processando && pdfFile ? "processando" : pdfFile ? "pronto" : "idle";
  const statusXml = processando && xmlFiles.length > 0 ? "processando" : xmlFiles.length > 0 ? "pronto" : "idle";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Fiscal · Fronteira</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="h-6 w-6 text-primary" />Auditoria ICMS Fronteira</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">Envie o extrato SEFAZ-PE e os XMLs das NF-e — a conferência é feita automaticamente.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(pdfFile || xmlFiles.length > 0) && (
            <Button variant="outline" size="sm" onClick={limpar}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Nova auditoria
            </Button>
          )}
        </div>
      </div>

      {/* Seletor de Lógica de Cálculo */}
      <div className="mb-4 rounded-lg border bg-card p-5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Lógica de cálculo aplicável</label>
          <Select value={logicaId} onValueChange={setLogicaId}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Selecione uma lógica..." />
            </SelectTrigger>
            <SelectContent>
              {(logicas ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {logicas && logicas.length === 0 && (
            <p className="text-xs text-amber-700">
              Nenhuma fórmula cadastrada ainda.{" "}
              {isAdmin ? <Link className="underline" to="/fiscal/fronteira/importar">Importe do sistema antigo</Link> : "Peça a um administrador para importar do sistema antigo"}.
            </p>
          )}
          {logica?.descricao && (
            <p className="text-xs text-muted-foreground">{logica.descricao}</p>
          )}
          {logica && (
            <p className="text-xs text-muted-foreground">
              {isUsoConsumo ? (
                <>DIFAL: {difalPctLogica.toString().replace(".", ",")}% · divisor 0,795 (constante)</>
              ) : isIcmsAntecipado ? (
                <>Antecipação tributária · perfil fiscal vigente na emissão da nota</>
              ) : (
                <>
                  Alíquota: {String((logica.parametros as { aliquota_interna?: number })?.aliquota_interna ?? "—")}% ·{" "}
                  {ncmsCadastrados?.length ?? 0} NCM(s) cadastrados
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DropZone
          titulo="Extrato SEFAZ-PE"
          descricao="Arraste o PDF do extrato emitido pela SEFAZ-PE."
          icone={<FileText className="h-8 w-8" />}
          accept=".pdf,application/pdf"
          multiple={false}
          status={erro && pdfFile ? "erro" : statusPdf}
          resumo={pdfFile?.name ?? null}
          onFiles={onPdf}
          disabled={!logica}
        />
        <DropZone
          titulo="Notas fiscais"
          descricao="Arraste XMLs, PDFs (DANFE) ou um .zip com as notas."
          icone={<FileArchive className="h-8 w-8" />}
          accept=".xml,.pdf,.zip,application/xml,text/xml,application/pdf,application/zip"
          multiple
          status={erro && xmlFiles.length > 0 ? "erro" : statusXml}
          resumo={
            xmlFiles.length > 0
              ? `${xmlFiles.length} ${xmlFiles.length === 1 ? "arquivo" : "arquivos"}`
              : null
          }
          onFiles={onXmls}
          disabled={!logica}
        />
      </div>

      {/* Painel: lendo XMLs / pendências de NCM / pronto pra processar */}
      {logica && xmlFiles.length > 0 && (
        <div className="mt-4">
          {validandoXml ? (
            <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo XMLs…
            </div>
          ) : lendoPDF ? (
            <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo extrato SEFAZ…
            </div>
          ) : pendenciasPorNCM.length > 0 ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                {pendenciasPorNCM.length} NCM(s) das NFs do extrato sem legislação cadastrada — informe abaixo para continuar
              </div>
              {sefazChaves && (
                <div className="text-xs text-muted-foreground">
                  {sefazChaves.size} NF(s) no extrato SEFAZ · {xmlsCasados.length} XML(s) casados · {xmlsParsed.length - xmlsCasados.length} XML(s) ignorados em silêncio
                </div>
              )}
              <div className="overflow-x-auto rounded-md border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NCM</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>NFs afetadas</TableHead>
                      <TableHead className="w-40">Legislação (R$/kg)</TableHead>
                      <TableHead className="w-44">Salvar na lógica?</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendenciasPorNCM.map((p) => (
                      <TableRow key={p.ncm}>
                        <TableCell className="font-mono text-xs">{p.ncm}</TableCell>
                        <TableCell className="text-xs">{p.descricaoProduto || "—"}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {p.nfsAfetadas.join(", ")}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.0001"
                            min="0"
                            value={overrides[p.ncm] ?? ""}
                            onChange={(e) =>
                              setOverrides((s) => ({ ...s, [p.ncm]: e.target.value }))
                            }
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <Checkbox
                              checked={!!salvarNaLogica[p.ncm]}
                              onCheckedChange={(v) =>
                                setSalvarNaLogica((s) => ({ ...s, [p.ncm]: !!v }))
                              }
                            />
                            Salvar permanentemente
                          </label>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {pendenciasResolvidas && pdfFile && !resultado && (
                <div className="pt-1">
                  <Button onClick={processarAgora} disabled={processando}>
                    <Play className="mr-1.5 h-4 w-4" /> Processar auditoria
                  </Button>
                </div>
              )}
            </div>
          ) : pdfFile && !resultado ? (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
              <div className="text-sm font-semibold flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Todos os NCMs cadastrados — pronto para processar.
              </div>
              <Button onClick={processarAgora} disabled={processando}>
                <Play className="mr-1.5 h-4 w-4" /> Processar auditoria
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {processando && (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Processando conferência…
        </div>
      )}

      {resultado && !processando && <ResultadoView resultado={resultado} />}
    </>
  );
}

type StatusUpload = "idle" | "processando" | "pronto" | "erro";

interface DropZoneProps {
  titulo: string;
  descricao: string;
  icone: React.ReactNode;
  accept: string;
  multiple: boolean;
  status: StatusUpload;
  resumo: string | null;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

function DropZone({
  titulo,
  descricao,
  icone,
  accept,
  multiple,
  status,
  resumo,
  onFiles,
  disabled,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
    [onFiles, disabled],
  );

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onFiles(files);
    e.target.value = "";
  };

  return (
    <div
      onClick={() => !disabled && status !== "processando" && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (disabled) return;
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "group relative flex h-48 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-card p-6 text-center transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        dragOver && "border-primary bg-primary/5",
        status === "pronto" && "border-emerald-500/60 bg-emerald-50/40 dark:bg-emerald-500/5",
        status === "erro" && "border-destructive/60 bg-destructive/5",
        status === "processando" && "cursor-wait opacity-80",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={onChange}
        disabled={disabled}
      />
      <div className="flex items-center gap-2 text-muted-foreground">
        {status === "processando" ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : status === "pronto" ? (
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        ) : status === "erro" ? (
          <AlertCircle className="h-8 w-8 text-destructive" />
        ) : (
          icone
        )}
      </div>
      <div className="text-sm font-semibold">{titulo}</div>
      <div className="max-w-xs text-xs text-muted-foreground">
        {resumo ?? descricao}
      </div>
      {status === "idle" && (
        <div className="text-[11px] text-muted-foreground/70">
          Clique ou arraste o arquivo aqui
        </div>
      )}
    </div>
  );
}

function ResultadoView({ resultado }: { resultado: ResultadoConferencia }) {
  const [linhaSelecionada, setLinhaSelecionada] = useState<LinhaConferencia | null>(null);
  const [linhaEdicao, setLinhaEdicao] = useState<LinhaConferencia | null>(null);

  const isUsoConsumo = resultado.notasConferidas.some(
    (l) => l.memoria?.formulaCodigo === "USO_E_CONSUMO",
  );
  const isIcmsAntecipado = resultado.notasConferidas.some(
    (l) => l.memoria?.formulaCodigo === "ICMS_ANTECIPADO",
  );
  const isFluxo = resultado.notasConferidas.some(
    (l) => l.memoria?.formulaCodigo === "FLUXO_VISUAL",
  );
  const mostrarColunasXML = isUsoConsumo || isIcmsAntecipado || isFluxo;

  type AjusteInfo = {
    original: number;
    novo: number;
    motivo: string;
    usuarioEmail: string | null;
    createdAt: string;
  };
  // chave: nNF|cnpj
  const [ajustes, setAjustes] = useState<Record<string, AjusteInfo>>({});

  const ie = resultado.empresa.ie || "";
  const periodo = resultado.empresa.periodo || "";

  // Carrega ajustes salvos para a empresa+período e re-aplica
  useEffect(() => {
    let cancelado = false;
    (async () => {
      let q = supabase
        .from("ff_ajustes_conferencia")
        .select("nnf,cnpj_emitente,icms_xml_original,icms_xml_novo,motivo,usuario_email,created_at")
        .order("created_at", { ascending: true });
      if (ie) q = q.eq("inscricao_estadual", ie);
      if (periodo) q = q.eq("periodo_fiscal", periodo);
      const { data, error } = await q;
      if (cancelado || error || !data) return;
      const map: Record<string, AjusteInfo> = {};
      // último ajuste por chave prevalece (ordem asc → o último sobrescreve)
      for (const r of data) {
        const k = `${r.nnf}|${r.cnpj_emitente}`;
        map[k] = {
          original: Number(r.icms_xml_original),
          novo: Number(r.icms_xml_novo),
          motivo: r.motivo,
          usuarioEmail: r.usuario_email ?? null,
          createdAt: r.created_at,
        };
      }
      setAjustes(map);
    })();
    return () => { cancelado = true; };
  }, [ie, periodo]);

  // Linhas com ICMS XML possivelmente sobrescrito + diferenca recalculada
  const linhas = useMemo(() => {
    return resultado.notasConferidas.map((n) => {
      const k = `${n.nNF}|${n.cnpjEmitente}`;
      const aj = ajustes[k];
      if (!aj) return n;
      const icmsCalculado = aj.novo;
      return {
        ...n,
        icmsCalculado,
        diferenca: icmsCalculado - n.icmsSefaz,
      } as LinhaConferencia;
    });
  }, [resultado.notasConferidas, ajustes]);

  const icmsCalculadoTotal = useMemo(
    () => linhas.reduce((s, n) => s + n.icmsCalculado, 0),
    [linhas],
  );
  const diferencaTotal = useMemo(
    () => linhas.reduce((s, n) => s + n.diferenca, 0),
    [linhas],
  );
  const diffOk = Math.abs(diferencaTotal) < 1;

  async function salvarAjuste(linha: LinhaConferencia, novoValor: number, motivo: string) {
    const k = `${linha.nNF}|${linha.cnpjEmitente}`;
    const original = ajustes[k]?.original ?? linha.icmsCalculado;
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email ?? null;
    const { error } = await supabase.from("ff_ajustes_conferencia").insert({
      nnf: linha.nNF,
      cnpj_emitente: linha.cnpjEmitente,
      inscricao_estadual: ie || null,
      periodo_fiscal: periodo || null,
      icms_xml_original: original,
      icms_xml_novo: novoValor,
      motivo,
      usuario_email: email,
    });
    if (error) {
      toast.error("Erro ao salvar ajuste", { description: error.message });
      return;
    }
    setAjustes((s) => ({
      ...s,
      [k]: {
        original,
        novo: novoValor,
        motivo,
        usuarioEmail: email,
        createdAt: new Date().toISOString(),
      },
    }));
    toast.success("ICMS XML ajustado");
  }

  // ─── Salvar no histórico (sessoes_auditoria + conferencia_notas) ───
  type EmpresaCad = { id: string; razao_social: string; cnpj: string; inscricao_estadual: string | null };
  const [empresas, setEmpresas] = useState<EmpresaCad[]>([]);
  const [empresaIdSelecionada, setEmpresaIdSelecionada] = useState<string>("");
  const [salvandoHistorico, setSalvandoHistorico] = useState(false);
  const [dialogEmpresaAberto, setDialogEmpresaAberto] = useState(false);
  const [sessaoSalvaId, setSessaoSalvaId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("empresas")
        .select("id, razao_social, cnpj, inscricao_estadual")
        .eq("ativa", true)
        .order("razao_social");
      setEmpresas((data ?? []) as EmpresaCad[]);
    })();
  }, []);

  // Tenta achar a empresa cadastrada pela IE
  const empresaAuto = useMemo<EmpresaCad | null>(() => {
    if (!ie || empresas.length === 0) return null;
    const norm = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
    const ieNorm = norm(ie);
    if (!ieNorm) return null;
    return empresas.find((e) => norm(e.inscricao_estadual) === ieNorm) ?? null;
  }, [ie, empresas]);

  function montarNotasParaExport(): ConferenciaNotaExport[] {
    return linhas.map((n) => {
      const k = `${n.nNF}|${n.cnpjEmitente}`;
      const aj = ajustes[k];
      return {
        nNF: n.nNF,
        cnpjEmitente: n.cnpjEmitente,
        vNF: n.vNF,
        icmsSefaz: n.icmsSefaz,
        icmsCalculado: n.icmsCalculado,
        diferenca: n.diferenca,
        icmsXmlEditado: aj ? aj.novo : null,
        motivoEdicao: aj ? aj.motivo : null,
      };
    });
  }

  async function exportarExcel() {
    try {
      await exportarConferenciaXLSX(montarNotasParaExport(), {
        razaoSocial: resultado.empresa.razaoSocial,
        inscricaoEstadual: ie,
        periodoFiscal: periodo,
        totalIcmsSefaz: resultado.icmsSefaz,
        totalIcmsCalculado: icmsCalculadoTotal,
        totalDiferenca: diferencaTotal,
        tituloArquivo: `conferencia_${(periodo || "").replace("/", "-") || "atual"}`,
      });
      toast.success("Excel gerado");
    } catch (e) {
      toast.error("Erro ao gerar Excel", { description: String(e) });
    }
  }

  async function salvarNoHistorico(empresaId: string) {
    if (!empresaId) {
      toast.error("Selecione uma empresa cadastrada");
      return;
    }
    setSalvandoHistorico(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const periodoFmt = normalizarPeriodoFiscal(periodo) ?? "00/0000";

      const { data: sessao, error: errSes } = await supabase
        .from("ff_sessoes_auditoria")
        .insert({
          empresa_id: empresaId,
          periodo_fiscal: periodoFmt,
          status: "CONCLUIDA",
          passo_atual: 3,
          total_casos: linhas.length,
          total_calculados: linhas.filter((l) => l.suportado).length,
          valor_recuperavel: Number(diferencaTotal.toFixed(2)),
          total_xmls_enviados: resultado.estatisticas.xmlsRecebidos,
          total_xmls_ignorados: resultado.estatisticas.xmlsDescartados,
          total_xmls_descartados: resultado.estatisticas.xmlsDescartados,
          concluida_em: new Date().toISOString(),
          created_by: userData.user?.id ?? null,
        })
        .select("id")
        .single();
      if (errSes || !sessao) throw errSes ?? new Error("Falha ao criar sessão");

      const notasRows = linhas.map((n) => {
        const k = `${n.nNF}|${n.cnpjEmitente}`;
        const aj = ajustes[k];
        return {
          sessao_id: sessao.id,
          nnf: n.nNF,
          cnpj_emitente: n.cnpjEmitente,
          nome_emitente: n.nomeEmitente ?? null,
          valor_nf: Number(n.vNF.toFixed(2)),
          icms_sefaz: Number(n.icmsSefaz.toFixed(2)),
          icms_calculado: Number(n.icmsCalculado.toFixed(2)),
          diferenca: Number(n.diferenca.toFixed(2)),
          icms_xml_editado: aj ? Number(aj.novo.toFixed(2)) : null,
          motivo_edicao: aj ? aj.motivo : null,
        };
      });
      if (notasRows.length > 0) {
        const { error: errNotas } = await supabase.from("ff_conferencia_notas").insert(notasRows);
        if (errNotas) throw errNotas;
      }

      setSessaoSalvaId(sessao.id);
      setDialogEmpresaAberto(false);
      toast.success("Auditoria salva no histórico");
    } catch (e) {
      const msg = getErrorMessage(e);
      console.error("Erro ao salvar histórico", e);
      toast.error("Erro ao salvar no histórico", { description: msg });
    } finally {
      setSalvandoHistorico(false);
    }
  }

  function handleClickSalvar() {
    if (sessaoSalvaId) {
      toast.info("Esta conferência já foi salva no histórico");
      return;
    }
    if (empresaAuto) {
      salvarNoHistorico(empresaAuto.id);
      return;
    }
    if (empresas.length === 0) {
      toast.warning("Nenhuma empresa cadastrada", {
        description: "Cadastre a empresa em Configurações → Empresas antes de salvar.",
      });
      return;
    }
    setEmpresaIdSelecionada("");
    setDialogEmpresaAberto(true);
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid flex-1 gap-3 text-sm md:grid-cols-3">
            <Info label="Razão social" value={resultado.empresa.razaoSocial || "—"} />
            <Info label="Inscrição estadual" value={resultado.empresa.ie || "—"} />
            <Info label="Período fiscal" value={resultado.empresa.periodo || "—"} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportarExcel}>
              <Download className="mr-1.5 h-4 w-4" /> Exportar Excel
            </Button>
            <Button
              size="sm"
              onClick={handleClickSalvar}
              disabled={salvandoHistorico || !!sessaoSalvaId}
            >
              {salvandoHistorico ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              {sessaoSalvaId ? "Salvo no histórico" : "Salvar no histórico"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card titulo="ICMS SEFAZ" valor={resultado.icmsSefaz} />
        <Card titulo="ICMS calculado (XMLs)" valor={icmsCalculadoTotal} />
        <Card
          titulo="Diferença"
          valor={diferencaTotal}
          destaque={diffOk ? "positivo" : "negativo"}
        />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between px-5 py-3 text-sm">
          <div className="font-semibold">
            Notas conferidas ({linhas.length})
          </div>
          <div className="text-xs text-muted-foreground">
            {resultado.estatisticas.xmlsRecebidos} XMLs recebidos ·{" "}
            {resultado.estatisticas.xmlsDescartados} descartados
          </div>
        </div>
        <TooltipProvider delayDuration={150}>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>nNF</TableHead>
              <TableHead>CNPJ emitente</TableHead>
              {mostrarColunasXML && <TableHead>UF</TableHead>}
              <TableHead className="text-right">Valor NF</TableHead>
              {mostrarColunasXML && <>
                <TableHead className="text-right">vProd</TableHead>
                <TableHead className="text-right">Frete</TableHead>
                <TableHead className="text-right">Seguro</TableHead>
                <TableHead className="text-right">Desconto</TableHead>
                <TableHead className="text-right">Outros</TableHead>
                <TableHead className="text-right">IPI</TableHead>
                <TableHead className="text-right">ICMS normal</TableHead>
                <TableHead className="text-right">{isIcmsAntecipado ? "Alíquota" : "DIFAL"}</TableHead>
              </>}
              <TableHead className="text-right">ICMS SEFAZ</TableHead>
              <TableHead className="text-right">{mostrarColunasXML ? "ICMS calculado" : "ICMS XML"}</TableHead>
              <TableHead className="text-right">Diferença</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={mostrarColunasXML ? 16 : 7} className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma nota encontrada no extrato.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((n) => {
                const k = `${n.nNF}|${n.cnpjEmitente}`;
                const aj = ajustes[k];
                const xi = n.xmlInfo;
                const aliqAntecipadoPct = n.memoria?.dataDocumento ? n.memoria.aliquotaInternaPct : n.memoria?.antecipacao?.aliquotaInternaPct;
                return (
                <TableRow key={`${n.nNF}-${n.cnpjEmitente}`}>
                  <TableCell className="font-mono text-xs">{n.nNF}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtCNPJ(n.cnpjEmitente)}</TableCell>
                  {mostrarColunasXML && <TableCell className="text-xs">{xi?.ufEmitente ?? "—"}</TableCell>}
                  <TableCell className="text-right">{fmtBRL(n.vNF)}</TableCell>
                  {mostrarColunasXML && <>
                    <TableCell className="text-right text-xs">{xi ? fmtBRL(xi.vProd) : "—"}</TableCell>
                    <TableCell className="text-right text-xs">{xi ? fmtBRL(xi.vFrete) : "—"}</TableCell>
                    <TableCell className="text-right text-xs">{xi ? fmtBRL(xi.vSeg) : "—"}</TableCell>
                    <TableCell className="text-right text-xs">{xi ? fmtBRL(xi.vDesc) : "—"}</TableCell>
                    <TableCell className="text-right text-xs">{xi ? fmtBRL(xi.vOutro) : "—"}</TableCell>
                    <TableCell className="text-right text-xs">{xi ? fmtBRL(xi.vIPI) : "—"}</TableCell>
                    <TableCell className="text-right text-xs">{xi ? fmtBRL(xi.vICMS) : "—"}</TableCell>
                    <TableCell className="text-right text-xs">
                      {aliqAntecipadoPct !== undefined
                        ? `${aliqAntecipadoPct.toString().replace(".", ",")}%`
                        : n.difalUsadoPct !== undefined
                          ? `${n.difalUsadoPct.toString().replace(".", ",")}%`
                          : "—"}
                    </TableCell>
                  </>}
                  <TableCell className="text-right">{fmtBRL(n.icmsSefaz)}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <span>{n.suportado ? fmtBRL(n.icmsCalculado) : "Pendente"}</span>
                      {aj && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="secondary" className="cursor-default text-[10px] py-0 px-1.5">
                              editado
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs space-y-1 text-xs">
                            <div><span className="opacity-70">Original:</span> {fmtBRL(aj.original)}</div>
                            <div><span className="opacity-70">Novo:</span> {fmtBRL(aj.novo)}</div>
                            <div><span className="opacity-70">Motivo:</span> {aj.motivo}</div>
                            <div className="opacity-70">
                              por {aj.usuarioEmail ?? "—"} · {new Date(aj.createdAt).toLocaleString("pt-BR")}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      n.diferenca > 0
                        ? "text-emerald-600"
                        : n.diferenca < 0
                          ? "text-destructive"
                          : "text-muted-foreground",
                    )}
                  >
                    {fmtBRL(n.diferenca)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setLinhaEdicao(n)}
                        title="Editar ICMS XML"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {n.memoria && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setLinhaSelecionada(n)}
                          title="Ver detalhes do cálculo"
                        >
                          <Search className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        </div>
        </TooltipProvider>
      </div>
      <MemoriaDialog
        linha={linhaSelecionada}
        onClose={() => setLinhaSelecionada(null)}
      />
      <EditarIcmsDialog
        linha={linhaEdicao}
        onClose={() => setLinhaEdicao(null)}
        onSalvar={async (valor, motivo) => {
          if (!linhaEdicao) return;
          await salvarAjuste(linhaEdicao, valor, motivo);
          setLinhaEdicao(null);
        }}
      />
      <Dialog open={dialogEmpresaAberto} onOpenChange={setDialogEmpresaAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Selecionar empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Não foi possível identificar a empresa pelo extrato (IE: {ie || "—"}).
              Escolha a empresa cadastrada para salvar esta auditoria no histórico.
            </p>
            <Select value={empresaIdSelecionada} onValueChange={setEmpresaIdSelecionada}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.razao_social}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={salvandoHistorico}>Cancelar</Button>
            </DialogClose>
            <Button
              disabled={!empresaIdSelecionada || salvandoHistorico}
              onClick={() => salvarNoHistorico(empresaIdSelecionada)}
            >
              {salvandoHistorico ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function Card({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: number;
  destaque?: "positivo" | "negativo";
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {titulo}
      </div>
      <div
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums",
          destaque === "positivo" && "text-emerald-600",
          destaque === "negativo" && "text-destructive",
        )}
      >
        {fmtBRL(valor)}
      </div>
    </div>
  );
}

function fmtChave(chave?: string) {
  if (!chave) return "—";
  return chave.replace(/(.{4})/g, "$1 ").trim();
}

function MemoriaDialog({
  linha,
  onClose,
}: {
  linha: LinhaConferencia | null;
  onClose: () => void;
}) {
  const open = linha !== null;
  const m = linha?.memoria;
  const diffOk = linha ? Math.abs(linha.diferenca) < 1 : false;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {linha && m && (
          <>
            <DialogHeader>
              <DialogTitle>Memória de cálculo — NF {linha.nNF}</DialogTitle>
            </DialogHeader>

            <div className="space-y-5 text-sm">
              {/* Identificação */}
              <section className="space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Identificação
                </div>
                <div className="grid gap-1">
                  <KV label="Emitente" value={linha.nomeEmitente} />
                  <KV label="CNPJ" value={fmtCNPJ(linha.cnpjEmitente)} />
                  <KV
                    label="Chave de acesso"
                    value={
                      <span className="break-all font-mono text-xs">
                        {fmtChave(linha.chaveAcesso)}
                      </span>
                    }
                  />
                  <KV label="Arquivo XML" value={linha.nomeArquivo ?? "—"} />
                </div>
              </section>

              {/* Aviso quando não suportado ou ST retida */}
              {m.motivoNaoSuportado && (
                <div
                  className={cn(
                    "rounded-md border p-3 text-sm",
                    m.stJaRetidaNaOrigem
                      ? "border-sky-500/40 bg-sky-500/5 text-sky-900 dark:text-sky-200"
                      : "border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200",
                  )}
                >
                  {m.motivoNaoSuportado}
                </div>
              )}

              {/* Base de cálculo + aplicação MVA — só se suportado e sem ST retida */}
              {m.suportado && !m.stJaRetidaNaOrigem && m.formulaCodigo === "ST_PESO_LEGISLACAO" && m.pesoLegis && (
                <MemoriaPesoLegislacao pesoLegis={m.pesoLegis} aliquotaPct={m.aliquotaInternaPct} />
              )}

              {m.suportado && m.formulaCodigo === "USO_E_CONSUMO" && m.usoConsumo && (
                <MemoriaUsoConsumo usoConsumo={m.usoConsumo} />
              )}

              {m.suportado && m.formulaCodigo === "ICMS_ANTECIPADO" && m.antecipacao && (
                <MemoriaIcmsAntecipado antecipacao={m.antecipacao} />
              )}

              {m.suportado && !m.stJaRetidaNaOrigem && m.formulaCodigo !== "FLUXO_VISUAL" && m.formulaCodigo !== "ST_PESO_LEGISLACAO" && m.formulaCodigo !== "USO_E_CONSUMO" && m.formulaCodigo !== "ICMS_ANTECIPADO" && (
                <>
                  <section className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Base de cálculo
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs">
                      <CalcRow label="Valor dos produtos (vProd)" sign="+" value={m.baseBrutaDetalhe.vProd} />
                      <CalcRow label="IPI (vIPI)" sign="+" value={m.baseBrutaDetalhe.vIPI} />
                      <CalcRow label="Frete (vFrete)" sign="+" value={m.baseBrutaDetalhe.vFrete} />
                      <CalcRow label="Seguro (vSeg)" sign="+" value={m.baseBrutaDetalhe.vSeg} />
                      <CalcRow label="Outros (vOutro)" sign="+" value={m.baseBrutaDetalhe.vOutro} />
                      <CalcRow label="Descontos (vDesc)" sign="−" value={m.baseBrutaDetalhe.vDesc} />
                      <div className="my-1 border-t border-border" />
                      <CalcRow label="Base bruta" sign="=" value={m.baseBruta} bold />
                    </div>
                  </section>

                  <section className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Aplicação da MVA e alíquota
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs">
                      <CalcRow label="Base bruta" value={m.baseBruta} />
                      <CalcRow
                        label={`× (1 + MVA ajustada)  (MVA aj. = ${m.mvaAjustadaPct.toFixed(2)}%)`}
                        rawRight={`× ${(1 + m.mvaAjustadaPct / 100).toFixed(4)}`}
                      />
                      <div className="my-1 border-t border-border" />
                      <CalcRow label="Base ST" value={m.baseST} />
                      <CalcRow
                        label="× Alíquota interna PE"
                        rawRight={`× ${m.aliquotaInternaPct.toFixed(2)}%`}
                      />
                      <div className="my-1 border-t border-border" />
                      <CalcRow label="ICMS total na operação interna" value={m.icmsTotal} />
                      <CalcRow
                        label="− ICMS destacado na origem (vICMS)"
                        sign="−"
                        value={m.vICMSOrigem}
                      />
                      <div className="my-1 border-t border-border" />
                      <CalcRow
                        label="ICMS antecipado calculado"
                        sign="="
                        value={m.icmsAntecipado}
                        bold
                      />
                    </div>
                  </section>
                </>
              )}

              {m.suportado && m.dataDocumento && (
                <section className="space-y-3">
                  <KV label="Data de emissão" value={m.dataDocumento} />
                  {(m.trace ?? []).map((p, i) => (
                    <div key={i} className="space-y-1 border-b border-border py-2">
                      <div className="flex justify-between gap-3"><span>{p.passo}</span><span className="font-mono shrink-0">{fmtBRL(p.valor)}</span></div>
                      {p.fundamento && <FonteLegal {...p.fundamento} />}
                    </div>
                  ))}
                  {m.avisos?.map((aviso, i) => <p key={i} className="text-muted-foreground">{aviso}</p>)}
                  {m.recolhimento && <><KV label="Código de receita" value={m.recolhimento.codigoReceita} /><p>{m.recolhimento.prazo}</p><FonteLegal {...m.recolhimento.fundamento} /></>}
                </section>
              )}

              {m.suportado && (m.trace?.length ?? 0) > 0 && (
                <ExplicacaoIA
                  passos={(m.trace ?? []).map((p) => ({ passo: p.passo, valor: p.valor, detalhe: p.detalhe, fundamento: p.fundamento }))}
                  avisos={m.avisos ?? []}
                  valor={linha.icmsCalculado}
                  dataRef={m.dataDocumento}
                />
              )}

              {/* Conferência */}
              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Conferência
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <MiniCard label="ICMS conforme SEFAZ" value={fmtBRL(linha.icmsSefaz)} />
                  <MiniCard label="ICMS calculado" value={fmtBRL(linha.icmsCalculado)} />
                  <MiniCard
                    label="Diferença"
                    value={fmtBRL(linha.diferenca)}
                    tone={diffOk ? "positivo" : "negativo"}
                  />
                </div>
                {!diffOk && (
                  <p className="text-xs text-muted-foreground">
                    {linha.diferenca < 0
                      ? "SEFAZ cobrou a menos do que o calculado."
                      : "SEFAZ cobrou a mais do que o calculado."}
                  </p>
                )}
              </section>

              {/* Trace passo a passo — só para lógicas que NÃO têm renderização estruturada */}
              {m.trace && m.trace.length > 0 && m.formulaCodigo !== "ST_PESO_LEGISLACAO" && m.formulaCodigo !== "USO_E_CONSUMO" && m.formulaCodigo !== "ICMS_ANTECIPADO" && (
                <section className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Memória passo a passo
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs space-y-0.5">
                    {m.trace.map((p, i) => (
                      <div key={i} className="flex items-baseline justify-between gap-4">
                        <span>
                          <span className="font-semibold">{p.passo}</span>
                          <span className="text-muted-foreground"> — {p.detalhe}</span>
                        </span>
                        <span className="tabular-nums">{fmtNum(p.valor)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Dados técnicos */}
              <Collapsible>
                <CollapsibleTrigger className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline">
                  Ver dados técnicos
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1 rounded-md border bg-muted/30 p-3 text-xs">
                  <KV
                    label="CSTs encontrados no XML"
                    value={m.cstsEncontrados.length ? m.cstsEncontrados.join(", ") : "—"}
                  />
                  <KV label="vST total no XML" value={fmtBRL(m.vST)} />
                  <KV
                    label="ST já retida na origem?"
                    value={m.stJaRetidaNaOrigem ? "Sim" : "Não"}
                  />
                </CollapsibleContent>
              </Collapsible>

            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Fechar</Button>
              </DialogClose>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function CalcRow({
  label,
  value,
  sign,
  rawRight,
  bold,
}: {
  label: string;
  value?: number;
  sign?: "+" | "−" | "=";
  rawRight?: string;
  bold?: boolean;
}) {
  const right =
    rawRight ??
    (value !== undefined
      ? `${sign && sign !== "=" ? sign + " " : sign === "=" ? "= " : ""}R$ ${value.toLocaleString(
          "pt-BR",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 },
        )}`
      : "");
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-0.5", bold && "font-bold")}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{right}</span>
    </div>
  );
}

function MiniCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positivo" | "negativo";
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-base font-semibold tabular-nums",
          tone === "positivo" && "text-emerald-600",
          tone === "negativo" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

const fmtKg = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kg";

const fmtUn = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const fmtMoneyKg = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function MemoriaPesoLegislacao({
  pesoLegis,
  aliquotaPct,
}: {
  pesoLegis: NonNullable<import("@/lib/fronteira/fronteiraFiscal").MemoriaCalculo["pesoLegis"]>;
  aliquotaPct: number;
}) {
  const v = pesoLegis.validacaoCruzada;
  return (
    <>
      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Dados da NF (do XML)
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-xs">
          <KV label="Peso bruto" value={fmtKg(pesoLegis.pesoBrutoNF)} />
          <KV label="Quantidade total" value={`${fmtUn(pesoLegis.quantidadeTotal)} unidades`} />
          <KV label="ICMS destacado (Σ vICMS)" value={fmtBRL(pesoLegis.icmsDestacadoNF)} />
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Cálculo item a item
        </div>
        <div className="overflow-x-auto rounded-md border bg-muted/30">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>NCM</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Peso un.</TableHead>
                <TableHead className="text-right">Peso total</TableHead>
                <TableHead className="text-right">Legisl. (R$/kg)</TableHead>
                <TableHead className="text-right">BC item</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pesoLegis.itens.map((it) => (
                <TableRow key={it.numero}>
                  <TableCell className="font-mono text-xs">{it.numero}</TableCell>
                  <TableCell className="text-xs">
                    {it.descricao || "—"}
                    {it.fontePeso === "MEDIA" && (
                      <span className="ml-1 text-[10px] text-amber-600">[peso médio]</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{it.ncm}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {fmtUn(it.qtd)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {fmtKg(it.pesoUnitario)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {fmtKg(it.pesoTotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {fmtMoneyKg(it.legislacao)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {fmtBRL(it.bcItem)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell />
                <TableCell>TOTAL</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums text-xs">
                  {fmtUn(pesoLegis.quantidadeTotal)}
                </TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums text-xs">
                  {fmtKg(v.somaPesos)}
                </TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums text-xs">
                  {fmtBRL(pesoLegis.bcTotal)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Validação cruzada
        </div>
        <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs">
          <div className="flex justify-between"><span>Soma dos pesos por item</span><span className="tabular-nums">{fmtKg(v.somaPesos)}</span></div>
          <div className="flex justify-between"><span>Peso bruto da NF (XML)</span><span className="tabular-nums">{fmtKg(v.pesoBrutoNF)}</span></div>
          <div className={cn("flex justify-between font-semibold", v.ok ? "text-emerald-600" : "text-amber-600")}>
            <span>Diferença</span>
            <span className="tabular-nums">{fmtKg(v.diferenca)} {v.ok ? "✓" : "⚠"}</span>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Aplicação da alíquota
        </div>
        <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs">
          <CalcRow label="Base de Cálculo total" value={pesoLegis.bcTotal} />
          <CalcRow label="× Alíquota interna" rawRight={`× ${aliquotaPct.toFixed(2)}%`} />
          <div className="my-1 border-t border-border" />
          <CalcRow label="ICMS bruto" sign="=" value={pesoLegis.icmsBruto} />
          <CalcRow label="− ICMS destacado na NF (Σ vICMS)" sign="−" value={pesoLegis.icmsDestacadoNF} />
          <div className="my-1 border-t border-border" />
          <CalcRow label="ICMS antecipado calculado" sign="=" value={pesoLegis.icmsCalculado} bold />
        </div>
      </section>

      {pesoLegis.avisos.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="mb-1 font-semibold">Avisos</div>
          <ul className="list-disc space-y-1 pl-4">
            {pesoLegis.avisos.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}

function MemoriaUsoConsumo({
  usoConsumo,
}: {
  usoConsumo: NonNullable<import("@/lib/fronteira/fronteiraFiscal").MemoriaCalculo["usoConsumo"]>;
}) {
  const u = usoConsumo;
  return (
    <>
      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Valores do XML (NF-e)
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-xs">
          <KV label="vProd (produtos)" value={fmtBRL(u.vProd)} />
          <KV label="vFrete" value={fmtBRL(u.vFrete)} />
          <KV label="vSeg" value={fmtBRL(u.vSeg)} />
          <KV label="vOutro" value={fmtBRL(u.vOutro)} />
          <KV label="vIPI" value={fmtBRL(u.vIPI)} />
          <KV label="vICMS (ICMS normal)" value={fmtBRL(u.vICMS)} />
          <KV
            label="vDesc (conferência)"
            value={<><span>{fmtBRL(u.vDesc)}</span><span className="ml-2 text-[10px] text-muted-foreground">não entra na fórmula</span></>}
          />
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          DIFAL (Diferencial de Alíquota)
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-xs">
          {u.fonteDifal === "xml" ? (
            <>
              <KV
                label="Alíquota interna do destino (XML — pICMSUFDest)"
                value={`${(u.aliqInternaDestPct ?? 0).toFixed(2).replace(".", ",")}%`}
              />
              <KV
                label="Alíquota interestadual (XML — pICMSInter)"
                value={`${(u.aliqInterestadualPct ?? 0).toFixed(2).replace(".", ",")}%`}
              />
              <KV
                label="DIFAL = interna − interestadual"
                value={<strong>{u.difalPercentual.toFixed(2).replace(".", ",")}%</strong>}
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                Valores lidos diretamente do grupo <code>ICMSUFDest</code> do XML.
              </p>
            </>
          ) : (
            <>
              <KV
                label="DIFAL (parâmetro da lógica — fallback)"
                value={<strong>{u.difalPercentual.toFixed(2).replace(".", ",")}%</strong>}
              />
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                O XML desta NF não contém o grupo <code>ICMSUFDest</code>. Foi usado o DIFAL cadastrado como fallback na lógica.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Cálculo Uso e Consumo
        </div>
        <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs">
          <CalcRow label="Valor dos produtos (vProd)" sign="+" value={u.vProd} />
          <CalcRow label="Despesas (vFrete + vSeg)" sign="+" value={u.despesas} />
          <CalcRow label="Outros (vOutro)" sign="+" value={u.vOutro} />
          <CalcRow label="IPI (vIPI)" sign="+" value={u.vIPI} />
          <CalcRow label="ICMS normal (vICMS)" sign="−" value={u.vICMS} />
          <div className="my-1 border-t border-border" />
          <CalcRow label="Base Uso e Consumo" sign="=" value={u.baseUsoConsumo} bold />
          <CalcRow label={`÷ divisor (${u.divisor.toString().replace(".", ",")})`} rawRight={`÷ ${u.divisor.toString().replace(".", ",")}`} />
          <div className="my-1 border-t border-border" />
          <CalcRow label="Base dividida" sign="=" value={u.baseDividida} />
          <CalcRow label={`× DIFAL ${u.difalPercentual.toString().replace(".", ",")}%`} rawRight={`× ${(u.difalPercentual / 100).toFixed(4)}`} />
          <div className="my-1 border-t border-border" />
          <CalcRow label="ICMS Uso e Consumo calculado" sign="=" value={u.icmsCalculado} bold />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Fórmula: <code>((vProd + vFrete + vSeg + vOutro + vIPI − vICMS) ÷ {u.divisor.toString().replace(".", ",")}) × ({u.difalPercentual.toString().replace(".", ",")}% ÷ 100)</code>
        </p>
      </section>
    </>
  );
}

function MemoriaIcmsAntecipado({
  antecipacao,
}: {
  antecipacao: NonNullable<import("@/lib/fronteira/fronteiraFiscal").MemoriaCalculo["antecipacao"]>;
}) {
  const a = antecipacao;
  return (
    <>
      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Valores do XML (NF-e)
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-xs">
          <KV label="vProd (produtos)" value={fmtBRL(a.vProd)} />
          <KV label="vFrete" value={fmtBRL(a.vFrete)} />
          <KV label="vSeg" value={fmtBRL(a.vSeg)} />
          <KV label="vOutro" value={fmtBRL(a.vOutro)} />
          <KV label="vIPI" value={fmtBRL(a.vIPI)} />
          <KV
            label="vICMS (ICMS normal)"
            value={<><span>{fmtBRL(a.vICMS)}</span><span className="ml-2 text-[10px] text-muted-foreground">crédito de origem</span></>}
          />
          <KV
            label="vDesc (conferência)"
            value={<><span>{fmtBRL(a.vDesc)}</span><span className="ml-2 text-[10px] text-muted-foreground">não entra na fórmula</span></>}
          />
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Cálculo ICMS Antecipado
        </div>
        <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs">
          <CalcRow label="Valor dos produtos (vProd)" sign="+" value={a.vProd} />
          <CalcRow label="Despesas (vFrete + vSeg)" sign="+" value={a.despesas} />
          <CalcRow label="Outros (vOutro)" sign="+" value={a.vOutro} />
          <CalcRow label="IPI (vIPI)" sign="+" value={a.vIPI} />
          <CalcRow label="ICMS normal (vICMS)" sign="−" value={a.vICMS} />
          <div className="my-1 border-t border-border" />
          <CalcRow label="Base" sign="=" value={a.base} bold />
          <CalcRow label={`÷ divisor (${a.divisor.toString().replace(".", ",")})`} rawRight={`÷ ${a.divisor.toString().replace(".", ",")}`} />
          <div className="my-1 border-t border-border" />
          <CalcRow label="Base dividida" sign="=" value={a.baseDividida} />
          <CalcRow label={`× Alíquota interna ${a.aliquotaInternaPct.toString().replace(".", ",")}%`} rawRight={`× ${(a.aliquotaInternaPct / 100).toFixed(4)}`} />
          <div className="my-1 border-t border-border" />
          <CalcRow label="ICMS bruto" sign="=" value={a.icmsBruto} />
          <CalcRow label="− vICMS (crédito de origem)" sign="−" value={a.vICMS} />
          <div className="my-1 border-t border-border" />
          <CalcRow label="ICMS Antecipado calculado" sign="=" value={a.icmsCalculado} bold />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Fórmula: <code>((vProd + vFrete + vSeg + vOutro + vIPI − vICMS) ÷ {a.divisor.toString().replace(".", ",")}) × {a.aliquotaInternaPct.toString().replace(".", ",")}% − vICMS</code>
        </p>
      </section>
    </>
  );
}

function EditarIcmsDialog({
  linha,
  onClose,
  onSalvar,
}: {
  linha: LinhaConferencia | null;
  onClose: () => void;
  onSalvar: (valor: number, motivo: string) => Promise<void>;
}) {
  const open = linha !== null;
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (linha) {
      setValor(linha.icmsCalculado.toFixed(2).replace(".", ","));
      setMotivo("");
    }
  }, [linha]);

  if (!linha) {
    return (
      <Dialog open={false} onOpenChange={() => onClose()}>
        <DialogContent />
      </Dialog>
    );
  }

  const novoValor = parseInputNumber(valor);
  const valorValido = Number.isFinite(novoValor) && novoValor >= 0;
  const alterado = valorValido && Math.abs(novoValor - linha.icmsCalculado) > 0.0001;
  const motivoOk = motivo.trim().length > 0;
  const podeSalvar = alterado && motivoOk && !salvando;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar ICMS XML — NF {linha.nNF}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Valor atual</span><span className="tabular-nums font-medium">{fmtBRL(linha.icmsCalculado)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">ICMS SEFAZ</span><span className="tabular-nums">{fmtBRL(linha.icmsSefaz)}</span></div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Novo ICMS XML (R$)</label>
            <Input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">
              Motivo da alteração <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Descreva o motivo do ajuste manual…"
              rows={3}
            />
            {!motivoOk && (
              <p className="text-[11px] text-muted-foreground">Obrigatório para salvar.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={salvando}>Cancelar</Button>
          </DialogClose>
          <Button
            disabled={!podeSalvar}
            onClick={async () => {
              setSalvando(true);
              try {
                await onSalvar(novoValor, motivo.trim());
              } finally {
                setSalvando(false);
              }
            }}
          >
            {salvando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
