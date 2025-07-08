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
    // The master key's purpose is to wrap/unwrap other keys.
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
    // Use `wrapKey` as it's semantically correct for wrapping a CryptoKey.
    const wrappedDek = await window.crypto.subtle.wrapKey(
      "raw", // The format of the key being wrapped
      dek, // The CryptoKey to wrap
      masterKey, // The wrapping key (which has 'wrapKey' usage)
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
    // Use `unwrapKey` to get the DEK back as a non-extractable CryptoKey.
    return window.crypto.subtle.unwrapKey(
      "raw",
      wrappedDek,
      masterKey, // The unwrapping key (which has 'unwrapKey' usage)
      { name: "AES-GCM", iv: iv },
      { name: "AES-GCM" },
      false, // Make the unwrapped key non-extractable for security
      ["encrypt", "decrypt"] // The DEK will be used for encrypting data
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
