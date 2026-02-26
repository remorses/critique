// Type declarations for importing .scm files with Bun
declare module "*.scm" {
  const value: string
  export default value
}
