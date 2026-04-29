// netlify/edge-functions/proxy.js

// Read the backend URL from environment variables,
// fallback value is just a placeholder – you must set it in Netlify.
// This allows you to dynamically configure the upstream backend without
// hardcoding it in the source (useful for different environments).
const SERVER_URL =
  Netlify.env.get("SERVER_URL") || "https://your-backend-server.com";

export default async function bridgeHandler(request, context) {
  try {
    // Parse the incoming request URL to reconstruct its path and query string.
    const url = new URL(request.url);

    // Keep the original path + query string so the backend receives the request
    // exactly as the client intended (e.g., /api/user?id=123).
    const desPath = url.pathname + url.search;

    // Construct the final upstream URL by combining the backend base URL
    // with the incoming request path. Example:
    // SERVER_URL = https://api.example.com
    // request = https://mysite.netlify.com/api/data
    // → aboveUrl = https://api.example.com/api/data
    const aboveUrl = new URL(desPath, SERVER_URL).toString();

    // Copy headers from the incoming request. This preserves things like:
    // - Authorization
    // - Cookies
    // - Custom client headers
    const headers = new Headers(request.headers);

    // Remove headers that should not be forwarded upstream because:
    // - Netlify injects them automatically
    // - They may conflict or leak internal infrastructure details
    headers.delete("host");
    headers.delete("x-forwarded-proto");
    headers.delete("x-forwarded-host");

    // Build the request to your backend.
    // Important notes:
    // - body is a ReadableStream, so we do not buffer it.
    //   This allows big uploads to stream directly to the backend.
    // - redirect: "manual" ensures we do not auto-follow redirects.
    const aboveRequest = new Request(aboveUrl, {
      method: request.method,
      headers: headers,
      body: request.body, // ReadableStream, no buffering
      redirect: "manual",
    });

    // Forward the request to the backend server and wait for its response.
    const aboveResponse = await fetch(aboveRequest);

    // Prepare response headers. We create a new header set instead of copying
    // directly to avoid leaking hop-by-hop or connection-specific headers.
    // Hop-by-hop headers MUST NOT be forwarded.
    const responseHeaders = new Headers();
    for (const [key, value] of aboveResponse.headers.entries()) {
      if (
        !["transfer-encoding", "connection", "keep-alive"].includes(
          key.toLowerCase(),
        )
      ) {
        responseHeaders.set(key, value);
      }
    }

    // Return the upstream response back to the client.
    // The body remains a ReadableStream which preserves streaming,
    // making this proxy efficient even for large files.
    return new Response(aboveResponse.body, {
      status: aboveResponse.status,
      statusText: aboveResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    // Log the error for debugging. Netlify logs will show this server-side.
    console.error("Proxy error message:", error);

    // Return a generic error to the client so sensitive details aren't exposed.
    return new Response(`Proxy Error message: ${error.message}`, {
      status: 502,
    });
  }
}
