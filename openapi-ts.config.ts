import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: 'http://localhost:8000/openapi.json', // sign up at app.heyapi.dev
  output: 'src/python-client',
});