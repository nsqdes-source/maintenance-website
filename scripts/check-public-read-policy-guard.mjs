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

const files = (await readdir(migrationsDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (!files.includes(guardMigration)) {
  throw new Error("Missing required guard migration: " + guardMigration);
}

const guardSql = (await readFile(path.join(migrationsDir, guardMigration), "utf8")).toLowerCase();

for (const policy of protectedPolicies) {
  if (!guardSql.includes('alter policy "' + policy + '"')) {
    throw new Error("Guard migration no longer protects policy: " + policy);
  }
}

if (guardSql.includes("current_user_has_role")) {
  throw new Error("Anonymous public-read guard migration must not call current_user_has_role().");
}

for (const name of files.filter((file) => file > guardMigration)) {
  const sql = (await readFile(path.join(migrationsDir, name), "utf8")).toLowerCase();

  for (const policy of protectedPolicies) {
    const touchesPolicy =
      sql.includes('alter policy "' + policy + '"') ||
      sql.includes('create policy "' + policy + '"') ||
      sql.includes('drop policy "' + policy + '"');

    if (touchesPolicy && sql.includes("current_user_has_role")) {
      throw new Error(
        name + ' reintroduces current_user_has_role() into protected public-read policy "' +
        policy +
        '". Keep anonymous visibility predicates independent from role helper execution.'
      );
    }
  }
}

console.log("Anonymous public-read policy guard: PASS");
