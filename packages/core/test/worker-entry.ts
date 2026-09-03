/**
 * A Worker entry point exists only because wrangler's config requires a `main`.
 * The tests never dispatch a request to it.
 */
export default {
  fetch(): Response {
    return new Response("affiant-core test worker", { status: 200 });
  },
};
