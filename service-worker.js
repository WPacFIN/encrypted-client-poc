// service-worker.js

const COOKIE_ENDPOINT = "/__read-cookie";
const WRAPPED_DEK_COOKIE_NAME = "wrapped-dek";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Intercept requests to our special cookie-reading endpoint.
  if (url.pathname === COOKIE_ENDPOINT) {
    event.respondWith(
      (async () => {
        // The request must come from a client page.
        const clientId = event.clientId;
        if (!clientId) {
          return new Response("Request must be made from a client page.", {
            status: 400,
          });
        }
        const client = await self.clients.get(clientId);

        if (!client) {
          return new Response("Client not found.", { status: 404 });
        }

        // Read the cookie header from the incoming request.
        const cookieHeader = event.request.headers.get("cookie") || "";
        const cookies = cookieHeader.split(";").map((c) => c.trim());
        const dekCookie = cookies.find((c) =>
          c.startsWith(`${WRAPPED_DEK_COOKIE_NAME}=`)
        );

        // Extract the value from the "key=value" string.
        const wrappedDekValue = dekCookie ? dekCookie.split("=")[1] : null;

        // Send the cookie value (or null) back to the client page.
        client.postMessage({ type: "COOKIE_VALUE", payload: wrappedDekValue });

        // Respond to the fetch request with a "No Content" status to complete it.
        return new Response(null, { status: 204 });
      })()
    );
  }
});
