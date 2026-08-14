/// <reference types="node" />

/**
 * Spike: verify `react-native-quick-crypto` provides the primitives the
 * PRD's secure channel needs, mirroring the PRD's exact derivation:
 *
 *   shared_secret  = X25519(A_priv, B_pub) == X25519(B_priv, A_pub)
 *   session_key    = HKDF(shared_secret, salt="PairSync-v2", info="transfer")
 *   encryption_key = HKDF(session_key, salt="enc", info="AES-256-GCM")
 *
 * react-native-quick-crypto is a native (JSI/Nitro) module, so this will
 * NOT run in Expo Go or on web. To run it, build a dev client
 * (`npx expo prebuild && npx expo run:ios` / `run:android`) and import
 * this module from any screen; results print to the console.
 */
import Crypto from "react-native-quick-crypto";

const SESSION_SALT = "PairSync-v2";
const SESSION_INFO = "transfer";
const KEY_SALT = "enc";
const KEY_INFO = "AES-256-GCM";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    throw new Error(`SPIKE FAILED: ${msg}`);
  }
  console.log(`  ✅ ${msg}`);
}

export function runSpike(): void {
  console.log("[spike] X25519 key exchange");

  const alice = Crypto.generateKeyPairSync("x25519");
  const bob = Crypto.generateKeyPairSync("x25519");

  const alicePub = alice.publicKey.export({ type: "spki", format: "der" });
  const bobPub = bob.publicKey.export({ type: "spki", format: "der" });
  assert(
    alicePub.length === 44 && bobPub.length === 44,
    `X25519 SPKI public keys are 44 bytes (got ${alicePub.length}/${bobPub.length})`
  );

  const sharedA = Crypto.diffieHellman({
    privateKey: alice.privateKey,
    publicKey: bob.publicKey,
  });
  const sharedB = Crypto.diffieHellman({
    privateKey: bob.privateKey,
    publicKey: alice.publicKey,
  });
  if (!sharedA || !sharedB) {
    throw new Error("SPIKE FAILED: diffieHellman returned void");
  }
  assert(Buffer.compare(sharedA, sharedB) === 0, "both sides derive the same shared secret");
  assert(sharedA.length === 32, `shared secret is 32 bytes (got ${sharedA.length})`);

  console.log("[spike] HKDF key derivation");

  const sessionKey = Crypto.hkdfSync("sha256", sharedA, Buffer.from(SESSION_SALT), Buffer.from(SESSION_INFO), 32);
  const encKey = Crypto.hkdfSync("sha256", sessionKey, Buffer.from(KEY_SALT), Buffer.from(KEY_INFO), 32);
  assert(sessionKey.length === 32 && encKey.length === 32, "HKDF derives 32-byte session and encryption keys");

  console.log("[spike] AES-256-GCM encrypt/decrypt");

  const iv = Crypto.randomBytes(12);
  const cipher = Crypto.createCipheriv("aes-256-gcm", encKey, iv);
  const plaintext = Buffer.from("pairsync spike payload: hello from device A");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  assert(ciphertext.length === plaintext.length, `GCM ciphertext is plaintext-length (got ${ciphertext.length})`);

  const decipher = Crypto.createDecipheriv("aes-256-gcm", encKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  assert(decrypted.equals(plaintext), "decrypted payload round-trips");

  const wrong = Crypto.createDecipheriv("aes-256-gcm", Crypto.randomBytes(32), iv);
  wrong.setAuthTag(tag);
  try {
    Buffer.concat([wrong.update(ciphertext), wrong.final()]);
    throw new Error("SPIKE FAILED: wrong key decrypted successfully");
  } catch (err) {
    if (String(err).includes("SPIKE FAILED")) {
      throw err;
    }
    console.log("  ✅ wrong key rejected (GCM auth tag)");
  }

  console.log("[spike] ALL CHECKS PASSED — X25519 + HKDF + AES-256-GCM available");
}

runSpike();
