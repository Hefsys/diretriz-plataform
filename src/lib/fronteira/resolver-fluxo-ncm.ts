// Resolve qual fluxograma (fórmula) deve ser aplicado para um NCM dentro de
// uma mesma lógica de cálculo.
//
// Regra: a lógica tem um fluxograma PADRÃO (logicas_calculo.fluxo). Alguns NCMs
// podem ter fórmula própria (logica_ncm_legislacao.fluxo). Quando a linha do NCM
// não tem fluxo (NULL) ou tem um fluxo inválido, cai para o padrão.
//
// Módulo puro: sem I/O.

import { fluxoValido, parseFluxo, type Fluxo } from "./fluxo-calculo";

export interface OverrideFluxoNcm {
  ncm: string;
  fluxo: unknown;
  vigencia_inicio?: string | null;
  vigencia_fim?: string | null;
}

export interface ResolverFluxoNcmArgs {
  /** NCM de referência da nota (normalmente o NCM predominante). */
  ncm: string;
  /** Fluxograma padrão da lógica. */
  fluxoPadrao: Fluxo;
  /** Linhas de logica_ncm_legislacao da lógica selecionada. */
  overrides: OverrideFluxoNcm[];
  /** Data (YYYY-MM-DD) usada para checar vigência. Default: hoje. */
  dataReferencia?: string;
}

function somenteDigitos(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Linha com NCM (ou prefixo de 4/6 dígitos) e vigência. */
export interface LinhaNcmVigente {
  ncm: string;
  vigencia_inicio?: string | null;
  vigencia_fim?: string | null;
}

function vigenciaValida(o: LinhaNcmVigente, data: string): boolean {
  const ini = o.vigencia_inicio ?? null;
  const fim = o.vigencia_fim ?? null;
  if (ini && ini > data) return false;
  if (fim && fim < data) return false;
  return true;
}

/**
 * Match hierárquico: tenta 8 dígitos exatos, depois prefixo de 6, depois 4.
 * Retorna a primeira linha vigente encontrada no nível mais específico.
 */
export function acharOverrideNcm<T extends LinhaNcmVigente>(
  ncm: string,
  overrides: T[],
  dataReferencia?: string,
): T | null {
  const alvo = somenteDigitos(ncm);
  if (!alvo) return null;
  const data = dataReferencia ?? new Date().toISOString().slice(0, 10);
  const vigentes = overrides.filter((o) => vigenciaValida(o, data));

  for (const tamanho of [8, 6, 4]) {
    if (alvo.length < tamanho) continue;
    const prefixo = alvo.slice(0, tamanho);
    const achado = vigentes.find((o) => {
      const cand = somenteDigitos(o.ncm);
      return cand.length === tamanho && cand === prefixo;
    });
    if (achado) return achado;
  }
  return null;
}

/** Fluxo efetivo para o NCM: fórmula própria válida, senão o padrão da lógica. */
export function resolverFluxoNcm({
  ncm,
  fluxoPadrao,
  overrides,
  dataReferencia,
}: ResolverFluxoNcmArgs): Fluxo {
  const achado = acharOverrideNcm(ncm, overrides, dataReferencia);
  if (!achado || achado.fluxo == null) return fluxoPadrao;
  const proprio = parseFluxo(achado.fluxo);
  return fluxoValido(proprio) ? proprio : fluxoPadrao;
}
