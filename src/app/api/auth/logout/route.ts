import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete('mnp360_access_token');
  response.cookies.delete('mnp360_user_email');
  response.cookies.delete('mnp360_role_code');
  response.cookies.delete('mnp360_role_name');
  return response;
}
