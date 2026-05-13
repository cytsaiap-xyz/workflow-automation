import { ScriptRunner } from './scriptRunner';

export interface TransformOptions {
  /**
   * Map of output keys to source expressions. Each expression is
   * interpolated against the provided context (typically
   * `{ ...variables, inputData: resolvedInput }`), and the resulting
   * string is JSON.parsed if it looks like JSON, otherwise kept as a
   * string. Same resolution rules as `inputVars`.
   */
  mapping: Record<string, string>;
}

export function transform(
  context: Record<string, unknown>,
  opts: TransformOptions,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, source] of Object.entries(opts.mapping)) {
    const interpolated = ScriptRunner.interpolateVariables(source, context as Record<string, any>);
    try {
      out[key] = JSON.parse(interpolated);
    } catch {
      out[key] = interpolated;
    }
  }
  return out;
}
