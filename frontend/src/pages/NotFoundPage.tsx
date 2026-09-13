import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Compass, Home } from "lucide-react";

export const NotFoundPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16 animate-fade-in">
      <div className="w-full max-w-[480px] flex flex-col items-center">
        <div className="w-14 h-14 mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Compass className="w-7 h-7 text-primary" />
        </div>

        <p className="text-[64px] leading-none font-extrabold tracking-tight text-primary mb-4">
          404
        </p>

        <h1 className="text-[26px] font-extrabold text-text tracking-tight leading-tight mb-3">
          Lost among the stars?
        </h1>

        <p className="text-sm text-text-secondary leading-relaxed mb-6">
          This corner of the cosmos doesn't exist. The page you are seeking has
          drifted out of orbit or was never charted.
        </p>

        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-8 max-w-full">
          <span className="text-primary text-sm font-medium truncate">
            {location.pathname}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary flex-1 flex items-center justify-center gap-2 min-h-[44px]"
          >
            <ArrowLeft size={16} />
            <span>Go back</span>
          </button>
          <Link
            to="/"
            className="btn-primary flex-1 flex items-center justify-center gap-2 min-h-[44px]"
          >
            <Home size={16} />
            <span>Return to dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
