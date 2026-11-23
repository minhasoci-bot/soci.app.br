import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const faq = z.array(z.object({ q: z.string(), a: z.string() })).default([]);

const base = {
  /** <title> da página (até 60 caracteres). */
  title: z.string().max(60),
  /** meta description (até 160 caracteres). */
  description: z.string().min(50).max(160),
  h1: z.string(),
  /** A pergunta que a página responde (AEO). O primeiro parágrafo do corpo responde a ela. */
  pergunta: z.string(),
  /** Resposta direta à pergunta, logo abaixo do H1 (40 a 70 palavras). */
  resposta: z.string().min(120).max(520),
  ordem: z.number().int(),
  faq,
};

const funcionalidades = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/funcionalidades' }),
  schema: z.object({
    ...base,
    /** Rótulo curto para listas e menus. */
    nome: z.string(),
    /** A = funciona de ponta a ponta; B = registro interno, sem integração externa. */
    evidencia: z.enum(['A', 'B']),
    /** Arquivos do repositório que provam o que a página afirma. */
    fontes: z.array(z.string()).min(1),
    objetivos: z.array(z.enum(['atrair', 'converter', 'atender', 'reter', 'gerir'])).min(1),
    /** Resumo de uma linha para cards. */
    resumo: z.string().max(110),
  }),
});

const solucoes = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/solucoes' }),
  schema: z.object({
    ...base,
    nome: z.string(),
    resumo: z.string().max(110),
    funcionalidades: z.array(reference('funcionalidades')).min(3),
  }),
});

export const collections = { funcionalidades, solucoes };
