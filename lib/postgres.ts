import pg from "pg";

const { Client } = pg;

function connectionString() {
  const password = process.env.DBPASSWORD?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (password && supabaseUrl) {
    const ref = new URL(supabaseUrl).hostname.split(".")[0];
    if (ref) {
      return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    }
  }
  return process.env.DATABASE_URL?.trim() || null;
}

export async function withDatabase<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const raw = connectionString();
  if (!raw) throw new Error("database_unconfigured");
  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  const client = new Client({
    connectionString: url.toString(),
    application_name: "2tapdoc",
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export async function withClinicUser<T>(userId: string, run: (client: pg.Client) => Promise<T>): Promise<T> {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      const result = await run(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}
