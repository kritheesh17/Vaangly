import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Profile, UserRole } from '../types/database';

export interface EmailOtpMetadata {
  fullName?: string;
  role?: UserRole;
  phone?: string;
}

export interface AuthContextType {
  user: Profile | null;
  role: UserRole | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSupabaseLive: boolean;
  isEmailVerified: boolean;
  requestEmailOtp: (
    email: string,
    metadata?: EmailOtpMetadata
  ) => Promise<{ success: boolean; error?: string; message?: string }>;
  verifyEmailOtp: (
    email: string,
    token: string
  ) => Promise<{ success: boolean; error?: string; user?: Profile }>;
  loginWithEmail: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  signUpWithEmail: (email: string, fullName: string, role?: UserRole, phone?: string) => Promise<{ success: boolean; error?: string }>;
  requestPhoneOtp: (phone: string) => Promise<{ success: boolean; error?: string }>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
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
  if (msg.includes('expired') || msg.includes('otp_expired')) {
    return 'This verification code has expired. Request a new code.';
  }
  if (msg.includes('invalid') || msg.includes('token') || msg.includes('incorrect') || msg.includes('invalid_grant')) {
    return 'That code is incorrect or has expired.';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection') || msg.includes('offline')) {
    return 'Unable to verify your email right now. Please try again.';
  }
  return defaultMessage;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // In-memory simulator cache for local preview mode
  const [demoPendingOtp, setDemoPendingOtp] = useState<{
    email: string;
    code: string;
    metadata?: EmailOtpMetadata;
    expiresAt: number;
  } | null>(null);
  const [demoPendingPhone, setDemoPendingPhone] = useState<string | null>(null);

  // Initialize session
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      if (isSupabaseConfigured) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user && mounted) {
            // Authoritative email verification status from Supabase Auth
            const isEmailConfirmed = Boolean(session.user.email_confirmed_at || session.user.confirmed_at);

            // Fetch profile
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profile) {
              setUser({
                ...(profile as Profile),
                // Ensure authoritative email verification from Supabase Auth
                is_verified: isEmailConfirmed,
              });
            } else {
              // Fallback basic profile from auth user metadata
              setUser({
                id: session.user.id,
                role: (session.user.user_metadata?.role as UserRole) || 'customer',
                full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
                phone: session.user.phone || null,
                email: session.user.email || null,
                avatar_url: null,
                preferred_location_id: null,
                is_verified: isEmailConfirmed,
                created_at: session.user.created_at,
                updated_at: session.user.created_at,
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
          const isEmailConfirmed = Boolean(session.user.email_confirmed_at || session.user.confirmed_at);

          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile) {
            setUser({
              ...(profile as Profile),
              is_verified: isEmailConfirmed,
            });
          } else {
            setUser({
              id: session.user.id,
              role: (session.user.user_metadata?.role as UserRole) || 'customer',
              full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
              phone: session.user.phone || null,
              email: session.user.email || null,
              avatar_url: null,
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
  // EMAIL OTP REQUEST
  // -------------------------------------------------------------
  const requestEmailOtp = async (
    email: string,
    metadata?: EmailOtpMetadata
  ): Promise<{ success: boolean; error?: string; message?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.auth.signInWithOtp({
          email: cleanEmail,
          options: {
            shouldCreateUser: true,
            data: metadata
              ? { full_name: metadata.fullName, role: metadata.role, phone: metadata.phone }
              : undefined,
          },
        });

        if (error) {
          console.error('[OTP] signInWithOtp error:', error.message, error);
          return { success: false, error: error.message || 'Failed to send verification code.' };
        }

        console.log('[OTP] signInWithOtp succeeded - Supabase accepted the request.');

        return { success: true, message: 'Verification code sent to your email.' };
      } catch (err) {
        return { success: false, error: mapSupabaseAuthError(err, 'Unable to verify your email right now. Please try again.') };
      }
    } else {
      // Local preview / evaluation mode:
      // Generate a demo 6-digit OTP code valid for 10 minutes
      const demoCode = '123456';
      setDemoPendingOtp({
        email: cleanEmail,
        code: demoCode,
        metadata,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      console.info(
        `[Vaango Preview Auth] Verification code for ${cleanEmail}: ${demoCode} (Valid in local architecture mode)`
      );

      return {
        success: true,
        message: 'Verification code sent to your email.',
      };
    }
  };

  // -------------------------------------------------------------
  // EMAIL OTP VERIFY
  // -------------------------------------------------------------
  const verifyEmailOtp = async (
    email: string,
    token: string
  ): Promise<{ success: boolean; error?: string; user?: Profile }> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim();

    if (!cleanToken || cleanToken.length !== 6) {
      return { success: false, error: 'That code is incorrect or has expired.' };
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: cleanToken,
          type: 'email',
        });

        if (error || !data.session?.user) {
          return {
            success: false,
            error: mapSupabaseAuthError(error, 'That code is incorrect or has expired.'),
          };
        }

        const authUser = data.session.user;
        const isEmailConfirmed = Boolean(authUser.email_confirmed_at || authUser.confirmed_at);

        // Fetch or create profile
        let userProfile: Profile | null = null;
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (profile) {
          userProfile = {
            ...(profile as Profile),
            is_verified: isEmailConfirmed,
          };
        } else {
          // Construct and persist profile
          const rawMetaRole = authUser.user_metadata?.role as string | undefined;
          const metaRole: UserRole = ['customer', 'shopkeeper'].includes(rawMetaRole ?? '')
            ? (rawMetaRole as UserRole)
            : 'customer';
          const metaName = authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User';

          userProfile = {
            id: authUser.id,
            role: metaRole,
            full_name: metaName,
            phone: authUser.phone || (authUser.user_metadata?.phone as string | undefined) || null,
            email: authUser.email || cleanEmail,
            avatar_url: null,
            preferred_location_id: null,
            is_verified: isEmailConfirmed,
            created_at: authUser.created_at || new Date().toISOString(),
            updated_at: authUser.created_at || new Date().toISOString(),
          };

          // Attempt safe profile creation
          try {
            await supabase.from('profiles').insert([
              {
                id: userProfile.id,
                role: userProfile.role,
                full_name: userProfile.full_name,
                email: userProfile.email,
                phone: authUser.phone || (authUser.user_metadata?.phone as string | undefined) || null,
                is_verified: isEmailConfirmed,
              },
            ]);
          } catch (insertErr) {
            console.warn('Could not insert profile row (handled gracefully):', insertErr);
          }
        }

        setUser(userProfile);
        return { success: true, user: userProfile };
      } catch (err) {
        return {
          success: false,
          error: mapSupabaseAuthError(err, 'Unable to verify your email right now. Please try again.'),
        };
      }
    } else {
      // Local preview / evaluation mode:
      if (!demoPendingOtp || demoPendingOtp.email !== cleanEmail) {
        // Allow universal 123456 code in preview mode
        if (cleanToken !== '123456') {
          return { success: false, error: 'That code is incorrect or has expired.' };
        }
      } else {
        if (Date.now() > demoPendingOtp.expiresAt) {
          return { success: false, error: 'This verification code has expired. Request a new code.' };
        }
        if (cleanToken !== demoPendingOtp.code && cleanToken !== '123456') {
          return { success: false, error: 'That code is incorrect or has expired.' };
        }
      }

      // Determine persona
      const metadata = demoPendingOtp?.metadata;
      let matchedRole: UserRole = metadata?.role || 'customer';
      if (!metadata?.role) {
        if (cleanEmail.includes('admin')) {
          matchedRole = 'admin';
        } else if (cleanEmail.includes('shop') || cleanEmail.includes('store')) {
          matchedRole = 'shopkeeper';
        }
      }

      const verifiedProfile: Profile = {
        id: `demo-usr-${Date.now()}`,
        role: matchedRole,
        full_name: metadata?.fullName || (cleanEmail.split('@')[0].replace('.', ' ').replace(/^./, (s) => s.toUpperCase())),
        email: cleanEmail,
        phone: null,
        avatar_url: null,
        preferred_location_id: '11111111-1111-1111-1111-111111111111',
        is_verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setUser(verifiedProfile);
      localStorage.setItem(LOCAL_STORAGE_DEMO_KEY, matchedRole);
      localStorage.setItem(LOCAL_STORAGE_DEMO_USER, JSON.stringify(verifiedProfile));
      setDemoPendingOtp(null);

      return { success: true, user: verifiedProfile };
    }
  };

  // -------------------------------------------------------------
  // PASSWORD LOGIN (Retained for Administrator / Staff Accounts)
  // -------------------------------------------------------------
  const loginWithEmail = async (email: string, password?: string) => {
    if (!password || password.trim().length === 0) {
      return { success: false, error: 'Password is required for staff login.' };
    }

    setIsLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          return { success: false, error: error.message };
        }
        const isEmailConfirmed = Boolean(data.user?.email_confirmed_at || data.user?.confirmed_at);
        if (data.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

          if (profile) {
            setUser({
              ...(profile as Profile),
              is_verified: isEmailConfirmed,
            });
          }
        }
        return { success: true };
      } else {
        // Preview mode login
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
  // SIGN UP WITH EMAIL (Directly hooks to OTP verification flow)
  // -------------------------------------------------------------
  const signUpWithEmail = async (
    email: string,
    fullName: string,
    role: UserRole = 'customer',
    phone?: string
  ) => {
    return requestEmailOtp(email, { fullName, role, phone });
  };

  // -------------------------------------------------------------
  // PHONE OTP (Preserves isolated hook architecture)
  // -------------------------------------------------------------
  const requestPhoneOtp = async (phone: string) => {
    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      return { success: false, error: 'Please enter a valid phone number.' };
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.signInWithOtp({ phone: cleanPhone });
      if (error) return { success: false, error: error.message };
      return { success: true };
    }

    setDemoPendingPhone(cleanPhone);
    console.info(`[Vaango Preview Auth] Verification code for ${cleanPhone}: 123456`);
    return { success: true };
  };

  const verifyPhoneOtp = async (phone: string, token: string) => {
    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.verifyOtp({ phone: phone.trim(), token: token.trim(), type: 'sms' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    }

    if (demoPendingPhone !== phone.trim() || token.trim() !== '123456') {
      return { success: false, error: 'That code is incorrect or has expired.' };
    }

    const verifiedProfile: Profile = {
      ...DEMO_PROFILES.customer,
      id: `demo-phone-${Date.now()}`,
      phone: phone.trim(),
      email: null,
      is_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setUser(verifiedProfile);
    setDemoPendingPhone(null);
    localStorage.setItem(LOCAL_STORAGE_DEMO_KEY, 'customer');
    localStorage.setItem(LOCAL_STORAGE_DEMO_USER, JSON.stringify(verifiedProfile));
    return { success: true };
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
        requestEmailOtp,
        verifyEmailOtp,
        loginWithEmail,
        signUpWithEmail,
        requestPhoneOtp,
        verifyPhoneOtp,
        signOut,
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
