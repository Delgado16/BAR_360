export type KitchenOrderStatus = 'PENDING' | 'PREPARING' | 'READY';

export interface TableOrderMeta {
  alias: string;
  kitchenNote: string;
  kitchenStatus: KitchenOrderStatus;
}

export function parseTableOrderMeta(rawNotes: string | null | undefined): TableOrderMeta {
  if (!rawNotes) {
    return { alias: '', kitchenNote: '', kitchenStatus: 'PENDING' };
  }
  const trimmed = rawNotes.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<TableOrderMeta>;
      return {
        alias: typeof parsed.alias === 'string' ? parsed.alias : '',
        kitchenNote: typeof parsed.kitchenNote === 'string' ? parsed.kitchenNote : '',
        kitchenStatus:
          parsed.kitchenStatus === 'PREPARING' || parsed.kitchenStatus === 'READY'
            ? parsed.kitchenStatus
            : 'PENDING',
      };
    } catch {
      return { alias: trimmed, kitchenNote: '', kitchenStatus: 'PENDING' };
    }
  }
  return { alias: trimmed, kitchenNote: '', kitchenStatus: 'PENDING' };
}

export function serializeTableOrderMeta(meta: Partial<TableOrderMeta>): string | null {
  const alias = (meta.alias ?? '').trim();
  const kitchenNote = (meta.kitchenNote ?? '').trim();
  const kitchenStatus = meta.kitchenStatus ?? 'PENDING';
  if (!alias && !kitchenNote && kitchenStatus === 'PENDING') {
    return null;
  }
  return JSON.stringify({ alias, kitchenNote, kitchenStatus });
}

export function isKitchenCategory(categoryName: string): boolean {
  const lower = categoryName.toLowerCase();
  return lower.includes('comida') || lower.includes('cocina') || lower.includes('alimento');
}
