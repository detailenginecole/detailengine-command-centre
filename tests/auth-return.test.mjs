import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const login = await readFile(new URL("../app/login/LoginClient.tsx", import.meta.url), "utf8");
const callback = await readFile(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8");

test("Google login keeps the intended internal destination without changing the approved callback URL", () => {
  assert.match(login, /de_auth_return_to/);
  assert.match(login, /new URL\("\/auth\/callback", window\.location\.origin\)/);
  assert.doesNotMatch(login, /callback\.searchParams\.set\("returnTo"/);
  assert.match(callback, /cookieValue\(request, "de_auth_return_to"\)/);
  assert.match(callback, /safeReturnTo/);
  assert.match(callback, /NextResponse\.redirect\(new URL\(returnTo, url\.origin\)\)/);
});


test("login page uses direct staff sign-in copy", () => {
  assert.match(login, /<h1>Sign in<\/h1>/);
  assert.match(login, /Use your DetailEngine Google account to continue/);
  assert.doesNotMatch(login, /Company intelligence, protected/);
});
