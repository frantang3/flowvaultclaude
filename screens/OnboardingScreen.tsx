import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import theme from '../lib/theme'

export default function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Welcome to Your Move Library! 💃</Text>
        
        <View style={styles.tipsContainer}>
          <View style={styles.tipRow}>
            <MaterialCommunityIcons name="plus-circle" size={24} color={theme.colors.primary} />
            <Text style={styles.tipText}>
              <Text style={styles.tipBold}>Add moves:</Text> Tap the "Create" tab to add your first move with videos, notes, and tags.
            </Text>
          </View>
          
          <View style={styles.tipRow}>
            <MaterialCommunityIcons name="shuffle-variant" size={24} color={theme.colors.primary} />
            <Text style={styles.tipText}>
              <Text style={styles.tipBold}>Start practicing:</Text> Once you've added a few moves, try the Practice tab to build your daily drill set!
            </Text>
          </View>
          
          <View style={styles.tipRow}>
            <MaterialCommunityIcons name="playlist-edit" size={24} color={theme.colors.primary} />
            <Text style={styles.tipText}>
              <Text style={styles.tipBold}>Build routines:</Text> Compose custom sequences in the Routine tab.
            </Text>
          </View>
        </View>
        
        <Pressable onPress={onComplete} style={styles.button}>
          <Text style={styles.buttonText}>Get Started</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    padding: theme.spacing.lg,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  tipsContainer: {
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  tipRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  tipText: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
    lineHeight: 24,
  },
  tipBold: {
    fontWeight: '700',
    color: theme.colors.primary,
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: theme.colors.onPrimary,
    fontWeight: '900',
    fontSize: 18,
  },
})