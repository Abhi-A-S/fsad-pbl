import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Editorial academic login page.
 * Authenticates users and redirects to their originally requested route.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, clearError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clear any existing auth errors when the login page mounts
  useEffect(() => {
    clearError();
  }, [clearError]);

  // Validate form fields on the client
  const validateForm = () => {
    const errors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    clearError();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login({
        email: email.trim(),
        password,
      });

      // Navigate to originally requested route or fallback to dashboard
      const destination = location.state?.from?.pathname || '/';
      navigate(destination, { replace: true });
    } catch (err) {
      setServerError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fbfbf9] text-stone-800 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Masthead */}
        <div className="flex flex-col items-center text-center">
          <div className="h-10 w-10 rounded-lg bg-stone-900 text-stone-100 flex items-center justify-center font-serif text-xl font-semibold shadow-xs mb-3">
            RF
          </div>
          <span className="text-[10px] uppercase font-mono tracking-widest text-stone-500 font-semibold mb-1">
            ResearchForge Platform
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900">
            Sign in to your account
          </h1>
          <p className="text-xs text-stone-500 mt-1.5 max-w-xs">
            Access your curated academic library, collections, and research dossiers.
          </p>
        </div>

        {/* Card Container */}
        <div className="mt-8 bg-white py-8 px-6 sm:px-8 rounded-xl border border-stone-200/90 shadow-xs space-y-6">
          {/* Server Error Alert */}
          {serverError && (
            <div
              className="p-3 bg-red-50 text-red-800 rounded-md text-xs flex items-start gap-2.5 border border-red-200"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1.5"
              >
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                disabled={isSubmitting}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: null }));
                  }
                  if (serverError) setServerError('');
                  clearError();
                }}
                placeholder="researcher@institution.edu"
                className={`w-full px-3.5 py-2 text-sm bg-stone-50 border rounded-md font-sans text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 transition-colors ${
                  fieldErrors.email
                    ? 'border-red-300 focus:ring-red-400 focus:bg-white'
                    : 'border-stone-200 focus:ring-stone-400 focus:bg-white'
                }`}
              />
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-red-600 font-sans">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-mono uppercase text-stone-500 font-semibold"
                >
                  Password
                </label>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) {
                      setFieldErrors((prev) => ({ ...prev, password: null }));
                    }
                    if (serverError) setServerError('');
                    clearError();
                  }}
                  placeholder="••••••••"
                  className={`w-full pl-3.5 pr-10 py-2 text-sm bg-stone-50 border rounded-md font-sans text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 transition-colors ${
                    fieldErrors.password
                      ? 'border-red-300 focus:ring-red-400 focus:bg-white'
                      : 'border-stone-200 focus:ring-stone-400 focus:bg-white'
                  }`}
                />
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-600 focus:outline-none cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-600 font-sans">{fieldErrors.password}</p>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-stone-900 hover:bg-stone-800 text-stone-50 text-xs font-medium rounded-md disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Registration Navigation Link */}
          <div className="pt-4 border-t border-stone-100 text-center text-xs text-stone-500">
            Don&apos;t have an account?{' '}
            <Link
              to="/register"
              state={location.state}
              className="font-medium text-stone-900 underline underline-offset-2 hover:text-stone-700 transition-colors"
            >
              Create an account
            </Link>
          </div>
        </div>

        {/* Academic Note Footer */}
        <p className="mt-6 text-center text-[11px] font-mono text-stone-400">
          ResearchForge Scholarly Discovery Platform • PBL Demo
        </p>
      </div>
    </div>
  );
}
