import { createFileRoute, redirect } from "@tanstack/react-router";

/* Redirect old /deal/:token links to the new /deal-sheet?t=TOKEN format */
export const Route = createFileRoute("/deal/$token")({
  loader: ({ params }) => {
    throw redirect({ to: "/deal-sheet", search: { t: params.token } });
  },
});
