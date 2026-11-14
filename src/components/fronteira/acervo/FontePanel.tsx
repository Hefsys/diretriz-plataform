import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { db as supabase } from "@/lib/dp/db";
import { todosTrechos } from "@/lib/fronteira/acervo-client";
import { dividirItens, formatarData, vigencia, type Fonte } from "@/lib/fronteira/acervo";
import { PdfActions } from "./PdfActions";
export function FontePanel({
  fonte,
  open,
  onOpenChange,
  item,
}: {
  fonte: Fonte;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: string | undefined;
}) {
  const [busca, setBusca] = useState("");
  const query = useQuery({
    queryKey: ["acervo-trechos", fonte.id, item],
    enabled: open,
    queryFn: async () => {
      if (!item) return todosTrechos(fonte.id);
      const grupos = await Promise.all(
        dividirItens(item).map(async (prefixo) => {
          const { data, error } = await supabase.rpc("ff_trechos_do_item", {
            fonte_chave: fonte.chave,
            item_prefixo: prefixo,
          });
          if (error) throw error;
          return data.map((t) => ({ ...t, id: t.trecho_id }));
        }),
      );
      return [...new Map(grupos.flat().map((t) => [t.id, t])).values()];
    },
  });
  const trechos = (query.data ?? []).filter((t) =>
    `${t.item} ${t.titulo} ${t.texto}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes(
        busca
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase(),
      ),
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{fonte.titulo}</SheetTitle>
          <SheetDescription>
            Atualizado em {formatarData(fonte.atualizado_em)} · Vigência: {vigencia(fonte)}
          </SheetDescription>
        </SheetHeader>
        {fonte.status === "HISTORICO" && (
          <div role="status" className="border-l-4 border-destructive bg-muted p-3 text-sm">
            Informativo histórico
            {fonte.substituido_por ? ` · substituído por ${fonte.substituido_por}` : ""}
          </div>
        )}
        <PdfActions fonte={fonte} />
        <Input
          type="search"
          aria-label="Buscar nos trechos"
          placeholder="Buscar nos trechos"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {query.isLoading ? (
          <p className="text-muted-foreground">Carregando trechos…</p>
        ) : query.error ? (
          <p role="alert" className="text-destructive">
            {query.error.message}
          </p>
        ) : trechos.length === 0 ? (
          <p className="text-muted-foreground">Nenhum trecho encontrado.</p>
        ) : (
          trechos.map((t) => (
            <article key={t.id} className="border-t border-border pt-4">
              <h3 className="font-semibold">
                {t.item} · {t.titulo}
                {t.parte ? ` · parte ${t.parte}` : ""}
              </h3>
              {t.fundamento && <p className="mt-2 text-sm text-muted-foreground">{t.fundamento}</p>}
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
                {t.texto}
              </p>
            </article>
          ))
        )}
      </SheetContent>
    </Sheet>
  );
}
