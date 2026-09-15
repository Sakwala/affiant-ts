/**
 * The two versions the parity manifest states about this implementation's adapter,
 * as literals, in a module that imports neither the adapter nor the framework.
 *
 * Literals rather than versions read off disk: this module runs inside workerd, which
 * has no filesystem, and a manifest naming a version the run did not use would be
 * unreproducible. A module of their own rather than `./ai-sdk.js`, so that reading the
 * parity manifest does not pull the AI SDK and the adapter into the program that reads
 * it — `../parity.js` states a claim about the adapter and does not run it.
 *
 * `test/node/published-claims.test.ts` asserts both against the manifests on disk, so
 * neither literal can drift from what the suites actually resolved.
 *
 * @packageDocumentation
 */

/** The version of `@affiant/adapter-ai-sdk` this repository's run exercised. */
export const ADAPTER_PACKAGE_VERSION = "0.1.0-alpha.0";

/** The version of `ai` the adapter's suites resolved and ran against (CV-5). */
export const AI_SDK_VERSION = "7.0.101";
