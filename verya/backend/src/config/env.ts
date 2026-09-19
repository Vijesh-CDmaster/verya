import dotenv from "dotenv";
import path from "node:path";

// Load environment variables before modules that read them during initialization.
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../.env.local") });
