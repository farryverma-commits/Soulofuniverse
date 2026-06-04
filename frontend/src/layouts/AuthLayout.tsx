import React from "react";
import { CosmicBrandPanel } from "../components/CosmicBrandPanel";

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
    <div className="min-h-screen flex bg-canvas">
      {/* Form side */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-16 lg:px-12 bg-canvas">
        <div className="w-full max-w-[380px]">
          {/* Top: small inline logo for brand recall */}
          <div className="flex items-center gap-2.5 mb-14">
            <img
              src="/images/logo soul of universe.png"
              alt=""
              className="w-7 h-7 rounded-lg object-contain opacity-80"
            />
            <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-text-muted">
              Soul of Universe
            </span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-[26px] font-extrabold text-text tracking-tight leading-tight">
              {title}
            </h1>
            <p className="text-sm text-text-secondary mt-2 leading-relaxed">
              {subtitle}
            </p>
          </div>

          {/* Form slot */}
          {children}
        </div>
      </div>

      {/* Brand panel */}
      <CosmicBrandPanel />
    </div>
  );
};
