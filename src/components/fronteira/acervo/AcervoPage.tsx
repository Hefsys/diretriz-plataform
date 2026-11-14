import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/fronteira/compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { categorias, formatarData, vigencia, type Fonte } from "@/lib/fronteira/acervo";
import { fontesQuery } from "@/lib/fronteira/acervo-client";
import { useUserRole } from "@/components/fronteira/compat";
import { AtualizarAcervoDialog } from "./AtualizarAcervoDialog";
import { PdfActions } from "./PdfActions";
import { FontePanel } from "./FontePanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NcmsRegimesTab } from "@/components/fronteira/ncm/NcmsRegimesTab";
export function AcervoPage({
  busca,
  categoria,
  status,
  onFilter,
}: {
  busca: string;
  categoria: string;
  status: string;
  onFilter: (patch: { busca?: string; categoria?: string; status?: string }) => void;
}) {
  const { data: fontes } = useSuspenseQuery(fontesQuery);
  const { role: papel } = useUserRole();
  const [selecionada, setSelecionada] = useState<Fonte | null>(null);
  const vigentes = fontes.filter((f) => f.status === "VIGENTE").length;
  const comPdf = fontes.filter((f) => f.storage_path).length;
  const totalTrechos = fontes.reduce((s, f) => s + (f.trechos_legais[0]?.count ?? 0), 0);
  const filtered = fontes.filter(
    (f) =>
      (categoria === "TODAS" || f.categoria === categoria) &&
      (status === "TODOS" || f.status === status) &&
      f.titulo
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(
          busca
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase(),
        ),
  );
  return (
    <>
      <PageHeader title="Acervo legal" />
      <Tabs defaultValue="informativos">
      <TabsList className="mb-4">
        <TabsTrigger value="informativos">Informativos</TabsTrigger>
        <TabsTrigger value="ncms">NCMs, regimes e MVAs</TabsTrigger>
      </TabsList>
      <TabsContent value="informativos">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {fontes.length} informativos ({vigentes} vigentes, {fontes.length - vigentes} históricos)
          · {comPdf} com PDF enviado · {totalTrechos.toLocaleString("pt-BR")} trechos
        </p>
        {papel === "admin" && <AtualizarAcervoDialog fontes={fontes} />}
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          Informativos{" "}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {filtered.length} de {fontes.length}
          </span>
        </h2>
        <div className="flex w-full flex-wrap gap-2 lg:w-auto">
          <Input
            className="w-full sm:w-60"
            type="search"
            placeholder="Buscar por título"
            aria-label="Buscar por título"
            value={busca}
            onChange={(e) => onFilter({ busca: e.target.value })}
          />
          <Select value={categoria} onValueChange={(v) => onFilter({ categoria: v })}>
            <SelectTrigger className="w-full sm:w-52" aria-label="Categoria">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas as categorias</SelectItem>
              {Object.entries(categorias).map(([v, t]) => (
                <SelectItem key={v} value={v}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => onFilter({ status: v })}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todas as situações</SelectItem>
              <SelectItem value="VIGENTE">Vigente</SelectItem>
              <SelectItem value="HISTORICO">Histórico</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {!fontes.length ? (
        <div className="border-y border-border py-12 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Nenhum informativo cadastrado</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Atualizado em</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Trechos</TableHead>
              <TableHead>PDF</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="min-w-56 max-w-80">
                  <Button
                    variant="link"
                    className="h-auto whitespace-normal p-0 text-left"
                    onClick={() => setSelecionada(f)}
                  >
                    {f.titulo}
                  </Button>
                </TableCell>
                <TableCell>{categorias[f.categoria as keyof typeof categorias]}</TableCell>
                <TableCell className="whitespace-nowrap">{formatarData(f.atualizado_em)}</TableCell>
                <TableCell className="min-w-40">{vigencia(f)}</TableCell>
                <TableCell>
                  <span
                    className={f.status === "VIGENTE" ? "text-primary" : "text-muted-foreground"}
                  >
                    {f.status === "VIGENTE" ? "Vigente" : "Histórico"}
                  </span>
                  {f.substituido_por && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Substituído por{" "}
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto whitespace-normal p-0 text-xs"
                        onClick={() =>
                          setSelecionada(fontes.find((x) => x.chave === f.substituido_por) ?? null)
                        }
                      >
                        {fontes.find((x) => x.chave === f.substituido_por)?.titulo ??
                          f.substituido_por}
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell>{f.trechos_legais[0]?.count ?? 0}</TableCell>
                <TableCell>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {f.storage_path ? "Enviado" : "Pendente"}
                  </p>
                  <PdfActions fonte={f} />
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhum informativo encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      {selecionada && (
        <FontePanel
          key={selecionada.id}
          fonte={selecionada}
          open={true}
          onOpenChange={(v) => {
            if (!v) setSelecionada(null);
          }}
        />
      )}
      </TabsContent>
      <TabsContent value="ncms"><NcmsRegimesTab /></TabsContent>
      </Tabs>
    </>
  );
}
