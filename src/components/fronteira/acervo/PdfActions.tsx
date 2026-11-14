import { Download, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { db as supabase } from "@/lib/dp/db";
import { Button } from "@/components/ui/button";
import { BUCKET_ACERVO, PDF_DURACAO, type Fonte } from "@/lib/fronteira/acervo";

export function PdfActions({ fonte }: { fonte: Fonte }) {
  const [busy, setBusy] = useState(false);

  async function gerar(download: boolean) {
    if (!fonte.storage_path) throw new Error("Documento sem arquivo.");
    const { data, error } = await supabase.storage
      .from(BUCKET_ACERVO)
      .createSignedUrl(fonte.storage_path, PDF_DURACAO, download ? { download: fonte.arquivo } : {});
    if (error) throw error;
    return data.signedUrl;
  }

  function erro(e: unknown) {
    toast.error("Não foi possível acessar o PDF", {
      description: e instanceof Error ? e.message : String(e),
    });
  }

  async function baixar() {
    setBusy(true);
    try {
      const u = await gerar(true);
      const a = document.createElement("a");
      a.href = u;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      erro(e);
    } finally {
      setBusy(false);
    }
  }

  async function abrir() {
    // Abre a aba antes do await para o navegador não bloquear como pop-up
    const aba = window.open("", "_blank");
    setBusy(true);
    try {
      const u = await gerar(false);
      if (aba) aba.location.href = u; else window.location.href = u;
    } catch (e) {
      aba?.close();
      erro(e);
    } finally {
      setBusy(false);
    }
  }

  const desabilitado = !fonte.storage_path || busy;
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={desabilitado} onClick={abrir}>
        <ExternalLink className="h-4 w-4" />
        Abrir PDF
      </Button>
      <Button variant="outline" size="sm" disabled={desabilitado} onClick={baixar}>
        <Download className="h-4 w-4" />
        Baixar PDF
      </Button>
    </div>
  );
}
