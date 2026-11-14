// Constantes — MVP só baterias NCM 8507
const ALIQUOTA_INTERNA_PE = 0.205;
import {
  fluxoValido,
  avaliarFluxoDetalhado,
  parseFluxo,
} from "./fluxo-calculo";
import type { CampoXmlDef } from "./campos-xml";
import { resolverCamposXml } from "./resolver-campos-xml";
import {
  parseXmlDoc,
  selecionarTodos,
  textoDe,
  numeroDeTexto,
  type XmlNode,
} from "./xml-doc";
import {
  resolverFluxoNcm,
  type OverrideFluxoNcm,
} from "./resolver-fluxo-ncm";
import {
  calcularAntecipacao,
  r2 as r2Oficial,
  type Fundamento,
} from "./fiscal-pe/motor-antecipacao-pe";

import { montarEntradaOficial, aliquotaInterestadualItem, aliquotaInternaItem, type ContextoEntrada, type ItemEntrada } from "./fiscal-pe/entrada-motor";

const MVA_AJUSTADA_BATERIAS = 1.0095;
const NCMS_SUPORTADOS = ['85071010', '85071020', '85071090'];

/**
 * Divisor da lógica "Uso e Consumo" (operação "por dentro").
 * Centralizado para facilitar futuras alterações de alíquota presumida.
 */
export const DIVISOR_USO_CONSUMO = 0.795;

/**
 * Divisor da lógica "ICMS Antecipado" — mesma lógica "por dentro" (1 − 20,5% = 0,795).
 */
export const DIVISOR_ICMS_ANTECIPADO = 0.795;

export interface NotaSefaz {
  registro: string;
  nNF: string;
  uf: string;
  vNF: number;
  icmsDevido: number;
  cnpjEmitente: string;
}

export interface ExtratoSefaz {
  razaoSocial: string;
  inscricaoEstadual: string;
  periodoFiscal: string;
  numeroExtrato: string;
  dataVencimento: string;
  notas: NotaSefaz[];
  icmsARecolher: number;
}

export interface NotaXML {
  data_emissao?: string;
  cnpjDestinatario?: string;
  chaveAcesso: string;
  nNF: string;
  cnpjEmitente: string;
  ufEmitente: string;
  nomeEmitente: string;
  vProd: number;
  vIPI: number;
  vFrete: number;
  vSeg: number;
  vDesc: number;
  vOutro: number;
  vICMS: number;
  vST: number;
  vNF: number;
  ncmsTodos: string[];
  cstICMS: string[];
  nomeArquivo?: string;
  pesoBruto: number;
  pesoLiquido: number;
  quantidadeTotalItens: number;
  itens?: ItemXML[];
  /** Alíquota interna da UF de destino (grupo ICMSUFDest > pICMSUFDest). */
  pICMSUFDest?: number;
  /** Alíquota interestadual (grupo ICMSUFDest > pICMSInter). */
  pICMSInter?: number;
  /** Base de cálculo do ICMS (total.ICMSTot.vBC). */
  vBC?: number;
  /** Base de cálculo do ICMS-ST (total.ICMSTot.vBCST). */
  vBCST?: number;
  /** Árvore XML completa da nota, usada pelos campos configuráveis. */
  doc?: XmlNode;
}


export interface MemoriaCalculo {
  avisos?: string[];
  recolhimento?: import("./fiscal-pe/motor-antecipacao-pe").ResultadoCalculo["recolhimento"];
  regraFiscalId?: string;
  dataDocumento?: string;
  suportado: boolean;
  motivoNaoSuportado?: string;
  baseBruta: number;
  baseBrutaDetalhe: {
    vProd: number; vIPI: number; vDesc: number;
    vFrete: number; vSeg: number; vOutro: number;
  };
  mvaAjustadaPct: number;
  baseST: number;
  aliquotaInternaPct: number;
  icmsTotal: number;
  vICMSOrigem: number;
  icmsAntecipado: number;
  stJaRetidaNaOrigem: boolean;
  cstsEncontrados: string[];
  vST: number;
  trace?: Array<{ passo: string; detalhe: string; valor: number; fundamento?: Fundamento }>;
  /** Código da fórmula usada (ex.: "ST_PESO_LEGISLACAO" ou undefined para legado MVA). */
  formulaCodigo?: string;
  /** Detalhamento estruturado da lógica ST_PESO_LEGISLACAO. */
  pesoLegis?: {
    pesoBrutoNF: number;
    quantidadeTotal: number;
    icmsDestacadoNF: number;
    itens: Array<{
      numero: number;
      descricao: string;
      ncm: string;
      qtd: number;
      pesoUnitario: number;
      pesoTotal: number;
      legislacao: number;
      bcItem: number;
      fontePeso: "XML" | "MEDIA";
    }>;
    validacaoCruzada: {
      somaPesos: number;
      pesoBrutoNF: number;
      diferenca: number;
      ok: boolean;
    };
    bcTotal: number;
    icmsBruto: number;
    icmsCalculado: number;
    avisos: string[];
  };
  /** Detalhamento estruturado da lógica USO_E_CONSUMO. */
  usoConsumo?: {
    vProd: number;
    vFrete: number;
    vSeg: number;
    vDesc: number;
    vOutro: number;
    vIPI: number;
    vICMS: number;
    despesas: number;        // vFrete + vSeg
    baseUsoConsumo: number;  // vProd + despesas + vOutro + vIPI − vICMS
    divisor: number;         // 0,795
    baseDividida: number;    // baseUsoConsumo / divisor
    difalPercentual: number; // ex.: 17.32
    icmsCalculado: number;   // baseDividida * (difalPercentual/100)
    /** Alíquota interna do estado de destino (do XML — pICMSUFDest). */
    aliqInternaDestPct?: number;
    /** Alíquota interestadual (do XML — pICMSInter). */
    aliqInterestadualPct?: number;
    /** Origem do DIFAL: 'xml' (calculado por diferença de alíquotas) ou 'parametro' (fallback da lógica). */
    fonteDifal: "xml" | "parametro";
  };
  /** Detalhamento estruturado da lógica ICMS_ANTECIPADO. */
  antecipacao?: {
    vProd: number;
    vFrete: number;
    vSeg: number;
    vDesc: number;
    vOutro: number;
    vIPI: number;
    vICMS: number;
    despesas: number;        // vFrete + vSeg
    base: number;            // vProd + despesas + vOutro + vIPI − vICMS
    divisor: number;         // 0,795
    baseDividida: number;    // base / divisor
    aliquotaInternaPct: number;
    icmsBruto: number;       // baseDividida × aliquota
    icmsCalculado: number;   // icmsBruto − vICMS
  };
  /** Detalhamento estruturado da lógica FLUXO_VISUAL. */
  fluxo?: {
    resultado: number;
    ok: boolean;
    erro?: string;
  };
}

export interface LinhaConferencia {
  nNF: string;
  cnpjEmitente: string;
  nomeEmitente: string;
  vNF: number;
  icmsSefaz: number;
  icmsCalculado: number;
  diferenca: number;
  suportado: boolean;
  chaveAcesso?: string;
  nomeArquivo?: string;
  memoria?: MemoriaCalculo;
  /** Dados do XML expostos para tabelas detalhadas (ex.: lógica Uso e Consumo). */
  xmlInfo?: {
    ufEmitente: string;
    vProd: number;
    vFrete: number;
    vSeg: number;
    vDesc: number;
    vOutro: number;
    vIPI: number;
    vICMS: number;
  };
  /** DIFAL (%) efetivamente usado quando a lógica é Uso e Consumo. */
  difalUsadoPct?: number;
}

export interface ResultadoConferencia {
  empresa: { razaoSocial: string; ie: string; periodo: string };
  icmsSefaz: number;
  icmsCalculado: number;
  diferenca: number;
  notasConferidas: LinhaConferencia[];
  estatisticas: {
    xmlsRecebidos: number;
    xmlsDescartados: number;
    notasNaoSuportadas: number;
  };
}

// ────────────────────────────────────────────────────────────────────
// Lógicas de Cálculo configuráveis (ex.: "Cálculo 1" = ST_PESO_LEGISLACAO)
// ────────────────────────────────────────────────────────────────────
export interface ProcessarOpcoes {
  memoriasOficiais?: Record<string, MemoriaCalculo>;
  logica?: {
    formula_codigo: string;
    parametros: Record<string, unknown>;
    fluxo?: unknown;
  };
  inputsUsuario?: Record<string, number>;
  /**
   * Fórmulas próprias por NCM (linhas de `logica_ncm_legislacao` da lógica).
   * Quando o NCM predominante da nota casar com uma linha vigente que tenha
   * `fluxo` válido, esse fluxo substitui o fluxograma padrão da lógica.
   */
  fluxosPorNcm?: OverrideFluxoNcm[];
  /** Catálogo de campos do XML (tabela public.campos_xml) usado pelos fluxos. */
  camposXml?: CampoXmlDef[];

  /** Data (YYYY-MM-DD) usada para checar vigência dos overrides. */
  dataReferencia?: string;
  /**
   * Mapa NCM → R$/kg (legislação) cadastrado para a lógica selecionada.
   * Sobreposto por `legislacoesManuais` (por NF) quando informado.
   */
  ncmLegislacoes?: Map<string, number>;
  /**
   * Mapa chaveNF (`${nNF}|${cnpjEmitente}`) → Map<NCM, R$/kg> com overrides
   * digitados pelo usuário na tela de pendências.
   */
  legislacoesManuaisPorNF?: Map<string, Map<string, number>>;
}

/**
 * Cálculo automático ST_PESO_LEGISLACAO:
 *  - peso unitário = pesoBruto total / soma de qCom
 *  - para cada item: peso_item = peso_unitário × qCom_item
 *  - base_item = peso_item × legislação(NCM do item)
 *  - BC total = soma das bases dos itens
 *  - ICMS bruto = BC × alíquota
 *  - ICMS devido = ICMS bruto − vICMS total (do XML)
 */
export interface ItemXML {
  ncm: string;
  qCom: number;
  xProd?: string;
  pesoUnitarioKg?: number | null;
  infAdProd?: string | null;
  /** Valor total do item (prod > vProd) — usado para achar o NCM predominante. */
  vProdItem?: number;
  entradaFiscal?: ItemEntrada;
}

/**
 * Extrai peso unitário (kg) de infAdProd.
 * Reconhece formatos como:
 *   #14,2KG#  #14.2KG#  14,2 KG  14.2KG
 *   PESO 14,2KG  PESO: 14,2 KG
 *   PESO UNITARIO 14,2KG  PESO UNITÁRIO: 14,2 KG
 */
export function extrairPesoUnitarioInfAdProd(s: string | null | undefined): number | null {
  if (!s) return null;
  const num = "(\\d+(?:[.,]\\d+)?)";
  const patterns: RegExp[] = [
    // 1) Padrão delimitado por # ... #
    new RegExp(`#\\s*${num}\\s*KG\\s*#`, "i"),
    // 2) PESO UNIT(ARIO|ÁRIO) [:]? <num> KG
    new RegExp(`PESO\\s+UNIT[AÁ]RIO\\s*[:.\\-]?\\s*${num}\\s*KG`, "i"),
    // 3) PESO [:]? <num> KG
    new RegExp(`PESO\\s*[:.\\-]?\\s*${num}\\s*KG`, "i"),
    // 4) <num> KG isolado (último recurso)
    new RegExp(`(?:^|[^\\d.,])${num}\\s*KG\\b`, "i"),
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const v = parseFloat(m[1].replace(",", "."));
      if (Number.isFinite(v) && v > 0) return v;
    }
  }
  return null;
}

export function calcularPorLogicaSTPeso(
  nota: NotaXML,
  parametros: { aliquota_interna: number },
  legislacoesPorNCM: Map<string, number>,
): MemoriaCalculo {
  const baseBrutaDetalhe = {
    vProd: nota.vProd, vIPI: nota.vIPI, vDesc: nota.vDesc,
    vFrete: nota.vFrete, vSeg: nota.vSeg, vOutro: nota.vOutro,
  };
  const baseBruta = nota.vProd + nota.vIPI - nota.vDesc + nota.vFrete + nota.vSeg + nota.vOutro;
  const aliquotaPct = parametros.aliquota_interna;
  const aliquota = aliquotaPct / 100;

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  const pesoTotal = nota.pesoBruto;
  const qtdTotal = nota.quantidadeTotalItens;
  const pesoMedio = qtdTotal > 0 ? pesoTotal / qtdTotal : 0;

  const trace: Array<{ passo: string; detalhe: string; valor: number }> = [
    { passo: "Peso bruto da NF (XML)", detalhe: "Tag transp>vol>pesoB", valor: pesoTotal },
    { passo: "Quantidade total (XML)", detalhe: "Soma de qCom dos itens", valor: qtdTotal },
  ];

  // Itens do XML (precisamos do detalhamento por NCM)
  const itens = nota.itens ?? [];
  let baseCalculo = 0;
  let ncmFaltante: string | null = null;
  let avisoPesoMedio = false;

  type ItemCalc = { peso: number; total: number; fonte: "XML" | "MEDIA" };
  const itensCalc: ItemCalc[] = [];
  type ItemDetalhado = {
    numero: number;
    descricao: string;
    ncm: string;
    qtd: number;
    pesoUnitario: number;
    pesoTotal: number;
    legislacao: number;
    bcItem: number;
    fontePeso: "XML" | "MEDIA";
  };
  const itensDetalhados: ItemDetalhado[] = [];

  trace.push({ passo: "─── Itens ───", detalhe: "", valor: 0 });

  for (let i = 0; i < itens.length; i++) {
    const it = itens[i];
    const legis = legislacoesPorNCM.get(it.ncm);
    if (legis === undefined) {
      ncmFaltante = it.ncm;
      break;
    }
    let pesoUnit: number;
    let fonte: "XML" | "MEDIA";
    if (it.pesoUnitarioKg && it.pesoUnitarioKg > 0) {
      pesoUnit = it.pesoUnitarioKg;
      fonte = "XML";
    } else {
      pesoUnit = pesoMedio;
      fonte = "MEDIA";
      avisoPesoMedio = true;
    }
    const pesoItemTotal = pesoUnit * it.qCom;
    const baseItem = pesoItemTotal * legis;
    baseCalculo += baseItem;
    itensCalc.push({ peso: pesoItemTotal, total: baseItem, fonte });
    itensDetalhados.push({
      numero: i + 1,
      descricao: it.xProd ?? "",
      ncm: it.ncm,
      qtd: it.qCom,
      pesoUnitario: pesoUnit,
      pesoTotal: pesoItemTotal,
      legislacao: legis,
      bcItem: baseItem,
      fontePeso: fonte,
    });
    const tag = fonte === "MEDIA" ? " [peso médio]" : "";
    const desc = it.xProd ? `${it.xProd} ` : "";
    trace.push({
      passo: `Item ${i + 1} ${desc}(NCM ${it.ncm})`,
      detalhe: `qtd ${fmt(it.qCom)} × ${fmt(pesoUnit)} kg × ${fmt(legis)} R$/kg${tag}`,
      valor: baseItem,
    });
  }

  if (ncmFaltante) {
    return {
      suportado: false,
      motivoNaoSuportado: `NCM ${ncmFaltante} não cadastrado na lógica selecionada. Informe a legislação para esta NF.`,
      baseBruta, baseBrutaDetalhe,
      mvaAjustadaPct: 0, baseST: 0,
      aliquotaInternaPct: aliquotaPct,
      icmsTotal: 0, vICMSOrigem: nota.vICMS,
      icmsAntecipado: 0,
      stJaRetidaNaOrigem: false,
      cstsEncontrados: nota.cstICMS, vST: nota.vST,
      formulaCodigo: "ST_PESO_LEGISLACAO",
    };
  }

  const icmsBruto = baseCalculo * aliquota;
  const icmsNF = nota.vICMS || 0;
  const icmsDevido = Math.max(0, icmsBruto - icmsNF);

  // Validação cruzada de pesos
  const somaPesos = itensCalc.reduce((s, x) => s + x.peso, 0);
  const divergenciaPeso = Math.abs(somaPesos - pesoTotal);
  const tolPeso = pesoTotal * 0.02;
  trace.push(
    { passo: "─── Validação cruzada ───", detalhe: "", valor: 0 },
    { passo: "Soma dos pesos por item", detalhe: "Σ (peso_unit × qtd)", valor: somaPesos },
    {
      passo: "Diferença vs peso bruto da NF",
      detalhe: divergenciaPeso <= tolPeso ? "✓ dentro da tolerância (2%)" : "⚠ acima de 2%",
      valor: somaPesos - pesoTotal,
    },
  );

  trace.push(
    { passo: "─── Cálculo ───", detalhe: "", valor: 0 },
    { passo: "Base de Cálculo total", detalhe: "Soma das bases por item", valor: baseCalculo },
    { passo: "Alíquota interna", detalhe: `${fmt(aliquotaPct)}% (parâmetro da lógica)`, valor: aliquotaPct },
    { passo: "ICMS bruto", detalhe: `${fmt(baseCalculo)} × ${fmt(aliquotaPct)}%`, valor: icmsBruto },
    { passo: "ICMS destacado na NF", detalhe: "Soma de vICMS do XML", valor: icmsNF },
    { passo: "ICMS devido (ST)", detalhe: `${fmt(icmsBruto)} − ${fmt(icmsNF)}`, valor: icmsDevido },
  );

  if (avisoPesoMedio) {
    trace.push({
      passo: "⚠ Aviso",
      detalhe:
        "Alguns itens não tinham peso unitário declarado no XML (infAdProd). " +
        "Foi usado peso médio (peso bruto ÷ quantidade total) como aproximação.",
      valor: 0,
    });
  }
  if (divergenciaPeso > tolPeso) {
    trace.push({
      passo: "⚠ Aviso",
      detalhe: `Soma dos pesos por item (${fmt(somaPesos)} kg) diverge mais de 2% do peso bruto da NF (${fmt(pesoTotal)} kg). Verifique os pesos declarados no XML.`,
      valor: 0,
    });
  }

  const avisosPesoLegis: string[] = [];
  if (avisoPesoMedio) {
    avisosPesoLegis.push(
      "Alguns itens não tinham peso unitário declarado no XML (infAdProd). Foi usado peso médio como aproximação.",
    );
  }
  if (divergenciaPeso > tolPeso) {
    avisosPesoLegis.push(
      `Soma dos pesos por item (${fmt(somaPesos)} kg) diverge mais de 2% do peso bruto da NF (${fmt(pesoTotal)} kg).`,
    );
  }

  return {
    suportado: true,
    baseBruta,
    baseBrutaDetalhe,
    mvaAjustadaPct: 0,
    baseST: baseCalculo,
    aliquotaInternaPct: aliquotaPct,
    icmsTotal: icmsBruto,
    vICMSOrigem: icmsNF,
    icmsAntecipado: icmsDevido,
    stJaRetidaNaOrigem: false,
    cstsEncontrados: nota.cstICMS,
    vST: nota.vST,
    trace,
    formulaCodigo: "ST_PESO_LEGISLACAO",
    pesoLegis: {
      pesoBrutoNF: pesoTotal,
      quantidadeTotal: qtdTotal,
      icmsDestacadoNF: icmsNF,
      itens: itensDetalhados,
      validacaoCruzada: {
        somaPesos,
        pesoBrutoNF: pesoTotal,
        diferenca: somaPesos - pesoTotal,
        ok: divergenciaPeso <= tolPeso,
      },
      bcTotal: baseCalculo,
      icmsBruto,
      icmsCalculado: icmsDevido,
      avisos: avisosPesoLegis,
    },
  };
}

export interface DivergenciaXML {
  campo: string;
  rotulo: string;
  valorInformado: number;
  valorXML: number;
  ok: boolean;
}

/** Dados insuficientes nunca são tratados como um cálculo de valor zero. */
export function memoriaPendente(nota: NotaXML, motivo: string, formulaCodigo: string): MemoriaCalculo {
  return { suportado: false, motivoNaoSuportado: motivo, avisos: [motivo],
    baseBruta: 0, baseBrutaDetalhe: { vProd: nota.vProd, vIPI: nota.vIPI, vDesc: nota.vDesc, vFrete: nota.vFrete, vSeg: nota.vSeg, vOutro: nota.vOutro },
    mvaAjustadaPct: 0, baseST: 0, aliquotaInternaPct: 0, icmsTotal: 0,
    vICMSOrigem: nota.vICMS, icmsAntecipado: 0, stJaRetidaNaOrigem: false,
    cstsEncontrados: nota.cstICMS, vST: nota.vST, formulaCodigo };
}

function calcularNotaOficial(nota: NotaXML, contexto: ContextoEntrada | undefined, regime: "ANTECIPACAO" | "DIFAL"): MemoriaCalculo {
  const codigo = regime === "DIFAL" ? "USO_E_CONSUMO" : "ICMS_ANTECIPADO";
  try {
    if (!contexto) throw new Error("Cadastre o perfil fiscal da empresa para a data de emissão da nota");
    const ctx = { ...contexto, data_referencia: nota.data_emissao ?? "", uf_origem: nota.ufEmitente };
    const itens = (nota.itens ?? []).flatMap(i => i.entradaFiscal ? [i.entradaFiscal] : []);
    const entradas: ItemEntrada[] = itens.length ? itens : [{ numero_item: 1, ncm: ncmPredominanteDaNota(nota), valor_total_item: nota.vProd, valor_ipi_item: nota.vIPI, valor_frete_item: nota.vFrete, valor_seguro_item: nota.vSeg, valor_outros_item: nota.vOutro, valor_desconto_item: nota.vDesc, valor_icms_item: nota.vICMS, aliquota_icms_origem: nota.pICMSInter }];
    const resultados = entradas.map(item => {
      const inter = aliquotaInterestadualItem(item, ctx.uf_origem);
      const destinoXml = item.aliquota_interna_destino ?? (entradas.length === 1 ? nota.pICMSUFDest : undefined);
      const interna = regime === "DIFAL" && Number(destinoXml) > 0 ? Number(destinoXml) : aliquotaInternaItem(item.ncm, ctx);
      const entrada = montarEntradaOficial(item, ctx, regime, interna, inter);
      return { entrada, r: calcularAntecipacao(entrada), item };
    });
    const primeiro = resultados[0];
    if (!primeiro) throw new Error("Nota sem itens para calcular");
    const total = r2Oficial(resultados.reduce((s, x) => s + x.r.valor, 0));
    const base = r2Oficial(resultados.reduce((s, x) => s + x.r.baseCalculo, 0));
    const trace = resultados.flatMap(({ r, item }) => [
      ...(resultados.length > 1 ? [{ passo: `Item ${item.numero_item ?? ""} — NCM ${item.ncm ?? ""}`, detalhe: "", valor: 0 }] : []),
      ...r.passos.map(p => ({ passo: p.passo, detalhe: p.detalhe ?? p.fundamento?.dispositivo ?? "", valor: p.valor, fundamento: p.fundamento })),
    ]);
    trace.push({ passo: "ICMS calculado da nota", detalhe: "Soma dos resultados do motor oficial", valor: total });
    return { suportado: true, baseBruta: nota.vProd + nota.vIPI + nota.vFrete + nota.vSeg + nota.vOutro,
      baseBrutaDetalhe: { vProd: nota.vProd, vIPI: nota.vIPI, vDesc: nota.vDesc, vFrete: nota.vFrete, vSeg: nota.vSeg, vOutro: nota.vOutro },
      mvaAjustadaPct: 0, baseST: base, aliquotaInternaPct: primeiro.entrada.aliquotaInterna,
      icmsTotal: total, vICMSOrigem: nota.vICMS, icmsAntecipado: total,
      stJaRetidaNaOrigem: false, cstsEncontrados: nota.cstICMS, vST: nota.vST, trace, formulaCodigo: codigo,
      avisos: resultados.flatMap(x => x.r.avisos), recolhimento: primeiro.r.recolhimento,
      regraFiscalId: primeiro.r.regraId, dataDocumento: primeiro.entrada.dataDocumento };
  } catch (erro) {
    return memoriaPendente(nota, erro instanceof Error ? erro.message : "Não foi possível calcular a nota", codigo);
  }
}

export function calcularPorIcmsAntecipado(nota: NotaXML, _parametros: { aliquota_interna: number }, contexto?: ContextoEntrada): MemoriaCalculo {
  return calcularNotaOficial(nota, contexto, "ANTECIPACAO");
}
export function calcularPorUsoConsumo(nota: NotaXML, _parametros: { difal_percentual: number }, contexto?: ContextoEntrada): MemoriaCalculo {
  return calcularNotaOficial(nota, contexto, "DIFAL");
}

/**
 * Para cada NF, lista os NCMs presentes no XML que NÃO estão cadastrados
 * no mapa de legislações da lógica.
 */
export interface PendenciaNCM {
  chaveNF: string;        // `${nNF}|${cnpjEmitente}`
  nNF: string;
  cnpjEmitente: string;
  nomeEmitente: string;
  ncm: string;
  descricaoProduto: string;
}

export function listarNCMsPendentes(
  xmls: NotaXML[],
  ncmLegislacoes: Map<string, number>,
): PendenciaNCM[] {
  const pendencias: PendenciaNCM[] = [];
  const vistos = new Set<string>();
  for (const x of xmls) {
    const itens = x.itens ?? [];
    for (const it of itens) {
      const k = `${x.nNF}|${x.cnpjEmitente}|${it.ncm}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      if (!ncmLegislacoes.has(it.ncm)) {
        pendencias.push({
          chaveNF: `${x.nNF}|${x.cnpjEmitente}`,
          nNF: x.nNF,
          cnpjEmitente: x.cnpjEmitente,
          nomeEmitente: x.nomeEmitente,
          ncm: it.ncm,
          descricaoProduto: it.xProd ?? '',
        });
      }
    }
  }
  return pendencias;
}

/**
 * Valida inputs do usuário contra o conjunto de XMLs.
 * Para ST_PESO_LEGISLACAO:
 *   - quantidade_bateria == soma de qCom de todos os itens
 *   - peso_bateria * quantidade_bateria == pesoBruto total (tolerância 1%)
 */
export function validarInputsContraXML(
  xmls: NotaXML[],
  inputs: { peso_bateria: number; legislacao: number; quantidade_bateria: number },
): DivergenciaXML[] {
  const qtdXML = xmls.reduce((s, x) => s + x.quantidadeTotalItens, 0);
  const pesoXML = xmls.reduce((s, x) => s + x.pesoBruto, 0);
  const pesoInformadoTotal = inputs.peso_bateria * inputs.quantidade_bateria;

  const tol = 0.01;
  const dentroTol = (a: number, b: number) =>
    b === 0 ? a === 0 : Math.abs(a - b) / b <= tol;

  return [
    {
      campo: "quantidade",
      rotulo: "Quantidade total",
      valorInformado: inputs.quantidade_bateria,
      valorXML: qtdXML,
      ok: Math.round(inputs.quantidade_bateria) === Math.round(qtdXML),
    },
    {
      campo: "peso",
      rotulo: "Peso total (kg)",
      valorInformado: pesoInformadoTotal,
      valorXML: pesoXML,
      ok: dentroTol(pesoInformadoTotal, pesoXML),
    },
  ];
}

function parseValorBR(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.'));
}

export function parseExtratoSefazPE(textoPdf: string): ExtratoSefaz {

  // Normaliza todos os espaços em um único espaço — crítico

  const t = textoPdf.replace(/\s+/g, ' ').trim();

  // Razão social: vem entre "Código da Receita: <período>" e " Razão Social:"

  const razaoMatch = t.match(/Código da Receita:\s*\d{2}\/\d{4}\s+(.+?)\s+Razão Social:/);

  // Período fiscal (mm/yyyy): vem DEPOIS de "Código da Receita:"

  const periodoMatch = t.match(/Código da Receita:\s*(\d{2}\/\d{4})/);

  // IE: vem DEPOIS de "Inscrição Estadual:" e antes de "Período Fiscal:"

  const ieMatch = t.match(/Inscrição Estadual:\s*(\d[\d\-]+?)\s+Período Fiscal:/);

  // Número do extrato: vem ANTES de "N° do Extrato:"

  const extratoMatch = t.match(/(\d+\-\d+)\s+N°?\s*do Extrato:/);

  // Data de vencimento: vem ANTES de "Data de Vencimento:"

  const vencMatch = t.match(/(\d{2}\/\d{2}\/\d{4})\s+Data de Vencimento:/);

  // Linhas das notas — ORDEM INVERTIDA pelo pdfjs:

  // CNPJ_formatado  ICMS_devido  valor_NF  UF  nNF  registro

  const notas: NotaSefaz[] = [];

  const linhaRegex = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s+([\d.,]+)\s+([\d.,]+)\s+([A-Z]{2})\s+(\d+)\s+(\d{3}\.\d\.\d{9}-\d)/g;

  let m;

  while ((m = linhaRegex.exec(t)) !== null) {

    notas.push({

      registro: m[6],

      nNF: m[5],

      uf: m[4],

      vNF: parseValorBR(m[3]),

      icmsDevido: parseValorBR(m[2]),

      cnpjEmitente: m[1].replace(/\D/g, ''),

    });

  }

  return {

    razaoSocial: razaoMatch ? razaoMatch[1].trim() : '',

    inscricaoEstadual: ieMatch ? ieMatch[1].trim() : '',

    periodoFiscal: periodoMatch ? periodoMatch[1] : '',

    numeroExtrato: extratoMatch ? extratoMatch[1].trim() : '',

    dataVencimento: vencMatch ? vencMatch[1] : '',

    notas,

    icmsARecolher: notas.reduce((s, n) => s + n.icmsDevido, 0),

  };

}

export function parseXMLNFe(xmlString: string): NotaXML | null {
  // fast-xml-parser: DOMParser não existe no runtime do servidor (Workers).
  const doc = parseXmlDoc(xmlString);
  const infNFe = selecionarTodos(doc, "infNFe")[0];
  if (!infNFe) return null;

  const chaveAcesso = (infNFe.atributos["Id"] || "").replace("NFe", "");
  const get = (caminho: string) => textoDe(selecionarTodos(doc, caminho)[0] ?? null);
  const getNum = (caminho: string) => numeroDeTexto(get(caminho)) ?? 0;
  const filho = (no: XmlNode | null | undefined, nome: string) =>
    no?.filhos.find((f) => f.nome === nome) ?? null;

  const dets = selecionarTodos(doc, "det");

  const itens: ItemXML[] = dets
    .map((det) => {
      const p = filho(det, "prod");
      const imposto = filho(det, "imposto");
      const icms = filho(imposto, "ICMS")?.filhos[0];
      const v = (c: string) => numeroDeTexto(textoDe(filho(p, c))) ?? 0;
      const ic = (c: string) => numeroDeTexto(textoDe(filho(icms, c))) ?? 0;
      const infAd =
        textoDe(filho(det, "infAdProd")) || textoDe(filho(p, "infAdProd")) || null;
      return {
        entradaFiscal: {
          numero_item: Number(det.atributos.nItem ?? 1), ncm: textoDe(filho(p, "NCM")),
          cfop: textoDe(filho(p, "CFOP")), origem_mercadoria: textoDe(filho(icms, "orig")),
          cst_csosn: textoDe(filho(icms, "CST")) || textoDe(filho(icms, "CSOSN")),
          aliquota_interna_destino: numeroDeTexto(textoDe(filho(filho(imposto, "ICMSUFDest"), "pICMSUFDest"))) ?? undefined,
          aliquota_icms_origem: ic("pICMS") || numeroDeTexto(textoDe(filho(filho(imposto, "ICMSUFDest"), "pICMSInter"))) || 0,
          valor_total_item: v("vProd"), valor_frete_item: v("vFrete"), valor_seguro_item: v("vSeg"),
          valor_outros_item: v("vOutro"), valor_desconto_item: v("vDesc"), valor_icms_item: ic("vICMS"),
          valor_ipi_item: numeroDeTexto(textoDe(filho(filho(filho(imposto, "IPI"), "IPITrib"), "vIPI"))) ?? 0,
        },
        ncm: textoDe(filho(p, "NCM")),
        qCom: numeroDeTexto(textoDe(filho(p, "qCom"))) ?? 0,
        xProd: textoDe(filho(p, "xProd")) || undefined,
        vProdItem: numeroDeTexto(textoDe(filho(p, "vProd"))) ?? 0,
        pesoUnitarioKg: extrairPesoUnitarioInfAdProd(infAd),
        infAdProd: infAd,
      };
    })
    .filter((it) => it.ncm);

  const ncmsTodos = itens.map((it) => it.ncm).filter(Boolean);
  const cstsTodos = selecionarTodos(doc, "det>imposto>ICMS")
    .flatMap((icms) => icms.filhos.flatMap((g) => g.filhos))
    .filter((n) => n.nome === "CST")
    .map((n) => textoDe(n))
    .filter(Boolean);

  // Grupo ICMSUFDest (DIFAL para operações interestaduais a consumidor final /
  // uso e consumo): pICMSUFDest = alíquota interna da UF de destino,
  // pICMSInter = alíquota interestadual. Usamos o primeiro item completo.
  let pICMSUFDest: number | undefined;
  let pICMSInter: number | undefined;
  for (const g of selecionarTodos(doc, "det>imposto>ICMSUFDest")) {
    const a = numeroDeTexto(textoDe(filho(g, "pICMSUFDest"))) ?? 0;
    const b = numeroDeTexto(textoDe(filho(g, "pICMSInter"))) ?? 0;
    if (a > 0 && b > 0) { pICMSUFDest = a; pICMSInter = b; break; }
  }

  return {
    data_emissao: (get("ide>dhEmi") || get("ide>dEmi")).slice(0, 10),
    cnpjDestinatario: get("dest>CNPJ"),
    chaveAcesso,
    nNF: get("ide>nNF"),
    cnpjEmitente: get("emit>CNPJ"),
    ufEmitente: get("emit>enderEmit>UF"),
    nomeEmitente: get("emit>xNome"),
    vProd: getNum("total>ICMSTot>vProd"),
    vIPI: getNum("total>ICMSTot>vIPI"),
    vFrete: getNum("total>ICMSTot>vFrete"),
    vSeg: getNum("total>ICMSTot>vSeg"),
    vDesc: getNum("total>ICMSTot>vDesc"),
    vOutro: getNum("total>ICMSTot>vOutro"),
    vICMS: getNum("total>ICMSTot>vICMS"),
    vST: getNum("total>ICMSTot>vST"),
    vNF: getNum("total>ICMSTot>vNF"),
    ncmsTodos: Array.from(new Set(ncmsTodos)),
    cstICMS: Array.from(new Set(cstsTodos)),
    pesoBruto: getNum("transp>vol>pesoB"),
    pesoLiquido: getNum("transp>vol>pesoL"),
    quantidadeTotalItens: itens.reduce((s, it) => s + (it.qCom || 0), 0),
    itens,
    pICMSUFDest,
    pICMSInter,
    vBC: getNum("total>ICMSTot>vBC"),
    vBCST: getNum("total>ICMSTot>vBCST"),
    doc,
  };
}


export function deveProcessarArquivo(nome: string): boolean {
  if (!nome.toLowerCase().endsWith('.xml')) return false;
  const lower = nome.toLowerCase();
  return !lower.includes('_cienc') && !lower.includes('_mdf');
}

export function calcularMemoria(nota: NotaXML): MemoriaCalculo {
  const baseBrutaDetalhe = {
    vProd: nota.vProd, vIPI: nota.vIPI, vDesc: nota.vDesc,
    vFrete: nota.vFrete, vSeg: nota.vSeg, vOutro: nota.vOutro,
  };
  const baseBruta = nota.vProd + nota.vIPI - nota.vDesc
                  + nota.vFrete + nota.vSeg + nota.vOutro;
  const ehBateria = nota.ncmsTodos.some(ncm => NCMS_SUPORTADOS.includes(ncm));
  if (!ehBateria) {
    return {
      suportado: false,
      motivoNaoSuportado: `NCM ${nota.ncmsTodos.join(', ') || '(vazio)'} não suportado neste MVP (apenas NCM 8507 — baterias)`,
      baseBruta, baseBrutaDetalhe,
      mvaAjustadaPct: 0, baseST: 0,
      aliquotaInternaPct: ALIQUOTA_INTERNA_PE * 100,
      icmsTotal: 0, vICMSOrigem: nota.vICMS,
      icmsAntecipado: 0,
      stJaRetidaNaOrigem: false,
      cstsEncontrados: nota.cstICMS, vST: nota.vST,
    };
  }
  const stJaRetida = nota.vST > 0
    || nota.cstICMS.some(cst => ['10','30','60','70'].includes(cst));
  if (stJaRetida) {
    return {
      suportado: true,
      motivoNaoSuportado: 'ICMS-ST já retido na origem pelo emitente — SEFAZ-PE não cobra antecipação',
      baseBruta, baseBrutaDetalhe,
      mvaAjustadaPct: MVA_AJUSTADA_BATERIAS * 100,
      baseST: 0,
      aliquotaInternaPct: ALIQUOTA_INTERNA_PE * 100,
      icmsTotal: 0, vICMSOrigem: nota.vICMS,
      icmsAntecipado: 0,
      stJaRetidaNaOrigem: true,
      cstsEncontrados: nota.cstICMS, vST: nota.vST,
    };
  }
  const baseST = baseBruta * (1 + MVA_AJUSTADA_BATERIAS);
  const icmsTotal = baseST * ALIQUOTA_INTERNA_PE;
  const icmsAntecipado = Math.max(0, icmsTotal - nota.vICMS);
  return {
    suportado: true,
    baseBruta, baseBrutaDetalhe,
    mvaAjustadaPct: MVA_AJUSTADA_BATERIAS * 100,
    baseST,
    aliquotaInternaPct: ALIQUOTA_INTERNA_PE * 100,
    icmsTotal, vICMSOrigem: nota.vICMS,
    icmsAntecipado,
    stJaRetidaNaOrigem: false,
    cstsEncontrados: nota.cstICMS, vST: nota.vST,
  };
}

export function calcularICMSAntecipado(nota: NotaXML): number {
  return calcularMemoria(nota).icmsAntecipado;
}

// ────────────────────────────────────────────────────────────────────
// FLUXO_VISUAL: motor que consome a árvore montada pelo usuário
// (avaliação estrita esquerda-para-direita — ver src/lib/fluxo-calculo.ts).
// ────────────────────────────────────────────────────────────────────
/**
 * Resolve os campos do XML usados pelo fluxograma.
 *
 * Com catálogo (`public.campos_xml`) + árvore XML da nota, os valores vêm do
 * resolvedor genérico. Sem catálogo (notas parseadas por caminhos legados),
 * cai no mapeamento fixo dos campos históricos.
 */
export function valoresFluxoDaNota(
  nota: NotaXML,
  campos: CampoXmlDef[] = [],
): Record<string, number> {
  if (campos.length && nota.doc) {
    return resolverCamposXml(nota.doc, campos);
  }
  // Peso unitário: prioriza o peso declarado em infAdProd (ex.: "#13.5KG#") do
  // item predominante (maior valor); se ausente, cai no peso médio da nota.
  const itens = nota.itens ?? [];
  const comPeso = itens.filter((it) => (it.pesoUnitarioKg ?? 0) > 0);
  const predominante = comPeso
    .slice()
    .sort((a, b) => (b.vProdItem ?? 0) - (a.vProdItem ?? 0))[0];
  const pesoUnitario =
    predominante?.pesoUnitarioKg ??
    (nota.quantidadeTotalItens > 0
      ? (nota.pesoBruto || nota.pesoLiquido || 0) / nota.quantidadeTotalItens
      : 0);
  return {
    valor_produtos: nota.vProd,
    valor_frete: nota.vFrete,
    valor_seguro: nota.vSeg,
    valor_ipi: nota.vIPI,
    valor_desconto: nota.vDesc,
    valor_outros: nota.vOutro,
    valor_total_nf: nota.vNF,
    base_icms: nota.vBC ?? 0,
    icms_destacado: nota.vICMS,
    base_icms_st: nota.vBCST ?? 0,
    icms_st_destacado: nota.vST,
    peso_bruto: nota.pesoBruto,
    peso_liquido: nota.pesoLiquido,
    quantidade_itens: nota.quantidadeTotalItens,
    peso_unitario: pesoUnitario,
    peso_unitario_medio:
      nota.quantidadeTotalItens > 0
        ? (nota.pesoBruto || nota.pesoLiquido || 0) / nota.quantidadeTotalItens
        : 0,
  };
}


export function calcularPorFluxo(
  nota: NotaXML,
  fluxoJson: unknown,
  campos: CampoXmlDef[] = [],
): MemoriaCalculo {

  const baseBrutaDetalhe = {
    vProd: nota.vProd, vIPI: nota.vIPI, vDesc: nota.vDesc,
    vFrete: nota.vFrete, vSeg: nota.vSeg, vOutro: nota.vOutro,
  };
  const baseBruta = nota.vProd + nota.vIPI - nota.vDesc + nota.vFrete + nota.vSeg + nota.vOutro;

  const fluxo = parseFluxo(fluxoJson);
  const nao = (motivo: string): MemoriaCalculo => ({
    suportado: false,
    motivoNaoSuportado: motivo,
    baseBruta, baseBrutaDetalhe,
    mvaAjustadaPct: 0, baseST: 0,
    aliquotaInternaPct: 0,
    icmsTotal: 0, vICMSOrigem: nota.vICMS,
    icmsAntecipado: 0,
    stJaRetidaNaOrigem: false,
    cstsEncontrados: nota.cstICMS, vST: nota.vST,
    formulaCodigo: "FLUXO_VISUAL",
  });

  if (!fluxoValido(fluxo)) {
    return nao("Lógica visual sem fluxo válido — abra a lógica e monte a fórmula.");
  }
  const av = avaliarFluxoDetalhado(fluxo, valoresFluxoDaNota(nota, campos), campos);
  if (!av.valido) {
    // Campo removido/inativo do catálogo nunca vale zero: a nota fica sem
    // cálculo e o motivo aparece na conferência.
    return nao(av.erro ?? "Fórmula inválida.");
  }
  const resultado = av.resultado;


  return {
    suportado: true,
    baseBruta, baseBrutaDetalhe,
    mvaAjustadaPct: 0, baseST: 0,
    aliquotaInternaPct: 0,
    icmsTotal: resultado,
    vICMSOrigem: nota.vICMS,
    icmsAntecipado: resultado,
    stJaRetidaNaOrigem: false,
    cstsEncontrados: nota.cstICMS, vST: nota.vST,
    trace: av.passos,
    formulaCodigo: "FLUXO_VISUAL",
    fluxo: { resultado, ok: true },
  };
}

// ── Cálculo POR ITEM ────────────────────────────────────────────────
// Cada <det> vira uma "mini-nota": o documento mantém só aquele item e os
// totais (ICMSTot) passam a ser os valores do próprio item. Assim a mesma
// fórmula roda item a item e o ICMS da nota é a soma dos itens.
function clonarNo(n: XmlNode): XmlNode {
  return { nome: n.nome, texto: n.texto, atributos: { ...n.atributos }, filhos: n.filhos.map(clonarNo) };
}
function numFilho(n: XmlNode | undefined, caminho: string[]): number {
  let atuais: XmlNode[] = n ? [n] : [];
  for (const seg of caminho) {
    atuais = atuais.flatMap((x) =>
      x.filhos.filter((f) => f.nome === seg || (seg === "*" )),
    );
  }
  return numeroDeTexto(textoDe(atuais[0] ?? null)) ?? 0;
}
function docDoItem(doc: XmlNode, det: XmlNode, fracaoPeso: number): XmlNode {
  const prod = det.filhos.find((f) => f.nome === "prod");
  const imposto = det.filhos.find((f) => f.nome === "imposto");
  const v = (c: string) => numFilho(prod, [c]);
  const icms = (c: string) => numFilho(imposto, ["ICMS", "*", c]);
  const tot: Record<string, number> = {
    vProd: v("vProd"), vFrete: v("vFrete"), vSeg: v("vSeg"),
    vDesc: v("vDesc"), vOutro: v("vOutro"),
    vBC: icms("vBC"), vICMS: icms("vICMS"),
    vBCST: icms("vBCST"), vST: icms("vICMSST"),
    vIPI: numFilho(imposto, ["IPI", "IPITrib", "vIPI"]),
  };
  tot.vNF = tot.vProd + tot.vFrete + tot.vSeg + tot.vOutro + tot.vIPI + tot.vST - tot.vDesc;
  const visitar = (n: XmlNode): XmlNode | null => {
    if (n.nome === "det") return n === det ? clonarNo(n) : null;
    const c: XmlNode = { nome: n.nome, texto: n.texto, atributos: { ...n.atributos }, filhos: [] };
    for (const f of n.filhos) {
      const r = visitar(f);
      if (r) c.filhos.push(r);
    }
    if (n.nome === "ICMSTot") {
      for (const f of c.filhos) if (f.nome in tot) f.texto = String(tot[f.nome]);
    }
    if (n.nome === "vol") {
      for (const f of c.filhos)
        if (f.nome === "pesoB" || f.nome === "pesoL")
          f.texto = String((numeroDeTexto(f.texto) ?? 0) * fracaoPeso);
    }
    return c;
  };
  const isolado = visitar(doc);
  if (!isolado) throw new Error("Não foi possível isolar o produto da nota fiscal.");
  return isolado;
}

export function calcularFluxoPorItem(
  nota: NotaXML,
  fluxoDoNcm: (ncm: string) => unknown,
  campos: CampoXmlDef[],
): MemoriaCalculo {
  const dets = nota.doc ? selecionarTodos(nota.doc, "det") : [];
  if (!campos.length || !nota.doc || dets.length <= 1) {
    return calcularPorFluxo(nota, fluxoDoNcm(ncmPredominanteDaNota(nota)), campos);
  }
  const qtd = dets.map((d) => numFilho(d, ["prod", "qCom"]));
  const qtdTotal = qtd.reduce((s, x) => s + x, 0);
  let total = 0;
  const trace: NonNullable<MemoriaCalculo["trace"]> = [];
  let base: MemoriaCalculo | null = null;
  for (let i = 0; i < dets.length; i++) {
    const det = dets[i];
    const ncm = textoDe(det.filhos.find((f) => f.nome === "prod")?.filhos.find((f) => f.nome === "NCM") ?? null);
    const xProd = textoDe(det.filhos.find((f) => f.nome === "prod")?.filhos.find((f) => f.nome === "xProd") ?? null);
    const fracao = qtdTotal > 0 ? qtd[i] / qtdTotal : 1 / dets.length;
    const notaItem: NotaXML = { ...nota, doc: docDoItem(nota.doc, det, fracao) };
    const m = calcularPorFluxo(notaItem, fluxoDoNcm(ncm), campos);
    if (!m.suportado) {
      return { ...m, motivoNaoSuportado: `Item ${i + 1} (${xProd || ncm}): ${m.motivoNaoSuportado}` };
    }
    base ??= m;
    total += m.icmsAntecipado;
    trace.push({ passo: `■ Item ${i + 1} — ${xProd || "produto"} (NCM ${ncm || "?"})`, detalhe: "", valor: 0 });
    for (const p of m.trace ?? []) trace.push({ ...p, passo: "  " + p.passo });
    trace.push({ passo: `= ICMS do item ${i + 1}`, detalhe: "", valor: m.icmsAntecipado });
  }
  trace.push({ passo: `Σ Soma do ICMS dos ${dets.length} itens`, detalhe: "", valor: total });
  const ref = calcularPorFluxo(nota, fluxoDoNcm(ncmPredominanteDaNota(nota)), campos);
  return {
    ...(base ?? ref),
    baseBruta: ref.baseBruta,
    baseBrutaDetalhe: ref.baseBrutaDetalhe,
    vICMSOrigem: nota.vICMS,
    icmsTotal: total,
    icmsAntecipado: total,
    trace,
    fluxo: { resultado: total, ok: true },
  };
}

function formatarPeriodo(mmYYYY: string): string {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const [mes, ano] = mmYYYY.split('/');
  const idx = parseInt(mes, 10) - 1;
  return (idx < 0 || idx > 11) ? mmYYYY : `${meses[idx]}/${ano}`;
}

/**
 * PONTO ÚNICO DE ESCOLHA DO NCM PARA A FÓRMULA.
 *
 * Hoje o cálculo é POR NOTA, então precisamos eleger um NCM representativo:
 * o NCM do item de MAIOR valor total (`prod > vProd`). Havendo empate ou
 * ausência de valores, cai para o primeiro item / primeiro NCM da nota.
 *
 * Se no futuro o cálculo passar a ser POR ITEM, basta deixar de usar esta
 * função e chamar `resolverFluxoNcm` com o NCM de cada item.
 */
export function ncmPredominanteDaNota(nota: NotaXML): string {
  let melhor = "";
  let maior = -1;
  for (const it of nota.itens ?? []) {
    if (!it.ncm) continue;
    const v = Number(it.vProdItem ?? 0);
    if (v > maior) { maior = v; melhor = it.ncm; }
  }
  return melhor || nota.ncmsTodos?.[0] || "";
}

export function conferir(
  extrato: ExtratoSefaz,
  xmls: NotaXML[],
  opcoes?: ProcessarOpcoes,
): ResultadoConferencia {
  const formulaCodigo = opcoes?.logica?.formula_codigo;
  const temFluxo = fluxoValido(parseFluxo(opcoes?.logica?.fluxo));
  const usarPesoLegis =
    !temFluxo &&
    formulaCodigo === "ST_PESO_LEGISLACAO" &&
    opcoes?.ncmLegislacoes !== undefined;
  const usarUsoConsumo = !temFluxo && formulaCodigo === "USO_E_CONSUMO";
  const usarIcmsAntecipado = !temFluxo && formulaCodigo === "ICMS_ANTECIPADO";
  // Quando a lógica tem fluxograma montado, ele tem precedência sobre a
  // fórmula fixa. Lógicas legadas sem fluxo seguem o caminho antigo.
  const usarFluxo =
    formulaCodigo === "FLUXO_VISUAL" ||
    fluxoValido(parseFluxo(opcoes?.logica?.fluxo));
  const params = (opcoes?.logica?.parametros ?? {}) as {
    aliquota_interna?: number;
    difal_percentual?: number;
  };
  const difalPctUsoConsumo = Number(params.difal_percentual ?? 0);
  const baseLegis = opcoes?.ncmLegislacoes ?? new Map<string, number>();
  const overridesPorNF = opcoes?.legislacoesManuaisPorNF ?? new Map();
  const fluxoJson = opcoes?.logica?.fluxo;

  const chave = (n: string, c: string) => `${n}|${c}`;
  const indexXML = new Map<string, NotaXML>();
  for (const x of xmls) indexXML.set(chave(x.nNF, x.cnpjEmitente), x);

  const linhas: LinhaConferencia[] = [];
  let notasNaoSuportadas = 0;
  let xmlsUsados = 0;

  for (const notaSefaz of extrato.notas) {
    const xml = indexXML.get(chave(notaSefaz.nNF, notaSefaz.cnpjEmitente));
    if (!xml) {
      // Só mostramos notas cujo XML foi enviado. As demais linhas do
      // extrato SEFAZ são ignoradas silenciosamente.
      continue;
    }
    xmlsUsados++;
    let memoria: MemoriaCalculo;
    if (usarPesoLegis) {
      // Mescla legislações base com overrides desta NF
      const chaveNF = chave(notaSefaz.nNF, notaSefaz.cnpjEmitente);
      const overrides = overridesPorNF.get(chaveNF) as Map<string, number> | undefined;
      const legisFinais = new Map(baseLegis);
      if (overrides) for (const [k, v] of overrides) legisFinais.set(k, v);
      memoria = calcularPorLogicaSTPeso(
        xml,
        { aliquota_interna: params.aliquota_interna ?? 20.5 },
        legisFinais,
      );
    } else if (usarUsoConsumo) {
      memoria = opcoes?.memoriasOficiais?.[xml.chaveAcesso] ?? calcularPorUsoConsumo(xml, { difal_percentual: difalPctUsoConsumo });
    } else if (usarIcmsAntecipado) {
      memoria = opcoes?.memoriasOficiais?.[xml.chaveAcesso] ?? calcularPorIcmsAntecipado(xml, {
        aliquota_interna: params.aliquota_interna ?? 20.5,
      });
    } else if (usarFluxo) {
      memoria = calcularFluxoPorItem(xml, (ncm) =>
        resolverFluxoNcm({
          ncm,
          fluxoPadrao: parseFluxo(fluxoJson),
          overrides: opcoes?.fluxosPorNcm ?? [],
          dataReferencia: opcoes?.dataReferencia,
        }), opcoes?.camposXml ?? []);
    } else {
      memoria = calcularMemoria(xml);
    }
    const suportado = memoria.suportado;
    if (!suportado) notasNaoSuportadas++;
    linhas.push({
      nNF: notaSefaz.nNF,
      cnpjEmitente: notaSefaz.cnpjEmitente,
      nomeEmitente: xml.nomeEmitente,
      vNF: notaSefaz.vNF,
      icmsSefaz: notaSefaz.icmsDevido,
      icmsCalculado: memoria.icmsAntecipado,
      diferenca: memoria.icmsAntecipado - notaSefaz.icmsDevido,
      suportado,
      chaveAcesso: xml.chaveAcesso,
      nomeArquivo: xml.nomeArquivo,
      memoria,
      xmlInfo: {
        ufEmitente: xml.ufEmitente,
        vProd: xml.vProd, vFrete: xml.vFrete, vSeg: xml.vSeg,
        vDesc: xml.vDesc, vOutro: xml.vOutro, vIPI: xml.vIPI, vICMS: xml.vICMS,
      },
      difalUsadoPct: undefined,
    });
  }

  return {
    empresa: {
      razaoSocial: extrato.razaoSocial,
      ie: extrato.inscricaoEstadual,
      periodo: formatarPeriodo(extrato.periodoFiscal),
    },
    icmsSefaz: extrato.icmsARecolher,
    icmsCalculado: linhas.reduce((s, l) => s + l.icmsCalculado, 0),
    diferenca: linhas.reduce((s, l) => s + l.icmsCalculado, 0) - extrato.icmsARecolher,
    notasConferidas: linhas,
    estatisticas: {
      xmlsRecebidos: xmls.length,
      xmlsDescartados: xmls.length - xmlsUsados,
      notasNaoSuportadas,
    },
  };
}

export async function processar(
  arquivoPDF: File,
  arquivosNotas: File[]
  ,
  opcoes?: ProcessarOpcoes
): Promise<ResultadoConferencia> {
  // Lazy-load libs pesadas só quando o usuário processa de fato
  const [pdfjs, { default: JSZip }, { default: pdfWorkerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('jszip'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const buf = await arquivoPDF.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let texto = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texto += content.items.map((item: any) => ('str' in item ? item.str : '')).join(' ') + '\n';
  }
  const extrato = parseExtratoSefazPE(texto);

  void JSZip;
  const xmls = await parseArquivosXML(arquivosNotas);


  return conferir(extrato, xmls, opcoes);
}


export async function textoDePdf(buf: ArrayBuffer): Promise<string> {
  const [pdfjs, { default: pdfWorkerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let texto = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    texto += content.items.map((it: any) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  return texto;
}

/**
 * DANFE em PDF: a leitura depende de IA (etapa 2 da integração na plataforma).
 * Por enquanto, orienta o usuário a enviar o XML da nota.
 */
async function parseDanfePdf(nome: string, _buf: ArrayBuffer): Promise<NotaXML | null> {
  throw new Error(`${nome}: leitura de DANFE em PDF ainda não disponível na plataforma — envie o XML da nota (ou um .zip com os XMLs).`);
}

/** Parser leve só para validação prévia (sem processar extrato). Aceita XML, PDF (DANFE) e ZIP. */
export async function parseArquivosXML(arquivos: File[]): Promise<NotaXML[]> {
  const { default: JSZip } = await import('jszip');
  const xmls: NotaXML[] = [];
  const add = (n: NotaXML | null, nome: string) => {
    if (n) { n.nomeArquivo = nome; xmls.push(n); }
  };
  // PDFs são lidos por IA (lento): coletamos e processamos em paralelo.
  const pdfs: Array<{ nome: string; ler: () => Promise<ArrayBuffer> }> = [];
  for (const f of arquivos) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(f);
      for (const [nome, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        if (nome.toLowerCase().endsWith('.pdf')) {
          pdfs.push({ nome, ler: () => entry.async('arraybuffer') });
        } else if (deveProcessarArquivo(nome)) {
          add(parseXMLNFe(await entry.async('text')), nome);
        }
      }
    } else if (lower.endsWith('.pdf')) {
      pdfs.push({ nome: f.name, ler: () => f.arrayBuffer() });
    } else if (deveProcessarArquivo(f.name)) {
      add(parseXMLNFe(await f.text()), f.name);
    }
  }
  if (pdfs.length) {
    const CONCORRENCIA = 6;
    const resultados: Array<NotaXML | null> = new Array(pdfs.length).fill(null);
    let prox = 0;
    let erro: unknown = null;
    const worker = async () => {
      while (prox < pdfs.length && !erro) {
        const i = prox++;
        try {
          resultados[i] = await parseDanfePdf(pdfs[i].nome, await pdfs[i].ler());
        } catch (e) {
          erro = erro ?? e;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, pdfs.length) }, worker));
    if (erro) throw erro;
    resultados.forEach((n, i) => add(n, pdfs[i].nome));
  }
  return xmls;
}

/** Lê o PDF do extrato SEFAZ-PE e retorna o ExtratoSefaz parseado. */
export async function parseExtratoPDF(arquivoPDF: File): Promise<ExtratoSefaz> {
  const [pdfjs, { default: pdfWorkerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const buf = await arquivoPDF.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let texto = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    texto += content.items.map((item: any) => ('str' in item ? item.str : '')).join(' ') + '\n';
  }
  return parseExtratoSefazPE(texto);
}