import { BookOpen } from "lucide-react";

/**
 * Referência legal usada no cálculo (informativo · item · dispositivo).
 * A consulta ao PDF do Acervo legal entra na etapa 2 da integração.
 */
export function FonteLegal({ informativo, item, dispositivo }: { informativo: string; item: string; dispositivo: string }) {
  return (
    <span className="inline-flex max-w-full items-start gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground">
      <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{informativo} · item {item} · {dispositivo}</span>
    </span>
  );
}
