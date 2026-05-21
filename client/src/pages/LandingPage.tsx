import { useLocation } from "wouter";

const FEATURES = [
  {
    title: "Portfolio Summary",
    desc: "Total leases, ROU assets, liabilities, and payments at a glance with asset type breakdown.",
    icon: "📊",
  },
  {
    title: "ROU Roll-Forward",
    desc: "Track every movement — additions, depreciation, modifications, disposals — from opening to closing.",
    icon: "📈",
  },
  {
    title: "Liability Roll-Forward",
    desc: "Interest accretion, payments, modifications — fully reconciled period over period.",
    icon: "📉",
  },
  {
    title: "Maturity Analysis",
    desc: "Undiscounted future payments by time band. IFRS 16 Para 58 disclosure ready.",
    icon: "⏳",
  },
  {
    title: "Interest & Depreciation",
    desc: "Monthly P&L impact with trend analysis. Budget vs actual variance at your fingertips.",
    icon: "💰",
  },
  {
    title: "Lease Expiry Alerts",
    desc: "Never miss a renewal deadline. Urgency badges and action recommendations.",
    icon: "🔔",
  },
  {
    title: "Cash Payment Forecast",
    desc: "12-month payment visibility by asset type. Peak month warnings and liquidity planning.",
    icon: "🏦",
  },
];

const CAPABILITIES = [
  {
    title: "IFRS 16 Compliant",
    desc: "Full lifecycle from initial recognition through modifications, renewals, purchases, and terminations.",
  },
  {
    title: "AI-Powered Reports",
    desc: "Azure OpenAI generates enterprise-grade narrative reports — Big 4 quality at the click of a button.",
  },
  {
    title: "Automated Journal Entries",
    desc: "Zero manual calculations. Monthly amortisation, modifications, and renewals auto-posted.",
  },
  {
    title: "Calc Explanation Engine",
    desc: "Full-screen blackboard showing step-by-step IFRS 16 calculations. Audit trail built in.",
  },
];

export default function LandingPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0e1a] via-[#0f1629] to-[#0a0e1a] text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0e1a]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center font-bold text-sm">
              VL
            </div>
            <span className="text-lg font-semibold tracking-tight">VodaLease Enterprise</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#reports" className="hover:text-white transition">Reports</a>
            <a href="#demo" className="hover:text-white transition">Demo</a>
          </nav>
          <button
            onClick={() => navigate("/dashboard")}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-teal-500 to-blue-600 text-white text-sm font-medium hover:opacity-90 transition"
          >
            Get Started
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-block px-4 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-medium mb-6">
            IFRS 16 Lease Accounting Platform
          </div>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
            Lease Accounting.{" "}
            <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
              Simplified.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto mb-10">
            End-to-end IFRS 16 compliance with automated journal entries, AI-powered reports,
            and real-time portfolio visibility. Built for enterprise finance teams.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate("/dashboard")}
              className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-teal-500 to-blue-600 text-white font-semibold hover:opacity-90 transition shadow-lg shadow-teal-500/20"
            >
              Start Free Trial
            </button>
            <a
              href="#demo"
              className="px-8 py-3.5 rounded-xl border border-white/10 text-white font-semibold hover:bg-white/5 transition"
            >
              Watch Demo
            </a>
          </div>
        </div>
      </section>

      {/* Video Demo */}
      <section id="demo" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">See It In Action</h2>
            <p className="text-gray-400 text-lg">60-second product walkthrough</p>
          </div>
          <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-teal-500/5">
            <video
              controls
              autoPlay
              muted
              loop
              playsInline
              className="w-full aspect-video bg-black"
              poster=""
            >
              <source src="/videos/vodalease-demo.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section id="features" className="py-20 px-6 bg-[#0d1220]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Enterprise Capabilities</h2>
            <p className="text-gray-400 text-lg">Everything you need for IFRS 16 compliance</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {CAPABILITIES.map((cap, i) => (
              <div
                key={i}
                className="p-6 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 hover:border-teal-500/30 transition"
              >
                <h3 className="text-xl font-semibold mb-2">{cap.title}</h3>
                <p className="text-gray-400">{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Reports */}
      <section id="reports" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              AI-Powered Report Engine
            </h2>
            <p className="text-gray-400 text-lg">
              7 enterprise-grade reports generated by Azure OpenAI — audit-ready in seconds
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {FEATURES.map((feat, i) => (
              <div
                key={i}
                className="p-5 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 hover:border-amber-500/30 transition group"
              >
                <div className="text-2xl mb-3">{feat.icon}</div>
                <h3 className="text-base font-semibold mb-1 group-hover:text-amber-400 transition">
                  {feat.title}
                </h3>
                <p className="text-sm text-gray-500">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to simplify your lease accounting?
          </h2>
          <p className="text-gray-400 text-lg mb-10">
            Join enterprise finance teams who trust VodaLease for IFRS 16 compliance.
          </p>
          <button
            onClick={() => navigate("/dashboard")}
            className="px-10 py-4 rounded-xl bg-gradient-to-r from-teal-500 to-blue-600 text-white font-semibold text-lg hover:opacity-90 transition shadow-lg shadow-teal-500/20"
          >
            Get Started Now
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center font-bold text-[10px]">
              VL
            </div>
            <span className="text-sm text-gray-500">VodaLease Enterprise</span>
          </div>
          <p className="text-xs text-gray-600">
            IFRS 16 compliant lease accounting platform. Built for enterprise.
          </p>
        </div>
      </footer>
    </div>
  );
}
