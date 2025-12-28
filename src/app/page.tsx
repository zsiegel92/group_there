import { solveSolvePost } from "@/python-client/sdk.gen";
export default async function Home() {
  const response = await solveSolvePost({
    body: {
      event_id: "123",
      trippers: [],
      tripper_origin_distances_seconds: {},
    },
    
  });
  if (response.error) {
    return (
      <div>
        <h1>Error</h1>
        <pre>{JSON.stringify(response.error, null, 2)}</pre>
      </div>
    );
  }
  console.log(response.data);
  return <div>
    <h1>Hello World</h1>
    <h2>Response from local Python API</h2>
    <pre>{JSON.stringify(response.data, null, 2)}</pre>
  </div>;
}
