# StackHero STK Push Starter

A minimal Node.js web app that sends M-Pesa STK Push requests through StackHero. It includes a small browser form, server-side credential handling, transaction status lookup, and an optional signed webhook receiver.

## Requirements

- Node.js 18 or newer
- A StackHero linked account with its account ID and secret key

## Run locally

1. Copy `.env.example` to `.env`.
2. Put your StackHero account ID and secret key in `.env`. Do not share or commit `.env`.
3. Start the app:

   ```sh
   npm start
   ```

4. Open <http://localhost:3000>.
5. Enter a phone number, whole KES amount, and order reference; click **Send STK Push**.
6. The transaction request ID is copied into the status form. Use **Check status** to query the payment.

No npm packages are required. Credentials stay on the server and are sent to StackHero using `X-Account-Id` and `X-Secret-Key` headers.

## Optional webhook

The app exposes `POST /webhook`. To use it, deploy the app to a public HTTPS host, set `STACKHERO_WEBHOOK_SECRET` in the server environment to the webhook secret from your StackHero account, and configure the account webhook URL (or enter `https://your-domain/webhook` as the callback URL). The receiver verifies `X-StackHero-Timestamp` and `X-StackHero-Signature` using the documented HMAC-SHA256 format.

This starter only verifies and acknowledges webhook events. It does not save orders or payment results. For a real store, add persistent order storage, make webhook handling idempotent, and mark an order paid only after a verified `success` event or a server-side status result.

## API routes in this demo

- `POST /api/stkpush` — validates the form and forwards it to StackHero `POST /v1/stkpush`.
- `POST /api/status` — checks a `transaction_request_id` through StackHero `POST /v1/tstatus`.
- `POST /webhook` — verifies and acknowledges signed payment webhook events.
- `GET /health` — simple app health check.

## Notes

- Amount must be a whole number from KES 1 to 250,000.
- Phone input accepts forms such as `0712345678`, `254712345678`, or `+254712345678`.
- An optional callback URL must use HTTPS. Leave it blank to use the account's configured webhook URL.
- StackHero may reject a request if the linked account is inactive, disabled, out of tokens, or rate-limited.
- Do not use this demo as a production payment record system; it has no database, login, or order reconciliation.
