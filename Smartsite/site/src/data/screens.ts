/** Capturas reais da plataforma. src null = captura ainda não feita: a página mostra um espaço identificado. */
export interface ScreenShot { src: string | null; alt: string; legenda: string; width?: number; height?: number }

export const SCREENS: Record<string, ScreenShot> = {};

export function screen(id: string): ScreenShot {
  return SCREENS[id] ?? { src: null, alt: '', legenda: id };
}
