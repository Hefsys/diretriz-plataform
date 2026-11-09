import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { MESES, brl, calcularAno, num, type MesEntrada, type ResultadoTrimestre } from "./lucro-presumido";

const NAVY: [number, number, number] = [16, 20, 61];
const RED: [number, number, number] = [237, 50, 55];

type Dados = { empresa: { razao_social: string; cnpj: string | null }; ano: number; aliquotaIss: number; meses: MesEntrada[] };

/** Relatório do cliente (A4) — usa exatamente o mesmo cálculo exibido na tela. */
export function gerarRelatorioApuracao(d: Dados) {
  const r = calcularAno(d.meses, d.aliquotaIss);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const emitido = new Date().toLocaleDateString("pt-BR");
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const cabecalho = () => {
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 24, "F");
    doc.setFillColor(...RED); doc.rect(0, 24, W, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("Diretriz Contabilidade", M, 11);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`APURAÇÃO TRIBUTÁRIA · LUCRO PRESUMIDO · ${d.ano}`, M, 18);
    doc.text(`Emitido em ${emitido}`, W - M, 18, { align: "right" });
    doc.setTextColor(30, 30, 30);
  };

  cabecalho();
  let y = 34;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(doc.splitTextToSize(d.empresa.razao_social, W - 2 * M), M, y);
  y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100, 100, 100);
  doc.text(`CNPJ: ${d.empresa.cnpj || "Não informado"}   |   ISS: ${(d.aliquotaIss * 100).toLocaleString("pt-BR")}%`, M, y);
  doc.setTextColor(30, 30, 30);
  y += 8;

  // Resumo anual
  const cards: [string, string][] = [
    ["Receita total", brl(r.totais.receita)],
    ["Total de impostos", brl(r.totais.impostos)],
    ["Carga tributária", `${(r.totais.carga * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`],
  ];
  const cw = (W - 2 * M - 8) / 3;
  cards.forEach(([t, v], i) => {
    const x = M + i * (cw + 4);
    if (i === 1) doc.setFillColor(...RED); else doc.setFillColor(245, 246, 250);
    doc.roundedRect(x, y, cw, 18, 2, 2, "F");
    doc.setTextColor(...(i === 1 ? ([255, 255, 255] as [number, number, number]) : ([100, 100, 100] as [number, number, number])));
    doc.setFontSize(8); doc.text(t, x + 4, y + 6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.setTextColor(...(i === 1 ? ([255, 255, 255] as [number, number, number]) : NAVY));
    doc.text(v, x + 4, y + 14);
    doc.setFont("helvetica", "normal");
  });
  doc.setTextColor(30, 30, 30);
  y += 24;

  autoTable(doc, {
    startY: y,
    head: [["Tributo", "Código DARF", "Total no ano", "% dos impostos"]],
    body: [
      ["IRPJ", "2089", r.totais.irpj], ["CSLL", "2372", r.totais.csll],
      ["PIS", "8109", r.totais.pis], ["COFINS", "2172", r.totais.cofins], ["ISS", "Municipal", r.totais.iss],
    ].map(([n, c, v]) => [n as string, c as string, brl(v as number), r.totais.impostos ? `${(((v as number) / r.totais.impostos) * 100).toFixed(1).replace(".", ",")}%` : "—"]),
    foot: [["Total", "", brl(r.totais.impostos), "100%"]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: NAVY }, footStyles: { fillColor: [245, 246, 250], textColor: NAVY, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
    margin: { left: M, right: M },
  });

  // Demonstrativo trimestral
  const linhasTri: [string, keyof ResultadoTrimestre, boolean?][] = [
    ["Receita acumulada - Mercadorias", "receitaMercadorias"], ["Receita acumulada - Serviços", "receitaServicos"],
    ["Total receitas no trimestre", "receitaTotal", true], ["Excedente R$ 1.250.000,00", "excedente"],
    ["BC IR 32% - Serviços", "bcIr32"], ["BC IR 35,2% - Serviços", "bcIr352"], ["BC IR 8% - Comércio", "bcIr8"], ["BC IR 8,8% - Comércio", "bcIr88"],
    ["Outras receitas", "outrasReceitas"], ["Base de cálculo presumida do IR", "baseIr", true],
    ["IRPJ 15%", "irpj15"], ["Adicional IR 10%", "adicional10"], ["Total IR", "totalIr"], ["PERSE IR", "perseIr"], ["Retenção IR", "retencaoIr"],
    ["IRPJ a pagar · DARF 2089", "irPagar", true],
    ["Presunção CSLL 12% - Mercadorias", "csllMercadorias"], ["Presunção CSLL 32% - Serviços", "csllServicos"],
    ["Base de cálculo presumida da CSLL", "baseCsll", true], ["CSLL 9%", "csll9"], ["PERSE CSLL", "perseCsll"], ["Retenção CSLL", "retencaoCsll"],
    ["CSLL a pagar · DARF 2372", "csllPagar", true],
  ];
  doc.addPage(); cabecalho();
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...NAVY);
  doc.text("IRPJ e CSLL · apuração trimestral", M, 34);
  autoTable(doc, {
    startY: 38,
    head: [["Demonstrativo", "1º tri", "2º tri", "3º tri", "4º tri", "Total"]],
    body: linhasTri.map(([l, k]) => [l, ...r.trimestral.map((t) => num(t[k])), num(r.trimestral.reduce((s, t) => s + t[k], 0))]),
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: NAVY },
    columnStyles: { 0: { cellWidth: 62 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    didParseCell: (h) => { if (h.section === "body" && linhasTri[h.row.index]?.[2]) h.cell.styles.fontStyle = "bold"; },
    margin: { left: M, right: M },
  });
  autoTable(doc, {
    startY: finalY() + 3,
    body: [
      ["IR em 3 quotas (cada)", ...r.trimestral.map((t) => num(t.irPagar / 3)), ""],
      ["CSLL em 3 quotas (cada)", ...r.trimestral.map((t) => num(t.csllPagar / 3)), ""],
    ],
    theme: "plain", styles: { fontSize: 8, cellPadding: 1.6, textColor: [90, 90, 90] },
    columnStyles: { 0: { cellWidth: 62 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    margin: { left: M, right: M },
  });

  // Demonstrativo mensal (dividido em dois semestres para caber no A4)
  doc.addPage(); cabecalho();
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...NAVY);
  doc.text("Receitas, PIS, COFINS e ISS · mensal", M, 34);
  let yy = 38;
  for (const [ini, fim] of [[0, 6], [6, 12]]) {
    const idx = Array.from({ length: fim - ini }, (_, i) => ini + i);
    const linhas: [string, (i: number) => number, boolean?][] = [
      ["Mercadorias", (i) => d.meses[i]?.rec_mercadorias ?? 0], ["Monofásico", (i) => d.meses[i]?.rec_monofasico ?? 0],
      ["Serviços", (i) => d.meses[i]?.rec_servicos ?? 0], ["Receita Exterior", (i) => d.meses[i]?.rec_exterior ?? 0],
      ["Total receitas", (i) => r.mensal[i].totalReceitas, true],
      ["PIS 0,65% · DARF 8109", (i) => r.mensal[i].pis, true], ["COFINS 3% · DARF 2172", (i) => r.mensal[i].cofins, true],
      [`ISS ${(d.aliquotaIss * 100).toLocaleString("pt-BR")}%`, (i) => r.mensal[i].iss, true],
    ];
    autoTable(doc, {
      startY: yy,
      head: [["", ...idx.map((i) => MESES[i]), ini === 6 ? "Total ano" : ""]],
      body: linhas.map(([l, f]) => [l, ...idx.map((i) => num(f(i))), ini === 6 ? num(MESES.reduce((s, _, i) => s + f(i), 0)) : ""]),
      theme: "striped",
      styles: { fontSize: 7.5, cellPadding: 1.4 },
      headStyles: { fillColor: NAVY },
      columnStyles: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, i === 0 ? { cellWidth: 36 } : { halign: "right" as const }])),
      didParseCell: (h) => { if (h.section === "body" && linhas[h.row.index]?.[2]) h.cell.styles.fontStyle = "bold"; },
      margin: { left: M, right: M },
    });
    yy = finalY() + 6;
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(110, 110, 110);
  doc.text(doc.splitTextToSize("Meses sem valores aparecem como zero; isso não indica que foram conferidos ou encerrados. Relatório gerado com os lançamentos e as regras de cálculo do sistema na data de emissão.", W - 2 * M), M, yy);

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(8); doc.setTextColor(130, 130, 130);
    doc.text(`Diretriz Contabilidade · Lucro Presumido ${d.ano}`, M, 290);
    doc.text(`Página ${p} de ${total}`, W - M, 290, { align: "right" });
  }
  return doc;
}
