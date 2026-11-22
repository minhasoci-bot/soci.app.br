// Gera o par de chaves VAPID das notificações push (app mobile e portal do cliente).
// Uso: node scripts/vapid-keys.mjs  → copie as duas linhas para as variáveis de ambiente (Vercel e .env).
import { vapidKeys } from '../web-push.mjs';

const { publicKey, privateKey } = vapidKeys();
console.log(`WEB_PUSH_PUBLIC_KEY=${publicKey}`);
console.log(`WEB_PUSH_PRIVATE_KEY=${privateKey}`);
