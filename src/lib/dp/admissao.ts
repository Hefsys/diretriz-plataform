import { z } from "zod";

export const TIPOS_DOCUMENTO = [
  { id: "aso", label: "ASO - Exame Admissional", obrigatorio: true, ajuda: "Documento original emitido pela clínica" },
  { id: "ctps", label: "Carteira de Trabalho", obrigatorio: true, ajuda: "Digital ou física" },
  { id: "pis_pasep", label: "Cartão de Inscrição no PIS/PASEP", obrigatorio: true, ajuda: "" },
  { id: "identidade", label: "Carteira de Identidade", obrigatorio: false, ajuda: "" },
  { id: "cpf_doc", label: "CPF", obrigatorio: false, ajuda: "" },
  { id: "comprovante_residencia", label: "Comprovante de residência", obrigatorio: false, ajuda: "" },
  { id: "titulo_eleitor_doc", label: "Título de Eleitor", obrigatorio: false, ajuda: "" },
  { id: "reservista_doc", label: "Carteira de Reservista", obrigatorio: false, ajuda: "Quando aplicável" },
  { id: "habilitacao_doc", label: "Carteira de Habilitação", obrigatorio: false, ajuda: "Quando aplicável" },
  { id: "certidao_casamento", label: "Certidão de Casamento", obrigatorio: false, ajuda: "Quando aplicável" },
  { id: "certidao_nascimento", label: "Certidão de Nascimento", obrigatorio: false, ajuda: "Do funcionário, quando solteiro" },
  { id: "filhos_nascimento", label: "Certidão de nascimento dos filhos menores de 14 anos", obrigatorio: false, ajuda: "Quando aplicável" },
  { id: "filhos_vacinacao", label: "Carteira de vacinação dos filhos menores de 5 anos", obrigatorio: false, ajuda: "Quando aplicável" },
] as const;

export const STATUS_ADMISSAO = [
  { id: "recebido", label: "Recebido", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  { id: "em_analise", label: "Em análise", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  { id: "pendencia", label: "Pendência", cls: "bg-red-100 text-red-700 border-red-200" },
  { id: "concluido", label: "Concluído", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
] as const;

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const CONTENT_TYPES_ACEITOS = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

export const GRAUS_INSTRUCAO = ["Fundamental incompleto", "Fundamental completo", "Médio incompleto", "Médio completo", "Superior incompleto", "Superior completo", "Pós-graduação"];
export const ESTADOS_CIVIS = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União estável"];
export const SEXOS = ["Masculino", "Feminino", "Outro"];
export const CORES = ["Branca", "Preta", "Parda", "Amarela", "Indígena", "Não informar"];
export const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export const labelStatus = (s: string) => STATUS_ADMISSAO.find((x) => x.id === s)?.label ?? s;
export const clsStatus = (s: string) => STATUS_ADMISSAO.find((x) => x.id === s)?.cls ?? "";
export const labelTipoDocumento = (t: string) => TIPOS_DOCUMENTO.find((x) => x.id === t)?.label ?? t;

export const apenasDigitos = (v: string) => v.replace(/\D/g, "");

export function cpfValido(valor: string) {
  const cpf = apenasDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (fator: number) => {
    let soma = 0;
    for (let i = 0; i < fator - 1; i++) soma += Number(cpf[i]) * (fator - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(10) === Number(cpf[9]) && calc(11) === Number(cpf[10]);
}

const t = (max = 200) => z.string().trim().max(max).optional().or(z.literal(""));
const obrig = (campo: string, max = 200) => z.string().trim().min(1, `Informe ${campo}`).max(max);

export const admissaoSchema = z.object({
  empresa_id: z.string().uuid("Selecione a empresa"),
  departamento: t(),
  nome_completo: obrig("o nome completo"),
  data_nascimento: t(10), naturalidade: t(100), sexo: t(30), estado_civil: t(40), cor: t(40), grau_instrucao: t(60),
  filiacao: t(300),
  telefone: z.string().trim().refine((v) => apenasDigitos(v).length >= 10, "Telefone inválido"),
  email: z.string().trim().email("E-mail inválido").max(255),
  endereco_rua: obrig("o endereço"), endereco_numero: t(20), endereco_complemento: t(100), endereco_bairro: t(100),
  endereco_cidade: obrig("a cidade", 100),
  endereco_cep: z.string().trim().refine((v) => apenasDigitos(v).length === 8, "CEP inválido"),
  cpf: z.string().trim().refine(cpfValido, "CPF inválido"),
  cpf_emissao: t(10), identidade_numero: t(40), identidade_orgao: t(40), identidade_expedicao: t(10),
  titulo_eleitor: t(40), titulo_zona: t(20), titulo_secao: t(20),
  habilitacao_numero: t(40), habilitacao_emissao: t(10), habilitacao_vencimento: t(10),
  reservista_numero: t(40), reservista_serie: t(40),
  pis_numero: t(40), pis_inscricao: t(10),
  ctps_numero: t(40), ctps_serie: t(40), ctps_uf: t(2),
  data_admissao: t(10),
  funcao: obrig("a função"),
  salario: t(20),
  contrato_experiencia: z.boolean(),
  contrato_experiencia_dias: t(4),
  vale_transporte: z.boolean(),
  observacoes_cliente: t(2000),
});

export type AdmissaoForm = z.infer<typeof admissaoSchema>;

export type Admissao = {
  id: string; protocolo: string; status: string; empresa_nome: string; empresa_id: string | null;
  nome_completo: string; funcao: string | null; created_at: string;
  [campo: string]: unknown;
};

export function sanitizarNomeArquivo(nome: string) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

export const fmtData = (v: unknown) => {
  if (!v) return "—";
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(s).toLocaleDateString("pt-BR");
};
