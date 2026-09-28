import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const api = await readFile(new URL("../app/api/start-client/route.ts", import.meta.url), "utf8");
const client = await readFile(new URL("../app/start/SalesStartClient.tsx", import.meta.url), "utf8");
const page = await readFile(new URL("../app/start/SalesStartPage.tsx", import.meta.url), "utf8");

test("sales start route preserves the internal staff boundary", () => {
  assert.match(api, /getDetailEngineUser\(\)/);
  assert.match(api, /status: 401/);
  assert.match(page, /requireDetailEngineUser/);
});

test("checkout creation uses the verified setup workflow", () => {
  assert.match(api, /client-setup-payment/);
  assert.match(api, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(api, /cache: "no-store"/);
  assert.doesNotMatch(api, /service[_-]?role/i);
});

test("sales UI collects owner and business context without card data", () => {
  for (const field of ["business_name", "full_name", "email", "general_location"]) {
    assert.match(client, new RegExp(field));
  }
  assert.match(client, /Card details are entered only on Stripe Checkout/);
  assert.match(client, /\$1,000 CAD/);
  assert.doesNotMatch(client, /card_number|cvc|payment_method_data/);
});
