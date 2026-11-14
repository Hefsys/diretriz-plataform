import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { db as supabase } from "@/lib/dp/db";
import {
  FORMULAS_DISPONIVEIS,
  type LogicaCalculo,
  type CampoUsuario,
} from "@/lib/fronteira/logicas-calculo";
import { NcmLegislacaoTable } from "@/components/fronteira/calculos/NcmLegislacaoTable";
import { parseFluxo, type Fluxo } from "@/lib/fronteira/fluxo-calculo";
import { FluxoEditor } from "@/components/fronteira/calculos/FluxoEditor";
import { FonteLegal } from "@/components/fronteira/FonteLegal";

interface FundamentoRegra { informativo: string; item: string; dispositivo: string }

function FundamentoLegal({ regraId }: { regraId: string }) {
  const { data } = useQuery({
    queryKey: ["regra-fiscal", regraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ff_regras_fiscais")
        .select("id, nome, status, fundamentos")
        .eq("id", regraId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (!data) return null;
  const fundamentos = (Array.isArray(data.fundamentos) ? data.fundamentos : []) as unknown as FundamentoRegra[];
  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Fundamento legal</h3>
          <p className="text-xs text-muted-foreground">
            {data.nome}{" "}
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{data.status}</span>
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/fiscal/fronteira/regras">Ver regra {data.id}</Link>
        </Button>
      </div>
      {fundamentos.length > 0 ? (
        <ul className="space-y-1.5 text-sm">
          {fundamentos.map((f, i) => (
            <li key={i}>
              <FonteLegal informativo={f.informativo} item={f.item} dispositivo={f.dispositivo} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Regra sem fundamentos cadastrados.</p>
      )}
    </div>
  );
}


const CAMPOS_DEFAULT_ST: CampoUsuario[] = [
  {
    key: "peso_bateria",
    label: "Peso da bateria (kg)",
    tipo: "decimal",
    obrigatorio: true,
    validar_contra_xml: "peso_bruto_por_unidade",
  },
  {
    key: "legislacao",
    label: "Legislação (R$/kg)",
    tipo: "decimal",
    obrigatorio: true,
    validar_contra_xml: null,
  },
  {
    key: "quantidade_bateria",
    label: "Quantidade de bateria",
    tipo: "inteiro",
    obrigatorio: true,
    validar_contra_xml: "quantidade_total_itens",
  },
];

const FLUXO_INICIAL: Fluxo = [
  { id: "a1", tipo: "operando", origem: "xml", campo: "valor_produtos" },
  { id: "a2", tipo: "operador", op: "+" },
  { id: "a3", tipo: "operando", origem: "xml", campo: "valor_frete" },
  { id: "a4", tipo: "operador", op: "-" },
  { id: "a5", tipo: "operando", origem: "xml", campo: "icms_destacado" },
  { id: "a6", tipo: "operador", op: "/" },
  { id: "a7", tipo: "operando", origem: "numero", valor: 0.795 },
  { id: "a8", tipo: "operador", op: "x" },
  { id: "a9", tipo: "operando", origem: "percentual", valor: 20.5 },
];

interface FormState {
  nome: string;
  descricao: string;
  formula_codigo: string;
  aliquota_interna: string;
  difal_percentual: string;
  ativa: boolean;
  campos_usuario: CampoUsuario[];
  fluxo: Fluxo;
}

export default function LogicaEditPage() {
  const { logicaId = "nova" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNova = logicaId === "nova";
  const [avisoAberto, setAvisoAberto] = useState(false);

  const [form, setForm] = useState<FormState>({
    nome: "",
    descricao: "",
    formula_codigo: "FLUXO_VISUAL",
    aliquota_interna: "20.5",
    difal_percentual: "17.32",
    ativa: true,
    campos_usuario: CAMPOS_DEFAULT_ST,
    fluxo: FLUXO_INICIAL,
  });

  const { data } = useQuery({
    queryKey: ["logica", logicaId],
    queryFn: async (): Promise<LogicaCalculo | null> => {
      if (isNova) return null;
      const { data, error } = await supabase
        .from("ff_logicas_calculo")
        .select("*")
        .eq("id", logicaId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as LogicaCalculo | null;
    },
    enabled: !isNova,
  });

  useEffect(() => {
    if (!data) return;
    const params = (data.parametros ?? {}) as {
      aliquota_interna?: number;
      difal_percentual?: number;
    };
    setForm({
      nome: data.nome,
      descricao: data.descricao ?? "",
      formula_codigo: data.formula_codigo,
      aliquota_interna: String(params.aliquota_interna ?? 20.5),
      difal_percentual: String(params.difal_percentual ?? 17.32),
      ativa: data.ativa,
      campos_usuario: (data.campos_usuario as CampoUsuario[]) ?? CAMPOS_DEFAULT_ST,
      fluxo: parseFluxo(data.fluxo),
    });
  }, [data]);

  const paramsOriginais = useMemo(
    () => ((data?.parametros ?? {}) as Record<string, unknown>),
    [data],
  );
  const fluxoAlterado =
    !!data && JSON.stringify(form.fluxo) !== JSON.stringify(parseFluxo(data.fluxo));
  const regraId = typeof paramsOriginais.regra_fiscal_id === "string" ? paramsOriginais.regra_fiscal_id : null;

  const salvar = useMutation({
    mutationFn: async () => {
      // Preserva chaves existentes (codigo, regra_fiscal_id, pre_cadastrada...).
      const parametros: Record<string, unknown> = { ...paramsOriginais };
      if (fluxoAlterado && paramsOriginais.pre_cadastrada) {
        parametros.pre_cadastrada = false;
        parametros.modificada = true;
      }
      if (
        form.formula_codigo === "ST_PESO_LEGISLACAO" ||
        form.formula_codigo === "ICMS_ANTECIPADO"
      ) {
        parametros.aliquota_interna = Number(form.aliquota_interna.replace(",", "."));
      } else if (form.formula_codigo === "USO_E_CONSUMO") {
        parametros.difal_percentual = Number(form.difal_percentual.replace(",", "."));
      }
      const campos =
        form.formula_codigo === "USO_E_CONSUMO" ||
        form.formula_codigo === "ICMS_ANTECIPADO" ||
        form.formula_codigo === "FLUXO_VISUAL"
          ? []
          : form.campos_usuario;
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        formula_codigo: form.formula_codigo,
        parametros: parametros as never,
        campos_usuario: campos as never,
        ativa: form.ativa,
        fluxo: form.fluxo as unknown as never,
      };
      if (isNova) {
        const { error } = await supabase.from("ff_logicas_calculo").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ff_logicas_calculo")
          .update(payload)
          .eq("id", logicaId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logicas-calculo"] });
      qc.invalidateQueries({ queryKey: ["logicas-ativas"] });
      qc.invalidateQueries({ queryKey: ["logica", logicaId] });
      toast.success(isNova ? "Lógica criada" : "Lógica atualizada");
      navigate("/fiscal/fronteira/formulas");
    },
    onError: (e) => toast.error("Erro ao salvar", { description: (e as Error).message }),
  });

  const legado = form.fluxo.length === 0;

  return (
    <>
      <PageHeader
        title={isNova ? "Nova Lógica de Cálculo" : form.nome || "Editar Lógica"}
        description="Monte a fórmula em blocos. Avaliação da esquerda para a direita."
      />

      <div className="max-w-4xl space-y-6 rounded-lg border bg-card p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              value={form.nome}
              onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
              placeholder="Ex: ICMS Antecipado"
            />
          </div>
          <div className="space-y-2">
            <Label>Fórmula base (usada quando não há fluxograma)</Label>
            <Select
              value={form.formula_codigo}
              onValueChange={(v) => setForm((s) => ({ ...s, formula_codigo: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMULAS_DISPONIVEIS.map((f) => (
                  <SelectItem key={f.codigo} value={f.codigo}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="descricao">Descrição</Label>
          <Textarea
            id="descricao"
            value={form.descricao}
            onChange={(e) => setForm((s) => ({ ...s, descricao: e.target.value }))}
            rows={2}
          />
        </div>

        {regraId && <FundamentoLegal regraId={regraId} />}

        <FluxoEditor
          fluxo={form.fluxo}
          onChange={(fluxo) => setForm((s) => ({ ...s, fluxo }))}
        />

        {legado &&
          (form.formula_codigo === "ST_PESO_LEGISLACAO" ||
            form.formula_codigo === "ICMS_ANTECIPADO") && (
            <div className="space-y-2">
              <Label htmlFor="aliq">Alíquota interna (%)</Label>
              <Input
                id="aliq"
                type="number"
                step="0.01"
                value={form.aliquota_interna}
                onChange={(e) =>
                  setForm((s) => ({ ...s, aliquota_interna: e.target.value }))
                }
              />
            </div>
          )}

        {legado && form.formula_codigo === "USO_E_CONSUMO" && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-4">
            <Label htmlFor="difal">DIFAL de fallback (%)</Label>
            <Input
              id="difal"
              type="number"
              step="0.01"
              value={form.difal_percentual}
              onChange={(e) =>
                setForm((s) => ({ ...s, difal_percentual: e.target.value }))
              }
              placeholder="17.32"
            />
            <p className="text-xs text-muted-foreground">
              O DIFAL é lido do XML (<code>pICMSUFDest − pICMSInter</code>). Este
              valor só é usado quando o XML não traz o grupo <code>ICMSUFDest</code>.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="ativa">Ativa</Label>
            <p className="text-xs text-muted-foreground">
              Aparece como opção ao iniciar uma auditoria.
            </p>
          </div>
          <Switch
            id="ativa"
            checked={form.ativa}
            onCheckedChange={(v) => setForm((s) => ({ ...s, ativa: v }))}
          />
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => navigate("/fiscal/fronteira/formulas")}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              fluxoAlterado && paramsOriginais.pre_cadastrada ? setAvisoAberto(true) : salvar.mutate()
            }
            disabled={salvar.isPending || !form.nome.trim()}
          >
            {salvar.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <Dialog open={avisoAberto} onOpenChange={setAvisoAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar lógica pré-cadastrada?</DialogTitle>
            <DialogDescription>
              Esta lógica foi conferida com os exemplos oficiais da SEFAZ. Alterar o fluxo remove essa garantia.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvisoAberto(false)}>Cancelar</Button>
            <Button onClick={() => { setAvisoAberto(false); salvar.mutate(); }}>Salvar mesmo assim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!isNova && (!legado || form.formula_codigo === "ST_PESO_LEGISLACAO") && (
        <div className="mt-6 max-w-5xl space-y-3 rounded-lg border bg-card p-6 shadow-sm">
          <div>
            <h3 className="text-base font-semibold">
              NCMs aplicáveis, legislação e fórmulas por exceção
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Cadastre os NCMs desta lógica. Cada NCM pode ter uma fórmula
              própria; sem fórmula própria, vale o fluxograma padrão acima.
            </p>
          </div>
          <NcmLegislacaoTable logicaId={logicaId} />
        </div>
      )}
    </>
  );
}
