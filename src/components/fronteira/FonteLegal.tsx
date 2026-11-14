import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/dp/db";
import type { Fonte } from "@/lib/fronteira/acervo";
import { FontePanel } from "./acervo/FontePanel";

/** Referência legal (informativo · item · dispositivo); abre os trechos do Acervo legal. */
export function FonteLegal({ informativo, item, dispositivo }: { informativo: string; item: string; dispositivo: string }) {
  const [open, setOpen] = useState(false);
  const { data, error } = useQuery({
    queryKey: ["ff-fonte-legal", informativo],
    queryFn: async () => {
      const res = await db.from("ff_fontes_legais").select("*").eq("chave", informativo).maybeSingle();
      if (res.error) throw res.error;
      return res.data as Fonte | null;
    },
    staleTime: 5 * 60_000,
  });
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-auto max-w-full whitespace-normal text-left"
        disabled={!data}
        onClick={() => setOpen(true)}
        title={error?.message ?? (!data ? "Informativo não está no Acervo legal" : undefined)}
      >
        <BookOpen className="h-4 w-4 shrink-0" />
        {data?.titulo ?? informativo} · item {item} · {dispositivo}
      </Button>
      {data && <FontePanel fonte={data} item={item} open={open} onOpenChange={setOpen} />}
    </>
  );
}
