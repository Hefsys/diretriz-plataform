import { useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ImportacaoPanel } from "./ImportacaoPanel";
import type { Fonte } from "@/lib/fronteira/acervo";

export function AtualizarAcervoDialog({ fontes }: { fontes: Fonte[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar acervo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Atualizar acervo</DialogTitle>
          <DialogDescription>Reimportar informativos, PDFs, trechos e regras.</DialogDescription>
        </DialogHeader>
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Use só quando a SEFAZ publicar uma versão nova de um informativo. Reimportar os trechos
            substitui todos os trechos atuais.
          </p>
        </div>
        <ImportacaoPanel fontes={fontes} />
      </DialogContent>
    </Dialog>
  );
}
