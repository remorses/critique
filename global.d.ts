// Type declarations for importing .scm files with Bun
declare module "*.scm" {
  const value: string
  export default value
}

declare module "wawoff2" {
  export function decompress(buffer: Buffer | Uint8Array): Promise<Uint8Array>
  export function compress(buffer: Buffer | Uint8Array): Promise<Uint8Array>
}
