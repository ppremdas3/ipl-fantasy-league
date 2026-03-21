import { IPLFantasyLogo } from '@/components/ui/IPLFantasyLogo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-background">
      {/* Animated background blobs */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top-left cyan blob */}
        <div
          className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{
            background: 'radial-gradient(circle, #00d4ff 0%, transparent 70%)',
            animation: 'blob1 12s ease-in-out infinite',
          }}
        />
        {/* Bottom-right orange blob */}
        <div
          className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full opacity-[0.06]"
          style={{
            background: 'radial-gradient(circle, #ff6b00 0%, transparent 70%)',
            animation: 'blob2 15s ease-in-out infinite',
          }}
        />
        {/* Center purple accent */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(ellipse, #8B5CF6 0%, transparent 65%)' }}
        />
        {/* Diagonal light beam */}
        <div
          className="absolute top-0 right-1/4 w-px h-full opacity-[0.08]"
          style={{ background: 'linear-gradient(180deg, transparent 0%, #00d4ff 40%, transparent 100%)' }}
        />
        <div
          className="absolute top-0 right-1/3 w-px h-full opacity-[0.05]"
          style={{ background: 'linear-gradient(180deg, transparent 0%, #ff6b00 50%, transparent 100%)' }}
        />
      </div>

      <style>{`
        @keyframes blob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%       { transform: translate(40px, -30px) scale(1.08); }
          66%       { transform: translate(-20px, 20px) scale(0.95); }
        }
        @keyframes blob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%       { transform: translate(-30px, 20px) scale(1.06); }
          66%       { transform: translate(20px, -30px) scale(0.96); }
        }
      `}</style>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <IPLFantasyLogo iconSize={52} />
          <p className="font-rajdhani text-xs tracking-[0.3em] uppercase text-[#00d4ff]/40 mt-3">
            IPL 2026 · Private League
          </p>
        </div>

        {/* Decorative line above card */}
        <div className="relative h-px w-full mb-0">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00d4ff]/40 to-transparent" />
        </div>

        {children}

        {/* Decorative line below card */}
        <div className="relative h-px w-full mt-0">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#ff6b00]/30 to-transparent" />
        </div>

        {/* Bottom label */}
        <p className="text-center font-rajdhani text-[10px] tracking-[0.25em] uppercase text-[#5a7a9a] mt-6">
          Powered by IPL Fantasy Engine
        </p>
      </div>
    </div>
  )
}
