// service-worker-client.js

/**
 * Retrieves the wrappedDEK from the HttpOnly cookie via the Service Worker.
 *
 *!!! --- CRITICAL DEMO-ONLY SIMPLIFICATION ---!!!
 * In a real application, this function would use a service worker to read a
 * secure, HttpOnly cookie set by a real server. For this demo, to make it
 * runnable without a backend, we are directly reading from localStorage, which
 * simulates where the mock-server.js stored the key. This is NOT secure and
 * is for demonstration purposes only.
 *
 * @returns {Promise<ArrayBuffer | null>} A promise that resolves with the ArrayBuffer of the wrapped DEK, or null if not found.
 */
export function getWrappedDekFromCookie() {
  return new Promise((resolve, reject) => {
    try {
      const base64Value = localStorage.getItem(
        "mockHttpOnlyCookie_wrapped-dek"
      );

      if (base64Value) {
        const binaryString = window.atob(base64Value);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        resolve(bytes.buffer);
      } else {
        resolve(null);
      }
    } catch (e) {
      console.error("Failed to get wrapped DEK from mock cookie storage:", e);
      reject(new Error("Failed to get wrapped DEK from mock cookie storage."));
    }
  });
}
