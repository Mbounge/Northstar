declare module 'next/dist/compiled/acorn' {
  export function parse(source: string, options: { ecmaVersion: 'latest'; sourceType: 'script' }): unknown;
}
