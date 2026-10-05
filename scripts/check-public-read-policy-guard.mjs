import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const guardMigration = "20261004100500_fix_anon_public_read_policies.sql";

const protectedPolicies = [
  "public reads visible sections",
  "public reads visible items",
  "public reads visible catalog items",
  "public reads active catalog services",
];

/**
 * Remove SQL comments while preserving quoted SQL content.
 *
 * Supports:
 * - -- line comments
 * - /* block comments *\/
 * - nested block comments
 * - single-quoted strings
 * - double-quoted identifiers
 *
 * This prevents mentions such as:
 *
 * -- current_user_has_role()
 *
 * from producing false positives while keeping real SQL calls detectable.
 */
function stripSqlComments(sql) {
  let result = "";
  let index = 0;
  let blockCommentDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    // Inside a nested /* ... */ block comment.
    if (blockCommentDepth > 0) {
      if (char === "/" && next === "*") {
        blockCommentDepth += 1;
        index += 2;
        continue;
      }

      if (char === "*" && next === "/") {
        blockCommentDepth -= 1;
        index += 2;
        continue;
      }

      // Preserve line boundaries so separated SQL tokens do not get joined.
      if (char === "\n") {
        result += "\n";
      }

      index += 1;
      continue;
    }

    // Inside a single-quoted SQL string.
    if (inSingleQuote) {
      result += char;

      // PostgreSQL/SQL escaping: ''
      if (char === "'" && next === "'") {
        result += next;
        index += 2;
        continue;
      }

      if (char === "'") {
        inSingleQuote = false;
      }

      index += 1;
      continue;
    }

    // Inside a double-quoted identifier.
    if (inDoubleQuote) {
      result += char;

      // Escaped double quote: ""
      if (char === '"' && next === '"') {
        result += next;
        index += 2;
        continue;
      }

      if (char === '"') {
        inDoubleQuote = false;
      }

      index += 1;
      continue;
    }

    // Start of a single-quoted string.
    if (char === "'") {
      inSingleQuote = true;
      result += char;
      index += 1;
      continue;
    }

    // Start of a double-quoted identifier.
    if (char === '"') {
      inDoubleQuote = true;
      result += char;
      index += 1;
      continue;
    }

    // -- line comment
    if (char === "-" && next === "-") {
      index += 2;

      while (index < sql.length && sql[index] !== "\n") {
        index += 1;
      }

      if (index < sql.length && sql[index] === "\n") {
        result += "\n";
        index += 1;
      }

      continue;
    }

    // /* block comment */
    if (char === "/" && next === "*") {
      blockCommentDepth = 1;
      index += 2;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

async function readSqlWithoutComments(fileName) {
  const rawSql = await readFile(
    path.join(migrationsDir, fileName),
    "utf8",
  );

  return stripSqlComments(rawSql).toLowerCase();
}

const files = (await readdir(migrationsDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (!files.includes(guardMigration)) {
  throw new Error(
    "Missing required guard migration: " + guardMigration,
  );
}

const guardSql = await readSqlWithoutComments(guardMigration);

for (const policy of protectedPolicies) {
  if (!guardSql.includes('alter policy "' + policy + '"')) {
    throw new Error(
      "Guard migration no longer protects policy: " + policy,
    );
  }
}

if (guardSql.includes("current_user_has_role")) {
  throw new Error(
    "Anonymous public-read guard migration must not call current_user_has_role().",
  );
}

for (const name of files.filter((file) => file > guardMigration)) {
  const sql = await readSqlWithoutComments(name);

  for (const policy of protectedPolicies) {
    const touchesPolicy =
      sql.includes('alter policy "' + policy + '"') ||
      sql.includes('create policy "' + policy + '"') ||
      sql.includes('drop policy "' + policy + '"');

    if (
      touchesPolicy &&
      sql.includes("current_user_has_role")
    ) {
      throw new Error(
        name +
          ' reintroduces current_user_has_role() into protected public-read policy "' +
          policy +
          '". Keep anonymous visibility predicates independent from role helper execution.',
      );
    }
  }
}

console.log("Anonymous public-read policy guard: PASS");
