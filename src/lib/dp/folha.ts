import * as XLSX from "xlsx";

export type ModuloFolha = "variaveis" | "vr";

export const STATUS_FOLHA: Record<string, { label: string; cls: string }> = {
  rascunho: { label: "Rascunho", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  enviado: { label: "Enviado ao cliente", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  preenchido: { label: "Preenchido", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  reaberto: { label: "Reaberto", cls: "bg-amber-100 text-amber-800 border-amber-200" },
};

export const clientePodeEditar = (status: string) => status === "enviado" || status === "reaberto";

export const fmtMoeda = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function parseMoeda(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

export const competenciaValida = (c: string) => /^(0[1-9]|1[0-2])\/\d{4}$/.test(c);

/** Ordena "MM/AAAA" do mais recente para o mais antigo. */
export const chaveCompetencia = (c: string) => (competenciaValida(c) ? c.slice(3) + c.slice(0, 2) : "000000");

export function proximaCompetencia(c?: string) {
  const d = new Date();
  let m = d.getMonth() + 1, a = d.getFullYear();
  if (c && competenciaValida(c)) { m = Number(c.slice(0, 2)) + 1; a = Number(c.slice(3)); if (m > 12) { m = 1; a++; } }
  return `${String(m).padStart(2, "0")}/${a}`;
}

// ───────────── Planilha Excel (layout "Relação de valores para folha") ─────────────
export type PlanilhaLida = {
  codigoEmpresa: string; razaoSocial: string; cnpj: string; competencia: string;
  rubricas: { nome: string; codigo: string }[];
  funcionarios: { tipo_calculo: string; codigo: string; nome: string; valores: (number | null)[] }[];
};

const s = (v: unknown) => (v == null ? "" : String(v).trim());

export async function lerPlanilha(file: File): Promise<PlanilhaLida> {
  const wb = XLSX.read(await file.arrayBuffer());
  const vr = lerPlanilhaVR(wb);
  if (vr) return vr;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  const campo = (label: string) => {
    const r = rows.find((row) => s(row[0]).toLowerCase().startsWith(label));
    return r ? s(r.slice(1).find((c) => s(c) && !s(c).endsWith(":"))) : "";
  };
  const hi = rows.findIndex((r) => s(r[0]).toLowerCase().startsWith("tipo de"));
  if (hi < 0) throw new Error("Não encontrei o cabeçalho 'Tipo de Cálculo' na planilha.");
  const nomes = rows[hi], codigos = rows[hi + 1] ?? [];
  const rubricas: PlanilhaLida["rubricas"] = [];
  for (let c = 3; c < nomes.length; c++) if (s(nomes[c])) rubricas.push({ nome: s(nomes[c]), codigo: s(codigos[c]) });
  const funcionarios: PlanilhaLida["funcionarios"] = [];
  for (let i = hi + 2; i < rows.length; i++) {
    const r = rows[i];
    if (s(r[0]).toUpperCase() === "TOTAL") break;
    if (!s(r[2])) continue;
    funcionarios.push({
      tipo_calculo: s(r[0]) || "11", codigo: s(r[1]), nome: s(r[2]),
      valores: rubricas.map((_, k) => {
        const n = parseMoeda(s(r[3 + k]));
        return n ? n : null;
      }),
    });
  }
  return {
    codigoEmpresa: campo("codigo empresa"),
    razaoSocial: campo("razão social") || campo("razao social"),
    cnpj: campo("inscrição") || campo("inscricao"),
    competencia: campo("competencia") || campo("competência"),
    rubricas, funcionarios,
  };
}

/** Layout simples de VR: Código | Nome | Valor. */
function lerPlanilhaVR(wb: XLSX.WorkBook): PlanilhaLida | null {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
  const hi = rows.findIndex((r) => /^c[oó]digo$/i.test(s(r[0])) && /^nome$/i.test(s(r[1])));
  if (hi < 0) return null;
  const funcionarios: PlanilhaLida["funcionarios"] = [];
  for (const r of rows.slice(hi + 1)) {
    if (!s(r[1])) continue;
    const n = typeof r[2] === "number" ? r[2] : Number(s(r[2]).replace(/\./g, "").replace(",", "."));
    funcionarios.push({ tipo_calculo: "11", codigo: s(r[0]), nome: s(r[1]), valores: [Number.isFinite(n) && n ? Math.round(n * 100) / 100 : null] });
  }
  return { codigoEmpresa: "", razaoSocial: "", cnpj: "", competencia: "", rubricas: [{ nome: "VALE REFEIÇÃO", codigo: "0253" }], funcionarios };
}

type Rub = { id: string; nome: string; codigo: string };
type Func = { id: string; tipo_calculo: string; codigo: string; nome: string };

export function exportarPlanilha(p: {
  codigoEmpresa: string; razaoSocial: string; cnpj: string; competencia: string;
  rubricas: Rub[]; funcionarios: Func[]; valores: Map<string, number>;
}) {
  const aoa: (string | number)[][] = [
    ["RELAÇÃO DE VALORES PARA FOLHA DE PAGAMENTO"], [],
    ["Codigo Empresa:", "", p.codigoEmpresa], ["Razão Social:", "", p.razaoSocial],
    ["Inscrição Cnpj:", "", p.cnpj], ["Competencia:", "", p.competencia], [], [],
    ["Tipo de", "Código", "Nome dos", ...p.rubricas.map((r) => r.nome)],
    ["Calculo", "Folha", "Colaboradores", ...p.rubricas.map((r) => r.codigo)],
  ];
  const totais = p.rubricas.map(() => 0);
  for (const e of p.funcionarios) {
    aoa.push([e.tipo_calculo, e.codigo, e.nome, ...p.rubricas.map((r, k) => {
      const v = p.valores.get(`${e.id}:${r.id}`) ?? 0;
      totais[k] += v;
      return v || "";
    })]);
  }
  aoa.push(["TOTAL", p.funcionarios.length, "", ...totais.map((t) => Math.round(t * 100) / 100)]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 10 }, { wch: 10 }, { wch: 42 }, ...p.rubricas.map(() => ({ wch: 18 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planilha");
  XLSX.writeFile(wb, `${p.codigoEmpresa || "empresa"}_${p.competencia.replace("/", "-")}.xls`, { bookType: "biff8" });
}

// ───────────── TXT de lançamentos do Domínio ─────────────
// "10" + func(10) + AAAAMM(6) + rubrica(4) + tipo cálculo(2) + valor em centavos(9) + empresa(10)
const num = (v: string | null | undefined) => (v ?? "").replace(/[^0-9]/g, "");
const zeros = (v: string, n: number) => v.padStart(n, "0");
export const TIPOS_CALCULO = ["11", "41", "42", "51", "52"];

export function gerarTxtDominio(p: {
  codigoEmpresa: string; competencia: string;
  rubricas: { id: string; codigo: string | null }[];
  funcionarios: { id: string; codigo: string | null; tipo_calculo: string | null }[];
  valores: Map<string, number>;
}) {
  const d = num(p.competencia);
  const anoMes = d.length === 6 ? d.slice(2) + d.slice(0, 2) : "";
  const emp = zeros(num(p.codigoEmpresa), 10);
  const linhas: string[] = [];
  const problemas: string[] = [];
  if (!num(p.codigoEmpresa)) problemas.push("Empresa sem código do Domínio (cadastre em Empresas)");
  if (!anoMes) problemas.push("Competência inválida");
  for (const f of p.funcionarios) {
    for (const r of p.rubricas) {
      const cent = Math.round((p.valores.get(`${f.id}:${r.id}`) ?? 0) * 100);
      if (cent <= 0) continue;
      const tipo = num(f.tipo_calculo) || "11";
      if (!num(f.codigo)) { problemas.push("Funcionário sem código"); continue; }
      if (!num(r.codigo)) { problemas.push("Rubrica sem código"); continue; }
      if (!TIPOS_CALCULO.includes(tipo)) { problemas.push(`Tipo de cálculo inválido: ${tipo}`); continue; }
      linhas.push("10" + zeros(num(f.codigo), 10) + anoMes + zeros(num(r.codigo), 4) + tipo + zeros(String(cent), 9) + emp);
    }
  }
  return { texto: linhas.map((l) => l + "\r\n").join(""), linhas: linhas.length, problemas: [...new Set(problemas)], nome: `${d}.txt` };
}

// ───────────── PDF "Relação de Empregados" do Domínio ─────────────
type ItemPdf = { str: string; x: number; y: number; w: number };
const LIMITE_CARGO = 159.5;

function palavras(it: ItemPdf) {
  const cw = it.str.length ? it.w / it.str.length : 0;
  const out: { t: string; x: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(it.str))) out.push({ t: m[0], x: it.x + m.index * cw });
  return out;
}

export function interpretarRelacao(paginas: ItemPdf[][]) {
  let razaoSocial = "";
  const funcionarios: { codigo: string; nome: string }[] = [];
  for (const itens of paginas) {
    const linhas = new Map<number, ItemPdf[]>();
    for (const it of itens) {
      if (!it.str) continue;
      const y = Math.round(it.y);
      const k = [...linhas.keys()].find((ky) => Math.abs(ky - y) <= 2) ?? y;
      linhas.set(k, [...(linhas.get(k) ?? []), it]);
    }
    const ys = [...linhas.keys()].sort((a, b) => b - a);
    let dentro = false;
    let ultimo: { codigo: string; nome: string } | null = null;
    for (const y of ys) {
      const its = linhas.get(y)!;
      const texto = its.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      if (!dentro) {
        if (/^\s*C[óo]digo\s+Nome/i.test(texto)) dentro = true;
        else if (!razaoSocial && its[0] && its[0].x < 50 && texto) razaoSocial = its.filter((i) => i.x < 400).map((i) => i.str.trim()).filter(Boolean).join(" ");
        continue;
      }
      if (/^\s*Departamento:/i.test(texto) || /Total de empregados/i.test(texto)) { ultimo = null; continue; }
      const nomeItens: ItemPdf[] = [];
      for (const it of its) {
        const prev = nomeItens[nomeItens.length - 1];
        const colado = prev && it.x >= prev.x + prev.w - 3 && it.x - (prev.x + prev.w) < 4;
        if (it.x < LIMITE_CARGO || colado) nomeItens.push(it); else break;
      }
      while (nomeItens.length && !nomeItens[nomeItens.length - 1].str.trim()) nomeItens.pop();
      const nomePal = nomeItens.flatMap((it, i) => {
        const ps = palavras(it);
        return i === nomeItens.length - 1 && it.x < LIMITE_CARGO ? ps.filter((p) => p.x < LIMITE_CARGO) : ps;
      }).map((p) => p.t);
      const temOutrasColunas = its.some((i) => i.x >= 250);
      if (nomePal.length > 1 && /^\d+$/.test(nomePal[0]) && temOutrasColunas) {
        ultimo = { codigo: nomePal[0], nome: nomePal.slice(1).join(" ") };
        funcionarios.push(ultimo);
      } else if (ultimo && nomePal.length && !temOutrasColunas && !/^\d+$/.test(nomePal[0])) {
        ultimo.nome += " " + nomePal.join(" ");
        ultimo = null;
      } else if (temOutrasColunas) {
        ultimo = null;
      }
    }
  }
  return { razaoSocial, funcionarios };
}

export async function lerRelacaoEmpregados(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default as string;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const paginas: ItemPdf[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const c = await (await doc.getPage(n)).getTextContent();
    paginas.push(c.items.flatMap((i) => ("str" in i ? [{ str: i.str, x: i.transform[4] as number, y: i.transform[5] as number, w: i.width }] : [])));
  }
  return interpretarRelacao(paginas);
}
