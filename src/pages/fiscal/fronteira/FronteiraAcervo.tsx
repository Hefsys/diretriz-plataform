import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { AcervoPage } from "@/components/fronteira/acervo/AcervoPage";

/** Acervo legal SEFAZ-PE: informativos, trechos pesquisáveis, PDFs e NCMs/regimes. */
export default function FronteiraAcervo() {
  const [params, setParams] = useSearchParams();
  return (
    <Suspense fallback={<p className="text-muted-foreground">Carregando acervo…</p>}>
      <AcervoPage
        busca={params.get("busca") ?? ""}
        categoria={params.get("categoria") ?? "TODAS"}
        status={params.get("status") ?? "TODOS"}
        onFilter={(patch) => {
          const prox = new URLSearchParams(params);
          for (const [k, v] of Object.entries(patch)) if (v !== undefined) prox.set(k, v);
          setParams(prox, { replace: true });
        }}
      />
    </Suspense>
  );
}
