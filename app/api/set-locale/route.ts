import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { locale } = await req.json();
  if (!["en", "de"].includes(locale)) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set("locale", locale, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
    httpOnly: false,
  });
  return res;
}
