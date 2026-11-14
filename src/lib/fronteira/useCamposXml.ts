import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/dp/db";
import { ordenarCampos, type CampoXmlDef } from "./campos-xml";

/** Catálogo de campos do XML (ff_campos_xml), ordenado para exibição. */
export function useCamposXml(apenasAtivos = true) {
  return useQuery({
    queryKey: ["ff-campos-xml", apenasAtivos],
    queryFn: async (): Promise<CampoXmlDef[]> => {
      let q = db.from("ff_campos_xml").select("*");
      if (apenasAtivos) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return ordenarCampos((data ?? []) as unknown as CampoXmlDef[]);
    },
    staleTime: 60_000,
  });
}
