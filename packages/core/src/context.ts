/**
 * Turn context — the object every gate entry point takes as a parameter.
 *
 * **Rules served: GT-2** (the conversation-scope contract), **AZ-3** (a relay may
 * never attest as the person it speaks for).
 *
 * GT-2 in one sentence: *turn context is explicit and passed, never ambient.*
 * Every entry point on the gate takes a {@link TurnContext} — conversation id,
 * tenant, channel, the principal if one is resolved, and the unmodified turn —
 * supplied by the host or the adapter at the call site. Nothing in this package
 * reads a process-global, a thread-ambient store or a container default; there is
 * no module-level mutable state here for two interleaved conversations to collide
 * in, and no accessor a caller could reach for instead of passing the context. An
 * adapter that cannot obtain a context at its seam refuses (CV-2) rather than
 * falling back to a shared default.
 *
 * Why the rule exists: in the shipped .NET wiring the tool-invocation seam resolves
 * its scoped context store from the application's root provider, so one
 * process-global instance is shared by every conversation — field provenance is
 * overwritten across conversations, and where the host supplies no conversation id
 * the second and later conversations skip write-tool inference silently.
 *
 * Every property below is `readonly`. A context is a value the host hands in, not a
 * scratchpad the gate writes back to; freezing the shape in the type is how "never
 * ambient" stays true after the pipeline lands.
 *
 * @packageDocumentation
 */

/**
 * How a person is addressed on the channel a relay speaks for — a workspace member
 * id, a phone number, an address, whatever the relay's own directory uses. Opaque
 * to the gate: it is carried onto the record and compared for equality, never
 * parsed.
 *
 * It is a `string` on the wire and in every signature; the alias exists so the
 * concept has one name across the packages.
 */
export type ChannelIdentity = string;

/**
 * What a relay asserts about the message it is carrying: which identity on its
 * channel the message came from, and the id of the message itself.
 *
 * A relay is a trusted machine caller that *asserts* a person's identity rather
 * than authenticating them. Both fields are carried onto the Affidavit's
 * `external-ref` binding and onto the attestation of any decision made through the
 * relay, so a reader of the record can name the message a write came from.
 */
export interface RelayAssertion {
  /** The identity, on the relay's own channel, the message came from. */
  readonly channelIdentity: ChannelIdentity;
  /** The relay's id for the message that carried the request. */
  readonly messageId: string;
}

/**
 * Who is acting on this turn.
 *
 * `member` is a human-verified session: the host authenticated the person itself.
 * `service` is a machine caller — an MCP relay, a queue consumer, a scheduled job.
 * A `service` principal may name the person it is speaking for
 * ({@link Principal.assertedMember}) and the message it is carrying
 * ({@link Principal.relay}), but **AZ-3** holds regardless: a `service` principal
 * can never produce a `member` attestation. The strongest attestation a relayed
 * decision can carry is `member-via-relay`, which names both the person and the
 * relay.
 *
 * `null` in {@link TurnContext.principal} means *unresolved*, which is not the same
 * as anonymous: a decision on an unresolved principal is refused
 * (`decision-unauthorized`) before the store is touched (AZ-2).
 */
export type Principal =
  | {
      /** A human-verified session. */
      readonly kind: "member";
      /** The host's id for the person. */
      readonly id: string;
    }
  | {
      /** A machine caller: a relay, a queue consumer, a scheduled job. */
      readonly kind: "service";
      /** The host's id for the calling service. */
      readonly id: string;
      /**
       * The message this service is carrying, when it is a relay. Absent when the
       * service is acting on its own behalf.
       */
      readonly relay?: RelayAssertion;
      /**
       * The person this service says it is speaking for. An assertion, not an
       * authentication — it never upgrades the principal to `member` (AZ-3).
       */
      readonly assertedMember?: string;
    };

/**
 * The turn as the host received it, unmodified.
 *
 * The gate hands exactly this to the host's inference port: one tool-free
 * structured inference runs against the untouched utterance, so what the Affidavit
 * swears to is traceable to what the person actually wrote.
 *
 * Structurally identical to `TurnContext["turn"]`; the alias exists so ports can
 * name it.
 */
export interface Turn {
  /** What the person wrote or said, verbatim. */
  readonly utterance: string;
  /** The host's id for this message. */
  readonly messageId: string;
  /** When the turn arrived, as an ISO 8601 instant in UTC. */
  readonly at: string;
}

/**
 * Everything the gate is allowed to know about who is asking and where they are
 * asking from — passed at the call site, never resolved from ambient state (GT-2).
 *
 * Two contexts constructed in the same process describe two different
 * conversations and share nothing: there is no registry keyed by conversation id
 * in this package, and no default context to fall back to.
 */
export interface TurnContext {
  /** The host's id for the conversation this turn belongs to. */
  readonly conversationId: string;
  /**
   * The tenant every record written for this turn is scoped to. A decision whose
   * context tenant differs from the entry's tenant is refused (AZ-2).
   */
  readonly tenantId: string;
  /**
   * Where the turn arrived from. The three named values are the ones the v0.1
   * sequences use; the `(string & {})` arm keeps the union open to a host's own
   * channel name without losing completion on the three.
   */
  readonly channel: "chat" | "mcp" | "api" | (string & {});
  /** Who is acting, or `null` when the host has not resolved an identity. */
  readonly principal: Principal | null;
  /** The turn itself, unmodified. */
  readonly turn: Turn;
}
