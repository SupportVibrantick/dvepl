import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { authService } from '@/services/auth';
import { toast } from 'react-hot-toast';
import logoImg from '@/assets/logos/image.png';
import bgImg from '@/assets/bg-image/image.png';
import { useERPStore } from '@/store/erpStore';

export function LoginPage() {
  const navigate = useNavigate();
  const markAuthenticated = useAuthStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  // Forgot Password Modal State
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<'email' | 'otp' | 'success'>('email');
  const [fpEmail, setFpEmail] = useState('');
  const [fpOtp, setFpOtp] = useState('');
  const [fpNewPass, setFpNewPass] = useState('');
  const [fpConfirmPass, setFpConfirmPass] = useState('');
  const [fpMsg, setFpMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [isFpLoading, setIsFpLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await authService.login(email, password);

      const userObj = {
        id: response.user.id,
        name: response.user.name,
        email: response.user.email,
        companyId: "",
        isEmailVerified: true,
        isPhoneVerified: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        role: response.user.roles?.[0] || "",
        designation: response.user.designation || "Team Member",
        pageAccess: response.user.pageAccess || [],
        actionPermissions: response.user.actionPermissions || { create: true, edit: true, delete: false, export: true },
        roles: (response.user.roles || []).map((rName: string) => ({
          id: rName,
          name: rName
        }))
      };

      const currentUsers = useERPStore.getState().users;
      const updatedUsers = currentUsers.some(u => u.id === userObj.id)
        ? currentUsers.map(u => u.id === userObj.id ? { ...u, ...userObj } : u)
        : [...currentUsers, userObj];

      useERPStore.setState({ users: updatedUsers as any });
      useERPStore.getState().setCurrentUser(response.user.id, response.user.name);

      markAuthenticated();
      setIsLoading(false);
      navigate('/', { replace: true });
      console.log(useERPStore.getState());
    } catch (error: any) {
      setIsLoading(false);
      toast.error(error.response?.data?.message ?? 'Unable to sign in. Please check your credentials.');
    }
  };

  const handleSendOtp = async () => {
    if (!fpEmail.trim()) {
      setFpMsg({ text: 'Please enter a valid email address.', isError: true });
      return;
    }
    setIsFpLoading(true);
    setFpMsg(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setForgotStep('otp');
      setFpMsg(null);
    } catch (err: any) {
      setFpMsg({ text: err.response?.data?.message || 'Failed to send reset code.', isError: true });
    } finally {
      setIsFpLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!fpOtp || fpOtp.length < 6) {
      setFpMsg({ text: 'Please enter a valid 6-digit code.', isError: true });
      return;
    }
    if (!fpNewPass || fpNewPass.length < 6) {
      setFpMsg({ text: 'New password must be at least 6 characters.', isError: true });
      return;
    }
    if (fpNewPass !== fpConfirmPass) {
      setFpMsg({ text: 'Passwords do not match.', isError: true });
      return;
    }
    setIsFpLoading(true);
    setFpMsg(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setForgotStep('success');
      setFpMsg(null);
    } catch (err: any) {
      setFpMsg({ text: err.response?.data?.message || 'Failed to reset password.', isError: true });
    } finally {
      setIsFpLoading(false);
    }
  };

  const closeForgotModal = () => {
    setIsForgotOpen(false);
    setForgotStep('email');
    setFpEmail('');
    setFpOtp('');
    setFpNewPass('');
    setFpConfirmPass('');
    setFpMsg(null);
  };

  return (
    <div className="min-h-screen w-screen flex flex-col lg:flex-row bg-[#F8FAFC] text-slate-900 font-sans overflow-x-hidden">
      {/* LEFT PANEL - CLEAN LIGHT CORPORATE SLATE WITH ASSET BACKGROUND */}
      <div className="relative w-full lg:w-[60%] min-h-[480px] lg:min-h-screen flex flex-col justify-between p-8 lg:p-14 overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-200/80 bg-slate-100 text-slate-900">
        {/* Background Image Asset */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bgImg})` }}
        />
        {/* Dark Overlay */}
        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-[2px]" />

        {/* Ambient Glows */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Logo Header */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="DVEPL Logo" className="h-24 w-auto object-contain px-3 py-1.5 rounded-xl shadow-xs" />
          </div>
        </div>

        {/* Bottom Content Group (Hero Text + Feature Cards + Footer) */}
        <div className="relative z-10 mt-auto pt-12 space-y-8">
          {/* Hero Text */}
          <div className="space-y-4 max-w-2xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
              <span className="text-white">Powering Industrial</span>
              <br />
              <span className="text-emerald-400">Excellence</span>
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-xl">
              Secure access to DVEPL Workspace for order management, production tracking, inventory monitoring and enterprise operations.
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/60 p-5 rounded-2xl space-y-3 shadow-sm hover:border-emerald-500/50 hover:shadow-md transition-all">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl w-fit">
                <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white">Real-Time Order Tracking</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">Live status updates across entire supply chains.</p>
            </div>

            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/60 p-5 rounded-2xl space-y-3 shadow-sm hover:border-emerald-500/50 hover:shadow-md transition-all">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl w-fit">
                <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M7 16l3-4 3 3 3-5 2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white">Production Monitoring</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">Granular analytics for factory output efficiency.</p>
            </div>

            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/60 p-5 rounded-2xl space-y-3 shadow-sm hover:border-emerald-500/50 hover:shadow-md transition-all">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl w-fit">
                <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                  <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="12" cy="16" r="1.2" fill="currentColor" />
                </svg>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white">Secure Enterprise Access</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">Encrypted multi-factor authentication protocols.</p>
            </div>
          </div>

          {/* Footer Text */}
          <div className="pt-2 text-[11px] text-slate-400 flex flex-wrap gap-4 items-center">
            <span>&copy; {new Date().getFullYear()} DVEPL. All rights reserved.</span>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full lg:w-[40%] flex items-center justify-center p-6 sm:p-12 bg-slate-50">
        <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-10 shadow-xl shadow-slate-200/60 space-y-6">
          {/* Shield Icon */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-50 border border-emerald-200/60 rounded-2xl flex items-center justify-center shadow-xs">
              <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7">
                <path d="M12 2l8 3v5c0 5-4 9-8 10C8 19 4 15 4 10V5l8-3Z" fill="#22C55E" stroke="#16a34a" strokeWidth="1" />
                <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">DVEPL CRM</h2>
              <p className="text-xs text-slate-500 mt-1">Sign in to continue</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-5" autoComplete="off">
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-semibold text-slate-700 block">
                Email Address
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-slate-400">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                    <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M2 8l10 7 10-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  required
                  className="w-full h-11 pl-10 pr-4 bg-slate-50/50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-semibold text-slate-700 block">
                Password
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-slate-400">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                    <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  type={isPasswordVisible ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  className="w-full h-11 pl-10 pr-10 bg-slate-50/50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible((v) => !v)}
                  className="absolute right-3 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label="Toggle password visibility"
                >
                  {isPasswordVisible ? (
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                      <path
                        d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a18.9 18.9 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M3 3l18 18"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                      <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12Z" stroke="currentColor" strokeWidth="1.8" />
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Remember Me</span>
              </label>
              <button
                type="button"
                onClick={() => setIsForgotOpen(true)}
                className="text-emerald-600 hover:text-emerald-700 font-semibold transition-colors"
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all disabled:opacity-50"
            >
              {isLoading ? (
                'Authenticating...'
              ) : (
                <>
                  <span>Sign In</span>
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className="h-px bg-slate-200 w-full" />

          <p className="text-center text-xs text-slate-500">
            Need access?{' '}
            <a href="#" className="text-emerald-600 hover:underline font-semibold">
              Contact your administrator.
            </a>
          </p>

          <div className="pt-2 text-center space-y-2">
            <p className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">Industrial Standard Compliance</p>
            <div className="flex items-center justify-center flex-wrap gap-2 text-[10px] text-slate-600 font-semibold">
              <span className="px-2 py-0.5 bg-slate-100 rounded border border-slate-200">ISO 9001</span>
              <span className="px-2 py-0.5 bg-slate-100 rounded border border-slate-200">CE</span>
              <span className="px-2 py-0.5 bg-slate-100 rounded border border-slate-200">NABL</span>
              <span className="px-2 py-0.5 bg-slate-100 rounded border border-slate-200">&copy; DVEPL.com</span>
            </div>
          </div>
        </div>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      {isForgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <button
              type="button"
              onClick={closeForgotModal}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            {/* STEP 1: Email */}
            {forgotStep === 'email' && (
              <div className="space-y-4">
                <div className="w-12 h-12 bg-emerald-50 border border-emerald-200/60 rounded-2xl flex items-center justify-center text-emerald-600">
                  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                    <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M2 8l10 7 10-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Reset your password</h3>
                  <p className="text-xs text-slate-500 mt-1">Enter your registered email and we'll send you a 6-digit code.</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="fp-email" className="text-xs font-semibold text-slate-700 block">
                    Email Address
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-slate-400">
                      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                        <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M2 8l10 7 10-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </span>
                    <input
                      type="email"
                      id="fp-email"
                      value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)}
                      placeholder="name@dvepl.com"
                      className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {fpMsg && <p className={`text-xs ${fpMsg.isError ? 'text-rose-600' : 'text-emerald-600'}`}>{fpMsg.text}</p>}

                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={isFpLoading}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-all disabled:opacity-50"
                >
                  {isFpLoading ? 'Sending...' : 'Send Reset Code'}
                </button>
              </div>
            )}

            {/* STEP 2: OTP + Pass */}
            {forgotStep === 'otp' && (
              <div className="space-y-4">
                <div className="w-12 h-12 bg-emerald-50 border border-emerald-200/60 rounded-2xl flex items-center justify-center text-emerald-600">
                  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                    <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Enter the code</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    We sent a 6-digit code to <strong className="text-slate-900">{fpEmail}</strong>. It expires in 10 minutes.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">6-Digit Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={fpOtp}
                    onChange={(e) => setFpOtp(e.target.value)}
                    placeholder="000000"
                    className="w-full h-11 text-center font-mono tracking-widest text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">New Password</label>
                  <input
                    type="password"
                    value={fpNewPass}
                    onChange={(e) => setFpNewPass(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full h-11 px-4 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">Confirm New Password</label>
                  <input
                    type="password"
                    value={fpConfirmPass}
                    onChange={(e) => setFpConfirmPass(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full h-11 px-4 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {fpMsg && <p className={`text-xs ${fpMsg.isError ? 'text-rose-600' : 'text-emerald-600'}`}>{fpMsg.text}</p>}

                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={isFpLoading}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-all disabled:opacity-50"
                >
                  {isFpLoading ? 'Resetting...' : 'Reset Password'}
                </button>

                <button
                  type="button"
                  onClick={handleSendOtp}
                  className="w-full text-center text-xs text-slate-500 hover:text-emerald-600 transition-colors"
                >
                  Didn't get a code? <span className="font-semibold text-emerald-600 underline">Resend</span>
                </button>
              </div>
            )}

            {/* STEP 3: Success */}
            {forgotStep === 'success' && (
              <div className="space-y-4 text-center">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Password reset!</h3>
                  <p className="text-xs text-slate-500 mt-1">Your password has been updated. You can now sign in with your new password.</p>
                </div>
                <button
                  type="button"
                  onClick={closeForgotModal}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-all"
                >
                  Back to Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default LoginPage;
