/**
 * Constantes compartilhadas pelo módulo de Perfil Fiscal.
 * Mantém labels, valores e tooltips em um único lugar para que o
 * dialog de edição e a visualização vigente fiquem sempre sincronizados.
 */

export const TIPOS_EMPRESA = [
  "Varejista",
  "Atacadista",
  "Indústria",
  "Equiparado a Indústria",
] as const;
export type TipoEmpresa = (typeof TIPOS_EMPRESA)[number];

export const PORTES = [
  "Microempreendedor Individual (MEI)",
  "Microempresa (ME)",
  "Empresa de Pequeno Porte (EPP)",
  "Médio Porte",
  "Grande Porte",
] as const;
export type Porte = (typeof PORTES)[number];

export const REGIMES = [
  "Simples Nacional",
  "Lucro Presumido",
  "Lucro Real",
] as const;
export type Regime = (typeof REGIMES)[number];

export const LOCALIZACOES = [
  "Região Metropolitana do Recife (RMR)",
  "Agreste",
  "Zona da Mata",
  "Sertão",
  "São Francisco",
] as const;
export type Localizacao = (typeof LOCALIZACOES)[number];

export interface SistematicaOption {
  value: string;
  label: string;
  tooltip: string;
}

export const SISTEMATICAS: SistematicaOption[] = [
  {
    value: "atacadista",
    label: "Atacadista",
    tooltip: "Decreto específico do varejo PE para atacadistas.",
  },
  {
    value: "farmaceutico",
    label: "Farmacêutico",
    tooltip: "Sistemática especial do setor farmacêutico.",
  },
  {
    value: "gado_corte",
    label: "Gado / Setor de Corte",
    tooltip: "Regime aplicável ao setor de gado e corte.",
  },
  {
    value: "cesta_basica",
    label: "Cesta Básica",
    tooltip: "Reduções e benefícios para itens da cesta básica.",
  },
  {
    value: "regime_reativo",
    label: "Regime Reativo",
    tooltip: "Regime reativo aplicado em condições específicas.",
  },
  {
    value: "vestuario",
    label: "Vestuário/Confecções",
    tooltip: "Sistemática específica do setor de vestuário e confecções.",
  },
  {
    value: "bebidas",
    label: "Bebidas",
    tooltip: "Sistemática específica do setor de bebidas.",
  },
];

export interface FlagDef {
  key: keyof PerfilFlags;
  label: string;
  tooltip: string;
}

export interface PerfilFlags {
  incentivo_fiscal: boolean;
  excluir_frete_calculo: boolean;
  incluir_ipi_frete_outras: boolean;
  calculo_manual: boolean;
  st_exige_cest: boolean;
  desconto_incondicional_calcula: boolean;
  considerar_dentro_estado: boolean;
  empresa_regular_fisco: boolean;
  industria_ou_equiparado: boolean;
}

export const FLAGS_DEFAULT: PerfilFlags = {
  incentivo_fiscal: false,
  excluir_frete_calculo: true,
  incluir_ipi_frete_outras: false,
  calculo_manual: false,
  st_exige_cest: false,
  desconto_incondicional_calcula: false,
  considerar_dentro_estado: false,
  empresa_regular_fisco: true,
  industria_ou_equiparado: false,
};

export const FLAGS_BENEFICIOS: FlagDef[] = [
  {
    key: "incentivo_fiscal",
    label: "Incentivo Fiscal",
    tooltip:
      "Empresa beneficiária de incentivo fiscal estadual (ex: PRODEPE, PEAP). Aplica reduções específicas previstas em decretos.",
  },
  {
    key: "excluir_frete_calculo",
    label: "Excluir frete do cálculo",
    tooltip:
      "Quando ativado, o valor do frete não compõe a base de cálculo do ICMS Fronteira. Configuração específica do perfil do contribuinte em PE.",
  },
  {
    key: "incluir_ipi_frete_outras",
    label: "Incluir IPI/Frete/Outras na base do ICMS",
    tooltip:
      "Quando ativado, IPI, frete e outras despesas acessórias compõem a base de cálculo do ICMS.",
  },
  {
    key: "calculo_manual",
    label: "Cálculo manual",
    tooltip:
      "Quando ativado, o sistema permite ajuste manual em casos específicos (somente usuários com papel fiscal/admin podem usar).",
  },
  {
    key: "st_exige_cest",
    label: "Para ser ST tem que ter CEST",
    tooltip:
      "Quando ativado, produtos sem CEST cadastrado não são tratados como Substituição Tributária mesmo que o NCM esteja na lista de ST.",
  },
  {
    key: "desconto_incondicional_calcula",
    label: "Desconto Incondicional entra no cálculo",
    tooltip:
      "Em Pernambuco (Não), descontos incondicionais NÃO entram no cálculo. Na Paraíba (Sim) sim. Para PE, mantenha desativado.",
  },
  {
    key: "considerar_dentro_estado",
    label: "Considerar XML de dentro do estado",
    tooltip:
      "Quando ativado, processa também documentos de operações dentro de PE (não apenas interestaduais).",
  },
  {
    key: "empresa_regular_fisco",
    label: "Empresa regular perante o fisco",
    tooltip: "Status de regularidade fiscal. Pode condicionar uso de benefícios.",
  },
];

export const CALCULO_POR_OPCOES = [
  {
    value: "extrato",
    label: "Pelo extrato SEFAZ",
    description: "Só processa XMLs contidos no extrato baixado.",
  },
  {
    value: "emissao",
    label: "Pela emissão",
    description: "Processa XMLs do período mesmo se não estão no extrato.",
  },
] as const;
export type CalculoPor = (typeof CALCULO_POR_OPCOES)[number]["value"];

/**
 * Estrutura completa do JSONB armazenado em perfis_fiscais.flags.
 * Inclui flags booleanas + parâmetros estruturados que não têm coluna
 * dedicada no schema atual.
 */
export interface PerfilFlagsExtended extends PerfilFlags {
  tipo_empresa?: TipoEmpresa;
  localizacao?: Localizacao;
  criterio_localizacao?: string;
  calculo_por?: CalculoPor;
  considerar_origem_cst_chave?: boolean;
  // Flags do motor oficial de antecipação (Dec. 44.650/2017)
  sujeito_antecipacao?: boolean;
  regular_339a?: boolean;
  agreste_anexo19?: boolean;
  credenciado_38455?: boolean;
  sistemista_prodeauto?: boolean;
  dispensa_mva?: boolean;
  atividade_suspensa?: boolean;
  destinacao_padrao?: DestinacaoPadrao;
}

export const DESTINACOES_PADRAO = [
  { value: "COMERCIALIZACAO", label: "Comercialização (revenda)" },
  { value: "INDUSTRIALIZACAO", label: "Industrialização" },
  { value: "USO_CONSUMO", label: "Uso e consumo" },
  { value: "ATIVO", label: "Ativo permanente" },
] as const;
export type DestinacaoPadrao = (typeof DESTINACOES_PADRAO)[number]["value"];

export interface FlagAntecipacaoDef {
  key: keyof PerfilFlagsExtended;
  label: string;
  tooltip: string;
}

export const FLAGS_ANTECIPACAO: FlagAntecipacaoDef[] = [
  {
    key: "sujeito_antecipacao",
    label: "Sujeito à antecipação tributária (Dec. 44.650/2017, arts. 329 a 347)",
    tooltip: "Define o código de receita: 058-2 quando sujeito; 057-4 em uso, consumo e ativo quando não sujeito.",
  },
  {
    key: "regular_339a",
    label: "Simples regular (art. 339-A)",
    tooltip:
      "Adquirente do Simples Nacional regular nos termos do art. 339-A do Dec. 44.650/2017 — habilita o benefício do art. 363-A (carga tributária reduzida).",
  },
  {
    key: "agreste_anexo19",
    label: "Agreste com CNAE no Anexo 19",
    tooltip:
      "Empresa na mesorregião do Agreste com CNAE principal no Anexo 19 — carga tributária específica do item 2.3.7.2.1.",
  },
  {
    key: "credenciado_38455",
    label: "Atacadista credenciado (Dec. 38.455/2012)",
    tooltip: "Atacadista credenciado no Dec. 38.455/2012 — antecipação limitada a 6% da base.",
  },
  {
    key: "sistemista_prodeauto",
    label: "Sistemista Prodeauto",
    tooltip: "Atacadista sistemista do Prodeauto — antecipação limitada a 1% da base.",
  },
  {
    key: "dispensa_mva",
    label: "Dispensa de MVA (edital DPC / Prodeauto)",
    tooltip:
      "Transferências > 60% (art. 332, §§ 2º e 3º) ou sistemista Prodeauto — a antecipação é calculada sem agregação de MVA.",
  },
  {
    key: "atividade_suspensa",
    label: "Atividade suspensa (art. 342)",
    tooltip: "Com atividade suspensa, a MVA é 30% ou a do Anexo 12, o maior.",
  },
];