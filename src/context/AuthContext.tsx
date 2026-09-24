import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured, getAuthRedirectUrl } from '../lib/supabase';
import { Profile, UserRole } from '../types/database';
import { isValidIndianMobile, normalizeIndianPhone } from '../lib/phoneUtils';

export const isCustomerProfileComplete = (profile: Profile | null): boolean => {
  if (!profile) return false;
  if (profile.role !== 'customer') return true;
  const hasName = Boolean(profile.full_name && profile.full_name.trim().length > 0);
  const hasPhone = Boolean(profile.phone && isValidIndianMobile(profile.phone));
  const hasAddress = Boolean(profile.address && profile.address.trim().length > 0);
  return hasName && hasPhone && hasAddress;
};

export interface AuthContextType {
  user: Profile | null;
  role: UserRole | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSupabaseLive: boolean;
  isEmailVerified: boolean;
  isProfileComplete: boolean;
  signInWithGoogle: (redirectPath?: string) => Promise<{ success: boolean; error?: string }>;
  updateCustomerProfile: (data: {
    full_name: string;
    phone: string;
    address: string;
  }) => Promise<{ success: boolean; error?: string }>;
  loginWithEmail: (email: string, password?: string) => Promise<{ success: boolean; error?: string; isEmailUnconfirmed?: boolean }>;
  signUpWithEmail: (email: string, password: string, fullName: string, role?: UserRole, phone?: string, redirectPath?: string) => Promise<{ success: boolean; error?: string; requiresEmailConfirmation?: boolean; message?: string }>;
  resendEmailConfirmation: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPasswordForEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<Profile | null>;
  switchDemoRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Default initial demo user profiles for offline/preview mode
const DEMO_PROFILES: Record<UserRole, Profile> = {
  customer: {
    id: 'c1111111-0000-0000-0000-000000000001',
    role: 'customer',
    full_name: 'Ananya Raman',
    phone: '+91 98765 43210',
    email: 'ananya.customer@example.com',
    address: '14 Cutcherry Street, Kangeyam',
    avatar_url: null,
    preferred_location_id: '11111111-1111-1111-1111-111111111111',
    is_verified: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  shopkeeper: {
    id: 's2222222-0000-0000-0000-000000000002',
    role: 'shopkeeper',
    full_name: 'Murugan Supermarket & Spices',
    phone: '+91 98765 12345',
    email: 'murugan.store@example.com',
    avatar_url: null,
    preferred_location_id: '11111111-1111-1111-1111-111111111111',
    is_verified: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  admin: {
    id: 'a3333333-0000-0000-0000-000000000003',
    role: 'admin',
    full_name: 'Vaango Platform Admin',
    phone: '+91 99999 00000',
    email: 'admin@vaango.in',
    avatar_url: null,
    preferred_location_id: '11111111-1111-1111-1111-111111111111',
    is_verified: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
};

const LOCAL_STORAGE_DEMO_KEY = 'vaango_demo_role';
const LOCAL_STORAGE_DEMO_USER = 'vaango_demo_user';

// Map internal Supabase / network errors into user-friendly Vaango auth messages
export function mapSupabaseAuthError(err: unknown, defaultMessage = 'Unable to verify your email right now. Please try again.'): string {
  if (!err) return defaultMessage;
  const obj = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : {};
  const msg = [
    err instanceof Error ? err.message : '',
    obj.message ? String(obj.message) : '',
    obj.code ? String(obj.code) : '',
    obj.status ? String(obj.status) : '',
    String(err),
  ].join(' ').toLowerCase();

  if (msg.includes('rate') || msg.includes('429') || msg.includes('too many') || msg.includes('over_email_send_rate_limit')) {
    return 'Too many attempts. Please wait and try again.';
  }
  if (
    msg.includes('invalid login credentials') ||
    msg.includes('invalid_credentials') ||
    msg.includes('invalid username or password') ||
    msg.includes('invalid email or password')
  ) {
    return 'Incorrect email or password. Please check your credentials and try again.';
  }
  if (msg.includes('email not confirmed') || msg.includes('not confirmed') || msg.includes('email_not_confirmed')) {
    return 'Your email address has not been verified yet. Please check your inbox or request a new verification email.';
  }
  if (msg.includes('user not found')) {
    return 'No account found with this email address.';
  }
  if (msg.includes('user already registered') || msg.includes('already registered')) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (msg.includes('already') && (msg.includes('confirmed') || msg.includes('verified'))) {
    return 'This email address is already verified. You can sign in.';
  }
  if (msg.includes('expired') || msg.includes('otp_expired')) {
    return 'This verification code has expired. Request a new code.';
  }
  if (msg.includes('otp') || msg.includes('token') || msg.includes('verification code') || msg.includes('pkce') || msg.includes('invalid_grant')) {
    return 'That verification code is invalid or has expired. Request a new code.';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection') || msg.includes('offline')) {
    return 'Unable to connect to the authentication service. Please check your internet connection.';
  }
  return defaultMessage;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      if (isSupabaseConfigured) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user && mounted) {
            // Authoritative email verification status from Supabase Auth
            const isGoogleOAuth = session.user.app_metadata?.provider === 'google' ||
              Boolean(session.user.identities?.some((id: { provider?: string }) => id.provider === 'google'));
            const isEmailConfirmed = Boolean(session.user.email_confirmed_at || session.user.confirmed_at || isGoogleOAuth);

            // Fetch profile
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .maybeSingle();

            if (profile) {
              const profileData = profile as Profile;
              setUser({
                ...profileData,
                phone: profileData.phone ? normalizeIndianPhone(profileData.phone) : (normalizeIndianPhone(session.user.user_metadata?.phone) || null),
                address: profileData.address || null,
                is_verified: isEmailConfirmed,
              });
            } else {
              // Initial customer profile fallback when row does not exist yet.
              // Authoritative role is strictly 'customer' (never derived from client-writable user_metadata).
              setUser({
                id: session.user.id,
                role: 'customer',
                full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Customer',
                phone: normalizeIndianPhone(session.user.user_metadata?.phone) || normalizeIndianPhone(session.user.phone) || null,
                email: session.user.email || null,
                address: null,
                avatar_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null,
                preferred_location_id: null,
                is_verified: isEmailConfirmed,
                created_at: session.user.created_at || new Date().toISOString(),
                updated_at: session.user.created_at || new Date().toISOString(),
              });
            }
          }
        } catch (err) {
          console.error('Error fetching Supabase session:', err);
        }
      } else {
        // Local preview fallback mode
        const savedCustomUser = localStorage.getItem(LOCAL_STORAGE_DEMO_USER);
        if (savedCustomUser) {
          try {
            setUser(JSON.parse(savedCustomUser));
          } catch {
            setUser(DEMO_PROFILES.customer);
          }
        } else {
          const savedDemoRole = localStorage.getItem(LOCAL_STORAGE_DEMO_KEY) as UserRole | null;
          if (savedDemoRole && DEMO_PROFILES[savedDemoRole]) {
            setUser(DEMO_PROFILES[savedDemoRole]);
          } else {
            // Default to Customer for evaluation
            setUser(DEMO_PROFILES.customer);
            localStorage.setItem(LOCAL_STORAGE_DEMO_KEY, 'customer');
          }
        }
      }

      if (mounted) {
        setIsLoading(false);
      }
    }

    initSession();

    // Supabase Auth listener
    if (isSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const isGoogleOAuth = session.user.app_metadata?.provider === 'google' ||
            Boolean(session.user.identities?.some((id: { provider?: string }) => id.provider === 'google'));
          const isEmailConfirmed = Boolean(session.user.email_confirmed_at || session.user.confirmed_at || isGoogleOAuth);

          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile) {
            const profileData = profile as Profile;
            setUser({
              ...profileData,
              phone: profileData.phone ? normalizeIndianPhone(profileData.phone) : (normalizeIndianPhone(session.user.user_metadata?.phone) || null),
              address: profileData.address || null,
              is_verified: isEmailConfirmed,
            });
          } else {
            setUser({
              id: session.user.id,
              role: 'customer',
              full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Customer',
              phone: normalizeIndianPhone(session.user.user_metadata?.phone) || normalizeIndianPhone(session.user.phone) || null,
              email: session.user.email || null,
              address: null,
              avatar_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null,
              preferred_location_id: null,
              is_verified: isEmailConfirmed,
              created_at: session.user.created_at || new Date().toISOString(),
              updated_at: session.user.created_at || new Date().toISOString(),
            });
          }
        } else {
          setUser(null);
        }
      });

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
    };
  }, []);

  // -------------------------------------------------------------
  // REFRESH AUTHENTICATED USER STATE
  // -------------------------------------------------------------
  const refreshUser = useCallback(async (): Promise<Profile | null> => {
    if (!isSupabaseConfigured) return user;
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        return null;
      }
      const authUser = authData.user;
      const isGoogleOAuth = authUser.app_metadata?.provider === 'google' ||
        Boolean(authUser.identities?.some((id: { provider?: string }) => id.provider === 'google'));
      const isEmailConfirmed = Boolean(authUser.email_confirmed_at || authUser.confirmed_at || isGoogleOAuth);

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      let activeProfile: Profile;
      if (profile) {
        activeProfile = {
          ...(profile as Profile),
          phone: (profile as Profile).phone ? normalizeIndianPhone((profile as Profile).phone) : (normalizeIndianPhone(authUser.user_metadata?.phone) || null),
          address: (profile as Profile).address || null,
          is_verified: isEmailConfirmed,
        };
      } else {
        activeProfile = {
          id: authUser.id,
          role: 'customer',
          full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Customer',
          phone: normalizeIndianPhone(authUser.user_metadata?.phone) || normalizeIndianPhone(authUser.phone) || null,
          email: authUser.email || null,
          address: null,
          avatar_url: authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null,
          preferred_location_id: null,
          is_verified: isEmailConfirmed,
          created_at: authUser.created_at || new Date().toISOString(),
          updated_at: authUser.created_at || new Date().toISOString(),
        };
      }
      setUser(activeProfile);
      return activeProfile;
    } catch (err) {
      console.error('Error in refreshUser:', err);
      return user;
    }
  }, [user]);

  // -------------------------------------------------------------
  // EMAIL CONFIRMATION RESEND (Used by Auth Callback)
  // -------------------------------------------------------------
  const resendEmailConfirmation = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return { success: false, error: 'Please enter your email address.' };
    if (!isSupabaseConfigured) return { success: true };

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: cleanEmail,
    });
    return error
      ? { success: false, error: mapSupabaseAuthError(error, 'Unable to send a new verification code.') }
      : { success: true };
  };

  // -------------------------------------------------------------
  // PASSWORD LOGIN (Unified for Customers & Merchants)
  // -------------------------------------------------------------
  const loginWithEmail = async (email: string, password?: string): Promise<{ success: boolean; error?: string; isEmailUnconfirmed?: boolean }> => {
    if (!email || email.trim().length === 0) {
      return { success: false, error: 'Email is required.' };
    }
    if (!password || password.trim().length === 0) {
      return { success: false, error: 'Password is required.' };
    }

    setIsLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) {
          const isUnconfirmed = error.message.toLowerCase().includes('email not confirmed') ||
                                error.message.toLowerCase().includes('not confirmed');
          return {
            success: false,
            error: mapSupabaseAuthError(error, error.message),
            isEmailUnconfirmed: isUnconfirmed,
          };
        }
        const isEmailConfirmed = Boolean(data.user?.email_confirmed_at || data.user?.confirmed_at);
        if (data.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .maybeSingle();

          if (profile) {
            setUser({
              ...(profile as Profile),
              phone: (profile as Profile).phone ? normalizeIndianPhone((profile as Profile).phone) : (normalizeIndianPhone(data.user.user_metadata?.phone) || null),
              is_verified: isEmailConfirmed,
            });
          } else {
            setUser({
              id: data.user.id,
              role: 'customer',
              full_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'Customer',
              phone: normalizeIndianPhone(data.user.user_metadata?.phone) || normalizeIndianPhone(data.user.phone) || null,
              email: data.user.email || null,
              address: null,
              avatar_url: data.user.user_metadata?.avatar_url || null,
              preferred_location_id: null,
              is_verified: isEmailConfirmed,
              created_at: data.user.created_at || new Date().toISOString(),
              updated_at: data.user.created_at || new Date().toISOString(),
            });
          }
        }
        return { success: true };
      } else {
        // Preview mode login for development evaluation
        const matchedRole: UserRole = email.includes('admin')
          ? 'admin'
          : email.includes('shop')
            ? 'shopkeeper'
            : 'customer';
        setUser(DEMO_PROFILES[matchedRole]);
        localStorage.setItem(LOCAL_STORAGE_DEMO_KEY, matchedRole);
        localStorage.removeItem(LOCAL_STORAGE_DEMO_USER);
        return { success: true };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------
  // SIGN UP WITH EMAIL (Unified Customer Registration)
  // -------------------------------------------------------------
  const signUpWithEmail = async (
    email: string,
    password: string,
    fullName: string,
    role: UserRole = 'customer',
    phone?: string,
    redirectPath?: string
  ): Promise<{ success: boolean; error?: string; requiresEmailConfirmation?: boolean; message?: string }> => {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Supabase authentication is not configured.' };
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    let normalizedPhone: string | null = null;

    if (!cleanEmail) {
      return { success: false, error: 'Please enter your email address.' };
    }
    if (!cleanName) {
      return { success: false, error: 'Please enter your full name.' };
    }
    if (!phone || !phone.trim()) {
      return { success: false, error: 'Mobile number is required.' };
    }
    if (!isValidIndianMobile(phone.trim())) {
      return { success: false, error: 'Please enter a valid 10-digit Indian mobile number.' };
    }
    normalizedPhone = normalizeIndianPhone(phone.trim());
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters long.' };
    }

    setIsLoading(true);
    try {
      const emailRedirectTo = getAuthRedirectUrl(redirectPath);
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { full_name: cleanName, role: role || 'customer', phone: normalizedPhone },
          emailRedirectTo,
        },
      });

      if (error) {
        return { success: false, error: mapSupabaseAuthError(error, error.message) };
      }

      // Check if session was returned or if email confirmation is required
      if (data.session && data.user) {
        const isEmailConfirmed = Boolean(data.user.email_confirmed_at || data.user.confirmed_at);
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profile) {
          setUser({
            ...(profile as Profile),
            phone: (profile as Profile).phone ? normalizeIndianPhone((profile as Profile).phone) : normalizedPhone,
            is_verified: isEmailConfirmed,
          });
        } else {
          setUser({
            id: data.user.id,
            role: 'customer',
            full_name: cleanName,
            phone: normalizedPhone,
            email: cleanEmail,
            address: null,
            avatar_url: null,
            preferred_location_id: null,
            is_verified: isEmailConfirmed,
            created_at: data.user.created_at || new Date().toISOString(),
            updated_at: data.user.created_at || new Date().toISOString(),
          });
        }
        return { success: true, requiresEmailConfirmation: false };
      } else {
        // Email confirmation is required by Supabase
        localStorage.setItem('vaangly_pending_confirmation_email', cleanEmail);
        return {
          success: true,
          requiresEmailConfirmation: true,
          message: 'Account created! Please check your email inbox to verify your account before signing in.',
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------
  // PASSWORD RESET & RECOVERY
  // -------------------------------------------------------------
  const resetPasswordForEmail = async (email: string): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseConfigured) return { success: true };
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, error: 'Please enter your email address.' };
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/login?mode=recovery`,
      });
      return error ? { success: false, error: mapSupabaseAuthError(error, error.message) } : { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Password reset failed' };
    }
  };

  const updatePassword = async (password: string): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseConfigured) return { success: true };
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters long.' };
    }
    try {
      const { error } = await supabase.auth.updateUser({ password });
      return error ? { success: false, error: mapSupabaseAuthError(error, error.message) } : { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Password update failed' };
    }
  };

  // -------------------------------------------------------------
  // GOOGLE OAUTH AUTHENTICATION (Customer Primary Auth Flow)
  // -------------------------------------------------------------
  const signInWithGoogle = async (redirectPath?: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      if (!isSupabaseConfigured) {
        return {
          success: false,
          error: 'Supabase authentication is not configured. Please check your environment variables.',
        };
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAuthRedirectUrl(redirectPath),
        },
      });
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google authentication failed';
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------
  // CUSTOMER PROFILE ONBOARDING & UPDATES
  // -------------------------------------------------------------
  const updateCustomerProfile = async (data: {
    full_name: string;
    phone: string;
    address: string;
  }): Promise<{ success: boolean; error?: string }> => {
    const cleanName = data.full_name.trim();
    const cleanPhone = data.phone.trim();
    const cleanAddress = data.address.trim();

    if (!cleanName) {
      return { success: false, error: 'Please enter your full name.' };
    }
    if (!cleanPhone || !isValidIndianMobile(cleanPhone)) {
      return { success: false, error: 'Please enter a valid 10-digit Indian mobile number.' };
    }
    const normalizedPhone = normalizeIndianPhone(cleanPhone)!;

    if (!cleanAddress || cleanAddress.length < 5) {
      return { success: false, error: 'Please enter your full delivery address.' };
    }

    if (!isSupabaseConfigured) {
      return {
        success: false,
        error: 'Supabase database is not configured. Profile cannot be saved.',
      };
    }

    // Derive the authenticated user strictly from the active Supabase Auth session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const authenticatedUserId = sessionData?.session?.user?.id;

    if (sessionError || !authenticatedUserId) {
      return { success: false, error: 'Active authentication session not found. Please sign in again.' };
    }

    setIsLoading(true);
    try {
      // Authoritative update directly on the user's own public.profiles row.
      // Must not report successful persistence if the database update failed.
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: cleanName,
          phone: normalizedPhone,
          address: cleanAddress,
          preferred_location_id: user?.preferred_location_id || '10000000-0000-0000-0000-000000000004',
          updated_at: new Date().toISOString(),
        })
        .eq('id', authenticatedUserId);

      if (profileError) {
        console.error('[Profile] Failed to update public.profiles:', profileError.message);
        let msg = profileError.message || 'Failed to update profile in database.';
        if (msg.includes('Failed to fetch') || msg.includes('network')) {
          msg = 'Unable to connect to database. Please check your internet connection and try again.';
        }
        return {
          success: false,
          error: msg,
        };
      }

      // Also sync user_metadata in Supabase Auth asynchronously
      await supabase.auth.updateUser({
        data: {
          phone: normalizedPhone,
          full_name: cleanName,
        },
      }).catch((err) => {
        // Log non-fatal auth sync error without leaking sensitive phone
        console.warn('[Profile] Auth metadata sync notice:', err?.message);
      });

      // Reload updated authoritative profile directly from database
      const { data: refreshedProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authenticatedUserId)
        .single();

      if (fetchError || !refreshedProfile) {
        return {
          success: false,
          error: fetchError?.message || 'Profile saved, but failed to reload updated record.',
        };
      }

      setUser({
        ...(refreshedProfile as Profile),
        phone: (refreshedProfile as Profile).phone ? normalizeIndianPhone((refreshedProfile as Profile).phone) : normalizedPhone,
        is_verified: Boolean(sessionData?.session?.user?.email_confirmed_at || sessionData?.session?.user?.confirmed_at),
      });

      return { success: true };
    } catch (err: unknown) {
      let message = err instanceof Error ? err.message : 'Failed to update profile';
      if (message.includes('Failed to fetch') || message.includes('network') || message.includes('NetworkError')) {
        message = 'Unable to connect to database. Please check your internet connection and try again.';
      }
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------
  // SIGN OUT
  // -------------------------------------------------------------
  const signOut = async () => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
      setUser(null);
      localStorage.removeItem(LOCAL_STORAGE_DEMO_KEY);
      localStorage.removeItem(LOCAL_STORAGE_DEMO_USER);
      localStorage.removeItem('vaangly_pending_confirmation_email');
    } finally {
      setIsLoading(false);
    }
  };

  // Switch demo persona (evaluation tool for reviewers)
  const switchDemoRole = useCallback((newRole: UserRole) => {
    if (!import.meta.env.DEV) return;
    setUser(DEMO_PROFILES[newRole]);
    localStorage.setItem(LOCAL_STORAGE_DEMO_KEY, newRole);
    localStorage.removeItem(LOCAL_STORAGE_DEMO_USER);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        isLoading,
        isAuthenticated: Boolean(user),
        isSupabaseLive: isSupabaseConfigured,
        isEmailVerified: Boolean(user?.is_verified),
        isProfileComplete: isCustomerProfileComplete(user),
        signInWithGoogle,
        updateCustomerProfile,
        resendEmailConfirmation,
        loginWithEmail,
        signUpWithEmail,
        resetPasswordForEmail,
        updatePassword,
        signOut,
        refreshUser,
        switchDemoRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
