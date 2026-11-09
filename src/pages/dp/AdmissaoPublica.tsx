import { useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm, Controller, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, FileDown, Loader2, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PublicShell } from "@/components/dp/PublicShell";
import { BUCKET_ADMISSOES, db } from "@/lib/dp/db";
import {
  CONTENT_TYPES_ACEITOS, CORES, ESTADOS_CIVIS, GRAUS_INSTRUCAO, MAX_FILE_BYTES, SEXOS, TIPOS_DOCUMENTO, UFS,
  admissaoSchema, sanitizarNomeArquivo, type Admissao, type AdmissaoForm,
} from "@/lib/dp/admissao";

const PASSOS: { titulo: string; campos: FieldPath<AdmissaoForm>[] }[] = [
  { titulo: "Empresa", campos: ["empresa_id", "departamento"] },
  { titulo: "Dados pessoais", campos: ["nome_completo", "data_nascimento", "telefone", "email", "endereco_rua", "endereco_cidade", "endereco_cep"] },
  { titulo: "Documentos", campos: ["cpf"] },
  { titulo: "Contrato", campos: ["funcao", "salario", "contrato_experiencia_dias"] },
  { titulo: "Anexos e envio", campos: [] },
];

const VAZIO: AdmissaoForm = {
  empresa_id: "", departamento: "", nome_completo: "", data_nascimento: "", naturalidade: "", sexo: "", estado_civil: "", cor: "",
  grau_instrucao: "", filiacao: "", telefone: "", email: "", endereco_rua: "", endereco_numero: "", endereco_complemento: "",
  endereco_bairro: "", endereco_cidade: "", endereco_cep: "", cpf: "", cpf_emissao: "", identidade_numero: "", identidade_orgao: "",
  identidade_expedicao: "", titulo_eleitor: "", titulo_zona: "", titulo_secao: "", habilitacao_numero: "", habilitacao_emissao: "",
  habilitacao_vencimento: "", reservista_numero: "", reservista_serie: "", pis_numero: "", pis_inscricao: "", ctps_numero: "",
  ctps_serie: "", ctps_uf: "", data_admissao: "", funcao: "", salario: "", contrato_experiencia: false, contrato_experiencia_dias: "",
  vale_transporte: false, observacoes_cliente: "",
};

function Campo({ label, erro, children, className }: { label: string; erro?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}

export default function AdmissaoPublica() {
  const { escritorio = "" } = useParams();
  const [passo, setPasso] = useState(0);
  const [arquivos, setArquivos] = useState<Record<string, File[]>>({});
  const [enviando, setEnviando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ protocolo: string; dados: Admissao; anexos: { tipo: string; nome_arquivo: string }[] } | null>(null);

  const empresas = useQuery({
    queryKey: ["dp-publico-empresas", escritorio],
    queryFn: async () => {
      const { data, error } = await db.rpc("dp_publico_empresas", { p_escritorio: escritorio });
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
    retry: false,
  });

  const form = useForm<AdmissaoForm>({ resolver: zodResolver(admissaoSchema), defaultValues: VAZIO, mode: "onTouched" });
  const { register, control, formState: { errors }, trigger, watch, handleSubmit } = form;
  const experiencia = watch("contrato_experiencia");

  const avancar = async () => {
    if (await trigger(PASSOS[passo].campos)) { setPasso((p) => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }
  };

  const adicionarArquivos = (tipo: string, lista: FileList | null) => {
    if (!lista) return;
    const validos = [...lista].filter((f) => {
      if (f.size > MAX_FILE_BYTES) { toast.error(`${f.name}: acima de 15 MB.`); return false; }
      if (f.type && !CONTENT_TYPES_ACEITOS.includes(f.type)) { toast.error(`${f.name}: envie PDF, JPG ou PNG.`); return false; }
      return true;
    });
    setArquivos((a) => ({ ...a, [tipo]: [...(a[tipo] ?? []), ...validos] }));
  };

  const enviar = handleSubmit(async (dados) => {
    const faltando = TIPOS_DOCUMENTO.filter((t) => t.obrigatorio && !(arquivos[t.id]?.length));
    if (faltando.length) { toast.error(`Anexe: ${faltando.map((f) => f.label).join(", ")}`); return; }
    setEnviando("Registrando a ficha…");
    try {
      const payload = { ...dados, salario: dados.salario ? String(dados.salario).replace(/\./g, "").replace(",", ".") : "" };
      const { data: criada, error } = await db.rpc("dp_publico_criar_admissao", { p_escritorio: escritorio, p_empresa_id: dados.empresa_id, p_dados: payload });
      if (error || !criada?.[0]) throw new Error("Não foi possível registrar a ficha. Tente novamente.");
      const { id, protocolo } = criada[0] as { id: string; protocolo: string };

      const lista = Object.entries(arquivos).flatMap(([tipo, fs]) => fs.map((f) => ({ tipo, f })));
      const enviados: { tipo: string; nome_arquivo: string; storage_path: string; tamanho: number; content_type: string }[] = [];
      for (const [i, { tipo, f }] of lista.entries()) {
        setEnviando(`Enviando arquivo ${i + 1} de ${lista.length}…`);
        const caminho = `${id}/${tipo}/${crypto.randomUUID()}-${sanitizarNomeArquivo(f.name)}`;
        const { error: e } = await db.storage.from(BUCKET_ADMISSOES).upload(caminho, f, { contentType: f.type || undefined });
        if (e) throw new Error(`Falha ao enviar ${f.name}. Verifique sua conexão e tente novamente.`);
        enviados.push({ tipo, nome_arquivo: f.name, storage_path: caminho, tamanho: f.size, content_type: f.type });
      }
      if (enviados.length) {
        const { error: e } = await db.rpc("dp_publico_registrar_arquivos", { p_admissao: id, p_protocolo: protocolo, p_arquivos: enviados });
        if (e) throw new Error("Os arquivos foram enviados mas não puderam ser registrados. Fale com a Diretriz.");
      }
      const empresaNome = empresas.data?.find((e) => e.id === dados.empresa_id)?.nome ?? "";
      setResultado({
        protocolo,
        dados: { ...payload, id, protocolo, status: "recebido", empresa_nome: empresaNome, created_at: new Date().toISOString() } as unknown as Admissao,
        anexos: enviados,
      });
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(null);
    }
  }, () => toast.error("Revise os campos destacados nas etapas anteriores."));

  if (empresas.isError) {
    return <PublicShell><Card><CardContent className="p-10 text-center">Link inválido. Peça um novo link à Diretriz Contabilidade.</CardContent></Card></PublicShell>;
  }

  if (resultado) {
    return (
      <PublicShell subtitulo="Ficha de admissão">
        <Card className="mx-auto max-w-xl">
          <CardContent className="space-y-4 p-10 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="text-2xl font-semibold">Ficha enviada com sucesso</h1>
            <p className="text-muted-foreground">Guarde o número do protocolo. A equipe de Departamento Pessoal da Diretriz já recebeu os dados e documentos.</p>
            <p className="text-2xl font-bold tracking-wider text-[#ED3237]">{resultado.protocolo}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={async () => {
                const { gerarPdfAdmissao } = await import("@/lib/dp/admissao-pdf");
                gerarPdfAdmissao(resultado.dados, resultado.anexos).save(`${resultado.protocolo}.pdf`);
              }}><FileDown className="mr-2 h-4 w-4" />Baixar comprovante (PDF)</Button>
              <Button onClick={() => { form.reset(VAZIO); setArquivos({}); setPasso(0); setResultado(null); }}>Enviar outra ficha</Button>
            </div>
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  const sel = (nome: FieldPath<AdmissaoForm>, opcoes: string[], placeholder = "Selecione") => (
    <Controller control={control} name={nome} render={({ field }) => (
      <Select value={(field.value as string) || undefined} onValueChange={field.onChange}>
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>{opcoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    )} />
  );
  const e = (n: keyof AdmissaoForm) => errors[n]?.message as string | undefined;

  return (
    <PublicShell subtitulo="Ficha de admissão">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-[#ED3237]">Departamento Pessoal</p>
          <h1 className="text-3xl font-semibold text-[#10143D]">Ficha de admissão de funcionário</h1>
          <p className="mt-1 text-muted-foreground">Preencha os dados do novo colaborador e anexe os documentos. Nada de mandar por WhatsApp. 🙂</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Etapa {passo + 1} de {PASSOS.length}: <b className="text-foreground">{PASSOS[passo].titulo}</b></span>
            <span>{Math.round(((passo + 1) / PASSOS.length) * 100)}%</span>
          </div>
          <Progress value={((passo + 1) / PASSOS.length) * 100} />
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={(ev) => ev.preventDefault()} className="grid gap-4 md:grid-cols-2">
              {passo === 0 && (
                <>
                  <Campo label="Empresa contratante *" erro={e("empresa_id")} className="md:col-span-2">
                    {empresas.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : (
                      <Controller control={control} name="empresa_id" render={({ field }) => (
                        <Select value={field.value || undefined} onValueChange={field.onChange}>
                          <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                          <SelectContent>{(empresas.data ?? []).map((emp) => <SelectItem key={emp.id} value={emp.id}>{emp.nome}</SelectItem>)}</SelectContent>
                        </Select>
                      )} />
                    )}
                  </Campo>
                  <Campo label="Departamento / setor" erro={e("departamento")} className="md:col-span-2">
                    <Input {...register("departamento")} placeholder="Ex.: Produção" />
                  </Campo>
                </>
              )}

              {passo === 1 && (
                <>
                  <Campo label="Nome completo *" erro={e("nome_completo")} className="md:col-span-2"><Input {...register("nome_completo")} /></Campo>
                  <Campo label="Data de nascimento" erro={e("data_nascimento")}><Input type="date" {...register("data_nascimento")} /></Campo>
                  <Campo label="Naturalidade"><Input {...register("naturalidade")} placeholder="Cidade / UF" /></Campo>
                  <Campo label="Sexo">{sel("sexo", SEXOS)}</Campo>
                  <Campo label="Estado civil">{sel("estado_civil", ESTADOS_CIVIS)}</Campo>
                  <Campo label="Cor / raça">{sel("cor", CORES)}</Campo>
                  <Campo label="Grau de instrução">{sel("grau_instrucao", GRAUS_INSTRUCAO)}</Campo>
                  <Campo label="Filiação (pai e mãe)" className="md:col-span-2"><Input {...register("filiacao")} /></Campo>
                  <Campo label="Telefone *" erro={e("telefone")}><Input {...register("telefone")} placeholder="(81) 99999-9999" inputMode="tel" /></Campo>
                  <Campo label="E-mail *" erro={e("email")}><Input type="email" {...register("email")} /></Campo>
                  <Campo label="Endereço (rua) *" erro={e("endereco_rua")} className="md:col-span-2"><Input {...register("endereco_rua")} /></Campo>
                  <Campo label="Número"><Input {...register("endereco_numero")} /></Campo>
                  <Campo label="Complemento"><Input {...register("endereco_complemento")} /></Campo>
                  <Campo label="Bairro"><Input {...register("endereco_bairro")} /></Campo>
                  <Campo label="Cidade *" erro={e("endereco_cidade")}><Input {...register("endereco_cidade")} /></Campo>
                  <Campo label="CEP *" erro={e("endereco_cep")}><Input {...register("endereco_cep")} placeholder="00000-000" inputMode="numeric" /></Campo>
                </>
              )}

              {passo === 2 && (
                <>
                  <Campo label="CPF *" erro={e("cpf")}><Input {...register("cpf")} placeholder="000.000.000-00" inputMode="numeric" /></Campo>
                  <Campo label="Data de emissão do CPF"><Input type="date" {...register("cpf_emissao")} /></Campo>
                  <Campo label="Identidade nº"><Input {...register("identidade_numero")} /></Campo>
                  <Campo label="Órgão emissor / UF"><Input {...register("identidade_orgao")} placeholder="SDS/PE" /></Campo>
                  <Campo label="Data de expedição"><Input type="date" {...register("identidade_expedicao")} /></Campo>
                  <Campo label="Título de eleitor"><Input {...register("titulo_eleitor")} /></Campo>
                  <Campo label="Zona"><Input {...register("titulo_zona")} /></Campo>
                  <Campo label="Seção"><Input {...register("titulo_secao")} /></Campo>
                  <Campo label="Habilitação nº"><Input {...register("habilitacao_numero")} /></Campo>
                  <Campo label="Emissão da CNH"><Input type="date" {...register("habilitacao_emissao")} /></Campo>
                  <Campo label="Vencimento da CNH"><Input type="date" {...register("habilitacao_vencimento")} /></Campo>
                  <Campo label="Reservista nº"><Input {...register("reservista_numero")} /></Campo>
                  <Campo label="Série do reservista"><Input {...register("reservista_serie")} /></Campo>
                  <Campo label="PIS nº"><Input {...register("pis_numero")} /></Campo>
                  <Campo label="Data de inscrição no PIS"><Input type="date" {...register("pis_inscricao")} /></Campo>
                  <Campo label="CTPS nº"><Input {...register("ctps_numero")} /></Campo>
                  <Campo label="Série da CTPS"><Input {...register("ctps_serie")} /></Campo>
                  <Campo label="UF da CTPS">{sel("ctps_uf", UFS)}</Campo>
                </>
              )}

              {passo === 3 && (
                <>
                  <Campo label="Função *" erro={e("funcao")}><Input {...register("funcao")} /></Campo>
                  <Campo label="Salário (R$)" erro={e("salario")}><Input {...register("salario")} placeholder="1.518,00" inputMode="decimal" /></Campo>
                  <Campo label="Data de admissão"><Input type="date" {...register("data_admissao")} /></Campo>
                  <div className="flex flex-col justify-end gap-3 pb-1">
                    <Controller control={control} name="vale_transporte" render={({ field }) => (
                      <label className="flex items-center gap-2 text-sm"><Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />Vale transporte</label>
                    )} />
                    <Controller control={control} name="contrato_experiencia" render={({ field }) => (
                      <label className="flex items-center gap-2 text-sm"><Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />Contrato de experiência</label>
                    )} />
                  </div>
                  {experiencia && <Campo label="Prazo da experiência (dias)"><Input type="number" min={1} max={90} {...register("contrato_experiencia_dias")} /></Campo>}
                  <Campo label="Observações" className="md:col-span-2"><Textarea rows={4} {...register("observacoes_cliente")} placeholder="Horário, benefícios, informações adicionais…" /></Campo>
                </>
              )}

              {passo === 4 && (
                <div className="space-y-3 md:col-span-2">
                  <p className="text-sm text-muted-foreground">Envie fotos ou PDFs legíveis (até 15 MB cada). Os itens com * são obrigatórios.</p>
                  {TIPOS_DOCUMENTO.map((t) => (
                    <div key={t.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{t.label}{t.obrigatorio ? " *" : ""}</p>
                          {t.ajuda && <p className="text-xs text-muted-foreground">{t.ajuda}</p>}
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:border-primary">
                          <Paperclip className="h-4 w-4" />Anexar
                          <input type="file" multiple hidden accept=".pdf,image/*" onChange={(ev) => { adicionarArquivos(t.id, ev.target.files); ev.target.value = ""; }} />
                        </label>
                      </div>
                      {(arquivos[t.id] ?? []).map((f, i) => (
                        <div key={i} className="mt-2 flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-xs">
                          <span className="truncate">{f.name}</span>
                          <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setArquivos((a) => ({ ...a, [t.id]: a[t.id].filter((_, k) => k !== i) }))}><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" disabled={passo === 0 || !!enviando} onClick={() => setPasso((p) => p - 1)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
          {passo < PASSOS.length - 1 ? (
            <Button onClick={avancar}>Continuar<ArrowRight className="ml-2 h-4 w-4" /></Button>
          ) : (
            <Button onClick={enviar} disabled={!!enviando} className="bg-[#ED3237] hover:bg-[#d42a2f]">
              {enviando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{enviando}</> : <><Send className="mr-2 h-4 w-4" />Enviar ficha</>}
            </Button>
          )}
        </div>
      </div>
    </PublicShell>
  );
}
