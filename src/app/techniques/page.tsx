import Link from 'next/link';
import { TechniqueGuide } from '@/components/technique-guide';
export const metadata = { title: 'Prompting techniques', description: 'Learn all eight Clarift prompting techniques with examples, skeletons, and practical use cases.' };
export default function TechniquesPage() {
  return <main className="min-h-screen px-4 py-8 md:px-8"><nav className="mx-auto mb-8 max-w-5xl"><Link className="text-sm text-primary underline underline-offset-4" href="/">← Clarift workspace</Link></nav><TechniqueGuide /></main>;
}
