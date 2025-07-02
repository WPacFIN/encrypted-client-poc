// crypto-service.js

const PBKDF2_ITERATIONS = 600000;
const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 12;

export const cryptoService = {
  /**
   * Generates a new random salt for PBKDF2.
   * @returns {Uint8Array} A 16-byte salt.
   */
  generateSalt() {
    return window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  },

  /**
   * Derives a master key (MK) from a PIN and salt using PBKDF2.
   * @param {string} pin The user's PIN.
   * @param {Uint8Array} salt The user's unique salt.
   * @returns {Promise<CryptoKey>} The derived master key, usable for wrapping/unwrapping.
   */
  async deriveMasterKey(pin, salt) {
    const encoder = new TextEncoder();
    const pinBuffer = encoder.encode(pin);

    // Import the PIN as a raw key for PBKDF2.
    const baseKey = await window.crypto.subtle.importKey(
      "raw",
      pinBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    // Derive the master key.
    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      true, // The MK must be extractable to be used for wrapping.
      ["wrapKey", "unwrapKey"]
    );
  },

  /**
   * Wraps (encrypts) a Data Encryption Key (DEK) with the Master Key (MK).
   * @param {CryptoKey} masterKey The in-memory master key.
   * @param {CryptoKey} dek The Data Encryption Key to wrap.
   * @returns {Promise<ArrayBuffer>} The encrypted DEK.
   */
  async wrapDek(masterKey, dek) {
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
    const wrappedDek = await window.crypto.subtle.wrapKey(
      "raw", // Format of the key to wrap
      dek,
      masterKey,
      {
        name: "AES-GCM",
        iv: iv,
      }
    );
    // Prepend the IV to the wrapped key for storage.
    const ivAndWrappedDek = new Uint8Array(iv.length + wrappedDek.byteLength);
    ivAndWrappedDek.set(iv);
    ivAndWrappedDek.set(new Uint8Array(wrappedDek), iv.length);
    return ivAndWrappedDek.buffer;
  },

  /**
   * Unwraps (decrypts) a Data Encryption Key (DEK) with the Master Key (MK).
   * @param {CryptoKey} masterKey The in-memory master key.
   * @param {ArrayBuffer} ivAndWrappedDek The encrypted DEK with prepended IV.
   * @returns {Promise<CryptoKey>} The decrypted Data Encryption Key.
   */
  async unwrapDek(masterKey, ivAndWrappedDek) {
    const buffer = new Uint8Array(ivAndWrappedDek);
    const iv = buffer.slice(0, IV_LENGTH_BYTES);
    const wrappedDek = buffer.slice(IV_LENGTH_BYTES);

    return window.crypto.subtle.unwrapKey(
      "raw",
      wrappedDek,
      masterKey,
      {
        name: "AES-GCM",
        iv: iv,
      },
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  },

  /**
   * Encrypts plaintext data using the Data Encryption Key (DEK).
   * @param {CryptoKey} dek The in-memory Data Encryption Key.
   * @param {string} plaintext The data to encrypt.
   * @returns {Promise<ArrayBuffer>} The ciphertext with a prepended IV.
   */
  async encryptData(dek, plaintext) {
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
    const encodedData = new TextEncoder().encode(plaintext);

    const ciphertext = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      dek,
      encodedData
    );

    // Prepend IV to ciphertext for storage.
    const ivAndCiphertext = new Uint8Array(iv.length + ciphertext.byteLength);
    ivAndCiphertext.set(iv);
    ivAndCiphertext.set(new Uint8Array(ciphertext), iv.length);
    return ivAndCiphertext.buffer;
  },

  /**
   * Decrypts ciphertext using the Data Encryption Key (DEK).
   * @param {CryptoKey} dek The in-memory Data Encryption Key.
   * @param {ArrayBuffer} ivAndCiphertext The ciphertext with prepended IV.
   * @returns {Promise<string>} The decrypted plaintext.
   */
  async decryptData(dek, ivAndCiphertext) {
    const buffer = new Uint8Array(ivAndCiphertext);
    const iv = buffer.slice(0, IV_LENGTH_BYTES);
    const ciphertext = buffer.slice(IV_LENGTH_BYTES);

    const decryptedData = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      dek,
      ciphertext
    );

    return new TextDecoder().decode(decryptedData);
  },
};
