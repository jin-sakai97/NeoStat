import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../../src/domain/passwords.js";

test("scrypt hashes verify the right password only", async () => {
  const hash = await hashPassword("NeoStatsDemo!2026");
  assert.match(hash, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(await verifyPassword("NeoStatsDemo!2026", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
});
