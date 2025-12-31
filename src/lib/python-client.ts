import { client } from "@/python-client/client.gen";

const GROUPTHERE_SOLVER_API_KEY = process.env.GROUPTHERE_SOLVER_API_KEY;
const GROUPTHERE_SOLVER_API_URL = process.env.GROUPTHERE_SOLVER_API_URL;

if (!GROUPTHERE_SOLVER_API_KEY || !GROUPTHERE_SOLVER_API_URL) {
  throw new Error(
    "GROUPTHERE_SOLVER_API_KEY and GROUPTHERE_SOLVER_API_URL must be set"
  );
}

// Configure the client once with environment variables
client.setConfig({
  baseUrl: GROUPTHERE_SOLVER_API_URL,
  headers: {
    Authorization: `Bearer ${GROUPTHERE_SOLVER_API_KEY}`,
  },
});

// Re-export everything from the generated SDK
export * from "@/python-client/sdk.gen";
