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

export function HeroSession() {
  return (
    <Suspense fallback={<LandingActions signedIn={false} placement="hero" />}>
      <HeroActions />
    </Suspense>
  );
}

export function ClosingSession() {
  return (
    <Suspense fallback={<LandingActions signedIn={false} placement="closing" />}>
      <ClosingActions />
    </Suspense>
  );
}

export function AccountSession() {
  return (
    <Suspense fallback={<LandingActions signedIn={false} placement="account" />}>
      <AccountActions />
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

async function HeroActions() {
  const user = await loadUser();
  return <LandingActions signedIn={Boolean(user)} placement="hero" />;
}

async function ClosingActions() {
  const user = await loadUser();
  return <LandingActions signedIn={Boolean(user)} placement="closing" />;
}

async function AccountActions() {
  const user = await loadUser();
  return <LandingActions signedIn={Boolean(user)} placement="account" />;
}
