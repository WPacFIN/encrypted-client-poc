// public/api-client.js
/**
 * Sends login credentials to the server.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<object>} The server response.
 */
export async function loginUser(username, password) {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Login failed");
  }
  return response.json();
}

/**
 * Sends the wrapped DEK to the server to be stored in an HttpOnly cookie.
 * @param {string} base64WrappedDek The base64-encoded wrapped DEK.
 * @returns {Promise<void>}
 */
export async function storeDekOnServer(base64WrappedDek) {
  const response = await fetch("/api/set-dek", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ wrappedDek: base64WrappedDek }),
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to store DEK on server");
  }
}
