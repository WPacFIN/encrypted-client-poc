/**
 * @file crypto-service.js
 * @description This module encapsulates all interactions with the Web Crypto API.
 * It provides a high-level, promise-based API for all cryptographic operations
 * required by the application, such as key derivation, key wrapping, and data
 * encryption/decryption. This isolates the complex, low-level cryptographic
 * details from the rest of the application logic.
 */

// --- Cryptographic Constants ---
// These values are chosen based on current security best practices (NIST recommendations).
const PBKDF2_ITERATIONS = 600000; // A high number of iterations makes brute-force attacks very slow.
const SALT_LENGTH_BYTES = 16; // 128-bit salt is a standard size.
const IV_LENGTH_BYTES = 12; // 96-bit IV is recommended for AES-GCM for optimal performance.

export const cryptoService = {
  /**
   * Generates a new, cryptographically random salt.
   * A unique salt must be created for each user to prevent rainbow table attacks.
   * @returns {Uint8Array} A 16-byte random salt.
   */
  generateSalt() {
    return window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  },

  /**
   * Derives a strong Master Key (MK) from a low-entropy user PIN.
   * This uses PBKDF2, a standard key-stretching algorithm, to make the weak PIN
   * resistant to brute-force attacks.
   * @param {string} pin - The user's PIN.
   * @param {Uint8Array} salt - The user's unique, stored salt.
   * @returns {Promise<CryptoKey>} The derived master key, usable only for wrapping/unwrapping other keys.
   */
  async deriveMasterKey(pin, salt) {
    const encoder = new TextEncoder();
    const pinBuffer = encoder.encode(pin);

    // First, import the user's PIN as a base key for PBKDF2.
    // This key is not used for encryption itself.
    const baseKey = await window.crypto.subtle.importKey(
      "raw",
      pinBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    // Then, derive the actual master key using the specified parameters.
    // The key usages are restricted to 'wrapKey' and 'unwrapKey' for security.
    // This prevents the master key from being accidentally used to encrypt data directly.
    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      true, // The key must be extractable to be used for wrapping.
      ["wrapKey", "unwrapKey"]
    );
  },

  /**
   * Wraps (encrypts) a Data Encryption Key (DEK) using the Master Key (MK).
   * This is the correct, semantic way to encrypt one key with another.
   * @param {CryptoKey} masterKey - The key to wrap with (must have 'wrapKey' usage).
   * @param {CryptoKey} dek - The key to be wrapped.
   * @returns {Promise<ArrayBuffer>} The encrypted (wrapped) DEK, prepended with its IV.
   */
  async wrapDek(masterKey, dek) {
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
    // Use `wrapKey` as it's semantically correct for wrapping a CryptoKey.
    const wrappedDek = await window.crypto.subtle.wrapKey(
      "raw", // The format of the key being wrapped
      dek, // The CryptoKey to wrap
      masterKey, // The wrapping key (which has 'wrapKey' usage)
      { name: "AES-GCM", iv: iv }
    );
    // The IV must be stored alongside the ciphertext to be used for decryption.
    // We prepend it for convenience.
    const ivAndWrappedDek = new Uint8Array(iv.length + wrappedDek.byteLength);
    ivAndWrappedDek.set(iv);
    ivAndWrappedDek.set(new Uint8Array(wrappedDek), iv.length);
    return ivAndWrappedDek.buffer;
  },

  /**
   * Unwraps (decrypts) a Data Encryption Key (DEK) using the Master Key (MK).
   * @param {CryptoKey} masterKey - The key to unwrap with (must have 'unwrapKey' usage).
   * @param {ArrayBuffer} ivAndWrappedDek - The buffer containing the IV and the wrapped DEK.
   * @returns {Promise<CryptoKey>} The original DEK, now ready for data encryption/decryption.
   */
  async unwrapDek(masterKey, ivAndWrappedDek) {
    const buffer = new Uint8Array(ivAndWrappedDek);
    const iv = buffer.slice(0, IV_LENGTH_BYTES);
    const wrappedDek = buffer.slice(IV_LENGTH_BYTES);

    // unwrapKey returns the original key as a CryptoKey object with the specified permissions.
    return window.crypto.subtle.unwrapKey(
      "raw",
      wrappedDek,
      masterKey,
      { name: "AES-GCM", iv: iv },
      { name: "AES-GCM" },
      false, // Make the unwrapped key non-extractable for better security.
      ["encrypt", "decrypt"] // The DEK will be used for data operations.
    );
  },

  /**
   * Encrypts a string of plaintext data using the provided Data Encryption Key (DEK).
   * @param {CryptoKey} dek - The key to use for encryption (must have 'encrypt' usage).
   * @param {string} plaintext - The data to encrypt.
   * @returns {Promise<ArrayBuffer>} The encrypted data, prepended with its unique IV.
   */
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

  /**
   * Decrypts a buffer of ciphertext using the provided Data Encryption Key (DEK).
   * @param {CryptoKey} dek - The key to use for decryption (must have 'decrypt' usage).
   * @param {ArrayBuffer} ivAndCiphertext - The buffer containing the IV and the ciphertext.
   * @returns {Promise<string>} The decrypted plaintext string.
   */
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
