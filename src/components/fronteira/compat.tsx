import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

/** Cabeçalho padrão das telas da Fronteira (mesma API do sistema original). */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Fiscal · Fronteira</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export type UserRole = "admin" | "fiscal" | "operador" | null;

/**
 * Papel do usuário no vocabulário do sistema original. Na plataforma,
 * "admin/fiscal" (pode gerir fórmulas, acervo e regras) = dono ou administrador da equipe
 * — mesma regra da função SQL ff_pode_gerir().
 */
export function useUserRole(): { role: UserRole; isAdminOrFiscal: boolean; isLoading: boolean } {
  const { isAdmin } = useAuth();
  return { role: isAdmin ? "admin" : "operador", isAdminOrFiscal: isAdmin, isLoading: false };
}
