import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  const prefix = `${name}=`;
  const item = cookies.split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
  if (!item) return "";
  try {
    return decodeURIComponent(item.slice(prefix.length));
  } catch {
    return "";
  }
}

function safeReturnTo(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requested =
    url.searchParams.get("returnTo") ||
    cookieValue(request, "de_auth_return_to") ||
    "/";
  const returnTo = safeReturnTo(requested);

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(new URL(returnTo, url.origin));
      response.cookies.set("de_auth_return_to", "", {
        path: "/",
        maxAge: 0,
        sameSite: "lax",
        secure: true,
      });
      return response;
    }
  }

  return NextResponse.redirect(new URL("/login?error=callback", url.origin));
}
