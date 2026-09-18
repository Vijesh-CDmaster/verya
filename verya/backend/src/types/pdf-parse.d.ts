// Minimal ambient types for pdf-parse (no bundled types upstream).
declare module "pdf-parse" {
  function pdfParse(buffer: Buffer): Promise<{ text: string; numpages: number; info: unknown }>;
  export default pdfParse;
}
