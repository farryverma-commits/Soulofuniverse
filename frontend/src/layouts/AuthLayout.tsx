import React from "react";
// Icon imports removed — all usage conditional-gated

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  title,
  subtitle,
}) => {
  return (
    <div
      data-theme="dark"
      className="min-h-screen w-full relative overflow-hidden text-text"
      style={{
        backgroundImage: 'url("/images/bg.png")',
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Overlay — dense on the left where the form lives, almost invisible on the right
          so the cosmic galaxy of bg.png stays vivid behind the meditative card */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "linear-gradient(to right, rgba(4,4,12,0.88) 0%, rgba(4,4,12,0.65) 46%, rgba(4,4,12,0.08) 100%)",
        }}
      />

      {/* ── Top header ─────────────────────────────────────────────────────── */}
      <header className="relative z-20 w-full px-8 pt-7 pb-3 flex items-center justify-between">
        <span
          className="uppercase select-none"
          style={{
            fontSize: "15px",
            fontWeight: 700,
            letterSpacing: "0.32em",
            background:
              "linear-gradient(90deg, #E8C97A 0%, #F0EDF5 55%, #C9A85C 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            textShadow: "none",
          }}
        >
          Soul of Universe
        </span>
        {/* <div className="flex items-center gap-5 text-white/50">
          <button
            className="hover:text-white/90 transition-colors duration-200"
            aria-label="Language"
          >
            <Globe size={17} />
          </button>
          <button
            className="hover:text-white/90 transition-colors duration-200"
            aria-label="Help"
          >
            <HelpCircle size={17} />
          </button>
          <button
            className="hover:text-white/90 transition-colors duration-200"
            aria-label="More"
          >
            <MoreVertical size={17} />
          </button>
        </div> */}
      </header>

      {/* ── Main area — stretches to fill viewport below header ─────────────── */}
      <div
        className="relative z-10 flex"
        style={{ minHeight: "calc(100vh - 64px)" }}
      >
        {/* LEFT — form column (≈50% width on desktop, full width on mobile) */}
        <div className="w-full lg:w-[50%] flex items-center justify-center lg:justify-start px-8 lg:pl-16 xl:pl-24 lg:pr-0 py-10 animate-fade-in">
          <div className="w-full max-w-[390px]">
            {/* White logo badge */}
            <div className="w-[52px] h-[52px] rounded-[14px] bg-white flex items-center justify-center p-2 mb-9 shadow-xl select-none">
              <img
                src="/images/logo soul of universe.png"
                alt="Soul of Universe"
                className="w-full h-full object-contain"
              />
            </div>

            {/* Page heading */}
            <div className="mb-8">
              <h1 className="text-[28px] font-extrabold text-text tracking-tight leading-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="text-sm text-text-secondary mt-2.5 leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>

            {/* Form slot */}
            {children}
          </div>
        </div>

        {/* RIGHT — meditative card, absolutely anchored to the right half of the viewport.
            The card floats in the cosmic sky: top/bottom/right margins leave bg.png visible
            around the card edges, exactly as in screen.png. */}
        {false && (
          <div
            className="hidden lg:block absolute"
            style={{
              top: "20%",
              bottom: "20%",
              left: "70%",
              right: "10%",
            }}
          >
            <div
              className="relative w-full h-full animate-fade-in stagger-2"
              style={{
                borderRadius: "18px",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow:
                  "0 40px 100px rgba(0,0,0,0.60), 0 0 0 1px rgba(255,255,255,0.04)",
              }}
            >
              <img
                src="/images/meditative-state.png"
                alt="Meditative figure in cosmic space"
                className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
                style={{ objectPosition: "center 15%" }}
              />

              <div
                className="absolute inset-x-0 bottom-0"
                style={{
                  height: "42%",
                  background:
                    "linear-gradient(to top, rgba(2,2,10,0.97) 0%, rgba(2,2,10,0.82) 45%, transparent 100%)",
                }}
              />

              <div className="absolute left-0 right-0 bottom-0 px-7 pb-8 pt-2">
                <p
                  className="text-white/65 text-sm leading-relaxed mb-5"
                  style={{ fontStyle: "italic", fontFamily: "Georgia, serif" }}
                >
                  "A focused space for deep learning, high-impact mentorship,
                  and cosmic exploration."
                </p>
                <div
                  className="flex gap-4"
                  style={{ color: "#D4A853", opacity: 0.75 }}
                >
                  {/* <Sun size={17} />
                <Sparkles size={17} />
                <Orbit size={17} /> */}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
