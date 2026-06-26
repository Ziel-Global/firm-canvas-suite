interface PlaceholderPageProps {
  title: string;
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <main className="px-4 py-6 sm:px-6">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
    </main>
  );
}
