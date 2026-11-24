# StackHero STK Push Starter

A small Node.js payment page for StackHero STK Push. This repository's root `vercel.json` routes requests to this serverless handler, which serves the page and handles STK Push, status, and webhook requests. It also runs locally with Node.js 18 or newer and no npm dependencies.

## Requirements

- Node.js 18 or newer for local use
- A StackHero linked account with its account ID and secret key

## Run locally

1. Copy `.env.example` to `.env`.
2. Set `STACKHERO_ACCOUNT_ID`, `STACKHERO_SECRET_KEY`, `STACKHERO_WEBHOOK_SECRET`, and a private `APP_PASSWORD` in `.env`. Do not share or commit `.env`.
3. Start the app:

   ```sh
   npm start
   ```

4. Open <http://localhost:3000>.
5. Enter the app access password, phone number, whole KES amount, and order reference; click **Send STK Push**.
6. The transaction request ID is copied into the status form. Use **Check status** to query the payment.

No npm packages are required. Credentials stay on the server and are sent to StackHero using `X-Account-Id` and `X-Secret-Key` headers.

## Deploy to Vercel

- `STACKHERO_ACCOUNT_ID`
- `STACKHERO_SECRET_KEY`
- `STACKHERO_WEBHOOK_SECRET`
- `APP_PASSWORD` — choose a separate, strong password for access to this payment page.

For deployment, add these variables in Vercel Project Settings and redeploy. The existing root `vercel.json` routes requests to this serverless handler. The callback field is prefilled with `https://noma-topaz.vercel.app/api/webhook`, which this handler verifies using `X-StackHero-Timestamp`, `X-StackHero-Signature`, and `STACKHERO_WEBHOOK_SECRET`.

The webhook only verifies and acknowledges events; it does not save orders or payment results. For a real store, add persistent order storage and idempotent handling, and mark an order paid only after a verified success event or a server-side status result.

## Endpoints

- `POST /api/stkpush` — checks the app password, validates input, and calls StackHero `POST /v1/stkpush`.
- `POST /api/status` — checks the app password and calls StackHero `POST /v1/tstatus`.
- `POST /api/webhook` — verifies and acknowledges signed payment events.
- `GET /health` — health check.

## Notes

- Amount must be a whole number from KES 1 to 250,000.
- Phone input accepts forms such as `0712345678`, `254712345678`, or `+254712345678`.
- The callback URL must use HTTPS and point to this deployed webhook route. Clear it to use the account's configured webhook URL instead.
- The payment and status routes require the app access password. Do not remove this protection from a public deployment.
- StackHero may reject a request if the linked account is inactive, disabled, out of tokens, or rate-limited.
- Do not use this demo as a production payment record system; it has no database, login, or order reconciliation.
