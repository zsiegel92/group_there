import { Suspense } from "react";

import { Spinner } from "@/components/ui/spinner";
import { solveSolvePost } from "@/lib/python-client";

export default async function TestApiPage() {
  return (
    <div>
      <pre>URL: {process.env.GROUPTHERE_SOLVER_API_URL}</pre>
      <Suspense
        fallback={
          <div className="flex justify-center items-center min-h-[50vh]">
            <Spinner />
            <div className="ml-2">Loading response from Python API...</div>
          </div>
        }
      >
        <ApiOutput />
      </Suspense>
    </div>
  );
}

async function ApiOutput() {
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
  return (
    <div>
      <h2>Response from Python API</h2>
      <pre>{JSON.stringify(response.data, null, 2)}</pre>
    </div>
  );
}
