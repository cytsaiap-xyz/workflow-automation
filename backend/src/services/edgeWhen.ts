import { ScriptRunner } from './scriptRunner';

export function evaluateWhen(expr: string | undefined, context: Record<string, unknown>): boolean {
  if (!expr || expr.trim() === '') return true;
  const interpolated = ScriptRunner.interpolateVariables(expr, context).trim();
  if (
    interpolated === '' ||
    interpolated === 'false' ||
    interpolated === '0' ||
    interpolated === 'null' ||
    interpolated === 'undefined'
  ) {
    return false;
  }
  return true;
}
