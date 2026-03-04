import { auth } from "@/lib/auth/config";
import { NextResponse } from "next/server";
import { ADMIN_WALLET_ADDRESS } from "@/lib/constants";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Only protect /activity/admin routes
  if (!pathname.startsWith("/activity/admin")) {
    return NextResponse.next();
  }

  const session = req.auth;

  if (
    !session?.address ||
    session.address.toLowerCase() !== ADMIN_WALLET_ADDRESS.toLowerCase()
  ) {
    return NextResponse.redirect(new URL("/activity", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/activity/admin/:path*"],
};
