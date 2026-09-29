import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const api = await readFile(new URL("../app/api/start-client/route.ts", import.meta.url), "utf8");
const client = await readFile(new URL("../app/start/SalesStartClient.tsx", import.meta.url), "utf8");
const page = await readFile(new URL("../app/start/SalesStartPage.tsx", import.meta.url), "utf8");
const nextConfig = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");

test("sales start route preserves the internal staff boundary", () => {
  assert.match(api, /getDetailEngineUser\(\)/);
  assert.match(api, /status: 401/);
  assert.match(page, /requireDetailEngineUser/);
});

test("checkout creation allows only the two verified setup pathways", () => {
  assert.match(api, /client-setup-payment/);
  assert.match(api, /\["embedded", "hosted"\]\.includes\(checkoutMode\)/);
  assert.match(api, /checkout_mode: checkoutMode/);
  assert.match(api, /setup_amount_minor: setupAmountMinor/);
  assert.match(api, /Number\.isInteger\(setupAmountMinor\)/);
  assert.match(api, /setupAmountMinor > 10000000/);
  assert.match(api, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(api, /cache: "no-store"/);
  assert.doesNotMatch(api, /service[_-]?role/i);
});

test("sales UI collects client context and delegates card data to Stripe", () => {
  for (const field of ["business_name", "full_name", "email", "general_location"]) {
    assert.match(client, new RegExp(field));
  }
  assert.match(client, /https:\/\/js\.stripe\.com\/v3\//);
  assert.match(client, /initEmbeddedCheckout/);
  assert.match(client, /checkout_client_secret/);
  assert.match(client, /Secure payment form provided by Stripe/);
  assert.match(client, /defaultSetupFeeCad = 1000/);
  assert.match(client, /setup_amount_minor: setupFeeCad \* 100/);
  assert.match(client, /Adjust/);
  assert.match(client, /Setup fee \(CAD\)/);
  assert.match(client, /formatSetupFee\(setupFeeCad\)/);
  assert.doesNotMatch(client, /card_number|payment_method_data/);
});

test("sales UI exposes both on-screen and client-link pathways", () => {
  assert.match(client, /Enter card here/);
  assert.match(client, /Send secure payment link/);
  assert.match(client, /checkout_url/);
  assert.match(client, /Copy payment link/);
  assert.match(client, /Email payment link/);
  assert.match(client, /Preview what the client sees/);
});

test("sales UI contains no promotional sales copy", () => {
  assert.doesNotMatch(client, /Turn the yes|SECURE HANDOFF|Welcome,/);
  assert.match(client, /Let&apos;s get you started with DetailEngine/);
  assert.match(client, /Client details/);
  assert.match(client, /Continue to payment/);
});

test("the start subdomain root routes to the authenticated sales tool", () => {
  assert.match(nextConfig, /source: "\/"/);
  assert.match(nextConfig, /type: "host"/);
  assert.match(nextConfig, /value: "start\.getdetailengine\.com"/);
  assert.match(nextConfig, /destination: "\/start"/);
});
