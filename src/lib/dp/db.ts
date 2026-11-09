import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// As tabelas dp_* ainda não estão no types.ts gerado; usamos o client sem tipagem
// até regenerar os tipos (supabase gen types) depois de aplicar a migração.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as unknown as SupabaseClient<any, "public", any>;

export const BUCKET_ADMISSOES = "dp-admissoes";
