import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, History, Pencil, Settings, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { db as supabase } from "@/lib/dp/db";
import { formatDateShort } from "@/lib/fronteira/format";
import { cn } from "@/lib/utils";
import { sujeitoAntecipacaoPadrao } from "@/lib/fronteira/fiscal-pe/entrada-motor";

import { NovoPerfilDialog, type PerfilExistente } from "./NovoPerfilDialog";
import { HistoricoPerfis, type PerfilHistorico } from "./HistoricoPerfis";
import {
  FLAGS_BENEFICIOS,
  SISTEMATICAS,
  type PerfilFlagsExtended,
} from "./perfil-options";

interface PerfilRow {
  id: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  cnae: string | null;
  porte: string | null;
  regime: string | null;
  aliquota_interna_default: number | null;
  sistematicas_especiais: string[] | null;
  flags: PerfilFlagsExtended | null;
}

export function PerfilFiscalTab({ empresaId }: { empresaId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["perfis-fiscais", empresaId],
    queryFn: async (): Promise<PerfilRow[]> => {
      const { data, error } = await supabase
        .from("ff_perfis_fiscais")
        .select(
          "id, vigencia_inicio, vigencia_fim, cnae, porte, regime, aliquota_interna_default, sistematicas_especiais, flags",
        )
        .eq("empresa_id", empresaId)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PerfilRow[];
    },
  });

  useEffect(() => {
    if (error) toast.error("Erro ao carregar perfil fiscal", { description: error.message });
  }, [error]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const perfis = data ?? [];
  const vigente = perfis.find((p) => p.vigencia_fim == null) ?? null;
  const anteriores = perfis.filter((p) => p.vigencia_fim != null);

  if (!vigente && anteriores.length === 0) {
    return <EmptyState empresaId={empresaId} />;
  }

  return (
    <div className="space-y-4">
      {vigente ? (
        <PerfilVigenteCard perfil={vigente} empresaId={empresaId} />
      ) : (
        <EmptyState empresaId={empresaId} variant="sem-vigente" />
      )}
      <HistoricoPerfis perfis={anteriores as PerfilHistorico[]} />
    </div>
  );
}

function EmptyState({
  empresaId,
  variant = "novo",
}: {
  empresaId: string;
  variant?: "novo" | "sem-vigente";
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Settings className="h-7 w-7" />
      </div>
      <h3 className="mt-5 text-base font-semibold text-foreground">
        Perfil fiscal não configurado
      </h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
        {variant === "sem-vigente"
          ? "Não há perfil vigente no momento. Configure um novo perfil para retomar a auditoria automatizada."
          : "Configure o perfil fiscal desta empresa para habilitar a auditoria automatizada do ICMS Fronteira."}
      </p>
      <NovoPerfilDialog
        empresaId={empresaId}
        trigger={
          <Button className="mt-6">
            + Configurar perfil fiscal
          </Button>
        }
      />
    </div>
  );
}

function PerfilVigenteCard({
  perfil,
  empresaId,
}: {
  perfil: PerfilRow;
  empresaId: string;
}) {
  const flags = perfil.flags ?? ({} as PerfilFlagsExtended);
  const sistematicasAtivas = (perfil.sistematicas_especiais ?? []).filter(
    (s) => !s.startsWith("__obs:"),
  );

  const perfilParaEdicao: PerfilExistente = {
    id: perfil.id,
    cnae: perfil.cnae,
    porte: perfil.porte,
    regime: perfil.regime,
    aliquota_interna_default: perfil.aliquota_interna_default,
    sistematicas_especiais: sistematicasAtivas,
    flags: perfil.flags,
    vigencia_inicio: perfil.vigencia_inicio,
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Perfil fiscal vigente</h3>
            <Badge className="bg-[oklch(0.62_0.13_160)] text-white hover:bg-[oklch(0.62_0.13_160)]">
              Vigente desde {formatDateShort(perfil.vigencia_inicio)}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Configuração ativa usada pelo motor de cálculo nesta empresa.
          </p>
        </div>
        <div className="flex gap-2">
          <NovoPerfilDialog
            empresaId={empresaId}
            perfilVigente={perfilParaEdicao}
            trigger={
              <Button size="sm" variant="outline">
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Editar
              </Button>
            }
          />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <Secao titulo="Identificação" icon={<History className="h-3.5 w-3.5" />}>
          <Campo label="CNAE" value={perfil.cnae} mono />
          <Campo label="Tipo de empresa" value={flags.tipo_empresa ?? null} />
          <Campo label="Porte" value={perfil.porte} />
          <Campo label="Regime" value={perfil.regime} />
          <div className="col-span-full">
            <FlagBadge label="Indústria ou equiparado" ativo={Boolean(flags.industria_ou_equiparado)} />
          </div>
        </Secao>

        <Secao titulo="Benefícios e Flags">
          <FlagBadge
            label="Sujeito à antecipação tributária (Dec. 44.650/2017, arts. 329 a 347)"
            ativo={flags.sujeito_antecipacao ?? sujeitoAntecipacaoPadrao(flags as unknown as Record<string, unknown>)}
          />
          {FLAGS_BENEFICIOS.map((f) => (
            <FlagBadge key={f.key} label={f.label} ativo={Boolean(flags[f.key])} />
          ))}
        </Secao>

        <Secao titulo="Localização e Sistemáticas">
          <Campo label="Localização" value={flags.localizacao ?? null} />
          <Campo label="Critério adicional" value={flags.criterio_localizacao ?? null} />
          <div className="col-span-full">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Sistemáticas especiais
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {sistematicasAtivas.length === 0 ? (
                <span className="text-sm text-muted-foreground">Nenhuma</span>
              ) : (
                sistematicasAtivas.map((s) => (
                  <Badge key={s} variant="secondary">
                    {SISTEMATICAS.find((x) => x.value === s)?.label ?? s}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </Secao>

        <Secao titulo="Parâmetros de Cálculo">
          <Campo
            label="% ICMS interno"
            value={
              perfil.aliquota_interna_default != null
                ? `${perfil.aliquota_interna_default}%`
                : null
            }
            mono
          />
          <Campo
            label="Cálculo por"
            value={flags.calculo_por === "emissao" ? "Pela emissão" : "Pelo extrato SEFAZ"}
          />
          <Campo
            label="Origem + CST na chave"
            value={flags.considerar_origem_cst_chave ? "Sim" : "Não"}
          />
        </Secao>
      </div>
    </div>
  );
}

function Secao({
  titulo,
  icon,
  children,
}: {
  titulo: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-4">
      <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {titulo}
      </h4>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Campo({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-0.5 text-sm text-foreground", mono && "tabular")}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function FlagBadge({ label, ativo }: { label: string; ativo: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-foreground">{label}</span>
      <Badge
        className={cn(
          "gap-1",
          ativo
            ? "bg-[oklch(0.62_0.13_160)] text-white hover:bg-[oklch(0.62_0.13_160)]"
            : "bg-muted text-muted-foreground hover:bg-muted",
        )}
      >
        {ativo ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        {ativo ? "Ativo" : "Inativo"}
      </Badge>
    </div>
  );
}