export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-4xl">🏏</span>
            <h1 className="text-3xl font-bold text-[#ff6b00]">IPL Fantasy</h1>
          </div>
          <p className="text-muted-foreground text-sm">IPL 2026 — Private League</p>
        </div>
        {children}
      </div>
    </div>
  )
}
