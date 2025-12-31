import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "src/solver/openapi.json",
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
