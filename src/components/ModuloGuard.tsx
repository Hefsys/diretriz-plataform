import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/** Só renderiza a página se o usuário tiver o (sub)módulo liberado. */
export function ModuloGuard({ modulo, children }: { modulo: string; children: React.ReactNode }) {
  const { temModulo } = useAuth();
  if (!temModulo(modulo)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
