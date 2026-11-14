/**
 * Validação completa de CNPJ — checa formato e dígitos verificadores.
 */
export function isValidCNPJ(input: string): boolean {
  const cnpj = input.replace(/\D/g, "");
  if (cnpj.length !== 14) return false;
  // Rejeita sequências repetidas (00000000000000, 11111111111111, ...)
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (base: string): number => {
    const weights = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base
      .split("")
      .reduce((acc, ch, i) => acc + parseInt(ch, 10) * weights[i]!, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const base12 = cnpj.slice(0, 12);
  const dv1 = calcDigit(base12);
  const dv2 = calcDigit(base12 + String(dv1));
  return dv1 === parseInt(cnpj[12]!, 10) && dv2 === parseInt(cnpj[13]!, 10);
}
