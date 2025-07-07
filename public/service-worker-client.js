// public/service-worker-client.js (Updated)
const COOKIE_ENDPOINT = "/__read-cookie";

/**
 * Retrieves the wrappedDEK from the HttpOnly cookie via the Service Worker.
 * This function initiates a fetch request to a special endpoint that the
 * service worker intercepts. The service worker reads the HttpOnly cookie
 * and sends its value back to the client via a message.
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
      // Ensure the message is the one we're waiting for
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
          resolve(null); // Cookie not found
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", messageListener);

    // THE FIX: Add `credentials: 'include'` to ensure cookies are sent with the fetch request.
    // This tells the browser to attach cookies (including HttpOnly ones) to this request.
    fetch(COOKIE_ENDPOINT, { credentials: "include" }).catch((err) => {
      navigator.serviceWorker.removeEventListener("message", messageListener);
      reject(err);
    });
  });
}
