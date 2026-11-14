import { useState } from "react";
import { Check, ChevronDown, ChevronRight, History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateShort } from "@/lib/fronteira/format";
import { cn } from "@/lib/utils";
import {
  FLAGS_BENEFICIOS,
  SISTEMATICAS,
  type PerfilFlagsExtended,
} from "./perfil-options";

export interface PerfilHistorico {
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

interface HistoricoPerfisProps {
  perfis: PerfilHistorico[];
  defaultOpen?: boolean;
}

export function HistoricoPerfis({ perfis, defaultOpen = false }: HistoricoPerfisProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (perfis.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Histórico de versões</h3>
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {perfis.length}
          </Badge>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-4">
          {perfis.map((p) => (
            <PerfilHistoricoCard key={p.id} perfil={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PerfilHistoricoCard({ perfil }: { perfil: PerfilHistorico }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            Encerrado em {formatDateShort(perfil.vigencia_fim)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Vigente de {formatDateShort(perfil.vigencia_inicio)} a {formatDateShort(perfil.vigencia_fim)}
          </span>
        </div>
        <div className="mt-1 text-sm text-foreground">
          {perfil.regime ?? "—"} · {perfil.porte ?? "—"} · CNAE {perfil.cnae ?? "—"}
        </div>
      </div>
      <DetalhesDialog perfil={perfil} />
    </div>
  );
}

function DetalhesDialog({ perfil }: { perfil: PerfilHistorico }) {
  const flags = perfil.flags ?? ({} as PerfilFlagsExtended);
  const sistematicasAtivas = (perfil.sistematicas_especiais ?? []).filter(
    (s) => !s.startsWith("__obs:"),
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Ver detalhes</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Perfil encerrado em {formatDateShort(perfil.vigencia_fim)}</DialogTitle>
          <DialogDescription>
            Vigente de {formatDateShort(perfil.vigencia_inicio)} a {formatDateShort(perfil.vigencia_fim)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Secao titulo="Identificação">
            <Campo label="CNAE" value={perfil.cnae} mono />
            <Campo label="Tipo de empresa" value={flags.tipo_empresa ?? "—"} />
            <Campo label="Porte" value={perfil.porte} />
            <Campo label="Regime" value={perfil.regime} />
          </Secao>

          <Secao titulo="Benefícios e Flags">
            {FLAGS_BENEFICIOS.map((f) => (
              <FlagBadge key={f.key} label={f.label} ativo={Boolean(flags[f.key])} />
            ))}
          </Secao>

          <Secao titulo="Localização e Sistemáticas">
            <Campo label="Localização" value={flags.localizacao ?? "—"} />
            <Campo label="Critério adicional" value={flags.criterio_localizacao ?? "—"} />
            <div className="col-span-full">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Sistemáticas especiais
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
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
              value={perfil.aliquota_interna_default != null ? `${perfil.aliquota_interna_default}%` : "—"}
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
      </DialogContent>
    </Dialog>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </h4>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Campo({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-0.5 text-sm text-foreground", mono && "tabular")}>{value ?? "—"}</div>
    </div>
  );
}

function FlagBadge({ label, ativo }: { label: string; ativo: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-foreground">{label}</span>
      <Badge
        variant={ativo ? "default" : "secondary"}
        className={cn(
          "gap-1",
          ativo
            ? "bg-[oklch(0.62_0.13_160)] text-white hover:bg-[oklch(0.62_0.13_160)]"
            : "bg-muted text-muted-foreground",
        )}
      >
        {ativo ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        {ativo ? "Ativo" : "Inativo"}
      </Badge>
    </div>
  );
}