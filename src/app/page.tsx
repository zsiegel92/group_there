export default async function Home() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">Welcome to GROUPTHERE</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Optimize carpooling for your team events. Join teams, share rides, and
          minimize total drive time with intelligent route planning.
        </p>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="border rounded-lg p-6">
            <h3 className="font-semibold mb-2">Join Teams</h3>
            <p className="text-sm text-muted-foreground">
              Connect with your organization and coordinate group transportation
            </p>
          </div>
          <div className="border rounded-lg p-6">
            <h3 className="font-semibold mb-2">Share Rides</h3>
            <p className="text-sm text-muted-foreground">
              Indicate if you can drive and how many seats you have available
            </p>
          </div>
          <div className="border rounded-lg p-6">
            <h3 className="font-semibold mb-2">Optimize Routes</h3>
            <p className="text-sm text-muted-foreground">
              Our solver finds the most efficient carpooling arrangement
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
