/**
 * Formatadores pt-BR para valores fiscais e identificadores.
 */

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateLong = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const dateShort = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatBRL(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return brl.format(value);
}

/**
 * Converte texto no formato pt-BR ("3.240", "1.513,93", "13,5") em número.
 * Trata o ponto como separador de milhar quando há vírgula decimal ou
 * quando o grupo após o ponto tem exatamente 3 dígitos.
 */
export function parseNumeroBR(input: string): number {
  const s = (input ?? "").trim().replace(/\s|R\$|%/g, "");
  if (!s) return 0;
  let normalizado: string;
  if (s.includes(",")) {
    normalizado = s.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s) && !/^-?0\./.test(s)) {
    normalizado = s.replace(/\./g, "");
  } else {
    normalizado = s;
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

export function formatCNPJ(cnpj: string | null | undefined): string {
  if (cnpj == null) return "—";
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function formatIE(ie: string): string {
  const digits = ie.replace(/\D/g, "");
  if (digits.length !== 9) return ie;
  return `${digits.slice(0, 7)}-${digits.slice(7)}`;
}

export function formatDateLong(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return dateLong.format(d);
}

export function formatDateShort(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return dateShort.format(d);
}

export function formatPeriodo(periodo: string): string {
  // "2026-03" -> "Março/2026"
  const [year, month] = periodo.split("-");
  if (!year || !month) return periodo;
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const idx = parseInt(month, 10) - 1;
  return `${meses[idx] ?? month}/${year}`;
}

/**
 * Formata "MM/YYYY" (formato usado no banco em casos_auditoria.periodo_fiscal)
 * para "Março/2026".
 */
export function formatPeriodoFiscal(periodo: string): string {
  const [month, year] = periodo.split("/");
  if (!year || !month) return periodo;
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const idx = parseInt(month, 10) - 1;
  return `${meses[idx] ?? month}/${year}`;
}

/**
 * Retorna o período fiscal corrente no formato "MM/YYYY".
 */
export function periodoFiscalAtual(date: Date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${m}/${y}`;
}

/**
 * Aplica máscara visual de CNPJ enquanto o usuário digita.
 * Aceita string parcial e retorna formato XX.XXX.XXX/XXXX-XX.
 */
export function maskCNPJ(value: string | null | undefined): string {
  const d = (value ?? "").replace(/\D/g, "").slice(0, 14);
  let out = d;
  if (d.length > 2) out = d.slice(0, 2) + "." + d.slice(2);
  if (d.length > 5) out = d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5);
  if (d.length > 8) out = d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5, 8) + "/" + d.slice(8);
  if (d.length > 12) out = d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5, 8) + "/" + d.slice(8, 12) + "-" + d.slice(12);
  return out;
}
