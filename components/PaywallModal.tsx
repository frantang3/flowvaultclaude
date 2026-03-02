// components/PaywallModal.tsx
import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator, ScrollView } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useA0Purchases } from 'a0-purchases'
import theme from '../lib/theme'
import PrimaryButton from './PrimaryButton'

interface PaywallModalProps {
  visible: boolean
  onClose: () => void
  featureName: string
  tierRequired: string
  description?: string
}

export default function PaywallModal({ visible, onClose, featureName, tierRequired, description }: PaywallModalProps) {
  const { offerings, purchase } = useA0Purchases()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const defaultOffering = offerings?.current

  const handlePurchase = async (packageToPurchase: any) => {
    if (!packageToPurchase) return
    
    setLoading(true)
    setError(null)
    
    try {
      await purchase(packageToPurchase)
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Purchase failed')
    } finally {
      setLoading(false)
    }
  }

  // Filter packages based on tier required
  const relevantPackages = defaultOffering?.availablePackages?.filter((pkg: any) => {
    const identifier = pkg.identifier || ''
    if (tierRequired.includes('Mid')) {
      return identifier.includes('mid')
    } else if (tierRequired.includes('Pro')) {
      return identifier.includes('pro')
    }
    return true
  }) || []

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Pressable onPress={onClose} style={styles.closeButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={24} color={theme.colors.muted} />
          </Pressable>

          <View style={styles.iconContainer}>
            <MaterialIcons name="lock" size={48} color={theme.colors.primary} />
          </View>

          <Text style={styles.title}>Upgrade to {tierRequired}</Text>
          <Text style={styles.featureName}>{featureName}</Text>

          {description && <Text style={styles.description}>{description}</Text>}

          <View style={styles.benefits}>
            <View style={styles.benefitRow}>
              <MaterialIcons name="check-circle" size={20} color={theme.colors.primary} />
              <Text style={styles.benefitText}>Unlock {featureName.toLowerCase()}</Text>
            </View>
            <View style={styles.benefitRow}>
              <MaterialIcons name="check-circle" size={20} color={theme.colors.primary} />
              <Text style={styles.benefitText}>Access all premium features</Text>
            </View>
            <View style={styles.benefitRow}>
              <MaterialIcons name="check-circle" size={20} color={theme.colors.primary} />
              <Text style={styles.benefitText}>Support ongoing development</Text>
            </View>
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <ScrollView style={styles.packagesContainer} contentContainerStyle={{ gap: 8 }}>
            {relevantPackages.length > 0 ? (
              relevantPackages.map((pkg: any, idx: number) => (
                <Pressable
                  key={idx}
                  style={styles.packageCard}
                  onPress={() => handlePurchase(pkg)}
                  disabled={loading}
                >
                  <View style={styles.packageInfo}>
                    <Text style={styles.packageTitle}>{pkg.product?.title || 'Subscription'}</Text>
                    <Text style={styles.packagePrice}>{pkg.product?.priceString || 'N/A'}</Text>
                  </View>
                  {loading && <ActivityIndicator size="small" color={theme.colors.primary} />}
                </Pressable>
              ))
            ) : (
              <Text style={styles.noPackagesText}>
                Loading plans... If this persists, products may not be configured in App Store Connect.
              </Text>
            )}
          </ScrollView>

          <Pressable onPress={onClose} style={styles.notNowButton}>
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modal: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    maxHeight: '80%',
  },
  closeButton: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    zIndex: 1,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.type.h3,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  featureName: {
    fontSize: theme.type.body,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  description: {
    fontSize: theme.type.small,
    color: theme.colors.muted,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    lineHeight: 20,
  },
  benefits: {
    width: '100%',
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  benefitText: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    flex: 1,
  },
  packagesContainer: {
    width: '100%',
    maxHeight: 200,
  },
  packageCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  packageInfo: {
    flex: 1,
  },
  packageTitle: {
    fontSize: theme.type.body,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  packagePrice: {
    fontSize: theme.type.small,
    color: theme.colors.primary,
    fontWeight: '800',
  },
  noPackagesText: {
    fontSize: theme.type.small,
    color: theme.colors.muted,
    textAlign: 'center',
    padding: theme.spacing.md,
  },
  errorText: {
    fontSize: theme.type.small,
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  notNowButton: {
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  notNowText: {
    fontSize: theme.type.body,
    color: theme.colors.muted,
    fontWeight: '600',
  },
})