// mock-server.js

/**
 * Simulates a server endpoint that generates a new Data Encryption Key (DEK)
 * and an expiry timestamp for it. In a real app, this would be a secure,
 * authenticated server endpoint.
 * @returns {Promise<{dek: ArrayBuffer, expiryTimestamp: number}>}
 */
export async function provisionOfflineAccess() {
  console.log("MOCK SERVER: Generating new DEK and expiry...");
  // Generate a raw 256-bit (32-byte) key for AES-GCM.
  const dek = window.crypto.getRandomValues(new Uint8Array(32));
  // Set expiry for 30 days from now.
  const expiryTimestamp = Date.now() + 30 * 24 * 60 * 60 * 1000;

  return { dek: dek.buffer, expiryTimestamp };
}

/**
 * Simulates the server setting an HttpOnly cookie.
 *
 *!!! --- CRITICAL DEMO-ONLY SIMPLIFICATION ---!!!
 * In a real application, this function would NOT exist on the client.
 * The client would send the wrappedDEK to the server, and the server would
 * respond with a `Set-Cookie` header like:
 * `Set-Cookie: wrapped-dek=...; HttpOnly; Secure; SameSite=Strict`
 * For this demo, we simulate this by storing the value in localStorage,
 * which is NOT secure against XSS attacks.
 *
 * @param {ArrayBuffer} wrappedDek The encrypted DEK.
 */
export function setWrappedDekCookie(wrappedDek) {
  console.log("MOCK SERVER: Simulating setting HttpOnly cookie...");
  // Convert ArrayBuffer to Base64 string for storage.
  const base64String = btoa(String.fromCharCode(...new Uint8Array(wrappedDek)));
  localStorage.setItem("mockHttpOnlyCookie_wrapped-dek", base64String);
}
