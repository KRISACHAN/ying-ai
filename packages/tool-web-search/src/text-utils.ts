const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

export function containsCjk(text: string): boolean {
  return CJK_PATTERN.test(text);
}
