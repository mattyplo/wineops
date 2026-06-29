import dotenv from "dotenv";

dotenv.config();

const {
  SUPABASE_URL,
  SUPABASE_KEY,
  PORT = "3000"
} = process.env;


if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Missing required environment variables"
  );
}

export const config = {
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_KEY,
  port: Number(PORT),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
};