import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Compass } from 'lucide-react';
import { useLocation } from 'wouter';

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[#f7fbfc] px-5">
      <Card className="w-full max-w-md border-[#d8e7ea] bg-white shadow-[0_20px_60px_rgba(27,55,86,.09)]">
        <CardContent className="p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e5f2f3] text-[#277c84]"><Compass size={23} /></span>
          <p className="mt-6 font-mono-ui text-[10px] uppercase tracking-[.18em] text-[#398b8e]">Off the map</p>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-[-.06em] text-[#173650]">This page is not here.</h1>
          <p className="mt-3 text-sm leading-6 text-[#6f858d]">The link may have changed, or the page may not be part of your school workspace.</p>
          <button onClick={() => setLocation('/')} className="mt-7 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#17466a] px-4 text-sm font-semibold text-white hover:bg-[#0f3b5b]" data-testid="button-not-found-home"><ArrowLeft size={15} /> Return to SchVIA</button>
        </CardContent>
      </Card>
    </div>
  );
}
