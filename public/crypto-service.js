// public/crypto-service.js
const PBKDF2_ITERATIONS = 600000;
const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 12;

export const cryptoService = {
  generateSalt() {
    return window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  },
  async deriveMasterKey(pin, salt) {
    const encoder = new TextEncoder();
    const pinBuffer = encoder.encode(pin);
    const baseKey = await window.crypto.subtle.importKey(
      "raw",
      pinBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["wrapKey", "unwrapKey"]
    );
  },
  async wrapDek(masterKey, dek) {
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
    const wrappedDek = await window.crypto.subtle.wrapKey(
      "raw",
      dek,
      masterKey,
      { name: "AES-GCM", iv: iv }
    );
    const ivAndWrappedDek = new Uint8Array(iv.length + wrappedDek.byteLength);
    ivAndWrappedDek.set(iv);
    ivAndWrappedDek.set(new Uint8Array(wrappedDek), iv.length);
    return ivAndWrappedDek.buffer;
  },
  async unwrapDek(masterKey, ivAndWrappedDek) {
    const buffer = new Uint8Array(ivAndWrappedDek);
    const iv = buffer.slice(0, IV_LENGTH_BYTES);
    const wrappedDek = buffer.slice(IV_LENGTH_BYTES);
    return window.crypto.subtle.unwrapKey(
      "raw",
      wrappedDek,
      masterKey,
      { name: "AES-GCM", iv: iv },
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  },
  async encryptData(dek, plaintext) {
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
    const encodedData = new TextEncoder().encode(plaintext);
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      dek,
      encodedData
    );
    const ivAndCiphertext = new Uint8Array(iv.length + ciphertext.byteLength);
    ivAndCiphertext.set(iv);
    ivAndCiphertext.set(new Uint8Array(ciphertext), iv.length);
    return ivAndCiphertext.buffer;
  },
  async decryptData(dek, ivAndCiphertext) {
    const buffer = new Uint8Array(ivAndCiphertext);
    const iv = buffer.slice(0, IV_LENGTH_BYTES);
    const ciphertext = buffer.slice(IV_LENGTH_BYTES);
    const decryptedData = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      dek,
      ciphertext
    );
    return new TextDecoder().decode(decryptedData);
  },
};
