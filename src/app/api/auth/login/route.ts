import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/infrastructure/database/prisma-client';

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/login?error=missing_supabase_env', request.url));
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error?.message ?? 'invalid_credentials')}`, request.url),
    );
  }

  const dbUser = await prisma.user.findFirst({
    where: {
      OR: [{ supabaseAuthId: data.user.id }, { email }],
    },
    include: {
      memberships: {
        where: { status: 'ACTIVE' },
        include: { tenant: true, role: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  const membership = dbUser?.memberships[0];
  let redirectPath = '/platform/dashboard';
  let roleCode = 'TENANT_OWNER';
  let roleName = 'Propietario';

  if (membership) {
    roleCode = membership.role.code;
    roleName = membership.role.name;
    if (roleCode === 'CUSTOM' && roleName.toLowerCase().includes('cocina')) {
      redirectPath = `/${membership.tenant.slug}/kitchen`;
    } else if (roleCode === 'CASHIER_SELLER') {
      redirectPath = `/${membership.tenant.slug}/sales`;
    } else {
      redirectPath = `/${membership.tenant.slug}/dashboard`;
    }
  } else if (dbUser?.platformRole !== 'SUPER_ADMIN') {
    redirectPath = '/fronteras-bar/dashboard';
  }

  const response = NextResponse.redirect(new URL(redirectPath, request.url));
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: data.session.expires_in,
  };
  response.cookies.set('mnp360_access_token', data.session.access_token, cookieOpts);
  response.cookies.set('mnp360_user_email', email, cookieOpts);
  response.cookies.set('mnp360_role_code', roleCode, cookieOpts);
  response.cookies.set('mnp360_role_name', roleName, cookieOpts);
  return response;
}
