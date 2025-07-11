/**
 * @file api-client.js
 * @description This file handles all communication with the backend server.
 * For this demo, it only contains a login function. In a real application,
 * it would handle all API requests.
 */

/**
 * Sends login credentials to the server.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<object>} The server response, which includes the username.
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
