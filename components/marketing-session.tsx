import { cache, Suspense } from "react";
import { LandingActions } from "@/components/landing-actions";
import { getSessionUser } from "@/lib/auth/session";

const loadUser = cache(async () => getSessionUser());

export function HeaderSession() {
  return (
    <Suspense fallback={<LandingActions signedIn={false} placement="nav" />}>
      <NavActions />
    </Suspense>
  );
}

export function MenuSession() {
  return (
    <Suspense fallback={<LandingActions signedIn={false} placement="menu" />}>
      <MenuActions />
    </Suspense>
  );
}

async function NavActions() {
  const user = await loadUser();
  return <LandingActions signedIn={Boolean(user)} placement="nav" />;
}

async function MenuActions() {
  const user = await loadUser();
  return <LandingActions signedIn={Boolean(user)} placement="menu" />;
}
