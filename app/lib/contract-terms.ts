export type ContractTerms = {
  version: 1; currency: "USD"; legal_name: string; entity_type: string;
  jurisdiction: string; business_address: string; signer_name: string;
  signer_title: string; signer_email: string; phone: string;
  setup_amount_minor: number; retainer_amount_minor: number;
  opportunity_goal: number; daily_budget_minor: number;
  minimum_cycle_days: 28; ad_spend_fee_percent: 10;
};
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new Error("Enter a valid " + label + ".");
  return value.trim();
}
function integer(value: unknown, label: string, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > max)
    throw new Error("Enter a valid " + label + ".");
  return value;
}
export function parseContractTerms(value: unknown, setupAmount: number): ContractTerms {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Complete the contract details.");
  const s = value as Record<string, unknown>;
  if (s.version !== 1 || s.currency !== "USD" || s.setup_amount_minor !== setupAmount)
    throw new Error("Contract version, currency or setup fee does not match.");
  const email = text(s.signer_email, "signer email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid signer email.");
  const phone = text(s.phone, "phone number", 40);
  if (!/^\+?[0-9 ()-]{7,40}$/.test(phone) || phone.replace(/\D/g, "").length < 7)
    throw new Error("Enter a valid phone number.");
  return {
    version: 1, currency: "USD",
    legal_name: text(s.legal_name, "legal business name", 160),
    entity_type: text(s.entity_type, "business entity type", 80),
    jurisdiction: text(s.jurisdiction, "formation state", 120),
    business_address: text(s.business_address, "business address", 500),
    signer_name: text(s.signer_name, "signer name", 120),
    signer_title: text(s.signer_title, "signer title", 120),
    signer_email: email, phone,
    setup_amount_minor: integer(setupAmount, "setup fee", 10000000),
    retainer_amount_minor: integer(s.retainer_amount_minor, "retainer", 10000000),
    opportunity_goal: integer(s.opportunity_goal, "whole-number opportunity goal", 1000000),
    daily_budget_minor: integer(s.daily_budget_minor, "daily advertising budget", 10000000),
    minimum_cycle_days: 28, ad_spend_fee_percent: 10,
  };
}
export function sameContractTerms(a: unknown, b: ContractTerms): boolean {
  try { return JSON.stringify(parseContractTerms(a, b.setup_amount_minor)) === JSON.stringify(b); }
  catch { return false; }
}
