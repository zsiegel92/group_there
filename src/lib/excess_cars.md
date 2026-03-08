Okay another challenge. Next to "Generate solutions", there should be a button for "allow rideshare service".

If selected, the python solver service should have a parameter that allows each non-driver participantss to have a variable (or multiple variables?) that indicate they can drive but with a penalty that will ensure it's only used if there is no feasible solution otherwise.

There should be some heuristic where using each additional rideshare car has a penalty equal to n1 drive minutes by drivers in the group; and each mile traveled has a penalty equal to n2 distance traveled by drivers in the group. Something like that. Make those consts very expicit in the solution module.

The linear program will have to be updated. The python tests will have to be updated. Construct a case that is close to borderline using one or two rideshare cars to test whether the costs described above are being honored.

The algorithm overall may have to be updated in broad ways. Make sure the whole thing keeps working!

The database schemas and application types/schemas for working with and persisting itineraries may need to be updated to acommodate this. The UI should make it really clear where rideshare rides are being used, who will be in them, etc.. The map should have some custom UI for displaying rideshare drivers and routes.