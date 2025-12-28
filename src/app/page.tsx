import { client } from '@/python-client/client/client.gen';
export default function Home() {
  const client = createClient();
  const response = client.
  console.log(response);
  return (
    <div>
      <h1>Hello World</h1>
    </div>
  );
}
