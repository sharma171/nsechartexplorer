export const normalizePhone = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
};
export const phoneToEmail = (p: string) => `${normalizePhone(p)}@phone.local`;
