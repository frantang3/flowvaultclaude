import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Linking, ActivityIndicator, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useA0Purchases } from 'a0-purchases'
import theme from '../lib/theme'
import { useAuthActions } from '../hooks/useAuth'
import { useSubscription } from '../hooks/useSubscription'
import { useMoves as useMovesQuery } from '../hooks/useMovesQuery'
import supabase from '../lib/supabase'

// Constants
const SUPPORT_EMAIL = 'flowvaultapp@gmail.com'
const PRIVACY_POLICY_URL = 'https://flowvault.app/privacy'
const TERMS_URL = 'https://flowvault.app/terms'

export default function SettingsScreen() {
  const { user, uid, signOut } = useAuthActions()
  const { features, limits } = useSubscription()
  const { moves } = useMovesQuery(uid)
  const { offerings, purchase, restore, isPremium, isLoading: purchasesLoading } = useA0Purchases()

  const [paywallVisible, setPaywallVisible] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)

  const moveCount = moves.length
  const isOverLimit = moveCount > limits.maxMoves
  const tierName = limits.tierName

  // Handle restore purchases
  const handleRestorePurchases = async () => {
    setRestoring(true)
    try {
      await restore()
      Alert.alert('Restored', 'Your purchases have been restored successfully.')
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert('Restore Failed', e?.message || 'Could not restore purchases. Please try again.')
      }
    } finally {
      setRestoring(false)
    }
  }

  // Handle manage subscription (deep link to Apple)
  const handleManageSubscription = async () => {
    try {
      await Linking.openURL('https://apps.apple.com/account/subscriptions')
    } catch (e) {
      Alert.alert('Error', 'Could not open subscription management. Please go to Settings > Apple ID > Subscriptions.')
    }
  }

  // Handle purchase
  const handlePurchase = async (pkg: any) => {
    setPurchasing(true)
    try {
      await purchase(pkg)
      Alert.alert('Success!', 'Welcome to your new plan! 🎉')
      setPaywallVisible(false)
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert('Purchase Failed', e?.message || 'Please try again.')
      }
    } finally {
      setPurchasing(false)
    }
  }

  // Handle sign out
  const handleSignOut = async () => {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut()
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to sign out')
          }
        },
      },
    ])
  }

  // Handle delete account
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account?',
      'This will delete your moves and routines from our database. Full account deletion (removing your login) may require support. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Data',
          style: 'destructive',
          onPress: () => confirmDeleteAccount(),
        },
      ]
    )
  }

  const extractStoragePath = (url: string): string | null => {
    try {
      const URLCtor = (globalThis as any).URL
      if (URLCtor) {
        const parsed = new URLCtor(url)
        // Supports public URLs: /object/public/<bucket>/<path>
        const idx = parsed.pathname.indexOf('/object/public/moves/')
        if (idx !== -1) {
          const path = parsed.pathname.substring(idx + '/object/public/moves/'.length)
          return path.split('?')[0]
        }
      }
      const match = url.match(/\/object\/public\/moves\/(.*?)(\?|$)/)
      if (match && match[1]) return match[1]
    } catch {}
    return null
  }

  const confirmDeleteAccount = async () => {
    setDeletingAccount(true)
    try {
      if (!user?.id) throw new Error('Not signed in')

      // Best-effort: delete storage objects referenced by your moves first (no listing required).
      try {
        const { data: userMoves } = await supabase
          .from('moves')
          .select('video_url, video_url_original, video_url_web, image_url')
          .eq('user_id', user.id)

        const pathsToDelete: string[] = []
        for (const row of userMoves || []) {
          const urls: string[] = [
            row.video_url,
            row.video_url_original,
            row.video_url_web,
            row.image_url,
          ].filter(Boolean)

          for (const u of urls) {
            const p = extractStoragePath(String(u))
            if (p) pathsToDelete.push(p)
          }
        }

        const unique = Array.from(new Set(pathsToDelete))
        if (unique.length > 0) {
          await supabase.storage.from('moves').remove(unique)
        }
      } catch {
        // ignore cleanup failures; we'll still delete DB rows
      }

      // Delete user's rows (RLS should enforce ownership)
      await supabase.from('moves').delete().eq('user_id', user.id)
      await supabase.from('routines').delete().eq('user_id', user.id)

      await signOut()

      Alert.alert(
        'Data Deleted',
        'Your moves and routines have been deleted. If you want your login removed entirely, contact support.'
      )
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to delete data. Please contact support.')
    } finally {
      setDeletingAccount(false)
    }
  }

  // Contact support
  const handleContactSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=FlowVault Support Request`)
  }

  const handleReportBug = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=FlowVault Bug Report&body=Please describe the bug you encountered:%0A%0ADevice:%0AApp Version:%0ASteps to reproduce:`)
  }

  const handleFeatureRequest = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=FlowVault Feature Request&body=I would like to suggest the following feature:%0A%0A`)
  }

  const handlePrivacyPolicy = () => {
    Linking.openURL(PRIVACY_POLICY_URL)
  }

  const handleTerms = () => {
    Linking.openURL(TERMS_URL)
  }

  // Get all packages for paywall
  const allPackages = offerings?.current?.availablePackages || []

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Settings</Text>

        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <MaterialCommunityIcons name="account" size={20} color={theme.colors.muted} />
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Email</Text>
                <Text style={styles.rowValue}>{user?.email || 'Not signed in'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Subscription Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.card}>
            {/* Current Plan */}
            <View style={styles.row}>
              <MaterialCommunityIcons 
                name={isPremium ? "crown" : "star-outline"} 
                size={20} 
                color={isPremium ? theme.colors.primary : theme.colors.muted} 
              />
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Current Plan</Text>
                <Text style={[styles.rowValue, isPremium && { color: theme.colors.primary, fontWeight: '800' }]}>
                  {tierName}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Move Usage */}
            <View style={styles.row}>
              <MaterialCommunityIcons name="folder-multiple" size={20} color={theme.colors.muted} />
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Moves Used</Text>
                <Text style={[styles.rowValue, isOverLimit && { color: theme.colors.error }]}>
                  {moveCount} / {limits.maxMoves}
                  {isOverLimit && ' (over limit)'}
                </Text>
              </View>
            </View>

            {isOverLimit && (
              <View style={styles.warningBanner}>
                <MaterialCommunityIcons name="alert" size={18} color={theme.colors.error} />
                <Text style={styles.warningText}>
                  You're over your plan limit. Your moves are view-only until you upgrade or delete some moves.
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            {/* Media Upload Status */}
            <View style={styles.row}>
              <MaterialCommunityIcons name="upload" size={20} color={theme.colors.muted} />
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Media Upload</Text>
                <Text style={[styles.rowValue, { color: features.MEDIA_UPLOAD_ENABLED ? theme.colors.success : theme.colors.muted }]}>
                  {features.MEDIA_UPLOAD_ENABLED ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Advanced Search */}
            <View style={styles.row}>
              <MaterialCommunityIcons name="magnify-plus" size={20} color={theme.colors.muted} />
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Advanced Search</Text>
                <Text style={[styles.rowValue, { color: features.ADVANCED_SEARCH_ENABLED ? theme.colors.success : theme.colors.muted }]}>
                  {features.ADVANCED_SEARCH_ENABLED ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Upgrade / Compare Plans Button */}
            <Pressable style={styles.actionButton} onPress={() => setPaywallVisible(true)}>
              <MaterialCommunityIcons name="star" size={20} color={theme.colors.primary} />
              <Text style={styles.actionButtonText}>
                {isPremium ? 'Compare Plans' : 'Upgrade Plan'}
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
            </Pressable>

            {/* Manage Subscription (for premium users) */}
            {isPremium && (
              <Pressable style={styles.actionButton} onPress={handleManageSubscription}>
                <MaterialCommunityIcons name="credit-card-settings" size={20} color={theme.colors.primary} />
                <Text style={styles.actionButtonText}>Manage Subscription</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
              </Pressable>
            )}

            {/* Restore Purchases */}
            <Pressable 
              style={styles.actionButton} 
              onPress={handleRestorePurchases}
              disabled={restoring}
            >
              <MaterialCommunityIcons name="restore" size={20} color={theme.colors.primary} />
              <Text style={styles.actionButtonText}>Restore Purchases</Text>
              {restoring ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
              )}
            </Pressable>
          </View>
        </View>

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.card}>
            <Pressable style={styles.actionButton} onPress={handleContactSupport}>
              <MaterialCommunityIcons name="email-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.actionButtonText}>Contact Support</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
            </Pressable>

            <Pressable style={styles.actionButton} onPress={handleReportBug}>
              <MaterialCommunityIcons name="bug-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.actionButtonText}>Report a Bug</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
            </Pressable>

            <Pressable style={styles.actionButton} onPress={handleFeatureRequest}>
              <MaterialCommunityIcons name="lightbulb-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.actionButtonText}>Feature Request</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* Legal Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <View style={styles.card}>
            <Pressable style={styles.actionButton} onPress={handlePrivacyPolicy}>
              <MaterialCommunityIcons name="shield-lock-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.actionButtonText}>Privacy Policy</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
            </Pressable>

            <Pressable style={styles.actionButton} onPress={handleTerms}>
              <MaterialCommunityIcons name="file-document-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.actionButtonText}>Terms of Service</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <Pressable onPress={handleSignOut} style={styles.dangerButton}>
              <MaterialCommunityIcons name="logout" size={20} color={theme.colors.error} />
              <Text style={styles.dangerButtonText}>Sign Out</Text>
            </Pressable>

            <Pressable 
              onPress={handleDeleteAccount} 
              style={styles.dangerButton}
              disabled={deletingAccount}
            >
              <MaterialCommunityIcons name="delete-forever" size={20} color={theme.colors.error} />
              <Text style={styles.dangerButtonText}>Delete Account</Text>
              {deletingAccount && <ActivityIndicator size="small" color={theme.colors.error} />}
            </Pressable>
          </View>
        </View>

        {/* App Version */}
        <Text style={styles.versionText}>FlowVault v1.0.0</Text>
      </ScrollView>

      {/* Paywall / Plans Modal */}
      <Modal visible={paywallVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choose Your Plan</Text>
            <Pressable onPress={() => setPaywallVisible(false)} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Free Plan */}
            <View style={[styles.planCard, tierName === 'Free' && styles.planCardActive]}>
              <View style={styles.planHeader}>
                <Text style={styles.planName}>Free</Text>
                {tierName === 'Free' && <Text style={styles.currentBadge}>Current</Text>}
              </View>
              <Text style={styles.planPrice}>$0/month</Text>
              <View style={styles.planFeatures}>
                <Text style={styles.planFeature}>✓ Up to 20 moves</Text>
                <Text style={styles.planFeature}>✓ Basic search</Text>
                <Text style={styles.planFeatureMuted}>✗ Media uploads</Text>
                <Text style={styles.planFeatureMuted}>✗ Advanced search</Text>
                <Text style={styles.planFeatureMuted}>✗ Export data</Text>
              </View>
            </View>

            {/* Mid Plan */}
            <View style={[styles.planCard, tierName === 'Mid' && styles.planCardActive]}>
              <View style={styles.planHeader}>
                <Text style={styles.planName}>Mid</Text>
                {tierName === 'Mid' && <Text style={styles.currentBadge}>Current</Text>}
              </View>
              <Text style={styles.planPrice}>$9.99/month</Text>
              <Text style={styles.planPriceAlt}>or $99/year (save 17%)</Text>
              <View style={styles.planFeatures}>
                <Text style={styles.planFeature}>✓ Up to 100 moves</Text>
                <Text style={styles.planFeature}>✓ Basic search</Text>
                <Text style={styles.planFeature}>✓ Media uploads (video & image)</Text>
                <Text style={styles.planFeatureMuted}>✗ Advanced search</Text>
                <Text style={styles.planFeatureMuted}>✗ Export data</Text>
              </View>
              {allPackages.filter((p: any) => p.identifier?.includes('mid')).map((pkg: any, idx: number) => (
                <Pressable 
                  key={idx}
                  style={[styles.purchaseButton, purchasing && { opacity: 0.6 }]}
                  onPress={() => handlePurchase(pkg)}
                  disabled={purchasing || tierName === 'Mid'}
                >
                  {purchasing ? (
                    <ActivityIndicator color={theme.colors.onPrimary} />
                  ) : (
                    <Text style={styles.purchaseButtonText}>
                      {tierName === 'Mid' ? 'Current Plan' : `Get Mid - ${pkg.product?.priceString}`}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>

            {/* Pro Plan */}
            <View style={[styles.planCard, tierName === 'Pro' && styles.planCardActive, styles.planCardHighlighted]}>
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedBadgeText}>Recommended</Text>
              </View>
              <View style={styles.planHeader}>
                <Text style={styles.planName}>Pro</Text>
                {tierName === 'Pro' && <Text style={styles.currentBadge}>Current</Text>}
              </View>
              <Text style={styles.planPrice}>$19.99/month</Text>
              <Text style={styles.planPriceAlt}>or $199/year (save 17%)</Text>
              <View style={styles.planFeatures}>
                <Text style={styles.planFeature}>✓ Unlimited moves (10,000+)</Text>
                <Text style={styles.planFeature}>✓ Media uploads (video & image)</Text>
                <Text style={styles.planFeature}>✓ Advanced multi-tag search</Text>
                <Text style={styles.planFeature}>✓ Export your data</Text>
                <Text style={styles.planFeature}>✓ Priority support</Text>
              </View>
              {allPackages.filter((p: any) => p.identifier?.includes('pro')).map((pkg: any, idx: number) => (
                <Pressable 
                  key={idx}
                  style={[styles.purchaseButton, styles.purchaseButtonPro, purchasing && { opacity: 0.6 }]}
                  onPress={() => handlePurchase(pkg)}
                  disabled={purchasing || tierName === 'Pro'}
                >
                  {purchasing ? (
                    <ActivityIndicator color={theme.colors.onPrimary} />
                  ) : (
                    <Text style={styles.purchaseButtonText}>
                      {tierName === 'Pro' ? 'Current Plan' : `Get Pro - ${pkg.product?.priceString}`}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>

            {/* Restore Purchases in Modal */}
            <Pressable 
              style={styles.restoreButton} 
              onPress={handleRestorePurchases}
              disabled={restoring}
            >
              {restoring ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Text style={styles.restoreButtonText}>Restore Purchases</Text>
              )}
            </Pressable>

            <Text style={styles.legalNote}>
              Subscriptions will be charged to your Apple ID account at confirmation of purchase. 
              Subscriptions automatically renew unless auto-renew is turned off at least 24-hours 
              before the end of the current period.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    padding: theme.spacing.md,
    paddingBottom: 40,
  },
  title: {
    fontSize: theme.type.h2,
    fontWeight: '900',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.type.small,
    fontWeight: '800',
    color: theme.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    padding: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: theme.type.small,
    color: theme.colors.muted,
    marginBottom: 2,
  },
  rowValue: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.outline,
    marginVertical: theme.spacing.md,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: theme.colors.error + '15',
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    marginTop: theme.spacing.sm,
  },
  warningText: {
    flex: 1,
    fontSize: theme.type.small,
    color: theme.colors.error,
    lineHeight: 18,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: theme.spacing.sm,
  },
  actionButtonText: {
    flex: 1,
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: '600',
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
  },
  dangerButtonText: {
    fontSize: theme.type.body,
    color: theme.colors.error,
    fontWeight: '700',
  },
  versionText: {
    textAlign: 'center',
    color: theme.colors.muted,
    fontSize: theme.type.small,
    marginTop: theme.spacing.md,
  },
  // Modal styles
  modalSafe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  modalTitle: {
    fontSize: theme.type.h3,
    fontWeight: '900',
    color: theme.colors.text,
  },
  modalContent: {
    flex: 1,
    padding: theme.spacing.md,
  },
  planCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  planCardActive: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  planCardHighlighted: {
    backgroundColor: theme.colors.primary + '08',
  },
  recommendedBadge: {
    position: 'absolute',
    top: -10,
    right: 12,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  recommendedBadgeText: {
    color: theme.colors.onPrimary,
    fontSize: 11,
    fontWeight: '800',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  planName: {
    fontSize: theme.type.h3,
    fontWeight: '900',
    color: theme.colors.text,
  },
  currentBadge: {
    backgroundColor: theme.colors.success + '20',
    color: theme.colors.success,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  planPrice: {
    fontSize: theme.type.body,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  planPriceAlt: {
    fontSize: theme.type.small,
    color: theme.colors.muted,
    marginBottom: theme.spacing.sm,
  },
  planFeatures: {
    marginTop: theme.spacing.sm,
    gap: 6,
  },
  planFeature: {
    fontSize: theme.type.body,
    color: theme.colors.text,
  },
  planFeatureMuted: {
    fontSize: theme.type.body,
    color: theme.colors.muted,
  },
  purchaseButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  purchaseButtonPro: {
    backgroundColor: theme.colors.primary,
  },
  purchaseButtonText: {
    color: theme.colors.onPrimary,
    fontWeight: '800',
    fontSize: theme.type.body,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
  },
  restoreButtonText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: theme.type.body,
  },
  legalNote: {
    fontSize: 11,
    color: theme.colors.muted,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
})