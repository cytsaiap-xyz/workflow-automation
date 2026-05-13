function getByPath(obj: any, path: string): any {
  if (!path) return obj;
  return path.split('.').reduce((acc, p) => acc?.[p], obj);
}

export type AggregateOperation =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'flatten'
  | 'group-by'
  | 'pick'
  | 'concat';

export interface AggregateOptions {
  operation: AggregateOperation;
  field?: string;       // dot-path into each item; required for sum/avg/min/max/group-by/pick
  separator?: string;   // for concat; default ''
}

export interface AggregateResult {
  result: unknown;
  count: number;
}

export function aggregate(items: unknown, opts: AggregateOptions): AggregateResult {
  if (!Array.isArray(items)) {
    throw new Error(`aggregate: input is not an array (got ${typeof items})`);
  }
  const op = opts.operation;
  const field = opts.field?.trim() || '';

  if (op === 'count') {
    return { result: items.length, count: items.length };
  }

  if (op === 'flatten') {
    const flat: unknown[] = [];
    for (const item of items) {
      if (Array.isArray(item)) flat.push(...item);
      else flat.push(item);
    }
    return { result: flat, count: flat.length };
  }

  if (op === 'pick') {
    if (!field) throw new Error('aggregate: pick requires a field path');
    const picked = items.map(item => getByPath(item, field));
    return { result: picked, count: picked.length };
  }

  if (op === 'concat') {
    const sep = opts.separator ?? '';
    const parts = field
      ? items.map(item => String(getByPath(item, field) ?? ''))
      : items.map(item => String(item ?? ''));
    return { result: parts.join(sep), count: parts.length };
  }

  if (op === 'group-by') {
    if (!field) throw new Error('aggregate: group-by requires a field path');
    const groups: Record<string, unknown[]> = {};
    for (const item of items) {
      const key = String(getByPath(item, field) ?? '');
      (groups[key] ||= []).push(item);
    }
    return { result: groups, count: items.length };
  }

  // sum / avg / min / max — numeric reductions
  const values: number[] = items
    .map(item => (field ? getByPath(item, field) : item))
    .map(v => (typeof v === 'number' ? v : Number(v)))
    .filter(v => Number.isFinite(v));

  if (values.length === 0) {
    return { result: op === 'sum' ? 0 : null, count: 0 };
  }

  if (op === 'sum') return { result: values.reduce((a, b) => a + b, 0), count: values.length };
  if (op === 'avg') return { result: values.reduce((a, b) => a + b, 0) / values.length, count: values.length };
  if (op === 'min') return { result: Math.min(...values), count: values.length };
  if (op === 'max') return { result: Math.max(...values), count: values.length };

  throw new Error(`aggregate: unknown operation "${op}"`);
}
