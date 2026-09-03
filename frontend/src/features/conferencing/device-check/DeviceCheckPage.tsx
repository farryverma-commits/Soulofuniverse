import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DeviceCheckPanel } from "./DeviceCheckPanel";

export const DeviceCheckPage: React.FC = () => {
  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>
        <h1 className="text-2xl font-bold text-text tracking-tight">
          Device check
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Make sure your microphone and camera are ready before joining a live
          session.
        </p>
      </div>

      <div className="card card-glow p-6 max-w-2xl">
        <DeviceCheckPanel mode="page" />
      </div>
    </div>
  );
};
