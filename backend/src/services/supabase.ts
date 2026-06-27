import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { config } from "../config";

export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseKey,
  {
    realtime: {
      transport: WebSocket as any
    }
  }
);