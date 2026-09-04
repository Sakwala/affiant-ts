/**
 * A Worker entry point exists only because wrangler's config requires a `main`.
 * The tests never dispatch a request to it.
 */
export default {
  fetch(): Response {
    return new Response("affiant conformance driver test worker", { status: 200 });
  },
};
