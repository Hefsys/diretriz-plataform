import { queryOptions } from "@tanstack/react-query";
import { db as supabase } from "@/lib/dp/db";
export const fontesQuery = queryOptions({
  queryKey: ["acervo-fontes"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("ff_fontes_legais")
      .select("*, ff_trechos_legais(count)")
      .order("titulo");
    if (error) throw error;
    return data;
  },
});
export async function todosTrechos(fonteId: string) {
  const resultado = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase
      .from("ff_trechos_legais")
      .select("id,item,titulo,texto,fundamento,fundamento_herdado,parte")
      .eq("fonte_id", fonteId)
      .order("item")
      .order("parte")
      .range(inicio, inicio + 999);
    if (error) throw error;
    resultado.push(...data);
    if (data.length < 1000) break;
  }
  return resultado.sort(
    (a, b) =>
      a.item.localeCompare(b.item, "pt-BR", { numeric: true }) || (a.parte ?? 0) - (b.parte ?? 0),
  );
}
