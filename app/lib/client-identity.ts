// clients.id is the permanent cross-system identity. Slugs are legacy URL aliases only.
export function isClientId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function selectClient<T extends { id: string; slug?: string }>(
  clients: T[], selector: { id?: string; slug?: string } = {},
): T | null {
  if (selector.id !== undefined) {
    if (!isClientId(selector.id)) return null;
    const client = clients.find(row => row.id.toLowerCase() === selector.id!.toLowerCase());
    return client && (selector.slug === undefined || client.slug === selector.slug) ? client : null;
  }
  if (selector.slug !== undefined) {
    const matches = clients.filter(row => row.slug === selector.slug);
    return matches.length === 1 ? matches[0] : null;
  }
  // Only a request with no account selection may choose the first available account.
  return clients[0] || null;
}
