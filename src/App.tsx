import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import Empresas from "./pages/Empresas";
import Certidoes from "./pages/Certidoes";
import Certificados from "./pages/Certificados";
import Alertas from "./pages/Alertas";
import Configuracoes from "./pages/Configuracoes";
import Usuarios from "./pages/Usuarios";
import CaixasPostais from "./pages/CaixasPostais";
import Financeiro from "./pages/Financeiro";
import ContasPagar from "./pages/ContasPagar";
import PlanoContas from "./pages/PlanoContas";
import Conciliacao from "./pages/Conciliacao";
import RegrasConciliacao from "./pages/RegrasConciliacao";
import Fornecedores from "./pages/Fornecedores";
import Obrigacoes from "./pages/Obrigacoes";
import Rotinas from "./pages/Rotinas";
import CalendarioRotinas from "./pages/CalendarioRotinas";
import DashboardRotinas from "./pages/DashboardRotinas";
import AutomacaoRotinas from "./pages/AutomacaoRotinas";
import DiagnosticoFiscal from "./pages/DiagnosticoFiscal";
import ConfiguracaoObrigacoes from "./pages/ConfiguracaoObrigacoes";
import FinanceInsight from "./pages/FinanceInsight";
import Relatorios from "./pages/Relatorios";
import Departamentos from "./pages/Departamentos";
import NotFound from "./pages/NotFound";
import AuthBanco from "./pages/AuthBanco";
import ComissaoESocial from "./pages/ComissaoESocial";
import ComissaoESocialDashboard from "./pages/ComissaoESocialDashboard";
import ComissaoESocialHistorico from "./pages/ComissaoESocialHistorico";
import ConfrontoXML from "./pages/ConfrontoXML";
import ConfrontoXMLFechamentoDetalhe from "./pages/ConfrontoXMLFechamentoDetalhe";
import ConciliacaoISS from "./pages/ConciliacaoISS";
import DpAdmissoes from "./pages/dp/DpAdmissoes";
import DpFolha from "./pages/dp/DpFolha";
import DpCompetencia from "./pages/dp/DpCompetencia";
import AdmissaoPublica from "./pages/dp/AdmissaoPublica";
import PortalFolha from "./pages/dp/PortalFolha";
import ApuracaoLP from "./pages/fiscal/ApuracaoLP";
import ApuracaoLPEmpresa from "./pages/fiscal/ApuracaoLPEmpresa";
import { ModuloGuard } from "@/components/ModuloGuard";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/banco" element={<AuthBanco />} />
            {/* Páginas públicas do Dpto Pessoal (abertas pelo cliente, sem login) */}
            <Route path="/admissao/:escritorio" element={<AdmissaoPublica />} />
            <Route path="/folha/:token" element={<PortalFolha />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Index />} />
              <Route path="/empresas" element={<Empresas />} />
              <Route path="/certidoes" element={<Certidoes />} />
              <Route path="/certificados" element={<Certificados />} />
              <Route path="/alertas" element={<Alertas />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/caixas-postais" element={<CaixasPostais />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/contas-pagar" element={<ContasPagar />} />
              <Route path="/plano-contas" element={<PlanoContas />} />
              <Route path="/conciliacao" element={<Conciliacao />} />
              <Route path="/regras-conciliacao" element={<RegrasConciliacao />} />
              <Route path="/fornecedores" element={<Fornecedores />} />
              <Route path="/obrigacoes" element={<Obrigacoes />} />
              <Route path="/rotinas" element={<Rotinas />} />
              <Route path="/rotinas/calendario" element={<CalendarioRotinas />} />
              <Route path="/rotinas/dashboard" element={<DashboardRotinas />} />
              <Route path="/rotinas/automacao" element={<AutomacaoRotinas />} />
              <Route path="/diagnostico-fiscal" element={<DiagnosticoFiscal />} />
              <Route path="/configuracao/obrigacoes" element={<ConfiguracaoObrigacoes />} />
              <Route path="/finance-insight" element={<FinanceInsight />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/departamentos" element={<Departamentos />} />
              <Route path="/comissao-esocial" element={<ComissaoESocial />} />
              <Route path="/comissao-esocial/dashboard/:id" element={<ComissaoESocialDashboard />} />
              <Route path="/comissao-esocial/historico" element={<ComissaoESocialHistorico />} />
              <Route path="/confronto-xml" element={<ModuloGuard modulo="fiscal:confronto-xml"><ConfrontoXML /></ModuloGuard>} />
              <Route path="/confronto-xml/fechamento/:fechamentoId" element={<ModuloGuard modulo="fiscal:confronto-xml"><ConfrontoXMLFechamentoDetalhe /></ModuloGuard>} />
              <Route path="/conciliacao-iss" element={<ModuloGuard modulo="fiscal:conciliacao-iss"><ConciliacaoISS /></ModuloGuard>} />
              <Route path="/dp/admissoes" element={<ModuloGuard modulo="dp:admissoes"><DpAdmissoes /></ModuloGuard>} />
              <Route path="/dp/variaveis" element={<ModuloGuard modulo="dp:variaveis"><DpFolha key="variaveis" modulo="variaveis" /></ModuloGuard>} />
              <Route path="/dp/vr" element={<ModuloGuard modulo="dp:vr"><DpFolha key="vr" modulo="vr" /></ModuloGuard>} />
              <Route path="/dp/competencia/:id" element={<DpCompetencia />} />
              <Route path="/fiscal/apuracao-lp" element={<ModuloGuard modulo="fiscal:apuracao-lp"><ApuracaoLP /></ModuloGuard>} />
              <Route path="/fiscal/apuracao-lp/:empresaId/:ano" element={<ModuloGuard modulo="fiscal:apuracao-lp"><ApuracaoLPEmpresa /></ModuloGuard>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
