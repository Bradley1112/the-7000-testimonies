import AdminLoginForm from '@/components/AdminLoginForm';

export const metadata = { title: 'Admin sign in', robots: { index: false, follow: false } };

export default function AdminLogin() {
  return (
    <div className="mx-auto max-w-md px-5 py-24">
      <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">Admin</h1>
      <p className="mt-3 font-sans text-sm leading-relaxed text-ink-soft">
        Enter the owner email address and we will send a sign-in link. There is no password
        to manage, and only allowlisted addresses can get in.
      </p>
      <div className="mt-8">
        <AdminLoginForm />
      </div>
    </div>
  );
}
