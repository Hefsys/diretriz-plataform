import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  OPERADORES,
  avaliarFluxoDetalhado,
  camposUsados,
  fluxoValido,
  labelNo,
  novoIdFluxo,
  simboloOperador,
  type Fluxo,
  type NoFluxo,
  type OperadorFluxo,
} from "@/lib/fronteira/fluxo-calculo";
import { labelDoCampo, type CampoXmlDef } from "@/lib/fronteira/campos-xml";
import { useCamposXml } from "@/lib/fronteira/useCamposXml";
import { Link } from "react-router-dom";
import { Plus, X, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL, parseNumeroBR } from "@/lib/fronteira/format";


// ────────────────────────────────────────────────────────────────
// Editor visual de fluxograma
// ────────────────────────────────────────────────────────────────
type EditTarget =
  | { modo: "editar"; index: number }
  | { modo: "adicionar" };

export function FluxoEditor({
  fluxo,
  onChange,
}: {
  fluxo: Fluxo;
  onChange: (f: Fluxo) => void;
}) {
  const [target, setTarget] = useState<EditTarget | null>(null);
  const { data: catalogo = [] } = useCamposXml();
  const valido = fluxoValido(fluxo);


  function removerEm(i: number) {
    const f = fluxo.slice();
    const no = f[i];
    if (no.tipo === "abre" || no.tipo === "fecha") {
      f.splice(i, 1);
      onChange(f);
      return;
    }
    if (no.tipo === "operando") {
      if (i === 0) f.splice(0, f.length > 1 ? 2 : 1);
      else f.splice(i - 1, 2);
    } else {
      // operador: remove também o operando seguinte para manter a cadeia
      f.splice(i, 2);
    }
    if (f.length && f[0].tipo === "operador") f.shift();
    while (f.length && f[f.length - 1].tipo === "operador") f.pop();
    onChange(f);
  }

  function salvarNo(no: NoFluxo, extraOperador?: OperadorFluxo) {
    if (!target) return;
    if (target.modo === "editar") {
      const f = fluxo.slice();
      f[target.index] = no;
      onChange(f);
    } else {
      const f = fluxo.slice();
      if (precisaOperador(f, no)) {
        f.push({ id: novoIdFluxo(), tipo: "operador", op: extraOperador ?? "+" });
      }
      f.push(no);
      onChange(f);
    }
    setTarget(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>Fórmula em blocos</Label>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          Esquerda para a direita · parênteses primeiro
        </span>
      </div>

      <div className="rounded-xl bg-[oklch(0.22_0.04_255)] p-5">
        <div className="flex flex-wrap items-center gap-2">
          {fluxo.map((no, i) =>
            no.tipo === "abre" || no.tipo === "fecha" ? (
              <div key={no.id + i} className="group relative">
                <span className="flex h-9 w-6 items-center justify-center text-2xl font-light text-white">
                  {no.tipo === "abre" ? "(" : ")"}
                </span>
                <button
                  type="button"
                  aria-label="Remover parêntese"
                  onClick={() => removerEm(i)}
                  className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow group-hover:flex"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : no.tipo === "operando" ? (
              <div key={no.id + i} className="group relative">
                <button
                  type="button"
                  onClick={() => setTarget({ modo: "editar", index: i })}
                  className="flex min-w-[7rem] flex-col items-start rounded-lg bg-[oklch(0.94_0.005_255)] px-3 py-2 text-left shadow-sm transition hover:bg-white"
                >
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {no.origem === "xml"
                      ? "XML"
                      : no.origem === "percentual"
                        ? "%"
                        : "Fixo"}
                  </span>
                  <span className="text-sm font-medium text-[oklch(0.22_0.04_255)]">
                    {labelNo(no, catalogo)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Remover bloco"
                  onClick={() => removerEm(i)}
                  className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow group-hover:flex"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div key={no.id + i} className="group relative">
                <button
                  type="button"
                  onClick={() => setTarget({ modo: "editar", index: i })}
                  className="flex h-9 w-9 items-center justify-center rounded-md bg-[oklch(0.55_0.19_25)] text-base font-bold text-white shadow-sm transition hover:brightness-110"
                >
                  {simboloOperador(no.op)}
                </button>
                <button
                  type="button"
                  aria-label="Remover operador"
                  onClick={() => removerEm(i)}
                  className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow group-hover:flex"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ),
          )}
          <button
            type="button"
            onClick={() => setTarget({ modo: "adicionar" })}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-white/40 text-white/80 transition hover:bg-white/10"
            aria-label="Adicionar bloco"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {fluxo.length === 0 && (
          <p className="mt-3 text-xs text-white/70">
            Nenhum bloco ainda — clique em ＋ para começar a montar a fórmula.
          </p>
        )}
        {fluxo.length > 0 && !valido && (
          <p className="mt-3 text-xs text-[oklch(0.8_0.15_25)]">
            Fórmula incompleta: operandos e operadores devem se alternar e todo
            parêntese aberto precisa ser fechado.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {OPERADORES.map((o) => (
          <span key={o.op} className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-[oklch(0.55_0.19_25)] text-[11px] font-bold text-white">
              {o.simbolo}
            </span>
            {o.label}
          </span>
        ))}
      </div>

      <TestarCalculo fluxo={fluxo} catalogo={catalogo} />

      <BlocoDialog
        target={target}
        fluxo={fluxo}
        catalogo={catalogo}
        onClose={() => setTarget(null)}
        onSalvar={salvarNo}
      />
    </div>
  );
}

function precisaOperador(f: Fluxo, novo: NoFluxo): boolean {
  const ult = f[f.length - 1];
  if (!ult) return false;
  const ultFecha = ult.tipo === "operando" || ult.tipo === "fecha";
  const novoInicia = novo.tipo === "operando" || novo.tipo === "abre";
  return ultFecha && novoInicia;
}

function BlocoDialog({
  target,
  fluxo,
  catalogo,
  onClose,
  onSalvar,
}: {
  target: EditTarget | null;
  fluxo: Fluxo;
  catalogo: CampoXmlDef[];
  onClose: () => void;
  onSalvar: (no: NoFluxo, extraOperador?: OperadorFluxo) => void;
}) {
  const atual = target?.modo === "editar" ? fluxo[target.index] : undefined;
  const editandoOperador = atual?.tipo === "operador";
  const adicionando = target?.modo === "adicionar";

  const padrao = catalogo.filter((c) => c.sistema);
  const personalizados = catalogo.filter((c) => !c.sistema);

  const [tipo, setTipo] = useState<"xml" | "numero" | "percentual" | "operador" | "abre" | "fecha">("xml");
  const [campo, setCampo] = useState<string>(catalogo[0]?.codigo ?? "valor_produtos");

  const [valor, setValor] = useState("0");
  const [op, setOp] = useState<OperadorFluxo>("x");
  const [opLigacao, setOpLigacao] = useState<OperadorFluxo>("+");

  useEffect(() => {
    if (!target) return;
    if (atual?.tipo === "operador") {
      setTipo("operador");
      setOp(atual.op);
    } else if (atual?.tipo === "abre" || atual?.tipo === "fecha") {
      setTipo(atual.tipo);
    } else if (atual?.tipo === "operando") {
      setTipo(atual.origem);
      if (atual.origem === "xml") setCampo(atual.campo);
      else setValor(String(atual.valor));
    } else {
      setTipo("xml");
      setCampo("valor_produtos");
      setValor("0");
      setOpLigacao("+");
    }
  }, [target, atual]);

  function confirmar() {
    const id = atual?.id ?? novoIdFluxo();
    let no: NoFluxo;
    if (tipo === "operador") no = { id, tipo: "operador", op };
    else if (tipo === "abre" || tipo === "fecha") no = { id, tipo };
    else if (tipo === "xml") no = { id, tipo: "operando", origem: "xml", campo };
    else {
      const v = parseNumeroBR(valor);
      no = {
        id,
        tipo: "operando",
        origem: tipo,
        valor: Number.isFinite(v) ? v : 0,
      };
    }
    onSalvar(no, opLigacao);
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target?.modo === "editar" ? "Editar bloco" : "Adicionar bloco"}
          </DialogTitle>
          <DialogDescription>
            {editandoOperador
              ? "Escolha a operação aplicada sobre o valor acumulado."
              : "Campo do XML busca o valor na NF-e; número e porcentagem ficam fixos."}
          </DialogDescription>
        </DialogHeader>

        {adicionando &&
          precisaOperador(fluxo, tipo === "fecha" ? { id: "", tipo: "fecha" } : { id: "", tipo: "abre" }) && (
          <div className="space-y-2">
            <Label>Operação</Label>
            <Select value={opLigacao} onValueChange={(v) => setOpLigacao(v as OperadorFluxo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERADORES.map((o) => (
                  <SelectItem key={o.op} value={o.op}>
                    {o.simbolo} {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!editandoOperador && (
          <div className="space-y-2">
            <Label>Tipo do operando</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xml">Campo do XML</SelectItem>
                <SelectItem value="numero">Número fixo</SelectItem>
                <SelectItem value="percentual">Porcentagem fixa</SelectItem>
                {adicionando && <SelectItem value="abre">Abrir parêntese (</SelectItem>}
                {adicionando && <SelectItem value="fecha">Fechar parêntese )</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        )}

        {editandoOperador && (
          <div className="space-y-2">
            <Label>Operador</Label>
            <Select value={op} onValueChange={(v) => setOp(v as OperadorFluxo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERADORES.map((o) => (
                  <SelectItem key={o.op} value={o.op}>
                    {o.simbolo} {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!editandoOperador && tipo === "xml" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Campo do XML</Label>
              <Link
                to="/fiscal/fronteira/campos"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Gerenciar campos
              </Link>
            </div>
            <Select value={campo} onValueChange={setCampo}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o campo" />
              </SelectTrigger>
              <SelectContent>
                {padrao.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Campos padrão
                    </div>
                    {padrao.map((c) => (
                      <SelectItem key={c.id} value={c.codigo}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </>
                )}
                {personalizados.length > 0 && (
                  <>
                    <div className="mt-1 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Campos personalizados
                    </div>
                    {personalizados.map((c) => (
                      <SelectItem key={c.id} value={c.codigo}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Não achou o campo? Cadastre um novo em “Gerenciar campos”.
            </p>
          </div>
        )}


        {!editandoOperador && (tipo === "numero" || tipo === "percentual") && (
          <div className="space-y-2">
            <Label>{tipo === "percentual" ? "Porcentagem (%)" : "Número"}</Label>
            <Input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={tipo === "percentual" ? "20,50" : "0,795"}
            />
            {tipo === "percentual" && (
              <p className="text-xs text-muted-foreground">
                Ao ser aplicada, vale valor ÷ 100.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirmar}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestarCalculo({
  fluxo,
  catalogo,
}: {
  fluxo: Fluxo;
  catalogo: CampoXmlDef[];
}) {
  const campos = useMemo(() => camposUsados(fluxo), [fluxo]);
  const [valores, setValores] = useState<Record<string, string>>({});

  const numericos = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of campos) {
      const v = parseNumeroBR(valores[c] ?? "");
      out[c] = Number.isFinite(v) ? v : 0;
    }
    return out;
  }, [campos, valores]);

  const resultado = useMemo(
    () => avaliarFluxoDetalhado(fluxo, numericos, catalogo),
    [fluxo, numericos, catalogo],
  );


  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div>
        <h4 className="text-sm font-semibold">Testar cálculo</h4>
        <p className="text-xs text-muted-foreground">
          Informe valores fictícios para os campos do XML usados na fórmula.
        </p>
      </div>

      {campos.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum campo do XML na fórmula — o resultado é constante.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {campos.map((c) => (
            <div key={c} className="space-y-1.5">
              <Label className="text-xs">{labelDoCampo(catalogo, c)}</Label>
              <Input
                value={valores[c] ?? ""}
                onChange={(e) =>
                  setValores((s) => ({ ...s, [c]: e.target.value }))
                }
                placeholder="0,00"
              />
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          "rounded-md border bg-card p-3",
          !resultado.valido && "opacity-60",
        )}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Resultado
          </span>
          <span className="text-lg font-semibold">
            {resultado.valido ? formatBRL(resultado.resultado) : "—"}
          </span>
        </div>
        {resultado.valido && resultado.passos.length > 0 && (
          <ol className="mt-2 space-y-1 border-t pt-2 text-xs">
            {resultado.passos.map((p, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {i + 1}. {p.passo}
                </span>
                <span className="font-mono">{p.valor.toFixed(2)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
