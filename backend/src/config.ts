import dotenv from "dotenv";

dotenv.config();

const {
  SUPABASE_URL,
  SUPABASE_KEY,
  WINEOPS_INGEST_TOKEN,
  PORT = "3000"
} = process.env;


if (!SUPABASE_URL || !SUPABASE_KEY || !WINEOPS_INGEST_TOKEN) {
  throw new Error(
    "Missing required environment variables"
  );
}

export const config = {
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_KEY,
  ingestToken: WINEOPS_INGEST_TOKEN,
  port: Number(PORT),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
};
