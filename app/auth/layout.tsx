export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="flex items-center justify-center min-h-screen">
        {children}
      </main>
    </div>
  );
} 