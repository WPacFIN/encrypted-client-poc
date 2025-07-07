// public/service-worker-client.js
const COOKIE_ENDPOINT = "/__read-cookie";

/**
 * Retrieves the wrappedDEK from the HttpOnly cookie via the Service Worker.
 * @returns {Promise<ArrayBuffer | null>} A promise that resolves with the ArrayBuffer of the wrapped DEK, or null if not found.
 */
export function getWrappedDekFromCookie() {
  return new Promise((resolve, reject) => {
    if (!navigator.serviceWorker.controller) {
      return reject(
        new Error("Service worker is not active. Please reload the page.")
      );
    }

    const messageListener = (event) => {
      if (event.data && event.data.type === "COOKIE_VALUE") {
        navigator.serviceWorker.removeEventListener("message", messageListener);
        const base64Value = event.data.payload;
        if (base64Value) {
          try {
            const binaryString = window.atob(base64Value);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            resolve(bytes.buffer);
          } catch (e) {
            reject(new Error("Failed to decode wrapped DEK from cookie."));
          }
        } else {
          resolve(null);
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", messageListener);

    fetch(COOKIE_ENDPOINT, { credentials: "include" }).catch((err) => {
      navigator.serviceWorker.removeEventListener("message", messageListener);
      reject(err);
    });
  });
}
