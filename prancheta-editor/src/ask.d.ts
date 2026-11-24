// ui/ask.js é JavaScript puro, compartilhado com o app; aqui só o que a Prancheta usa.
declare module "*/ui/ask.js" {
  export function ask(title: string, options?: { text?: string; ok?: string; cancel?: string; danger?: boolean }): Promise<boolean>;
}
