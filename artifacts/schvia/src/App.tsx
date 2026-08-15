import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  FileText,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogIn,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useHealthCheck } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();

type IconType = typeof Home;
type View = 'overview' | 'attendance' | 'students' | 'people' | 'settings' | 'activity';
type AttendanceStatus = 'present' | 'absent' | 'late' | 'unmarked';

const navItems: { id: View; label: string; icon: IconType }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'people', label: 'Staff & classes', icon: BookOpen },
  { id: 'activity', label: 'Activity', icon: Activity },
];

const attendanceSeed = [
  { id: 1, studentId: 'demo-1', classId: 'demo-class', name: 'Ava Mitchell', initials: 'AM', status: 'present' as AttendanceStatus, time: '8:07 AM', note: '' },
  { id: 2, studentId: 'demo-2', classId: 'demo-class', name: 'Noah Williams', initials: 'NW', status: 'present' as AttendanceStatus, time: '8:08 AM', note: '' },
  { id: 3, studentId: 'demo-3', classId: 'demo-class', name: 'Sofia Chen', initials: 'SC', status: 'late' as AttendanceStatus, time: '8:31 AM', note: 'Bus delay' },
  { id: 4, studentId: 'demo-4', classId: 'demo-class', name: 'Ethan Brooks', initials: 'EB', status: 'absent' as AttendanceStatus, time: '—', note: 'Family reported' },
  { id: 5, studentId: 'demo-5', classId: 'demo-class', name: 'Mia Robinson', initials: 'MR', status: 'present' as AttendanceStatus, time: '8:10 AM', note: '' },
  { id: 6, studentId: 'demo-6', classId: 'demo-class', name: 'Liam Carter', initials: 'LC', status: 'present' as AttendanceStatus, time: '8:09 AM', note: '' },
  { id: 7, studentId: 'demo-7', classId: 'demo-class', name: 'Isla Thompson', initials: 'IT', status: 'unmarked' as AttendanceStatus, time: '—', note: '' },
  { id: 8, studentId: 'demo-8', classId: 'demo-class', name: 'Mateo Garcia', initials: 'MG', status: 'present' as AttendanceStatus, time: '8:06 AM', note: '' },
];

type PilotState = {
  school: { id: string; name: string; location?: string; term?: string };
  currentUser: { id: string; name: string; email?: string; role: string };
  users: { id: string; name: string; email?: string; role: string; status?: string }[];
  classes: { id: string; name: string; year?: string; teacherIds?: string[] }[];
  students: { id: string; studentId?: string; name: string; classId: string; guardian?: string; status?: string }[];
  attendance: { id: string; date: string; classId: string; studentId: string; status: AttendanceStatus | 'excused'; updatedAt?: string }[];
  invitations: { id: string; name: string; email: string; role: string; status: string; code?: string }[];
  audit: { id: string; actorName: string; action: string; detail?: string; at: string }[];
};

type AttendanceRow = (typeof attendanceSeed)[number];

async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Something went wrong. Please try again.');
  }
  return payload as T;
}

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function rowsFromPilotState(state: PilotState): AttendanceRow[] {
  const recordsByStudent = new Map(state.attendance.map((record) => [record.studentId, record]));
  return state.students.map((student, index) => {
    const record = recordsByStudent.get(student.id);
    const status: AttendanceStatus = record?.status === 'present' || record?.status === 'absent' || record?.status === 'late' ? record.status : 'unmarked';
    return {
      id: index + 1,
      studentId: student.id,
      classId: student.classId,
      name: student.name,
      initials: initialsFor(student.name),
      status,
      time: record?.updatedAt ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(record.updatedAt)) : '—',
      note: '',
    };
  });
}

function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" data-testid="brand-schvia">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${inverse ? 'bg-white/15 text-white' : 'bg-[#d8edf3] text-[#17466a]'}`}>
        <span className="h-4 w-4 rounded-[5px] border-[2.5px] border-current border-r-transparent rotate-45" />
      </span>
      <span className={`font-display text-[1.05rem] font-extrabold tracking-[-0.04em] ${inverse ? 'text-white' : 'text-[#173650]'}`}>SchVIA</span>
    </div>
  );
}

function Button({
  children,
  variant = 'primary',
  className = '',
  onClick,
  type = 'button',
  disabled = false,
  testId,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  testId?: string;
}) {
  const styles = {
    primary: 'bg-[#17466a] text-white shadow-[0_8px_20px_rgba(23,70,106,.16)] hover:bg-[#0f3b5b]',
    secondary: 'border border-[#c9dce5] bg-white text-[#17466a] hover:border-[#87b7c8] hover:bg-[#f3f9fb]',
    quiet: 'text-[#577083] hover:bg-[#eaf3f6] hover:text-[#17466a]',
    danger: 'bg-[#fff1ef] text-[#a93832] hover:bg-[#ffe4e1]',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

function Landing({ go }: { go: (path: string) => void }) {
  return (
    <div className="min-h-[100dvh] overflow-hidden bg-[#f8fbfc] text-[#173650]">
      <header className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 lg:px-8" data-testid="landing-header">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm font-semibold text-[#5b7180] md:flex" aria-label="Main navigation">
          <a href="#how-it-works" className="transition-colors hover:text-[#17466a]" data-testid="link-how-it-works">How it works</a>
          <a href="#for-schools" className="transition-colors hover:text-[#17466a]" data-testid="link-for-schools">For schools</a>
          <a href="#principle" className="transition-colors hover:text-[#17466a]" data-testid="link-principle">Our approach</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="quiet" className="hidden sm:inline-flex" onClick={() => go('/sign-in')} testId="button-sign-in">Sign in</Button>
          <Button onClick={() => go('/request-access')} testId="button-request-access">Request access <ArrowRight size={15} /></Button>
        </div>
      </header>

      <main>
        <section className="relative mx-auto grid max-w-[1240px] items-center gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1.02fr_.98fr] lg:px-8 lg:pb-28 lg:pt-20">
          <div className="relative z-10 reveal">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#c7e1e5] bg-[#edf8f7] px-3 py-1.5 text-xs font-bold uppercase tracking-[.14em] text-[#16706b]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3ca69a] pulse-soft" /> The school operating system
            </div>
            <h1 className="max-w-[650px] font-display text-[clamp(3.1rem,7vw,6.8rem)] font-extrabold leading-[.95] tracking-[-.075em] text-[#173650]">
              The day is busy.<br /><span className="text-[#247f89]">Your system</span><br />shouldn’t be.
            </h1>
            <p className="mt-7 max-w-[500px] text-[1.08rem] leading-8 text-[#607887]">
              SchVIA brings the signal into focus — so principals can lead with context, teachers can move quickly, and families can trust what they see.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button className="min-h-12 px-5" onClick={() => go('/request-access')} testId="button-see-schvia">See SchVIA in your school <ArrowRight size={16} /></Button>
              <Button variant="secondary" className="min-h-12 px-5" onClick={() => go('/sign-in')} testId="button-existing-account"><LogIn size={16} /> I have an account</Button>
            </div>
            <div className="mt-9 flex items-center gap-3 text-xs font-semibold text-[#75909d]">
              <div className="flex -space-x-2">
                {['MR', 'SL', 'JC'].map((initials, index) => <span key={initials} className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#f8fbfc] text-[9px] font-bold ${index === 0 ? 'bg-[#d8edf3] text-[#17466a]' : index === 1 ? 'bg-[#e6e8d8] text-[#5d693d]' : 'bg-[#f2ded3] text-[#8b5c43]'}`}>{initials}</span>)}
              </div>
              <span>Designed with school teams, not around them.</span>
            </div>
          </div>

          <div className="relative reveal reveal-delay-1">
            <div className="absolute -right-12 -top-16 h-64 w-64 rounded-full bg-[#d9eff0] blur-3xl" />
            <div className="relative rounded-[2rem] border border-[#cfe3e9] bg-[#eaf5f7] p-3 shadow-[0_30px_70px_rgba(30,88,111,.13)]">
              <div className="overflow-hidden rounded-[1.4rem] border border-[#dae9ec] bg-[#fbfdfd]">
                <div className="flex items-center justify-between border-b border-[#e6eef0] px-5 py-4">
                  <div className="flex items-center gap-2"><Logo /><span className="hidden text-xs text-[#8ba0a8] sm:inline">/ Northfield Elementary</span></div>
                  <div className="flex items-center gap-2"><span className="hidden rounded-full bg-[#e8f5ef] px-2.5 py-1 text-[10px] font-bold text-[#2a8064] sm:inline">School day · Live</span><span className="h-7 w-7 rounded-full bg-[#17466a] text-center pt-1.5 text-[10px] font-bold text-white">MR</span></div>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-[1.12fr_.88fr] sm:p-7">
                  <div>
                    <p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-[#7c969f]">Tuesday · October 15, 2024</p>
                    <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-.05em] text-[#173650]">Good morning, Maya.</h2>
                    <div className="mt-6 rounded-2xl bg-[#f0f7f8] p-4">
                      <div className="flex items-end justify-between"><div><p className="text-xs font-semibold text-[#6f8790]">Today’s attendance</p><p className="mt-1 font-display text-4xl font-extrabold tracking-[-.06em] text-[#173650]">94.8%</p></div><div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'conic-gradient(#2c9486 0 94.8%, #dcebe9 94.8% 100%)' }}><div className="h-10 w-10 rounded-full bg-[#f0f7f8]" /></div></div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#dbe9e9]"><div className="h-full w-[76%] rounded-full bg-[#2c9486]" /></div>
                      <p className="mt-2 text-[11px] font-semibold text-[#66818a]">1,246 of 1,312 students accounted for</p>
                    </div>
                    <div className="mt-4 flex items-center justify-between rounded-2xl border border-[#e5edef] p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff4df] text-[#af7323]"><CircleAlert size={17} /></span><div><p className="text-xs font-bold text-[#405d6e]">2 things need your eye</p><p className="mt-0.5 text-[11px] text-[#82959d]">Late arrivals since 8:30 AM</p></div></div><ChevronRight size={16} className="text-[#9ab1b9]" /></div>
                  </div>
                  <div className="rounded-2xl border border-[#e5edef] p-4"><div className="flex items-center justify-between"><p className="text-xs font-bold text-[#526c78]">Live pulse</p><span className="flex items-center gap-1 text-[10px] font-bold text-[#348c79]"><span className="h-1.5 w-1.5 rounded-full bg-[#348c79]" /> Updated now</span></div><div className="mt-6 flex h-24 items-end gap-1.5">{[34, 48, 42, 61, 57, 78, 69, 91, 76, 83, 70, 88].map((height, i) => <div key={i} className={`flex-1 rounded-t-md ${i > 8 ? 'bg-[#3e978f]' : 'bg-[#b6d9dc]'}`} style={{ height: `${height}%` }} />)}</div><div className="mt-3 flex justify-between text-[10px] font-semibold text-[#a0b1b6]"><span>8:00</span><span>9:00</span><span>10:00</span></div><div className="mt-6 border-t border-[#edf1f1] pt-4"><p className="text-[10px] uppercase tracking-[.12em] text-[#98aab0]">Staff check-in</p><div className="mt-3 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e8e9d9] text-[9px] font-bold text-[#5d693d]">JL</span><p className="text-xs font-semibold text-[#58727d]">All staff accounted for</p><CheckCircle2 size={14} className="ml-auto text-[#3c9c83]" /></div></div></div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-6 -left-8 hidden items-center gap-3 rounded-2xl border border-[#d8e7e8] bg-white px-4 py-3 shadow-lift sm:flex"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e9f5f1] text-[#2c8c78]"><Check size={18} /></span><div><p className="text-xs font-bold text-[#355565]">Clarity, at a glance</p><p className="text-[10px] text-[#82959d]">No extra admin layer</p></div></div>
          </div>
        </section>

        <section className="border-y border-[#e3edef] bg-white/70" id="principle">
          <div className="mx-auto grid max-w-[1240px] gap-8 px-5 py-10 sm:grid-cols-3 lg:px-8">
            {[['01', 'See the day', 'A shared view of what is happening, before it becomes a problem.'], ['02', 'Move with confidence', 'Thoughtful workflows that make the right action the easy action.'], ['03', 'Keep families close', 'Clear, timely information that builds trust beyond the school gates.']].map(([number, title, copy], index) => <div key={number} className={`reveal reveal-delay-${index + 1} flex gap-4`}><span className="font-mono-ui pt-1 text-[11px] text-[#3a99a0]">{number}</span><div><h3 className="font-display text-lg font-extrabold tracking-[-.04em]">{title}</h3><p className="mt-1 max-w-[290px] text-sm leading-6 text-[#6b818b]">{copy}</p></div></div>)}
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-5 py-24 lg:px-8 lg:py-32" id="how-it-works">
          <div className="grid gap-12 lg:grid-cols-[.78fr_1.22fr]"><div><p className="font-mono-ui text-[11px] uppercase tracking-[.18em] text-[#348d91]">One clear rhythm</p><h2 className="mt-4 max-w-[420px] font-display text-4xl font-extrabold leading-[1.02] tracking-[-.065em] text-[#173650] sm:text-5xl">The school day, in focus.</h2><p className="mt-5 max-w-[390px] text-base leading-7 text-[#6b818b]">SchVIA gives every role the right amount of information — no more, no less.</p><Button variant="secondary" className="mt-7" onClick={() => go('#dashboard')} testId="button-founder-preview">Open founder preview <ArrowRight size={15} /></Button></div>
            <div className="grid gap-3 sm:grid-cols-2"><FeatureCard icon={ClipboardCheck} number="01" title="Attendance without friction" copy="A teacher can account for a class in seconds from any screen, including the one in their hand." /><FeatureCard icon={BarChart3} number="02" title="Signal over noise" copy="Principals get the small set of indicators that deserve attention today." /><FeatureCard icon={ShieldCheck} number="03" title="Trust built in" copy="Every change has a clear trail. Every family-facing message starts from context." /><FeatureCard icon={Users} number="04" title="One school view" copy="Students, staff, and classes stay connected as the year changes around them." /></div>
          </div>
        </section>

        <section className="bg-[#17466a] text-white" id="for-schools">
          <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-20 lg:grid-cols-[1fr_.85fr] lg:px-8 lg:py-24"><div><p className="font-mono-ui text-[11px] uppercase tracking-[.18em] text-[#8fd0cf]">Built for the people doing the work</p><h2 className="mt-5 max-w-[600px] font-display text-4xl font-extrabold leading-[1.02] tracking-[-.06em] sm:text-6xl">Less chasing.<br />More leading.</h2></div><div className="flex flex-col justify-end"><p className="max-w-[440px] text-base leading-7 text-[#c7dce3]">A calm operating system makes room for better decisions, better teaching, and better conversations with families.</p><Button className="mt-7 w-fit bg-[#d8f0ee] text-[#17466a] hover:bg-white" onClick={() => go('/request-access')} testId="button-start-conversation">Start a conversation <ArrowRight size={15} /></Button></div></div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-[1240px] flex-col gap-4 px-5 py-8 text-xs text-[#78909a] sm:flex-row sm:items-center sm:justify-between lg:px-8"><Logo /><div className="flex items-center gap-5"><span>School operations, made human.</span><button onClick={() => go('/sign-in')} className="font-semibold text-[#52717d] hover:text-[#17466a]" data-testid="button-footer-sign-in">Sign in</button></div></footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, number, title, copy }: { icon: IconType; number: string; title: string; copy: string }) {
  return <div className="rounded-2xl border border-[#dce9ec] bg-white p-5 shadow-soft transition-transform hover:-translate-y-1"><div className="flex items-center justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8f4f5] text-[#287c86]"><Icon size={17} /></span><span className="font-mono-ui text-[10px] text-[#a4b8bd]">{number}</span></div><h3 className="mt-5 font-display text-lg font-extrabold tracking-[-.04em] text-[#173650]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#718690]">{copy}</p></div>;
}

function Preview({ go }: { go: (path: string) => void }) {
  return <div className="min-h-[100dvh] bg-[#edf5f6] text-[#173650]"><header className="flex items-center justify-between border-b border-[#d7e7ea] bg-white/80 px-5 py-4 lg:px-10"><div className="flex items-center gap-5"><Logo /><span className="hidden h-5 w-px bg-[#d4e3e6] sm:block" /><span className="hidden text-sm font-semibold text-[#67808a] sm:block">Founder preview</span></div><div className="flex items-center gap-2"><Button variant="quiet" onClick={() => go('/')} testId="button-preview-home">Back to SchVIA</Button><Button onClick={() => go('/request-access')} testId="button-preview-access">Request access <ArrowRight size={15} /></Button></div></header><main className="mx-auto max-w-[1400px] px-4 py-8 lg:px-10 lg:py-12"><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-[#318a8c]">A working view</p><h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-.06em] sm:text-4xl">Make the school day legible.</h1></div><p className="max-w-[360px] text-sm leading-6 text-[#6a8089]">A founder’s view of the principal experience — focused, responsive, and ready for the morning rush.</p></div><div className="overflow-hidden rounded-3xl border border-[#cfE1e5] bg-white shadow-[0_24px_80px_rgba(29,75,96,.12)]"><div className="flex items-center gap-2 border-b border-[#e1ebed] px-5 py-3"><span className="h-2.5 w-2.5 rounded-full bg-[#e7b08c]" /><span className="h-2.5 w-2.5 rounded-full bg-[#d9d899]" /><span className="h-2.5 w-2.5 rounded-full bg-[#9dcebd]" /><span className="ml-3 text-[11px] text-[#9aadb3]">app.schvia.org / dashboard</span></div><div className="grid min-h-[620px] md:grid-cols-[220px_1fr]"><div className="hidden border-r border-[#e1ebed] bg-[#f7fafb] p-5 md:block"><Logo /><p className="mt-12 px-3 font-mono-ui text-[9px] uppercase tracking-[.18em] text-[#9aadB3]">Workspace</p><div className="mt-3 space-y-1">{navItems.map((item, index) => <div key={item.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold ${index === 0 ? 'bg-[#e2f1f3] text-[#17466a]' : 'text-[#70858e]'}`}><item.icon size={15} />{item.label}</div>)}</div><div className="mt-20 rounded-2xl bg-[#e9f4f3] p-3"><p className="text-[10px] font-bold text-[#267672]">Everything is in sync</p><p className="mt-1 text-[10px] leading-4 text-[#6d8585]">Last update 12 seconds ago</p></div></div><div className="bg-[#fbfdfd] p-5 sm:p-8"><div className="flex items-start justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-[#87a0a8]">Tuesday · October 15, 2024</p><h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-.05em]">Good morning, Maya.</h2></div><div className="hidden items-center gap-3 sm:flex"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#dce9eb] text-[#66818d]"><Bell size={16} /></span><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#17466a] text-[10px] font-bold text-white">MR</span></div></div><div className="mt-8 grid gap-4 lg:grid-cols-[1.28fr_.72fr]"><div className="rounded-2xl border border-[#e0ebed] p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-[#718892]">Attendance today</p><p className="mt-1 font-display text-5xl font-extrabold tracking-[-.07em]">94.8<span className="text-2xl text-[#6b9da3]">%</span></p></div><span className="rounded-full bg-[#e6f4ee] px-2.5 py-1 text-[10px] font-bold text-[#328067]">On track</span></div><div className="mt-6 h-2 rounded-full bg-[#e7eeee]"><div className="h-full w-[76%] rounded-full bg-[#318f87]" /></div><div className="mt-5 grid grid-cols-3 gap-3 border-t border-[#edf2f2] pt-4">{[['Present', '1,198', '#328d78'], ['Late', '24', '#b9782c'], ['Absent', '42', '#b0554d']].map(([label, value, color]) => <div key={label}><p className="text-[10px] text-[#899da4]">{label}</p><p className="mt-1 font-display text-lg font-extrabold" style={{ color }}>{value}</p></div>)}</div></div><div className="rounded-2xl bg-[#17466a] p-5 text-white"><p className="text-xs font-semibold text-[#b9d5dc]">Needs your attention</p><p className="mt-3 font-display text-3xl font-extrabold tracking-[-.06em]">2 items</p><p className="mt-2 text-xs leading-5 text-[#c5dce1]">One unexplained absence and one class still completing attendance.</p><button className="mt-7 flex items-center gap-2 text-xs font-bold text-[#9de0dc]" data-testid="button-preview-attention" onClick={() => go('#pilot')}>Review now <ArrowRight size={14} /></button></div></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-[#e0ebed] p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-bold">Attendance by class</h3><BarChart3 size={16} className="text-[#6fa2a5]" /></div><div className="mt-5 space-y-3">{[['Kindergarten', 97], ['Grade 1', 94], ['Grade 2', 91], ['Grade 3', 96]].map(([label, value]) => <div key={label}><div className="mb-1 flex justify-between text-[10px] font-semibold text-[#70868e]"><span>{label}</span><span>{value}%</span></div><div className="h-1.5 rounded-full bg-[#e8eeee]"><div className="h-full rounded-full bg-[#71b6ae]" style={{ width: `${value}%` }} /></div></div>)}</div></div><div className="rounded-2xl border border-[#e0ebed] p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-bold">Recent activity</h3><Activity size={16} className="text-[#6fa2a5]" /></div><div className="mt-4 space-y-4">{[['JL', 'Jordan Lee', 'completed attendance', '8:42 AM'], ['TA', 'Tessa Adams', 'added a note to Grade 3', '8:36 AM'], ['MR', 'Maya Rivera', 'reviewed an absence', '8:30 AM']].map(([initials, name, action, time]) => <div key={name} className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e5f0ef] text-[9px] font-bold text-[#397a78]">{initials}</span><p className="min-w-0 flex-1 text-[11px] text-[#66808a]"><b className="text-[#3e5c69]">{name}</b> {action}</p><span className="text-[9px] text-[#9babb0]">{time}</span></div>)}</div></div></div></div></div></div></main></div>;
}

function AuthCard({ mode, go }: { mode: 'sign-in' | 'request' | 'invite'; go: (path: string) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'principal' | 'teacher'>('principal');
  const [inviteCode, setInviteCode] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const titles = { 'sign-in': 'Welcome back.', request: 'Bring SchVIA to your school.', invite: 'You’re invited in.' };
  const descriptions = { 'sign-in': 'Sign in to continue to your school workspace.', request: 'Tell us a little about your school. We’ll be in touch with a thoughtful next step.', invite: 'Your school has a place ready for you. Accept the invitation to get started.' };
  if (submitted) return <AuthLayout go={go}><div className="mx-auto max-w-[420px] text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e4f2ee] text-[#2d8a78]"><Check size={25} /></span><h1 className="mt-6 font-display text-3xl font-extrabold tracking-[-.06em] text-[#173650]">{mode === 'sign-in' ? 'Check your inbox.' : 'Thanks — we have it.'}</h1><p className="mt-3 text-sm leading-6 text-[#6d838c]">{mode === 'sign-in' ? 'Use the secure link we sent to finish signing in.' : 'A member of the SchVIA team will follow up with a clear next step.'}</p><Button variant="secondary" className="mt-7" onClick={() => go('/')} testId="button-auth-home">Back to home</Button></div></AuthLayout>;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'sign-in') {
        if (email && password) {
          await apiJson('/api/auth/login-email', { method: 'POST', body: JSON.stringify({ email, password }) });
        } else {
          await apiJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ role }) });
        }
        go('#pilot');
        return;
      }
      if (mode === 'invite') {
        await apiJson('/api/auth/accept-invite', { method: 'POST', body: JSON.stringify({ code: inviteCode, name, email, password }) });
        go('#pilot');
        return;
      }
      await apiJson('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, schoolName: school, password: password || 'schvia-demo-password' }) });
      go('#pilot');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to continue right now.');
    } finally {
      setBusy(false);
    }
  };
  return <AuthLayout go={go}><div className="mx-auto w-full max-w-[430px]"><p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-[#378b8d]">{mode === 'invite' ? 'School invitation' : 'SchVIA'}</p><h1 className="mt-4 font-display text-4xl font-extrabold tracking-[-.07em] text-[#173650]">{titles[mode]}</h1><p className="mt-3 text-sm leading-6 text-[#6d838c]">{descriptions[mode]}</p><form className="mt-8 space-y-4" onSubmit={submit}>{mode === 'sign-in' && <div className="rounded-2xl border border-[#d8e8ea] bg-[#eef7f7] p-4"><p className="text-xs font-bold text-[#35616b]">Choose your workspace access</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setRole('principal')} className={`rounded-xl px-3 py-2 text-xs font-bold ${role === 'principal' ? 'bg-[#17466a] text-white' : 'bg-white text-[#6a808a]'}`}>Principal</button><button type="button" onClick={() => setRole('teacher')} className={`rounded-xl px-3 py-2 text-xs font-bold ${role === 'teacher' ? 'bg-[#17466a] text-white' : 'bg-white text-[#6a808a]'}`}>Teacher</button></div><p className="mt-2 text-[11px] leading-5 text-[#769099]">Demo access is available while the pilot is being configured. Use email and password below for a real account.</p></div>}{mode !== 'sign-in' && <label className="block text-sm font-semibold text-[#385767]">Your name<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Maya Rivera" className="mt-2 h-12 w-full rounded-xl border border-[#cadde3] bg-white px-4 text-sm outline-none transition focus:border-[#4c9aa0] focus:ring-4 focus:ring-[#dff0f0]" data-testid="input-name" /></label>}{mode === 'request' && <label className="block text-sm font-semibold text-[#385767]">School name<input value={school} onChange={(e) => setSchool(e.target.value)} required placeholder="e.g. Northfield Elementary" className="mt-2 h-12 w-full rounded-xl border border-[#cadde3] bg-white px-4 text-sm outline-none transition focus:border-[#4c9aa0] focus:ring-4 focus:ring-[#dff0f0]" data-testid="input-school" /></label>}{mode === 'invite' && <label className="block text-sm font-semibold text-[#385767]">Invitation code<input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required placeholder="AB12CD34" className="mt-2 h-12 w-full rounded-xl border border-[#cadde3] bg-white px-4 text-sm uppercase outline-none transition focus:border-[#4c9aa0] focus:ring-4 focus:ring-[#dff0f0]" data-testid="input-invite-code" /></label>}<label className="block text-sm font-semibold text-[#385767]">Work email<input value={email} onChange={(e) => setEmail(e.target.value)} required={mode !== 'sign-in' || Boolean(password)} type="email" placeholder="you@school.org" className="mt-2 h-12 w-full rounded-xl border border-[#cadde3] bg-white px-4 text-sm outline-none transition focus:border-[#4c9aa0] focus:ring-4 focus:ring-[#dff0f0]" data-testid="input-email" /></label>{(mode === 'sign-in' || mode === 'invite') && <label className="block text-sm font-semibold text-[#385767]">Password<input value={password} onChange={(e) => setPassword(e.target.value)} required={mode === 'invite'} type="password" placeholder={mode === 'sign-in' ? 'Optional for demo access' : 'At least 8 characters'} className="mt-2 h-12 w-full rounded-xl border border-[#cadde3] bg-white px-4 text-sm outline-none transition focus:border-[#4c9aa0] focus:ring-4 focus:ring-[#dff0f0]" data-testid="input-password" /></label>}{mode === 'request' && <p className="rounded-xl border border-[#e0ecee] bg-white px-3 py-2 text-[11px] leading-5 text-[#7b9199]">This creates a pilot workspace for you now. You can invite your school team from inside it.</p>}{error && <p role="alert" className="rounded-xl bg-[#fff0ee] px-3 py-2 text-xs font-semibold text-[#a84e48]">{error}</p>}<Button type="submit" disabled={busy} className="mt-2 h-12 w-full" testId="button-submit-auth">{busy ? 'Working…' : mode === 'sign-in' ? 'Continue to workspace' : mode === 'invite' ? 'Accept invitation' : 'Create school workspace'} <ArrowRight size={15} /></Button></form>{mode === 'sign-in' && <p className="mt-5 text-center text-xs text-[#7f969e]">Need an invitation? <button onClick={() => go('/request-access')} className="font-bold text-[#2c7d84]" data-testid="button-request-from-signin">Create a school workspace</button></p>}</div></AuthLayout>;
}

function AuthLayout({ children, go }: { children: ReactNode; go: (path: string) => void }) {
  return <div className="grid min-h-[100dvh] bg-[#f7fbfc] lg:grid-cols-[.9fr_1.1fr]"><aside className="relative hidden overflow-hidden bg-[#17466a] p-10 text-white lg:flex lg:flex-col lg:justify-between"><div className="absolute -right-28 top-20 h-80 w-80 rounded-full border border-white/10" /><div className="absolute -bottom-20 -left-16 h-72 w-72 rounded-full border border-[#8dd7d1]/20" /><div className="relative"><Logo inverse /><p className="mt-28 max-w-[370px] font-display text-5xl font-extrabold leading-[.98] tracking-[-.07em]">A steadier way to run the day.</p><p className="mt-6 max-w-[330px] text-sm leading-6 text-[#c1dce4]">SchVIA gives school teams a shared view of the day — with the calm to act on what matters.</p></div><div className="relative flex items-center gap-3 text-xs text-[#b1d2dc]"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15"><ShieldCheck size={15} /></span>Designed for real school work</div></aside><main className="flex flex-col p-5 sm:p-8"><div className="flex items-center justify-between lg:justify-end"><div className="lg:hidden"><Logo /></div><Button variant="quiet" onClick={() => go('/')} testId="button-auth-back"><X size={17} /> Close</Button></div><div className="flex flex-1 items-center justify-center py-12">{children}</div><p className="text-center text-[11px] text-[#91a4aa]">SchVIA · Clearer days for school communities</p></main></div>;
}

function WorkspaceShell({ go }: { go: (path: string) => void }) {
  const [view, setView] = useState<View>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRow[]>(attendanceSeed);
  const [pilotState, setPilotState] = useState<PilotState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const health = useHealthCheck();
  const presentCount = attendance.filter((student) => student.status === 'present').length;
  const markedCount = attendance.filter((student) => student.status !== 'unmarked').length;
  const pageTitle = navItems.find((item) => item.id === view)?.label ?? 'Overview';
  const refreshState = async () => {
    try {
      const nextState = await apiJson<PilotState>('/api/state');
      setPilotState(nextState);
      setAttendance(rowsFromPilotState(nextState));
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load this workspace.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refreshState();
  }, []);
  const updateStatus = (id: number, status: AttendanceStatus) => {
    setAttendance((current) => current.map((student) => student.id === id ? { ...student, status, time: status === 'unmarked' || status === 'absent' ? '—' : student.time === '—' ? '8:42 AM' : student.time } : student));
    setToast('Change ready to save');
    window.setTimeout(() => setToast(''), 1800);
  };
  const saveAttendance = async () => {
    if (!pilotState) return;
    const byClass = new Map<string, AttendanceRow[]>();
    attendance.filter((row) => row.status !== 'unmarked' && !row.studentId.startsWith('demo-')).forEach((row) => {
      const rows = byClass.get(row.classId) || [];
      rows.push(row);
      byClass.set(row.classId, rows);
    });
    if (!byClass.size) return;
    setSaving(true);
    try {
      for (const [classId, rows] of byClass) {
        await apiJson('/api/attendance', {
          method: 'POST',
          body: JSON.stringify({
            date: new Date().toISOString().slice(0, 10),
            classId,
            records: rows.map((row) => ({ studentId: row.studentId, status: row.status })),
          }),
        });
      }
      await refreshState();
      setToast('Attendance saved to the school record');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Attendance could not be saved');
    } finally {
      setSaving(false);
      window.setTimeout(() => setToast(''), 2400);
    }
  };
  const signOut = async () => {
    await apiJson('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    go('/sign-in');
  };
  if (loading) return <div className="flex min-h-[100dvh] items-center justify-center bg-[#f5f9fa] text-sm font-semibold text-[#607887]">Loading your school workspace…</div>;
  if (loadError || !pilotState) return <div className="flex min-h-[100dvh] items-center justify-center bg-[#f5f9fa] p-6 text-center"><div><p className="font-display text-2xl font-extrabold text-[#173650]">Your workspace needs a fresh sign-in.</p><p className="mt-2 text-sm text-[#71868f]">{loadError || 'No active workspace session was found.'}</p><Button className="mt-6" onClick={() => go('/sign-in')}>Return to sign in</Button></div></div>;
  return <div className="app-noise flex min-h-[100dvh] bg-[#f5f9fa] text-[#173650]"><aside className={`fixed inset-y-0 left-0 z-30 flex w-[258px] flex-col border-r border-[#dbe8ea] bg-white px-4 py-5 transition-transform lg:static lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}><div className="flex items-center justify-between px-2"><Logo /><button className="rounded-lg p-2 text-[#6b818a] lg:hidden" onClick={() => setMobileNav(false)} data-testid="button-close-mobile-nav"><X size={18} /></button></div><button onClick={() => setSchoolOpen(!schoolOpen)} className="relative mt-9 flex w-full items-center gap-3 rounded-xl border border-[#dce9eb] bg-[#f8fbfb] p-3 text-left hover:bg-[#eef6f7]" data-testid="button-workspace-switcher"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#d6edf0] text-xs font-extrabold text-[#176579]">{initialsFor(pilotState.school.name)}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{pilotState.school.name}</span><span className="mt-0.5 block text-[10px] text-[#82969d]">{pilotState.currentUser.role} workspace</span></span><ChevronDown size={15} className={`text-[#81989f] transition-transform ${schoolOpen ? 'rotate-180' : ''}`} />{schoolOpen && <span className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-xl border border-[#d6e5e8] bg-white p-2 shadow-lift"><span className="flex items-center gap-2 rounded-lg bg-[#edf6f7] p-2 text-xs font-semibold"><span className="h-2 w-2 rounded-full bg-[#3c9f91]" /> {pilotState.school.name}</span></span>}</button><p className="mb-2 mt-9 px-3 font-mono-ui text-[9px] uppercase tracking-[.18em] text-[#9aadb2]">School day</p><nav className="space-y-1">{navItems.map((item) => <button key={item.id} onClick={() => { setView(item.id); setMobileNav(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === item.id ? 'bg-[#e7f3f4] text-[#17466a]' : 'text-[#70858e] hover:bg-[#f2f7f8] hover:text-[#17466a]'}`} data-testid={`nav-${item.id}`}><item.icon size={17} />{item.label}{item.id === 'attendance' && <span className="ml-auto rounded-full bg-[#d9eeeb] px-1.5 py-0.5 text-[9px] font-bold text-[#2f887b]">Today</span>}</button>)}</nav><p className="mb-2 mt-9 px-3 font-mono-ui text-[9px] uppercase tracking-[.18em] text-[#9aadb2]">Manage</p><button onClick={() => { setView('settings'); setMobileNav(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${view === 'settings' ? 'bg-[#e7f3f4] text-[#17466a]' : 'text-[#70858e] hover:bg-[#f2f7f8]'}`} data-testid="nav-settings"><Settings size={17} /> Settings</button><div className="mt-auto rounded-2xl bg-[#17466a] p-4 text-white"><p className="text-xs font-bold">School day status</p><div className="mt-3 flex items-center gap-2 text-[10px] text-[#c7e0e5]"><span className={`h-2 w-2 rounded-full ${health.isError ? 'bg-[#e8ad78]' : 'bg-[#7dd3c1]'}`} />{health.isError ? 'Working offline' : 'All systems operational'}</div><div className="mt-3 h-1.5 rounded-full bg-white/15"><div className="h-full w-[78%] rounded-full bg-[#7bd0c6]" /></div></div><button className="mt-4 flex items-center gap-3 rounded-xl p-2 text-left hover:bg-[#f2f7f8]" onClick={() => void signOut()} data-testid="button-workspace-signout"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#17466a] text-[10px] font-bold text-white">{initialsFor(pilotState.currentUser.name)}</span><span><span className="block text-xs font-bold">{pilotState.currentUser.name}</span><span className="block text-[10px] text-[#8ca0a6]">Sign out</span></span></button></aside>{mobileNav && <button className="fixed inset-0 z-20 bg-[#173650]/20 lg:hidden" onClick={() => setMobileNav(false)} aria-label="Close navigation" data-testid="button-nav-overlay" />}<main className="min-w-0 flex-1"><header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-[#dbe8ea] bg-[#f8fbfc]/90 px-4 backdrop-blur-md sm:px-7 lg:px-10"><div className="flex items-center gap-3"><button onClick={() => setMobileNav(true)} className="rounded-xl p-2 text-[#577582] hover:bg-[#e7f2f4] lg:hidden" data-testid="button-open-mobile-nav"><Menu size={20} /></button><div><p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-[#94a7ad]">{pilotState.school.name}</p><h1 className="mt-1 font-display text-lg font-extrabold tracking-[-.04em]">{pageTitle}</h1></div></div><div className="flex items-center gap-2 sm:gap-4"><div className="hidden items-center gap-2 rounded-full border border-[#d9e7e9] bg-white px-3 py-2 text-xs font-semibold text-[#78909a] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#3ca18f]" /> {pilotState.school.term || 'School day'}</div><button className="relative rounded-xl p-2.5 text-[#66808b] hover:bg-[#e7f2f4]" onClick={() => setToast('You are all caught up')} data-testid="button-notifications"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#d47d51]" /></button><button className="flex h-9 w-9 items-center justify-center rounded-full bg-[#17466a] text-[10px] font-bold text-white" onClick={() => void signOut()} data-testid="button-profile">{initialsFor(pilotState.currentUser.name)}</button></div></header><div className="mx-auto max-w-[1400px] p-4 sm:p-7 lg:p-10">{view === 'overview' && <Overview setView={setView} presentCount={presentCount} markedCount={markedCount} />}{view === 'attendance' && <Attendance attendance={attendance} updateStatus={updateStatus} markedCount={markedCount} onMarkAll={() => { setAttendance((current) => current.map((student) => student.status === 'unmarked' ? { ...student, status: 'present', time: '8:42 AM' } : student)); setToast('All remaining students marked present'); window.setTimeout(() => setToast(''), 1800); }} onSave={() => void saveAttendance()} saving={saving} />}{view === 'students' && <Students />}{view === 'people' && <People />}{view === 'activity' && <ActivityView />}{view === 'settings' && <SettingsView />}</div></main>{toast && <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#173650] px-4 py-3 text-xs font-semibold text-white shadow-lift reveal" data-testid="status-toast"><CheckCircle2 size={16} className="text-[#86d4c7]" /> {toast}</div>}</div>;
}

function Overview({ setView, presentCount, markedCount }: { setView: (view: View) => void; presentCount: number; markedCount: number }) {
  return <div className="reveal"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2 text-xs font-semibold text-[#358b88]"><span className="h-2 w-2 rounded-full bg-[#3ca18f]" /> Tuesday morning, October 15</div><h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-.065em] text-[#173650] sm:text-4xl">Good morning, Maya.</h2><p className="mt-2 text-sm text-[#71868f]">Here is the shape of your school day so far.</p></div><Button onClick={() => setView('attendance')} testId="button-take-attendance"><ClipboardCheck size={16} /> Take attendance <ArrowRight size={15} /></Button></div><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Attendance today" value="94.8%" detail={`${markedCount} of 8 students accounted for`} accent="teal" /><Metric label="Present right now" value={`${presentCount}`} detail="Across 4 active classes" accent="blue" /><Metric label="Needs your attention" value="2" detail="1 absence · 1 open task" accent="amber" /><Metric label="Staff accounted for" value="100%" detail="24 of 24 checked in" accent="sage" /></div><div className="mt-5 grid gap-5 xl:grid-cols-[1.18fr_.82fr]"><section className="rounded-2xl border border-[#dce9eb] bg-white p-5 shadow-soft sm:p-6"><div className="flex items-start justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-[#91a5ab]">Live pulse</p><h3 className="mt-2 font-display text-xl font-extrabold tracking-[-.05em]">A clear start to the day</h3></div><button className="rounded-lg p-2 text-[#76919a] hover:bg-[#eef6f7]" onClick={() => setView('activity')} data-testid="button-view-activity"><MoreHorizontal size={18} /></button></div><div className="mt-8 flex h-[180px] items-end gap-2 border-b border-[#e7eff0] pb-0">{[22, 34, 30, 48, 45, 61, 52, 70, 66, 85, 76, 93, 88, 95].map((height, index) => <div key={index} className="group relative flex-1 rounded-t-lg bg-[#c8e4e5] transition-all hover:bg-[#4b9c98]" style={{ height: `${height}%` }}><span className="absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded-md bg-[#173650] px-1.5 py-1 text-[9px] text-white group-hover:block">{8 + Math.floor(index / 3)}:{index % 3}0</span></div>)}</div><div className="mt-3 flex justify-between text-[10px] font-semibold text-[#9aadb2]"><span>8:00</span><span>8:30</span><span>9:00</span><span>9:30</span><span>10:00</span></div></section><section className="rounded-2xl border border-[#dce9eb] bg-white p-5 shadow-soft sm:p-6"><div className="flex items-center justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-[#91a5ab]">Attention queue</p><h3 className="mt-2 font-display text-xl font-extrabold tracking-[-.05em]">Worth a look</h3></div><span className="rounded-full bg-[#fff3df] px-2.5 py-1 text-[10px] font-bold text-[#a66c28]">2 open</span></div><div className="mt-5 space-y-3"><Attention icon={CircleAlert} color="amber" title="One unexplained absence" detail="Ethan Brooks · Grade 2" onClick={() => setView('attendance')} /><Attention icon={Clock3} color="teal" title="Attendance in progress" detail="Ms. Patel’s class · 6 of 8" onClick={() => setView('attendance')} /><div className="mt-5 border-t border-[#e8eff0] pt-4"><button className="flex items-center gap-1 text-xs font-bold text-[#2b7e85] hover:text-[#17466a]" onClick={() => setView('activity')} data-testid="button-see-all-activity">See all activity <ChevronRight size={14} /></button></div></div></section></div><section className="mt-5 rounded-2xl border border-[#cce2e3] bg-[#eaf6f5] p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#cae8e5] text-[#277b78]"><Sparkles size={20} /></span><div className="flex-1"><p className="text-sm font-bold text-[#246b70]">The school day is moving well.</p><p className="mt-1 text-sm text-[#5e8184]">Attendance is 1.6 points above your 30-day average. Keep the morning simple.</p></div><button className="flex items-center gap-1 text-xs font-bold text-[#267b7d]" onClick={() => setView('activity')} data-testid="button-view-school-patterns">View school patterns <ArrowRight size={14} /></button></div></section></div>;
}

function Metric({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  const colors: Record<string, string> = { teal: 'bg-[#e3f3f1] text-[#277c77]', blue: 'bg-[#e3eef5] text-[#255f82]', amber: 'bg-[#fff1dc] text-[#a26b27]', sage: 'bg-[#edf0e1] text-[#687543]' };
  return <div className="rounded-2xl border border-[#dce9eb] bg-white p-5 shadow-soft"><div className="flex items-start justify-between"><p className="text-xs font-semibold text-[#71868e]">{label}</p><span className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold ${colors[accent]}`}>{accent === 'teal' ? '↗' : accent === 'blue' ? '◌' : accent === 'amber' ? '!' : '✓'}</span></div><p className="mt-5 font-display text-3xl font-extrabold tracking-[-.07em] text-[#173650]">{value}</p><p className="mt-1 text-[11px] text-[#8a9ca3]">{detail}</p></div>;
}

function Attention({ icon: Icon, color, title, detail, onClick }: { icon: IconType; color: string; title: string; detail: string; onClick: () => void }) {
  return <button className="flex w-full items-center gap-3 rounded-xl border border-[#e6eeef] p-3 text-left transition-colors hover:border-[#b9d9dc] hover:bg-[#f7fbfb]" onClick={onClick} data-testid={`button-attention-${title.toLowerCase().replaceAll(' ', '-')}`}><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${color === 'amber' ? 'bg-[#fff2dc] text-[#ad752e]' : 'bg-[#e2f2f0] text-[#39857e]'}`}><Icon size={16} /></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-[#456371]">{title}</span><span className="mt-0.5 block text-[11px] text-[#8a9ca3]">{detail}</span></span><ChevronRight size={15} className="text-[#a6b5b9]" /></button>;
}

function Attendance({ attendance, updateStatus, markedCount, onMarkAll, onSave, saving }: { attendance: AttendanceRow[]; updateStatus: (id: number, status: AttendanceStatus) => void; markedCount: number; onMarkAll: () => void; onSave: () => void; saving: boolean }) {
  const [selectedClass, setSelectedClass] = useState('Grade 2 · Ms. Patel');
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => attendance.filter((student) => student.name.toLowerCase().includes(search.toLowerCase())), [attendance, search]);
  return <div className="reveal"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="flex items-center gap-2 text-xs font-semibold text-[#358b88]"><span className="h-2 w-2 rounded-full bg-[#3ca18f]" /> {new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</p><h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-.065em] sm:text-4xl">Take attendance</h2><p className="mt-2 text-sm text-[#71868f]">A quick, quiet check-in for every classroom.</p></div><div className="flex gap-2"><Button variant="secondary" testId="button-attendance-help"><HelpCircle size={16} /> Help</Button><Button onClick={onMarkAll} disabled={markedCount === attendance.length} testId="button-mark-all-present"><Check size={16} /> Mark remaining present</Button></div></div><div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2 overflow-x-auto pb-1">{['All assigned students'].map((label) => <button key={label} onClick={() => setSelectedClass(label)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold ${selectedClass === label ? 'bg-[#17466a] text-white' : 'border border-[#d8e6e9] bg-white text-[#6c838c] hover:bg-[#edf6f7]'}`} data-testid="button-class-all">{label}</button>)}</div><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aadb3]" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a student" className="h-10 w-full rounded-xl border border-[#d8e6e9] bg-white pl-9 pr-3 text-xs outline-none focus:border-[#69a7aa] sm:w-48" data-testid="input-search-students" /></div></div><div className="mt-4 rounded-2xl border border-[#dce9eb] bg-white shadow-soft"><div className="flex flex-col gap-4 border-b border-[#e5edef] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><h3 className="font-display text-lg font-extrabold tracking-[-.04em]">{selectedClass}</h3><p className="mt-1 text-xs text-[#82969d]">{markedCount} of {attendance.length} students marked · Save to update the school record</p></div><div className="flex items-center gap-2 text-xs font-semibold text-[#5e7b83]"><span className="h-2 w-2 rounded-full bg-[#3ca18f]" /> Live and synced</div></div><div className="hidden grid-cols-[1.5fr_.65fr_.65fr_1fr] gap-3 border-b border-[#edf2f2] px-6 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#9babb0] sm:grid"><span>Student</span><span>Status</span><span>Checked in</span><span>Note</span></div><div className="divide-y divide-[#edf2f2]">{filtered.map((student) => <AttendanceRow key={student.id} student={student} updateStatus={updateStatus} />)}{filtered.length === 0 && <div className="px-6 py-14 text-center"><Search className="mx-auto text-[#9bb2b8]" size={24} /><p className="mt-3 text-sm font-bold text-[#4f6c78]">No students found</p><p className="mt-1 text-xs text-[#8ca0a6]">Try a different name.</p></div>}</div><div className="flex flex-col gap-3 border-t border-[#e5edef] bg-[#f8fbfb] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><p className="text-xs text-[#82969d]"><span className="font-bold text-[#496975]">{attendance.filter((student) => student.status === 'present').length} present</span> · {attendance.filter((student) => student.status === 'late').length} late · {attendance.filter((student) => student.status === 'absent').length} absent</p><Button className="w-full sm:w-auto" onClick={onSave} disabled={saving} testId="button-save-attendance"><Check size={15} /> {saving ? 'Saving…' : 'Save attendance'}</Button></div></div><p className="mt-4 text-center text-[11px] text-[#9aaeb3]">Changes remain visible while you are offline and can be saved when the connection returns.</p></div>;
}

function AttendanceRow({ student, updateStatus }: { student: (typeof attendanceSeed)[number]; updateStatus: (id: number, status: AttendanceStatus) => void }) {
  const statusStyles: Record<AttendanceStatus, string> = { present: 'bg-[#e5f3ee] text-[#2a8068]', absent: 'bg-[#fff0ee] text-[#ad5148]', late: 'bg-[#fff2df] text-[#a16b27]', unmarked: 'bg-[#f1f5f5] text-[#82969d]' };
  const statusLabels: Record<AttendanceStatus, string> = { present: 'Present', absent: 'Absent', late: 'Late', unmarked: 'Unmarked' };
  return <div className="grid gap-3 px-4 py-4 sm:grid-cols-[1.5fr_.65fr_.65fr_1fr] sm:items-center sm:px-6"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e7f1f2] text-[10px] font-bold text-[#39747c]">{student.initials}</span><div><p className="text-sm font-bold text-[#456271]">{student.name}</p><p className="text-[10px] text-[#9aabb0] sm:hidden">{student.note || 'No note added'}</p></div></div><div className="flex gap-1.5"><button onClick={() => updateStatus(student.id, 'present')} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${student.status === 'present' ? statusStyles.present : 'bg-[#f6f8f8] text-[#94a6aa] hover:bg-[#e8f4f1]'}`} data-testid={`button-present-${student.id}`}>Present</button><button onClick={() => updateStatus(student.id, 'absent')} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${student.status === 'absent' ? statusStyles.absent : 'bg-[#f6f8f8] text-[#94a6aa] hover:bg-[#fff0ee]'}`} data-testid={`button-absent-${student.id}`}>Absent</button><button onClick={() => updateStatus(student.id, 'late')} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${student.status === 'late' ? statusStyles.late : 'bg-[#f6f8f8] text-[#94a6aa] hover:bg-[#fff4e5]'}`} data-testid={`button-late-${student.id}`}>Late</button></div><span className="hidden text-xs font-semibold text-[#68818b] sm:block">{student.time}</span><span className="hidden text-xs text-[#81969d] sm:block">{student.note || '—'}</span><span className={`text-[10px] font-bold sm:hidden ${statusStyles[student.status].split(' ')[1]}`}>{statusLabels[student.status]} · {student.time}</span></div>;
}

function Students() {
  const [search, setSearch] = useState('');
  const students = [{ name: 'Ava Mitchell', grade: 'Grade 2', family: 'Connected', initials: 'AM' }, { name: 'Noah Williams', grade: 'Grade 2', family: 'Connected', initials: 'NW' }, { name: 'Sofia Chen', grade: 'Grade 2', family: 'Needs review', initials: 'SC' }, { name: 'Ethan Brooks', grade: 'Grade 2', family: 'Connected', initials: 'EB' }, { name: 'Mia Robinson', grade: 'Grade 2', family: 'Connected', initials: 'MR' }]; const filtered = students.filter((student) => student.name.toLowerCase().includes(search.toLowerCase()));
  return <div className="reveal"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-[#91a5ab]">School directory</p><h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-.065em]">Students</h2><p className="mt-2 text-sm text-[#71868f]">A simple, current view of every learner and family connection.</p></div><Button testId="button-add-student"><UserPlus size={16} /> Add student</Button></div><div className="mt-8 rounded-2xl border border-[#dce9eb] bg-white shadow-soft"><div className="flex flex-col gap-3 border-b border-[#e5edef] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><p className="text-sm font-bold text-[#456271]">1,312 students <span className="font-normal text-[#91a3a9]">across 24 classes</span></p><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aadb3]" size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students" className="h-10 w-full rounded-xl border border-[#d8e6e9] pl-9 pr-3 text-xs outline-none focus:border-[#69a7aa] sm:w-52" data-testid="input-student-directory-search" /></div></div><div className="hidden grid-cols-[1.4fr_.8fr_1fr_32px] gap-3 border-b border-[#edf2f2] px-6 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#9babb0] sm:grid"><span>Student</span><span>Class</span><span>Family connection</span><span /></div><div className="divide-y divide-[#edf2f2]">{filtered.map((student, index) => <div key={student.name} className="grid gap-3 px-4 py-4 sm:grid-cols-[1.4fr_.8fr_1fr_32px] sm:items-center sm:px-6"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e7f1f2] text-[10px] font-bold text-[#39747c]">{student.initials}</span><div><p className="text-sm font-bold text-[#456271]">{student.name}</p><p className="text-[10px] text-[#9aabb0] sm:hidden">{student.grade} · {student.family}</p></div></div><span className="hidden text-xs font-semibold text-[#6d858e] sm:block">{student.grade}</span><span className={`hidden w-fit rounded-full px-2.5 py-1 text-[10px] font-bold sm:inline ${student.family === 'Needs review' ? 'bg-[#fff2df] text-[#a36d2e]' : 'bg-[#e8f4ef] text-[#388068]'}`}>{student.family}</span><button className="hidden rounded-lg p-2 text-[#91a6ac] hover:bg-[#eef6f7] sm:block" onClick={() => undefined} data-testid={`button-student-more-${index}`}><MoreHorizontal size={16} /></button></div>)}{filtered.length === 0 && <EmptyState title="No students match" copy="Try a different name or clear your search." />}</div></div></div>;
}

function People() {
  const staff = [{ initials: 'JL', name: 'Jordan Lee', role: 'Grade 3 teacher', status: 'Active' }, { initials: 'TA', name: 'Tessa Adams', role: 'Office coordinator', status: 'Active' }, { initials: 'MC', name: 'Mina Chen', role: 'Kindergarten teacher', status: 'Active' }, { initials: 'RD', name: 'Rafael Diaz', role: 'Grade 1 teacher', status: 'Invited' }];
  return <div className="reveal"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-[#91a5ab]">School directory</p><h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-.065em]">Staff & classes</h2><p className="mt-2 text-sm text-[#71868f]">Keep the people and rooms behind the day in step.</p></div><Button testId="button-invite-staff"><UserPlus size={16} /> Invite staff</Button></div><div className="mt-8 grid gap-5 xl:grid-cols-[1.1fr_.9fr]"><section className="rounded-2xl border border-[#dce9eb] bg-white p-5 shadow-soft"><div className="flex items-center justify-between"><h3 className="font-display text-lg font-extrabold tracking-[-.04em]">Staff</h3><span className="text-xs text-[#91a3a9]">24 people</span></div><div className="mt-4 divide-y divide-[#edf2f2]">{staff.map((person) => <div key={person.name} className="flex items-center gap-3 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e7f1f2] text-[10px] font-bold text-[#39747c]">{person.initials}</span><div className="flex-1"><p className="text-sm font-bold text-[#456271]">{person.name}</p><p className="mt-0.5 text-[11px] text-[#8a9da3]">{person.role}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${person.status === 'Active' ? 'bg-[#e8f4ef] text-[#388068]' : 'bg-[#fff2df] text-[#a36d2e]'}`}>{person.status}</span><button className="rounded-lg p-2 text-[#91a6ac] hover:bg-[#eef6f7]" onClick={() => undefined} data-testid={`button-staff-more-${person.name.replaceAll(' ', '-').toLowerCase()}`}><MoreHorizontal size={16} /></button></div>)}</div></section><section className="rounded-2xl border border-[#dce9eb] bg-white p-5 shadow-soft"><div className="flex items-center justify-between"><h3 className="font-display text-lg font-extrabold tracking-[-.04em]">Classes</h3><Button variant="secondary" className="min-h-9 px-3 text-xs" testId="button-add-class"><Plus size={14} /> Add class</Button></div><div className="mt-4 space-y-2">{[['Kindergarten', 'Ms. Chen', '22 students'], ['Grade 1', 'Mr. Diaz', '24 students'], ['Grade 2', 'Ms. Patel', '26 students'], ['Grade 3', 'Mr. Lee', '25 students']].map(([grade, teacher, count], index) => <button key={grade} onClick={() => undefined} className="flex w-full items-center gap-3 rounded-xl border border-[#e7eef0] p-3 text-left hover:border-[#b9d9dc] hover:bg-[#f8fbfb]" data-testid={`button-class-detail-${index}`}><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8f3f4] text-[#397b82]"><BookOpen size={16} /></span><span className="flex-1"><span className="block text-sm font-bold text-[#456271]">{grade}</span><span className="mt-0.5 block text-[11px] text-[#8a9da3]">{teacher} · {count}</span></span><ChevronRight size={15} className="text-[#a5b5b9]" /></button>)}</div></section></div></div>;
}

function ActivityView() {
  const activity = [['8:42 AM', 'Jordan Lee', 'completed attendance', 'Grade 3 · 25 students', 'JL'], ['8:36 AM', 'Tessa Adams', 'added a note', 'Grade 3 · Bus delay follow-up', 'TA'], ['8:30 AM', 'Maya Rivera', 'reviewed an absence', 'Ethan Brooks · Grade 2', 'MR'], ['8:18 AM', 'Mina Chen', 'completed attendance', 'Kindergarten · 22 students', 'MC'], ['Yesterday', 'System', 'sent a family update', 'October attendance summary', 'SV']]; return <div className="reveal"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-[#91a5ab]">A clear trail</p><h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-.065em]">Activity</h2><p className="mt-2 text-sm text-[#71868f]">See what changed, when it changed, and who moved it forward.</p></div><div className="mt-8 rounded-2xl border border-[#dce9eb] bg-white p-5 shadow-soft sm:p-7"><div className="flex items-center justify-between border-b border-[#e5edef] pb-4"><h3 className="font-display text-lg font-extrabold tracking-[-.04em]">Recent activity</h3><button className="flex items-center gap-1 text-xs font-bold text-[#2b7e85]" onClick={() => undefined} data-testid="button-filter-activity">Filter <ChevronDown size={14} /></button></div><div className="divide-y divide-[#edf2f2]">{activity.map(([time, name, action, detail, initials]) => <div key={`${time}-${name}`} className="flex gap-3 py-5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e7f1f2] text-[10px] font-bold text-[#39747c]">{initials}</span><div className="min-w-0 flex-1"><p className="text-sm text-[#456271]"><b>{name}</b> {action}</p><p className="mt-1 text-xs text-[#8a9da3]">{detail}</p></div><span className="whitespace-nowrap text-[10px] font-semibold text-[#a0afb3]">{time}</span></div>)}</div></div></div>;
}

function SettingsView() {
  const [saved, setSaved] = useState(false);
  return <div className="reveal"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-[#91a5ab]">Workspace preferences</p><h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-.065em]">Settings</h2><p className="mt-2 text-sm text-[#71868f]">Keep SchVIA aligned with how your school works.</p></div><div className="mt-8 max-w-[760px] space-y-5"><section className="rounded-2xl border border-[#dce9eb] bg-white p-5 shadow-soft sm:p-6"><h3 className="font-display text-lg font-extrabold tracking-[-.04em]">School profile</h3><p className="mt-1 text-xs text-[#8a9da3]">This is how your school appears across the workspace.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-[#536f7a]">School name<input defaultValue="Northfield Elementary" className="mt-2 h-11 w-full rounded-xl border border-[#d5e4e7] px-3 text-sm font-normal outline-none focus:border-[#6aa7aa]" data-testid="input-settings-school-name" /></label><label className="text-xs font-bold text-[#536f7a]">School year<select defaultValue="2024-25" className="mt-2 h-11 w-full rounded-xl border border-[#d5e4e7] bg-white px-3 text-sm font-normal outline-none focus:border-[#6aa7aa]" data-testid="select-settings-year"><option value="2024-25">2024–25</option><option value="2025-26">2025–26</option></select></label></div></section><section className="rounded-2xl border border-[#dce9eb] bg-white p-5 shadow-soft sm:p-6"><h3 className="font-display text-lg font-extrabold tracking-[-.04em]">Attendance defaults</h3><div className="mt-5 divide-y divide-[#edf2f2]"><ToggleRow title="Remind teachers at 9:00 AM" detail="A gentle nudge for classes still in progress." defaultChecked /><ToggleRow title="Include late arrivals in daily pulse" detail="Keep the principal view focused on the full picture." defaultChecked /><ToggleRow title="Family updates require review" detail="Hold messages until a member of staff has checked them." /></div></section><div className="flex items-center gap-3"><Button onClick={() => { setSaved(true); window.setTimeout(() => setSaved(false), 2200); }} testId="button-save-settings"><Check size={15} /> Save changes</Button>{saved && <span className="text-xs font-semibold text-[#2d8a78] reveal">Settings saved</span>}</div></div></div>;
}

function ToggleRow({ title, detail, defaultChecked = false }: { title: string; detail: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  return <div className="flex items-center gap-4 py-4"><div className="flex-1"><p className="text-sm font-bold text-[#456271]">{title}</p><p className="mt-1 text-xs text-[#8a9da3]">{detail}</p></div><button onClick={() => setChecked(!checked)} className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-[#318d87]' : 'bg-[#dbe6e8]'}`} data-testid={`toggle-${title.toLowerCase().replaceAll(' ', '-')}`} aria-pressed={checked}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="px-6 py-14 text-center"><FileText className="mx-auto text-[#9bb2b8]" size={24} /><p className="mt-3 text-sm font-bold text-[#4f6c78]">{title}</p><p className="mt-1 text-xs text-[#8ca0a6]">{copy}</p></div>;
}

function AppRouter() {
  const [location, setLocation] = useLocation();
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => { const onHash = () => setHash(window.location.hash); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  const go = (target: string) => {
    if (target.startsWith('#')) { window.location.hash = target.slice(1); return; }
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setLocation(target);
  };
  if (hash === '#dashboard') return <Preview go={go} />;
  if (hash === '#pilot') return <WorkspaceShell go={go} />;
  if (location === '/') return <Landing go={go} />;
  if (location === '/sign-in') return <AuthCard mode="sign-in" go={go} />;
  if (location === '/request-access') return <AuthCard mode="request" go={go} />;
  if (location === '/invite') return <AuthCard mode="invite" go={go} />;
  return <NotFound />;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><ErrorBoundary><AppRouter /></ErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;