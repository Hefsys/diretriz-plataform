import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { sujeitoAntecipacaoPadrao } from "@/lib/fronteira/fiscal-pe/entrada-motor";

import { db as supabase } from "@/lib/dp/db";
type Json = unknown;
import { useAuth } from "@/contexts/AuthContext";
import {
  CALCULO_POR_OPCOES,
  DESTINACOES_PADRAO,
  FLAGS_ANTECIPACAO,
  FLAGS_BENEFICIOS,
  FLAGS_DEFAULT,
  LOCALIZACOES,
  PORTES,
  REGIMES,
  SISTEMATICAS,
  TIPOS_EMPRESA,
  type PerfilFlagsExtended,
} from "./perfil-options";

const cnaeSchema = z
  .string()
  .trim()
  .min(1, "CNAE é obrigatório")
  .transform((v) => v.replace(/[.\s-]/g, ""))
  .refine((v) => {
    const parts = v.split("/").filter(Boolean);
    if (parts.length === 0) return false;
    return parts.every((p) => /^\d{7}$/.test(p));
  }, "CNAE deve ter 7 dígitos numéricos (separe múltiplos por /)");

const schema = z.object({
  // Aba 1
  cnae: cnaeSchema,
  tipo_empresa: z.enum(TIPOS_EMPRESA, { message: "Selecione o tipo de empresa" }),
  porte: z.enum(PORTES, { message: "Selecione o porte" }),
  regime: z.enum(REGIMES, { message: "Selecione o regime tributário" }),
  industria_ou_equiparado: z.boolean(),

  // Aba 2 — flags booleanas
  incentivo_fiscal: z.boolean(),
  excluir_frete_calculo: z.boolean(),
  incluir_ipi_frete_outras: z.boolean(),
  calculo_manual: z.boolean(),
  st_exige_cest: z.boolean(),
  desconto_incondicional_calcula: z.boolean(),
  considerar_dentro_estado: z.boolean(),
  empresa_regular_fisco: z.boolean(),

  // Aba 2 — motor oficial de antecipação
  sujeito_antecipacao: z.boolean(),
  regular_339a: z.boolean(),
  agreste_anexo19: z.boolean(),
  credenciado_38455: z.boolean(),
  sistemista_prodeauto: z.boolean(),
  dispensa_mva: z.boolean(),
  atividade_suspensa: z.boolean(),
  destinacao_padrao: z.enum(["COMERCIALIZACAO", "INDUSTRIALIZACAO", "USO_CONSUMO", "ATIVO"]),

  // Aba 3
  localizacao: z.enum(LOCALIZACOES, { message: "Selecione a localização" }),
  criterio_localizacao: z.string().trim().max(200).optional().or(z.literal("")),
  sistematicas_especiais: z.array(z.string()),

  // Aba 4
  aliquota_interna_default: z
    .number({ message: "Informe a alíquota" })
    .min(0, "Mínimo 0%")
    .max(100, "Máximo 100%"),
  calculo_por: z.enum(["extrato", "emissao"]),
  considerar_origem_cst_chave: z.boolean(),

  // Rodapé
  vigencia_inicio: z.date({ message: "Informe a data de vigência" }),
  observacoes: z.string().trim().max(500, "Máximo 500 caracteres").optional().or(z.literal("")),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export interface PerfilExistente {
  id: string;
  cnae: string | null;
  porte: string | null;
  regime: string | null;
  aliquota_interna_default: number | null;
  sistematicas_especiais: string[] | null;
  flags: PerfilFlagsExtended | null;
  vigencia_inicio: string;
}

interface NovoPerfilDialogProps {
  empresaId: string;
  perfilVigente?: PerfilExistente | null;
  trigger: ReactNode;
}

type AbaId = "identificacao" | "beneficios" | "localizacao" | "calculo";

const ABA_FIELDS: Record<AbaId, (keyof FormInput)[]> = {
  identificacao: ["cnae", "tipo_empresa", "porte", "regime", "industria_ou_equiparado"],
  beneficios: [
    "incentivo_fiscal",
    "excluir_frete_calculo",
    "incluir_ipi_frete_outras",
    "calculo_manual",
    "st_exige_cest",
    "desconto_incondicional_calcula",
    "considerar_dentro_estado",
    "empresa_regular_fisco",
    "sujeito_antecipacao",
    "regular_339a",
    "agreste_anexo19",
    "credenciado_38455",
    "sistemista_prodeauto",
    "dispensa_mva",
    "atividade_suspensa",
    "destinacao_padrao",
  ],
  localizacao: ["localizacao", "criterio_localizacao", "sistematicas_especiais"],
  calculo: ["aliquota_interna_default", "calculo_por", "considerar_origem_cst_chave"],
};

export function NovoPerfilDialog({ empresaId, perfilVigente, trigger }: NovoPerfilDialogProps) {
  const isEdit = !!perfilVigente;
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [aba, setAba] = useState<AbaId>("identificacao");
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const defaults = useMemo<FormInput>(() => {
    const f = { ...FLAGS_DEFAULT, ...(perfilVigente?.flags ?? {}) };
    return {
      cnae: perfilVigente?.cnae ?? "",
      tipo_empresa: f.tipo_empresa ?? TIPOS_EMPRESA[0],
      porte: (perfilVigente?.porte as FormInput["porte"]) ?? PORTES[0],
      regime: (perfilVigente?.regime as FormInput["regime"]) ?? REGIMES[1],
      industria_ou_equiparado: f.industria_ou_equiparado,

      incentivo_fiscal: f.incentivo_fiscal,
      excluir_frete_calculo: f.excluir_frete_calculo,
      incluir_ipi_frete_outras: f.incluir_ipi_frete_outras,
      calculo_manual: f.calculo_manual,
      st_exige_cest: f.st_exige_cest,
      desconto_incondicional_calcula: f.desconto_incondicional_calcula,
      considerar_dentro_estado: f.considerar_dentro_estado,
      empresa_regular_fisco: f.empresa_regular_fisco,

      sujeito_antecipacao: f.sujeito_antecipacao ?? sujeitoAntecipacaoPadrao({ ...f, tipo_empresa: f.tipo_empresa ?? TIPOS_EMPRESA[0] }),
      regular_339a: f.regular_339a ?? false,
      agreste_anexo19: f.agreste_anexo19 ?? false,
      credenciado_38455: f.credenciado_38455 ?? false,
      sistemista_prodeauto: f.sistemista_prodeauto ?? false,
      dispensa_mva: f.dispensa_mva ?? false,
      atividade_suspensa: f.atividade_suspensa ?? false,
      destinacao_padrao: f.destinacao_padrao ?? "COMERCIALIZACAO",

      localizacao: f.localizacao ?? LOCALIZACOES[0],
      criterio_localizacao: f.criterio_localizacao ?? "",
      sistematicas_especiais: perfilVigente?.sistematicas_especiais ?? [],

      aliquota_interna_default: perfilVigente?.aliquota_interna_default ?? 20.5,
      calculo_por: f.calculo_por ?? "extrato",
      considerar_origem_cst_chave: f.considerar_origem_cst_chave ?? false,

      vigencia_inicio: new Date(),
      observacoes: "",
    };
  }, [perfilVigente]);

  const form = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    mode: "onBlur",
  });

  useEffect(() => {
    if (open) {
      form.reset(defaults);
      setAba("identificacao");
    }
  }, [open, defaults, form]);

  const errors = form.formState.errors;

  const errosPorAba = useMemo<Record<AbaId, boolean>>(() => {
    const out: Record<AbaId, boolean> = {
      identificacao: false,
      beneficios: false,
      localizacao: false,
      calculo: false,
    };
    (Object.keys(ABA_FIELDS) as AbaId[]).forEach((id) => {
      out[id] = ABA_FIELDS[id].some((field) => Boolean(errors[field]));
    });
    return out;
  }, [errors]);

  async function onSubmit(raw: FormInput) {
    const values = raw as unknown as FormOutput;
    setSubmitting(true);
    try {
      const novaVigenciaISO = format(values.vigencia_inicio, "yyyy-MM-dd");

      // 1. Encerrar perfil vigente atual (se houver)
      const { data: vigentes, error: errVig } = await supabase
        .from("ff_perfis_fiscais")
        .select("id, vigencia_inicio")
        .eq("empresa_id", empresaId)
        .is("vigencia_fim", null);
      if (errVig) throw errVig;

      const fimAnterior = new Date(values.vigencia_inicio);
      fimAnterior.setDate(fimAnterior.getDate() - 1);
      const fimAnteriorISO = format(fimAnterior, "yyyy-MM-dd");

      if (vigentes && vigentes.length > 0) {
        const ids = vigentes.map((v) => v.id);
        const { error: errClose } = await supabase
          .from("ff_perfis_fiscais")
          .update({ vigencia_fim: fimAnteriorISO })
          .in("id", ids);
        if (errClose) throw errClose;
      }

      // 2. Inserir novo perfil
      const flags: PerfilFlagsExtended = {
        incentivo_fiscal: values.incentivo_fiscal,
        excluir_frete_calculo: values.excluir_frete_calculo,
        incluir_ipi_frete_outras: values.incluir_ipi_frete_outras,
        calculo_manual: values.calculo_manual,
        st_exige_cest: values.st_exige_cest,
        desconto_incondicional_calcula: values.desconto_incondicional_calcula,
        considerar_dentro_estado: values.considerar_dentro_estado,
        empresa_regular_fisco: values.empresa_regular_fisco,
        industria_ou_equiparado: values.industria_ou_equiparado,
        tipo_empresa: values.tipo_empresa,
        localizacao: values.localizacao,
        criterio_localizacao: values.criterio_localizacao || undefined,
        calculo_por: values.calculo_por,
        considerar_origem_cst_chave: values.considerar_origem_cst_chave,
        sujeito_antecipacao: values.sujeito_antecipacao,
        regular_339a: values.regular_339a,
        agreste_anexo19: values.agreste_anexo19,
        credenciado_38455: values.credenciado_38455,
        sistemista_prodeauto: values.sistemista_prodeauto,
        dispensa_mva: values.dispensa_mva,
        atividade_suspensa: values.atividade_suspensa,
        destinacao_padrao: values.destinacao_padrao,
      };

      const cnaeNorm = values.cnae.replace(/[.\s-]/g, "");
      const cnaeParts = cnaeNorm.split("/").filter(Boolean);
      const sistematicasArr = [...values.sistematicas_especiais];
      if (values.observacoes && values.observacoes.trim()) {
        sistematicasArr.push(`__obs:${values.observacoes.trim()}`);
      }

      const { error: errIns } = await supabase.from("ff_perfis_fiscais").insert([
        {
          empresa_id: empresaId,
          cnae: cnaeParts.join("/"),
          porte: values.porte,
          regime: values.regime,
          aliquota_interna_default: values.aliquota_interna_default,
          sistematicas_especiais: sistematicasArr,
          flags: flags as unknown as Json,
          vigencia_inicio: novaVigenciaISO,
          vigencia_fim: null,
          created_by: user?.id ?? null,
        },
      ]);
      if (errIns) throw errIns;

      toast.success("Perfil fiscal atualizado");
      await queryClient.invalidateQueries({ queryKey: ["perfis-fiscais", empresaId] });
      await queryClient.invalidateQueries({ queryKey: ["perfil-fiscal", empresaId] });
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error("Erro ao salvar perfil fiscal", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  function onInvalid() {
    const primeiroComErro = (Object.keys(ABA_FIELDS) as AbaId[]).find(
      (id) => errosPorAba[id],
    );
    if (primeiroComErro) setAba(primeiroComErro);
    toast.error("Verifique os campos destacados antes de salvar");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar perfil fiscal" : "Configurar perfil fiscal"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Ao salvar, o perfil vigente será encerrado e uma nova versão será criada."
              : "Configure regime, benefícios e parâmetros que o motor de cálculo usará para auditar esta empresa."}
          </DialogDescription>
        </DialogHeader>

        <TooltipProvider delayDuration={150}>
          <form
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            className="space-y-5"
            noValidate
          >
            <Tabs value={aba} onValueChange={(v) => setAba(v as AbaId)}>
              <TabsList className="grid w-full grid-cols-4">
                {(
                  [
                    { id: "identificacao", label: "Identificação" },
                    { id: "beneficios", label: "Benefícios e Flags" },
                    { id: "localizacao", label: "Localização" },
                    { id: "calculo", label: "Parâmetros" },
                  ] as { id: AbaId; label: string }[]
                ).map((t) => (
                  <TabsTrigger key={t.id} value={t.id} className="relative">
                    <span className="truncate">{t.label}</span>
                    {errosPorAba[t.id] && (
                      <span
                        aria-label="Há campos com erro nesta aba"
                        className="ml-1.5 inline-block h-2 w-2 rounded-full bg-destructive"
                      />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Aba 1: Identificação */}
              <TabsContent value="identificacao" className="mt-5 space-y-4">
                <FieldRow
                  label="CNAE"
                  htmlFor="cnae"
                  tooltip="7 dígitos numéricos. Para múltiplos CNAEs, separe por barra (ex: 4772500/4773300)."
                  error={errors.cnae?.message}
                  required
                >
                  <Input
                    id="cnae"
                    inputMode="numeric"
                    placeholder="0000000 ou 0000000/0000000"
                    className="tabular"
                    {...form.register("cnae")}
                  />
                </FieldRow>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldRow
                    label="Tipo de empresa"
                    error={errors.tipo_empresa?.message}
                    required
                  >
                    <Controller
                      control={form.control}
                      name="tipo_empresa"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TIPOS_EMPRESA.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </FieldRow>

                  <FieldRow label="Porte" error={errors.porte?.message} required>
                    <Controller
                      control={form.control}
                      name="porte"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PORTES.map((p) => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </FieldRow>
                </div>

                <FieldRow
                  label="Regime tributário"
                  error={errors.regime?.message}
                  required
                >
                  <Controller
                    control={form.control}
                    name="regime"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {REGIMES.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FieldRow>

                <SwitchRow
                  label="Indústria ou equiparado"
                  tooltip="Marque quando a empresa for indústria ou equiparada a indústria. Interage com o tipo de empresa."
                  name="industria_ou_equiparado"
                  control={form.control}
                />
              </TabsContent>

              {/* Aba 2: Benefícios */}
              <TabsContent value="beneficios" className="mt-5">
                <div className="space-y-1 rounded-lg border border-border divide-y divide-border">
                  {FLAGS_BENEFICIOS.map((f) => (
                    <SwitchRow
                      key={f.key}
                      label={f.label}
                      tooltip={f.tooltip}
                      name={f.key}
                      control={form.control}
                      compact
                    />
                  ))}
                </div>

                <div className="mt-6">
                  <Label className="text-sm">Antecipação tributária (motor oficial SEFAZ-PE)</Label>
                  <p className="text-xs text-muted-foreground">
                    Flags que o motor oficial usa na antecipação e no diferencial de alíquotas.
                  </p>
                  <div className="mt-2 space-y-1 rounded-lg border border-border divide-y divide-border">
                    {FLAGS_ANTECIPACAO.map((f) => (
                      <SwitchRow
                        key={f.key}
                        label={f.label}
                        tooltip={f.tooltip}
                        name={f.key}
                        control={form.control}
                        compact
                      />
                    ))}
                  </div>
                  <div className="mt-4">
                    <FieldRow
                      label="Destinação padrão das mercadorias"
                      tooltip="Usada pelo motor oficial quando a nota não indica uso/consumo ou ativo (CFOP)."
                      error={errors.destinacao_padrao?.message}
                    >
                      <Controller
                        control={form.control}
                        name="destinacao_padrao"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DESTINACOES_PADRAO.map((d) => (
                                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </FieldRow>
                  </div>
                </div>
              </TabsContent>

              {/* Aba 3: Localização */}
              <TabsContent value="localizacao" className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldRow
                    label="Localização"
                    error={errors.localizacao?.message}
                    required
                  >
                    <Controller
                      control={form.control}
                      name="localizacao"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {LOCALIZACOES.map((l) => (
                              <SelectItem key={l} value={l}>{l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </FieldRow>

                  <FieldRow
                    label="Critério adicional"
                    htmlFor="criterio_localizacao"
                    tooltip="Texto livre para casos não cobertos pela seleção padrão."
                    error={errors.criterio_localizacao?.message}
                  >
                    <Input
                      id="criterio_localizacao"
                      placeholder="Opcional"
                      {...form.register("criterio_localizacao")}
                    />
                  </FieldRow>
                </div>

                <div>
                  <Label className="text-sm">Sistemáticas Especiais</Label>
                  <p className="text-xs text-muted-foreground">
                    Selecione todas que se aplicam a esta empresa.
                  </p>
                  <Controller
                    control={form.control}
                    name="sistematicas_especiais"
                    render={({ field }) => (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {SISTEMATICAS.map((s) => {
                          const checked = field.value.includes(s.value);
                          return (
                            <label
                              key={s.value}
                              className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 hover:bg-muted/40"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  const next = v
                                    ? [...field.value, s.value]
                                    : field.value.filter((x) => x !== s.value);
                                  field.onChange(next);
                                }}
                                className="mt-0.5"
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-1 text-sm font-medium text-foreground">
                                  {s.label}
                                  <InfoTooltip text={s.tooltip} />
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  />
                </div>
              </TabsContent>

              {/* Aba 4: Parâmetros */}
              <TabsContent value="calculo" className="mt-5 space-y-4">
                <FieldRow
                  label="% ICMS interno default"
                  htmlFor="aliquota"
                  tooltip="Alíquota interna de PE aplicada quando não há percentual específico cadastrado para o NCM do item. Atualmente PE = 20,5% (lei 18.305/2023)."
                  error={errors.aliquota_interna_default?.message}
                  required
                >
                  <div className="relative">
                    <Input
                      id="aliquota"
                      type="number"
                      step="0.01"
                      className="pr-8 tabular"
                      {...form.register("aliquota_interna_default", { valueAsNumber: true })}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      %
                    </span>
                  </div>
                </FieldRow>

                <div>
                  <div className="mb-2 flex items-center gap-1">
                    <Label className="text-sm">Cálculo por</Label>
                    <InfoTooltip text="Define se o motor processa apenas XMLs do extrato SEFAZ ou todos os XMLs emitidos no período." />
                  </div>
                  <Controller
                    control={form.control}
                    name="calculo_por"
                    render={({ field }) => (
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="space-y-2"
                      >
                        {CALCULO_POR_OPCOES.map((opt) => (
                          <label
                            key={opt.value}
                            className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/40"
                          >
                            <RadioGroupItem value={opt.value} className="mt-0.5" />
                            <div>
                              <div className="text-sm font-medium text-foreground">{opt.label}</div>
                              <div className="text-xs text-muted-foreground">{opt.description}</div>
                            </div>
                          </label>
                        ))}
                      </RadioGroup>
                    )}
                  />
                </div>

                <Controller
                  control={form.control}
                  name="considerar_origem_cst_chave"
                  render={({ field }) => (
                    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(Boolean(v))}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="flex items-center gap-1 text-sm font-medium text-foreground">
                          Considerar Origem + CST ICMS na chave
                          <InfoTooltip text="Por padrão a chave é NCM + UF Origem. Marcando esta opção, inclui também o CST do ICMS na chave." />
                        </div>
                      </div>
                    </label>
                  )}
                />
              </TabsContent>
            </Tabs>

            {/* Rodapé fixo: vigência + observações */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 flex items-center gap-1">
                    <Label className="text-sm">Vigência início *</Label>
                    <InfoTooltip text="Data a partir da qual este perfil entra em vigor. Perfis anteriores serão automaticamente encerrados." />
                  </div>
                  <Controller
                    control={form.control}
                    name="vigencia_inicio"
                    render={({ field }) => (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value
                              ? format(field.value, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                              : "Selecione uma data"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={(d) => d && field.onChange(d)}
                            initialFocus
                            locale={ptBR}
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                  />
                  {errors.vigencia_inicio && (
                    <p className="mt-1 text-xs text-destructive">{errors.vigencia_inicio.message}</p>
                  )}
                  {isEdit && perfilVigente && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Perfil vigente atual será encerrado automaticamente.
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="observacoes" className="text-sm">Observações</Label>
                  <Textarea
                    id="observacoes"
                    placeholder="Ex: migração para Lucro Presumido em janeiro/2025"
                    maxLength={500}
                    rows={3}
                    {...form.register("observacoes")}
                  />
                  {errors.observacoes && (
                    <p className="mt-1 text-xs text-destructive">{errors.observacoes.message}</p>
                  )}
                </div>
              </div>

              {(Object.keys(errosPorAba) as AbaId[]).some((id) => errosPorAba[id]) && (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  <span className="font-medium">Erros em:</span>
                  {(Object.keys(errosPorAba) as AbaId[])
                    .filter((id) => errosPorAba[id])
                    .map((id) => (
                      <Badge key={id} variant="destructive" className="text-[10px]">
                        {id === "identificacao" && "Identificação"}
                        {id === "beneficios" && "Benefícios"}
                        {id === "localizacao" && "Localização"}
                        {id === "calculo" && "Parâmetros"}
                      </Badge>
                    ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar perfil
              </Button>
            </DialogFooter>
          </form>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}

/** Helpers visuais internos */

interface FieldRowProps {
  label: string;
  htmlFor?: string;
  tooltip?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

function FieldRow({ label, htmlFor, tooltip, error, required, children }: FieldRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Label htmlFor={htmlFor} className="text-sm">
          {label}
          {required && " *"}
        </Label>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface SwitchRowProps {
  label: string;
  tooltip: string;
  name: keyof FormInput;
  control: ReturnType<typeof useForm<FormInput>>["control"];
  compact?: boolean;
}

function SwitchRow({ label, tooltip, name, control, compact }: SwitchRowProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div
          className={cn(
            "flex items-center justify-between gap-3",
            compact ? "px-3 py-2.5" : "rounded-md border border-border p-3",
          )}
        >
          <div className="flex items-center gap-1 text-sm font-medium text-foreground">
            {label}
            <InfoTooltip text={tooltip} />
          </div>
          <Switch
            checked={Boolean(field.value)}
            onCheckedChange={(v) => field.onChange(v)}
          />
        </div>
      )}
    />
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Mais informações"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}