import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, ScrollView, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import theme from '../lib/theme'
import { useAuthActions } from '../hooks/useAuth'

type AuthMode = 'signin' | 'signup'

export default function AuthScreen() {
  const { signInWithPassword, signUpWithPassword, resetPasswordForEmail, resendSignupEmail } = useAuthActions()

  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false)
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('')
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false)
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false)

  // Track the email used for signup so we can resend verification
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null)
  const [resendLoading, setResendLoading] = useState(false)

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length >= 6
  }, [email, password.length])

  const handlePrimary = async () => {
    setError(null)
    setSuccessMessage(null)

    const cleanedEmail = email.trim().toLowerCase()
    if (!cleanedEmail) return

    setLoading(true)
    try {
      if (mode === 'signin') {
        await signInWithPassword(cleanedEmail, password)
      } else {
        const result = await signUpWithPassword(cleanedEmail, password)
        if (result?.needsEmailVerification) {
          setPendingVerificationEmail(cleanedEmail)
          setSuccessMessage(`We sent a confirmation link to ${cleanedEmail}. Check your inbox (and spam folder), then come back and sign in.`)
          setMode('signin')
          return
        }
        // If no verification needed, onAuthStateChange handles navigation
      }
    } catch (e: any) {
      console.warn('Auth error:', e)

      let errorMessage = e?.message || `${mode === 'signin' ? 'Sign in' : 'Sign up'} failed`

      if (mode === 'signup') {
        if (errorMessage.includes('already registered') || errorMessage.includes('already exists') || errorMessage.includes('User already registered')) {
          errorMessage = `An account with ${cleanedEmail} already exists. Try signing in instead.`
        } else if (errorMessage.includes('Password should be')) {
          errorMessage = 'Password must be at least 6 characters.'
        } else if (errorMessage.includes('invalid email') || errorMessage.includes('Invalid email')) {
          errorMessage = 'Please enter a valid email address.'
        }
      } else {
        // Sign in errors — check specific cases BEFORE generic
        if (errorMessage.includes('Email not confirmed')) {
          setPendingVerificationEmail(cleanedEmail)
          errorMessage = 'Please verify your email before signing in. Check your inbox for a confirmation link.'
        } else if (errorMessage.includes('Invalid login credentials') || errorMessage.includes('invalid')) {
          errorMessage = 'Invalid email or password. Please check your credentials and try again.'
        } else if (errorMessage.includes('User not found')) {
          errorMessage = `No account found for ${cleanedEmail}. Try creating an account instead.`
        }
      }

      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    if (!pendingVerificationEmail) return
    setResendLoading(true)
    try {
      await resendSignupEmail(pendingVerificationEmail)
      Alert.alert('Email sent', `We resent the confirmation link to ${pendingVerificationEmail}. Check your inbox.`)
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not resend confirmation email. Please try again later.')
    } finally {
      setResendLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    const cleanedEmail = forgotPasswordEmail.trim().toLowerCase()
    if (!cleanedEmail) return

    setForgotPasswordLoading(true)
    try {
      await resetPasswordForEmail(cleanedEmail)
      setForgotPasswordSuccess(true)
    } catch (e: any) {
      setError(e?.message || 'Failed to send reset email')
    } finally {
      setForgotPasswordLoading(false)
    }
  }

  const switchMode = () => {
    setError(null)
    setSuccessMessage(null)
    setMode(mode === 'signin' ? 'signup' : 'signin')
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            <Text style={styles.title}>{mode === 'signin' ? 'Welcome Back' : 'Create Account'}</Text>
            <Text style={styles.subtitle}>
              {mode === 'signin'
                ? 'Sign in to sync your moves across devices.'
                : 'Create your account to save and sync your moves.'}
            </Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@domain.com"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="next"
              style={styles.input}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              secureTextEntry
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              autoComplete={mode === 'signup' ? 'password-new' : 'password'}
              returnKeyType="done"
              onSubmitEditing={canSubmit ? handlePrimary : undefined}
              style={styles.input}
            />

            {mode === 'signin' && (
              <Pressable onPress={() => { setForgotPasswordVisible(true); setForgotPasswordEmail(email) }} hitSlop={10}>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </Pressable>
            )}

            {!!successMessage && (
              <View style={styles.successBanner}>
                <Text style={styles.successBannerText}>{successMessage}</Text>
                {pendingVerificationEmail && (
                  <Pressable onPress={handleResendVerification} disabled={resendLoading} style={styles.resendButton}>
                    {resendLoading ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                      <Text style={styles.resendText}>Resend confirmation email</Text>
                    )}
                  </Pressable>
                )}
              </View>
            )}

            {!!error && (
              <View>
                <Text style={styles.error}>{error}</Text>
                {pendingVerificationEmail && !successMessage && (
                  <Pressable onPress={handleResendVerification} disabled={resendLoading} style={styles.resendButton}>
                    {resendLoading ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                      <Text style={styles.resendText}>Resend confirmation email</Text>
                    )}
                  </Pressable>
                )}
              </View>
            )}

            <Pressable
              onPress={handlePrimary}
              disabled={!canSubmit || loading}
              style={[styles.primaryButton, (!canSubmit || loading) && { opacity: 0.6 }]}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </Pressable>

            <Pressable onPress={switchMode} style={styles.switchModeButton}>
              <Text style={styles.switchModeText}>
                {mode === 'signin'
                  ? "Don't have an account? Create one"
                  : 'Already have an account? Sign in'}
              </Text>
            </Pressable>

            <Text style={styles.footer}>
              By continuing you agree to basic app usage. (We keep it simple.)
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot Password Modal */}
      <Modal visible={forgotPasswordVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            {!forgotPasswordSuccess ? (
              <>
                <Text style={styles.modalSubtitle}>
                  Enter your email and we'll send you a link to reset your password.
                </Text>
                <TextInput
                  value={forgotPasswordEmail}
                  onChangeText={setForgotPasswordEmail}
                  placeholder="you@domain.com"
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                />
                <Pressable
                  onPress={handleForgotPassword}
                  disabled={!forgotPasswordEmail.trim() || forgotPasswordLoading}
                  style={[styles.primaryButton, (!forgotPasswordEmail.trim() || forgotPasswordLoading) && { opacity: 0.6 }]}
                >
                  {forgotPasswordLoading ? (
                    <ActivityIndicator color={theme.colors.onPrimary} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Send Reset Link</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.successMessageText}>
                  Check your email! We sent a password reset link to {forgotPasswordEmail}
                </Text>
                <Pressable
                  onPress={() => {
                    setForgotPasswordVisible(false)
                    setForgotPasswordSuccess(false)
                    setForgotPasswordEmail('')
                  }}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>Done</Text>
                </Pressable>
              </>
            )}
            <Pressable
              onPress={() => {
                setForgotPasswordVisible(false)
                setForgotPasswordSuccess(false)
                setForgotPasswordEmail('')
              }}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { flexGrow: 1 },
  container: {
    flex: 1,
    padding: theme.spacing.lg,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    color: theme.colors.text,
    ...theme.fonts.heading,
  },
  subtitle: {
    marginTop: 8,
    color: theme.colors.muted,
    lineHeight: 20,
    ...theme.fonts.body,
  },
  label: {
    marginTop: 16,
    color: theme.colors.text,
    ...theme.fonts.headingSemiBold,
    fontSize: 14,
  },
  input: {
    marginTop: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: theme.radii.md,
    padding: 14,
    color: theme.colors.text,
    fontSize: 16,
    ...theme.fonts.body,
  },
  forgotLink: {
    marginTop: 10,
    color: theme.colors.primary,
    fontSize: 14,
    ...theme.fonts.bodySemiBold,
  },
  error: {
    marginTop: 12,
    color: theme.colors.error,
    ...theme.fonts.bodySemiBold,
    lineHeight: 20,
  },
  successBanner: {
    marginTop: 16,
    backgroundColor: '#E8F5E9',
    padding: 14,
    borderRadius: theme.radii.md,
  },
  successBannerText: {
    color: '#2E7D32',
    ...theme.fonts.bodySemiBold,
    lineHeight: 20,
  },
  resendButton: {
    marginTop: 10,
    paddingVertical: 6,
  },
  resendText: {
    color: theme.colors.primary,
    ...theme.fonts.bodySemiBold,
    fontSize: 14,
  },
  primaryButton: {
    marginTop: 20,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: theme.colors.onPrimary,
    fontSize: 16,
    ...theme.fonts.headingSemiBold,
  },
  switchModeButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchModeText: {
    color: theme.colors.primary,
    fontSize: 14,
    ...theme.fonts.bodySemiBold,
  },
  footer: {
    marginTop: 20,
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 18,
    ...theme.fonts.body,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 22,
    color: theme.colors.text,
    marginBottom: 8,
    ...theme.fonts.heading,
  },
  modalSubtitle: {
    color: theme.colors.muted,
    lineHeight: 20,
    marginBottom: 16,
    ...theme.fonts.body,
  },
  successMessageText: {
    color: theme.colors.success,
    lineHeight: 22,
    marginBottom: 16,
    ...theme.fonts.bodySemiBold,
  },
  cancelButton: {
    marginTop: 10,
    alignItems: 'center',
    padding: 10,
  },
  cancelButtonText: {
    color: theme.colors.muted,
    ...theme.fonts.bodySemiBold,
  },
})
