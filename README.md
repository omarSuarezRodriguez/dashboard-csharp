# csharp-final

cd c:\Users\Usuario\Desktop\csharp-final\whatsapp-chat-mvp
npm run dashboard



Proyecto principal: **`whatsapp-chat-mvp/`**

## Panel WhatsApp (lo que necesitas)

Ver y responder mensajes de WhatsApp desde el navegador. **No usa el bot automático**; tu bot Flask sigue en el puerto 5000.

```bash
cd whatsapp-chat-mvp
npm install
npm run configure    # credenciales Twilio en .env
npm run dashboard    # abre http://localhost:5002
```

Variables en `whatsapp-chat-mvp/.env`:

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
- `DASHBOARD_PORT=5002` (no choca con Flask 5000 ni ngrok)

El panel sincroniza mensajes desde la API de Twilio cada ~1 s. No cambia el webhook de tu bot.

## Bot automático (opcional)

Solo si quieres el MVP Node además de tu bot Flask:

```bash
npm run dev    # puerto 5001
```
