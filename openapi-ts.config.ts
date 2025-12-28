import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "http://localhost:8000/openapi.json", // TODO: remove localhost from client - hard-code something else for prod! Maybe env var!
  output: "src/python-client",
  plugins: [
    "@hey-api/sdk",
    "zod",
    {
      name: "@hey-api/sdk",
      validator: true,
    },
  ],
});
