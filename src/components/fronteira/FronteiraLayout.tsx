import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, Building2, Calculator, DatabaseZap, History, ScrollText, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const ABAS = [
  { to: "/fiscal/fronteira", label: "Auditoria", icon: ShieldCheck, end: true },
  { to: "/fiscal/fronteira/empresas", label: "Perfis fiscais", icon: Building2 },
  { to: "/fiscal/fronteira/historico", label: "Histórico", icon: History },
  { to: "/fiscal/fronteira/formulas", label: "Fórmulas", icon: Calculator },
  { to: "/fiscal/fronteira/regras", label: "Regras", icon: ScrollText },
  { to: "/fiscal/fronteira/acervo", label: "Acervo legal", icon: BookOpen },
];

/** Navegação comum das telas Fiscal → Fronteira ICMS. */
export function FronteiraLayout() {
  const { isAdmin } = useAuth();
  const abas = isAdmin ? [...ABAS, { to: "/fiscal/fronteira/importar", label: "Importar", icon: DatabaseZap }] : ABAS;
  return (
    <div className="space-y-6">
      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b px-1">
        {abas.map((a) => (
          <NavLink
            key={a.to}
            to={a.to}
            end={"end" in a ? a.end : false}
            className={({ isActive }) => cn(
              "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors",
              isActive ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-t after:bg-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <a.icon className="h-4 w-4" />
            {a.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
