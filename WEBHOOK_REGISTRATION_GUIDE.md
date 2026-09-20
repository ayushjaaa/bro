# Webhook Registration — Step by Step

## Kya register karna hai (total 4 script runs, 2 apps)

| App | Script | Topics | Points at |
|---|---|---|---|
| `admin-panel` | `register-inventory-webhook.ts` | `INVENTORY_LEVELS_UPDATE` | `/api/webhooks/inventory` |
| `admin-panel` | `register-products-webhook.ts` | `PRODUCTS_CREATE/UPDATE/DELETE` | `/api/webhooks/products` |
| `admin-panel` | `register-orders-webhook.ts` | `DRAFT_ORDERS_CREATE/UPDATE`, `ORDERS_CREATE/UPDATED` | `/api/webhooks/orders` |
| `storefront` | `register-webhooks.ts` | `PRODUCTS_*`, `INVENTORY_LEVELS_UPDATE`, `METAOBJECTS_*`, `COLLECTIONS_UPDATE` | `/api/webhooks/products`, `/api/webhooks/taxonomy` |

Dono apps **alag callback URLs** use karte hain (apna-apna webhook route), isliye Shopify dono ko independently register hone deta hai — koi conflict nahi.

## Local testing ke liye (ngrok se)

Har app ke liye **alag ngrok tunnel** chahiye (kyunki dono alag port pe chalte hain — admin-panel `:4000`, storefront `:3000`):

```bash
# Terminal 1 — admin-panel ke liye tunnel
ngrok http 4000
# ngrok output se URL copy karo, jaise https://abcd1234.ngrok-free.app

# Terminal 2 — storefront ke liye tunnel
ngrok http 3000
```

Phir admin-panel se (usi ngrok URL ke saath):
```bash
cd admin-panel
WEBHOOK_CALLBACK_BASE_URL=https://<admin-panel-ngrok-url> npm run shopify:register-inventory-webhook
WEBHOOK_CALLBACK_BASE_URL=https://<admin-panel-ngrok-url> npm run shopify:register-products-webhook
WEBHOOK_CALLBACK_BASE_URL=https://<admin-panel-ngrok-url> npm run shopify:register-orders-webhook
```

Storefront se:
```bash
cd storefront
WEBHOOK_CALLBACK_BASE_URL=https://<storefront-ngrok-url> npx tsx --env-file=.env.local scripts/shopify/register-webhooks.ts
```

⚠️ **Ngrok free tier ka URL har restart pe badal jaata hai** — jab bhi ngrok restart karo, scripts dobara chalane padenge naye URL ke saath, warna purana webhook mar jaayega (dead URL pe deliver hota rahega, silently fail).

## Production/deployed ke liye

Jab dono apps real domain pe deploy ho jaayen (Vercel ya jahan bhi), **same scripts** chalao lekin `WEBHOOK_CALLBACK_BASE_URL` ko real domain se replace karke — ek hi baar karna hoga (URL fir nahi badlega), `PRODUCTION_MIGRATION_PENDING.md` ke `STOREFRONT_INTERNAL_URL`/`ADMIN_PANEL_INTERNAL_URL` update karne ke saath saath.

## Verify kaise karein registration ke baad

Scripts khud existing subscriptions list kar dete hain agar pehle se koi ho (duplicate warning dete hain). Manually confirm karne ke liye Shopify Admin mein: **Settings → Notifications → Webhooks** (ya GraphQL se `webhookSubscriptions` query).

Phir asli test: admin-panel mein koi product price/stock edit karo → storefront pe (bina cache clear/restart ke) turant reflect hona chahiye. Ye exact test case already `PRODUCTION_MIGRATION_PENDING.md` mein likha hai.

## Security note
Dono apps ke webhook routes HMAC signature verify karte hain (`SHOPIFY_CLIENT_SECRET` se, already `.env.local` mein hai) — isliye koi extra secret setup nahi chahiye, sirf registration hi baaki hai.
