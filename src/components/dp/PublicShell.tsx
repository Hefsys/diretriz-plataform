import type { ReactNode } from "react";

/** Moldura das páginas abertas pelo cliente (sem login). */
export function PublicShell({ children, subtitulo }: { children: ReactNode; subtitulo?: string }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#10143D]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <img src="/logo-white.svg" alt="Diretriz Contabilidade" className="h-9 w-auto" />
          {subtitulo && <span className="hidden text-xs font-medium uppercase tracking-widest text-white/70 sm:inline">{subtitulo}</span>}
        </div>
      </header>
      <div className="h-1 bg-[#ED3237]" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="py-6 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Diretriz Contabilidade</footer>
    </div>
  );
}
