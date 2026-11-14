import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db as supabase } from "@/lib/dp/db";
import { importarAcervo } from "@/lib/fronteira/acervo-importar";
import { useAuth } from "@/contexts/AuthContext";
import {
  fonteSchema,
  regraSchema,
  anexoSchema,
  trechoSchema,
  corresponderFonte,
  caminhoPdf,
  lotes,
  PDF_CONCORRENCIA,
  BUCKET_ACERVO,
  type Fonte,
} from "@/lib/fronteira/acervo";
import { z } from "zod";
type Estado = { progresso: number; importados: number; erros: string[]; finalizado: boolean };
const vazio = (): Estado => ({ progresso: 0, importados: 0, erros: [], finalizado: false });
const passos = ["Informativos", "PDFs", "Trechos", "Regras e anexos"];
export function ImportacaoPanel({ fontes }: { fontes: Fonte[] }) {
  const qc = useQueryClient();
  const { ownerUserId } = useAuth();
  const mutation = useMutation({ mutationFn: importarAcervo });
  const [busy, setBusy] = useState<number | null>(null);
  const [estados, setEstados] = useState<Estado[]>([vazio(), vazio(), vazio(), vazio()]);
  const [previa, setPrevia] = useState<{ arquivo: File; chave: string }[]>([]);
  const [drag, setDrag] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  function atualizar(p: number, patch: Partial<Estado>) {
    setEstados((a) => a.map((e, i) => (i === p ? { ...e, ...patch } : e)));
  }
  async function importar(p: number, files: File[]) {
    if (!files.length || busy !== null) return;
    if (p === 1) {
      setPrevia(
        files.map((arquivo) => ({
          arquivo,
          chave: corresponderFonte(arquivo.name, fontes)?.chave ?? "",
        })),
      );
      atualizar(p, vazio());
      return;
    }
    setBusy(p);
    atualizar(p, vazio());
    let count = 0;
    try {
      if (p === 0) {
        const linhas = z
          .array(fonteSchema)
          .min(1)
          .parse(JSON.parse((await files[0]?.text()) ?? ""));
        const res = await mutation.mutateAsync({ data: { tipo: "fontes", linhas } });
        count = res.importados;
        atualizar(p, { progresso: 100 });
      } else if (p === 2) {
        if (!window.confirm("Substituir todos os trechos existentes pelos trechos deste arquivo?"))
          return;
        const text = (await files[0]?.text()) ?? "";
        const linhas = text
          .replace(/^\uFEFF/, "")
          .split(/\r?\n/)
          .filter((l) => l.trim());
        const parsed = [];
        const errors = [];
        for (let i = 0; i < linhas.length; i++) {
          try {
            parsed.push(trechoSchema.parse(JSON.parse(linhas[i] ?? "")));
          } catch (e) {
            errors.push(`Linha ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (errors.length) {
          atualizar(p, { erros: errors });
          return;
        }
        if (!parsed.length) throw new Error("O arquivo não contém trechos.");
        const grupos = lotes(parsed);
        for (let i = 0; i < grupos.length; i++) {
          const batch = grupos[i];
          if (!batch) continue;
          const res = await mutation.mutateAsync({
            data: { tipo: "trechos", primeiro: i === 0, linhas: batch },
          });
          count += res.importados;
          atualizar(p, {
            progresso: Math.round(((i + 1) / grupos.length) * 100),
            importados: count,
          });
        }
      } else {
        const preparados = await Promise.all(
          files.map(async (f) => {
            const raw = JSON.parse(await f.text());
            if (f.name === "regras_fiscais.json")
              return { tipo: "regras" as const, linhas: z.array(regraSchema).min(1).parse(raw) };
            if (f.name === "anexos_cnae.json")
              return { tipo: "anexos" as const, linhas: z.array(anexoSchema).min(1).parse(raw) };
            throw new Error(`Arquivo não reconhecido: ${f.name}`);
          }),
        );
        if (
          preparados.some((a) => a.tipo === "anexos") &&
          !window.confirm("Substituir todos os anexos CNAE existentes?")
        )
          return;
        for (let i = 0; i < preparados.length; i++) {
          const payload = preparados[i];
          if (!payload) continue;
          const res = await mutation.mutateAsync({ data: payload });
          count += res.importados;
          atualizar(p, {
            progresso: Math.round(((i + 1) / preparados.length) * 100),
            importados: count,
          });
        }
      }
      atualizar(p, { importados: count, finalizado: true });
    } catch (e) {
      atualizar(p, { importados: count, erros: [e instanceof Error ? e.message : String(e)] });
    } finally {
      setBusy(null);
      await qc.invalidateQueries({ queryKey: ["acervo-fontes"] });
      await qc.invalidateQueries({ queryKey: ["acervo-trechos"] });
    }
  }
  async function enviarPdfs() {
    if (busy !== null) return;
    setBusy(1);
    let count = 0,
      processados = 0;
    const errors: string[] = [];
    atualizar(1, vazio());
    try {
      const grupos = lotes(previa, PDF_CONCORRENCIA);
      for (const grupo of grupos) {
        await Promise.all(
          grupo.map(async ({ arquivo, chave }) => {
            try {
              if (!chave) throw new Error("Selecione o informativo correspondente");
              if (!arquivo.name.toLowerCase().endsWith(".pdf"))
                throw new Error("Envie um arquivo PDF");
              const header = await arquivo.slice(0, 5).text();
              if (header !== "%PDF-") throw new Error("Conteúdo não é um PDF válido");
              if (!ownerUserId) throw new Error("Sessão sem escritório");
              const path = caminhoPdf(chave, ownerUserId);
              const res = await supabase.storage
                .from(BUCKET_ACERVO)
                .upload(path, arquivo, { upsert: true, contentType: "application/pdf" });
              if (res.error) throw res.error;
              const update = await supabase
                .from("ff_fontes_legais")
                .update({ storage_path: path })
                .eq("chave", chave)
                .select("id");
              if (update.error) throw update.error;
              if (!update.data.length) throw new Error("Registro não atualizado");
              count++;
            } catch (e) {
              errors.push(`${arquivo.name}: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              processados++;
              atualizar(1, {
                importados: count,
                progresso: Math.round((processados / previa.length) * 100),
                erros: [...errors],
              });
            }
          }),
        );
      }
      atualizar(1, { finalizado: true });
      if (!errors.length) setPrevia([]);
    } finally {
      setBusy(null);
      await qc.invalidateQueries({ queryKey: ["acervo-fontes"] });
    }
  }
  const duplicados = previa.some(
    (p, i) => p.chave && previa.some((q, j) => j !== i && p.chave === q.chave),
  );
  return (
    <section className="mb-8 border-y border-border py-5">
      <h2 className="mb-4 text-base font-semibold">Importação do acervo</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {passos.map((nome, p) => (
          <div key={nome} className="min-w-0 border-l border-border pl-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {p + 1}
              </span>
              <h3 className="font-medium">{nome}</h3>
            </div>
            <p className="mb-3 break-words text-xs text-muted-foreground">
              {
                [
                  "fontes_legais.json · 88 informativos",
                  "88 arquivos .pdf",
                  "trechos_legais.jsonl · 2.476 trechos",
                  "regras_fiscais.json · 35 regras / anexos_cnae.json · 333 linhas",
                ][p]
              }
            </p>
            <input
              ref={(el) => {
                refs.current[p] = el;
              }}
              type="file"
              className="hidden"
              aria-label={`Enviar ${nome}`}
              accept={p === 1 ? ".pdf" : p === 2 ? ".jsonl" : ".json"}
              multiple={p === 1 || p === 3}
              onChange={(e) => {
                void importar(p, Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <div
              onDragOver={
                p === 1
                  ? (e) => {
                      e.preventDefault();
                      setDrag(true);
                    }
                  : undefined
              }
              onDragLeave={p === 1 ? () => setDrag(false) : undefined}
              onDrop={
                p === 1
                  ? (e) => {
                      e.preventDefault();
                      setDrag(false);
                      void importar(1, Array.from(e.dataTransfer.files));
                    }
                  : undefined
              }
              className={
                p === 1
                  ? `rounded-md border border-dashed p-3 ${drag ? "border-primary bg-primary/10" : "border-border"}`
                  : ""
              }
            >
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null || (p > 0 && !fontes.length)}
                onClick={() => refs.current[p]?.click()}
              >
                <Upload className="h-4 w-4" />
                {busy === p ? "Importando…" : "Enviar arquivos"}
              </Button>
            </div>
            <Progress
              className="mt-4 h-1.5"
              value={estados[p]?.progresso ?? 0}
              aria-label={`Progresso de ${nome}`}
            />
            <div aria-live="polite" className="mt-2 text-xs">
              {estados[p]?.finalizado || estados[p]?.importados ? (
                <p className="flex items-center gap-1 text-primary">
                  <Check className="h-3 w-3" />
                  {estados[p]?.importados} registros importados
                </p>
              ) : null}
              {estados[p]?.erros.length ? (
                <ul
                  role="alert"
                  className="mt-2 max-h-32 overflow-y-auto break-words text-destructive"
                >
                  {estados[p]?.erros.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {previa.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="mb-3 font-medium">Prévia dos PDFs</h3>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {previa.map((p, i) => (
              <div
                key={i}
                className="grid items-center gap-2 border-b border-border py-2 text-sm md:grid-cols-2"
              >
                <span className="break-words">
                  {!p.chave && <AlertTriangle className="mr-1 inline h-4 w-4 text-destructive" />}
                  {p.arquivo.name} →
                </span>
                <Select
                  value={p.chave}
                  onValueChange={(chave) =>
                    setPrevia((a) => a.map((x, j) => (j === i ? { ...x, chave } : x)))
                  }
                  disabled={busy !== null}
                >
                  <SelectTrigger
                    aria-label={`Informativo para ${p.arquivo.name}`}
                    className={!p.chave ? "border-destructive" : ""}
                  >
                    <SelectValue placeholder="Sem correspondência — selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {fontes.map((f) => (
                      <SelectItem key={f.id} value={f.chave}>
                        {f.titulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          {duplicados && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              Há PDFs associados ao mesmo informativo. Ajuste as correspondências antes de enviar.
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button
              disabled={busy !== null || previa.some((p) => !p.chave) || duplicados}
              onClick={() => void enviarPdfs()}
            >
              <Upload className="h-4 w-4" />
              Confirmar envio de {previa.length} PDFs
            </Button>
            <Button variant="ghost" disabled={busy !== null} onClick={() => setPrevia([])}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
