import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../layouts/AuthLayout";
import { supabase } from "../../services/supabaseClient";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Calendar,
  Sparkles,
} from "lucide-react";
import { OrbitalLoader } from "../../components/OrbitalLoader";

export const RegisterPage: React.FC = () => {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const role: "student" = "student";
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          dob: dob,
          role: role,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate("/login?registered=true");
    }
  };

  return (
    <AuthLayout title="Begin your journey" subtitle="Join the cosmos.">
      <form onSubmit={handleRegister} className="space-y-5">
        {/* Role badge */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-accent/5 border border-accent/10 rounded-xl">
          <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
            <User className="w-3.5 h-3.5 text-accent" />
          </div>
          <p className="text-xs text-text-secondary">
            Registering as a{" "}
            <span className="font-semibold text-text">Seeker</span>
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="register-name"
            className="text-xs font-semibold text-text-secondary tracking-wide"
          >
            Full name
          </label>
          <div className="relative group">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors duration-200" />
            <input
              id="register-name"
              type="text"
              required
              className="input pl-11"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="register-dob"
            className="text-xs font-semibold text-text-secondary tracking-wide"
          >
            Date of birth
          </label>
          <div className="relative group">
            <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors duration-200" />
            <input
              id="register-dob"
              type="date"
              required
              className="input pl-11"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="register-email"
            className="text-xs font-semibold text-text-secondary tracking-wide"
          >
            Email address
          </label>
          <div className="relative group">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors duration-200" />
            <input
              id="register-email"
              type="email"
              required
              className="input pl-11"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="register-password"
            className="text-xs font-semibold text-text-secondary tracking-wide"
          >
            Password
          </label>
          <div className="relative group">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors duration-200" />
            <input
              id="register-password"
              type={showPassword ? "text" : "password"}
              required
              className="input pl-11 pr-11"
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-text-muted hover:text-text-secondary transition-colors rounded-lg hover:bg-surface"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-error/8 text-error px-4 py-3 rounded-xl text-sm font-medium border border-error/10 animate-fade-in">
            {error}
          </div>
        )}

        <button disabled={loading} className="btn-primary w-full py-3 mt-2 text-sm">
          {loading ? (
            <OrbitalLoader variant="button" />
          ) : (
            <>
              <Sparkles size={15} /> Create account
            </>
          )}
        </button>

        <p className="text-center text-sm text-text-secondary pt-3">
          Already part of the cosmos?{" "}
          <Link
            to="/login"
            className="text-primary font-semibold hover:text-primary-hover transition-colors"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};
