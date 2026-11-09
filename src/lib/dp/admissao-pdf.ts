import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtData, labelStatus, labelTipoDocumento, type Admissao } from "./admissao";

const v = (x: unknown) => (x === null || x === undefined || x === "" ? "—" : String(x));
const simNao = (x: unknown) => (x ? "Sim" : "Não");
const moeda = (x: unknown) =>
  x === null || x === undefined || x === "" ? "—" : Number(x).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Gera a ficha de admissão em PDF (no navegador). */
export function gerarPdfAdmissao(a: Admissao, arquivos: { tipo: string; nome_arquivo: string }[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(16, 20, 61);
  doc.rect(0, 0, W, 22, "F");
  doc.setFillColor(237, 50, 55);
  doc.rect(0, 22, W, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Diretriz Contabilidade", 14, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("FICHA DE ADMISSÃO", 14, 17);
  doc.text(`Protocolo ${a.protocolo}`, W - 14, 11, { align: "right" });
  doc.text(`Recebida em ${fmtData(a.created_at)} · ${labelStatus(a.status)}`, W - 14, 17, { align: "right" });
  doc.setTextColor(16, 20, 61);

  let y = 30;
  const secao = (titulo: string, linhas: [string, string][]) => {
    autoTable(doc, {
      startY: y,
      head: [[{ content: titulo, colSpan: 4 }]],
      body: linhas.reduce<string[][]>((acc, par, i) => {
        if (i % 2 === 0) acc.push([par[0], par[1]]);
        else acc[acc.length - 1].push(par[0], par[1]);
        return acc;
      }, []),
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 1.8, textColor: [30, 30, 30] },
      headStyles: { fillColor: [16, 20, 61], textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 36, fillColor: [245, 246, 250] }, 2: { fontStyle: "bold", cellWidth: 36, fillColor: [245, 246, 250] } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  };

  secao("Empresa", [["Empresa", v(a.empresa_nome)], ["Departamento", v(a.departamento)]]);
  secao("Dados pessoais", [
    ["Nome completo", v(a.nome_completo)], ["Nascimento", fmtData(a.data_nascimento)],
    ["Naturalidade", v(a.naturalidade)], ["Sexo", v(a.sexo)],
    ["Estado civil", v(a.estado_civil)], ["Cor / raça", v(a.cor)],
    ["Grau de instrução", v(a.grau_instrucao)], ["Filiação", v(a.filiacao)],
    ["Telefone", v(a.telefone)], ["E-mail", v(a.email)],
  ]);
  secao("Endereço", [
    ["Rua", v(a.endereco_rua)], ["Número", v(a.endereco_numero)],
    ["Complemento", v(a.endereco_complemento)], ["Bairro", v(a.endereco_bairro)],
    ["Cidade", v(a.endereco_cidade)], ["CEP", v(a.endereco_cep)],
  ]);
  secao("Documentos", [
    ["CPF", v(a.cpf)], ["Emissão CPF", fmtData(a.cpf_emissao)],
    ["Identidade", v(a.identidade_numero)], ["Órgão / expedição", `${v(a.identidade_orgao)} · ${fmtData(a.identidade_expedicao)}`],
    ["Título eleitor", v(a.titulo_eleitor)], ["Zona / seção", `${v(a.titulo_zona)} / ${v(a.titulo_secao)}`],
    ["CNH", v(a.habilitacao_numero)], ["Emissão / venc. CNH", `${fmtData(a.habilitacao_emissao)} · ${fmtData(a.habilitacao_vencimento)}`],
    ["Reservista", `${v(a.reservista_numero)} / ${v(a.reservista_serie)}`], ["PIS", `${v(a.pis_numero)} · ${fmtData(a.pis_inscricao)}`],
    ["CTPS", `${v(a.ctps_numero)} / ${v(a.ctps_serie)}`], ["UF CTPS", v(a.ctps_uf)],
  ]);
  secao("Contrato", [
    ["Função", v(a.funcao)], ["Salário", moeda(a.salario)],
    ["Data de admissão", fmtData(a.data_admissao)], ["Vale transporte", simNao(a.vale_transporte)],
    ["Experiência", a.contrato_experiencia ? `Sim (${v(a.contrato_experiencia_dias)} dias)` : "Não"], ["", ""],
  ]);
  if (a.observacoes_cliente) secao("Observações do cliente", [["Observações", v(a.observacoes_cliente)]]);
  secao("Documentos anexados", arquivos.length
    ? arquivos.map((f) => [labelTipoDocumento(f.tipo), f.nome_arquivo] as [string, string])
    : [["Anexos", "Nenhum arquivo enviado"]]);

  return doc;
}
