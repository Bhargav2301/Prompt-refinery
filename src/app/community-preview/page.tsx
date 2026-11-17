import { notFound } from 'next/navigation';
import { CommunityFixture } from '@/components/community/community-fixture';
export default function CommunityPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <CommunityFixture />;
}
