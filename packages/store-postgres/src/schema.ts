/**
 * The schema name, and the one place it is turned into SQL text.
 *
 * Every other value this package sends to Postgres is a bound parameter. A schema
 * name cannot be: an identifier is part of the statement, not of its arguments. So it
 * goes through one check and one quoting function, both here, and nothing else in the
 * package interpolates anything into a statement.
 *
 * @packageDocumentation
 */

/** The schema the tables live in when the host names none. */
export const DEFAULT_SCHEMA = "affiant";

/** The token the shipped SQL carries where the schema name belongs. */
export const SCHEMA_PLACEHOLDER = "{{schema}}";

/**
 * What a schema name may look like: a letter or underscore, then letters, digits,
 * underscores or dollar signs, up to Postgres's 63-byte identifier limit.
 *
 * Narrower than Postgres allows on purpose. A name outside this set would still be
 * safe once quoted, but it would also be a name a host almost certainly did not mean
 * to pass, and a loud refusal is the better answer to that than a table in a schema
 * called `"; drop table --`.
 */
const SCHEMA_NAME = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;

/**
 * `schema`, checked.
 *
 * @throws RangeError when the name is not one this package will build a statement
 *         from. A `RangeError` rather than an `AffiantError` for the reason the core
 *         gives: the error-code registry names the reasons the gate refuses a
 *         *request*, and a malformed schema name is a wiring mistake.
 */
export function requireSchema(schema: string): string {
  if (!SCHEMA_NAME.test(schema)) {
    throw new RangeError(
      `schema must be a plain SQL identifier of at most 63 characters, got: ${JSON.stringify(schema)}`,
    );
  }
  return schema;
}

/**
 * `sql` with every {@link SCHEMA_PLACEHOLDER} replaced by `schema`, quoted.
 *
 * This is how a migration shipped as text becomes a statement, and it is also what a
 * host vendoring the SQL into its own sequence should apply: the checksum on
 * `Migration.sha256` is over the text as shipped, placeholder included, so rendering
 * is reproducible and the digest does not depend on which schema the host chose.
 */
export function renderSchema(sql: string, schema: string): string {
  return sql.split(SCHEMA_PLACEHOLDER).join(quoteIdentifier(requireSchema(schema)));
}

/** `name` as a quoted SQL identifier. Checked first, so the quoting is belt and braces. */
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
