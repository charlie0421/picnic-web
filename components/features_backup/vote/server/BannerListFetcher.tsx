import { BannerList, Banner } from '../client/BannerList';

// 실제 구현에서는 Supabase나 API에서 데이터를 가져옵니다
async function fetchBanners(): Promise<Banner[]> {
  // TODO: Implement actual data fetching
  // const supabase = createServerSupabaseClient();
  // const { data: banners } = await supabase
  //   .from('banners')
  //   .select('*')
  //   .eq('active', true)
  //   .order('order', { ascending: true });
  
  // 임시 데이터
  return [
    {
      id: '1',
      title: '첫 번째 배너',
      imageUrl: '/images/banner1.jpg',
      link: '/vote/1',
      order: 1
    },
    {
      id: '2', 
      title: '두 번째 배너',
      imageUrl: '/images/banner2.jpg',
      link: '/vote/2',
      order: 2
    },
    {
      id: '3',
      title: '세 번째 배너', 
      imageUrl: '/images/banner3.jpg',
      link: '/vote/3',
      order: 3
    }
  ];
}

export interface BannerListFetcherProps {
  className?: string;
}

export async function BannerListFetcher({ className }: BannerListFetcherProps = {}) {
  const banners = await fetchBanners();
  
  return <BannerList banners={banners} className={className} />;
} 