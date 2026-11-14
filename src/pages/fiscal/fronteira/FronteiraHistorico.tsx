import { Link } from "react-router-dom";
import { ArrowLeft, History } from "lucide-react";
import { HistoricoAuditorias } from "@/components/fronteira/HistoricoAuditorias";

/** Todas as auditorias de Fronteira salvas pelo escritório. */
export default function FronteiraHistorico() {
  return (
    <div className="space-y-6">
      <div>
        <Link to="/fiscal/fronteira" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Auditoria</Link>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Fiscal · Fronteira</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><History className="h-6 w-6 text-primary" />Histórico de auditorias</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Conferências salvas, com o valor recuperável (ICMS cobrado a mais pela SEFAZ-PE) de cada período.</p>
      </div>
      <HistoricoAuditorias />
    </div>
  );
}
