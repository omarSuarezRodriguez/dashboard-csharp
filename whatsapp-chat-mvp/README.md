# WhatsApp Chat MVP (Twilio)

Bot de WhatsApp multi-tenant con respuesta **síncrona TwiML**, Fastify, Prisma y PostgreSQL.

## Requisitos

- Node 20+
- PostgreSQL 16+
- Cuenta Twilio con WhatsApp Sandbox o número aprobado

## Variables de plataforma

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Conexión PostgreSQL |
| `NODE_ENV` | `development` \| `production` |
| `PORT` | Puerto HTTP (default `3000`) |
| `ENCRYPTION_KEY` | Clave AES (texto largo o 64 hex) para cifrar Auth Token en DB |
| `LOG_LEVEL` | Nivel Pino (`info`, `debug`, …) |
| `SETUP_REQUIRED` | Si `true`, el servidor no arranca sin tenant |

Las credenciales Twilio **por restaurante** se guardan solo vía `npm run setup` (no en `.env`).

## Primer arranque

```bash
cp .env.example .env
# Editar DATABASE_URL, ENCRYPTION_KEY, TWILIO_* y WEBHOOK_BASE_URL

npm install
npx prisma migrate deploy

npm run dev   # puerto 5001 por defecto en .env (no usa 5000 del bot Flask)
```

### Activación rápida (Twilio + tenant `demo`)

Con ngrok apuntando al **puerto 5000** (Flask) y el proxy en `chatbot-cursor` hacia el MVP:

```bash
npm run configure
npm run webhook:twilio   # requiere WEBHOOK_URL o WEBHOOK_BASE_URL en .env
npm run send:test        # mensaje saliente de prueba
npm run simulate         # simula un "hola" entrante firmado
# o todo junto:
npm run go-live
```

Variables en `.env`:

| Variable | Uso |
|----------|-----|
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | API Twilio |
| `TWILIO_WHATSAPP_FROM` | Número del bot |
| `WEBHOOK_BASE_URL` | URL ngrok **sin** path final |
| `TEST_WHATSAPP_TO` | Destino de `npm run send:test` |
| `PORT` | HTTP del MVP (recomendado `5001`) |

Wizard interactivo alternativo: `npm run setup`

Reconfigurar un tenant:

```bash
npm run setup -- --reconfigure=mi-slug
```

## Webhook Twilio

Por tenant, método **POST**:

```
{WEBHOOK_BASE_URL}/webhooks/twilio/{slug}/whatsapp
```

La URL base la defines en el setup; debe coincidir con la URL pública que Twilio firma (HTTPS, sin path extra).

Si Flask ocupa el puerto 5000 con ngrok, el proyecto incluye un **proxy** en `chatbot-cursor/app/app.py` que reenvía `/webhooks/twilio/*` al MVP en `localhost:5001` (`WHATSAPP_MVP_PORT`). Así no necesitas un segundo túnel ngrok.

## Docker

```bash
# .env con ENCRYPTION_KEY
docker compose up --build
docker compose exec app npm run setup
```

Migraciones se aplican en el entrypoint (`prisma migrate deploy`).

## Health

`GET /health` → `{ "status": "ok", "db": "ok" }`

## Arquitectura

```
delivery → application → domain
infrastructure implementa repos y cifrado
```

Puertos stub para migración futura: `OutboundMessenger`, `MessageQueue`, `IntentClassifier`.

## Tests

```bash
npm test
```

## Checklist producción básica

- [ ] `npm run setup` completado, tenant `is_active`
- [ ] Webhook en Twilio Console apuntando a la URL del setup
- [ ] Mensaje duplicado (mismo `MessageSid`) → respuesta vacía, sin doble procesamiento
- [ ] Flujos pedido y reserva con confirmación Sí/No
- [ ] Logs con `tenant_id`, `MessageSid`, `intent`, `latency_ms`
- [ ] Reinicio del contenedor: sin wizard, estado en Postgres
