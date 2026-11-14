import { describe, it, expect } from "vitest";
import {
  normalizarArquivo,
  caminhoPdf,
  dividirItens,
  lotes,
  PDF_CONCORRENCIA,
  PDF_DURACAO,
  podeGerirAcervo,
  fonteSchema,
  regraSchema,
  preservarFonte,
  preservarValidacao,
  trechoSchema,
  anexoSchema,
} from "./acervo";
import type { Fonte } from "./acervo";
describe("Acervo legal", () => {
  it("normaliza NFC/NFD, acentos, pontuação, espaços e aspas para comparação", () => {
    expect(normalizarArquivo("Antecipação, “Outra-UF”.pdf".normalize("NFD"))).toBe(
      normalizarArquivo("antecipacao outra uf pdf"),
    );
  });
  it("armazena PDF pela chave, na pasta do escritório, sem nome original", () => {
    expect(caminhoPdf("ANTECIPACAO_OUTRA_UF", "esc-1")).toBe("esc-1/informativos/ANTECIPACAO_OUTRA_UF.pdf");
    expect(() => caminhoPdf("../outro", "esc-1")).toThrow();
  });
  it("limita a concorrência de PDFs a três", () => {
    expect(PDF_CONCORRENCIA).toBe(3);
    expect(lotes([1, 2, 3, 4], PDF_CONCORRENCIA)).toEqual([[1, 2, 3], [4]]);
  });
  it("divide trechos em lotes de 200", () => {
    expect(lotes(Array.from({ length: 401 }, (_, i) => i)).map((l) => l.length)).toEqual([
      200, 200, 1,
    ]);
  });
  it("links privados duram dez minutos", () => {
    expect(PDF_DURACAO).toBe(600);
  });
  it("somente admin e fiscal podem gerir o acervo", () => {
    expect(["admin", "fiscal", "operador", null].map(podeGerirAcervo)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
  it("preserva o PDF já enviado na reimportação", () => {
    const nova = fonteSchema.parse({
      chave: "A",
      titulo: "Novo",
      arquivo: "a.pdf",
      categoria: "OUTROS",
      storage_path: "injetado",
    });
    const antiga = {
      ...nova,
      id: "x",
      storage_path: "informativos/A.pdf",
      atualizado_em: null,
      vigencia_inicio: null,
      vigencia_fim: null,
      substituido_por: null,
      paginas: null,
      observacao: null,
      created_at: "",
    } as Fonte;
    expect(preservarFonte(nova, antiga).storage_path).toBe("informativos/A.pdf");
  });
  it("preserva validação humana e ignora validação vinda do arquivo", () => {
    const nova = regraSchema.parse({
      id: "A",
      nome: "A",
      tipo: "CALCULO",
      descricao: "A",
      status: "INATIVA",
      validado_por: "intruso",
    });
    expect(
      preservarValidacao(nova, {
        status: "VALIDADA",
        validado_por: "humano",
        validado_em: "2026-10-16",
      }),
    ).toMatchObject({ status: "VALIDADA", validado_por: "humano", validado_em: "2026-10-16" });
    expect(preservarValidacao(nova).status).toBe("RASCUNHO");
  });
  it("consulta separadamente múltiplos itens", () => {
    expect(dividirItens("2.3.1.2 / 2.3.2.2")).toEqual(["2.3.1.2", "2.3.2.2"]);
  });
  it("ignora os demais campos de trechos e anexos", () => {
    expect(
      trechoSchema.parse({ fonte_chave: "A", item: "1", titulo: "A", texto: "A", embedding: [1] }),
    ).not.toHaveProperty("embedding");
    expect(
      anexoSchema.parse({
        anexo: 12,
        cnae: "4530701",
        descricao: "A",
        cnae_formatado: "45.30-7/01",
      }),
    ).not.toHaveProperty("cnae_formatado");
  });
});
