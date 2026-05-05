function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, p) => acc?.[p], obj);
}

export function fanOutInputs(input: Record<string, any>, inputArrayPath: string): Record<string, any>[] {
  const arr = getByPath(input, inputArrayPath);
  if (!Array.isArray(arr)) {
    throw new Error(`fanOut: input at path "${inputArrayPath}" is not an array`);
  }
  return arr.map(elem => {
    const copy = { ...input };
    const parts = inputArrayPath.split('.');
    if (parts.length === 1) {
      copy[parts[0]] = elem;
    } else {
      let cursor = copy;
      for (let i = 0; i < parts.length - 1; i++) {
        cursor[parts[i]] = { ...cursor[parts[i]] };
        cursor = cursor[parts[i]];
      }
      cursor[parts[parts.length - 1]] = elem;
    }
    return copy;
  });
}

export function collectFanOutOutputs(outputs: any[]): { items: any[] } {
  return { items: outputs };
}
