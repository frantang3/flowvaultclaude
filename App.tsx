import 'react-native-gesture-handler'
import 'react-native-get-random-values'
import React, { useEffect, useState } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { QueryClientProvider } from './lib/reactQuery'
import { queryClient } from './lib/queryClient'
import { A0PurchaseProvider } from 'a0-purchases'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Font from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'

import { useAuthActions } from './hooks/useAuth'
import theme from './lib/theme'
import { useSupabaseSetup } from './lib/supabase'

import LibraryScreen from './screens/LibraryScreen'
import MoveDetailsScreen from './screens/MoveDetailsScreen'
import MoveEditScreen from './screens/MoveEditScreen'
import RoutineComposerScreen from './screens/RoutineComposerScreen'
import PracticeScreen from './screens/PracticeScreen'
import SettingsScreen from './screens/SettingsScreen'
import AuthScreen from './screens/AuthScreen'
import OnboardingScreen from './screens/OnboardingScreen'

// NOTE: Move these to environment variables via app.config.js before App Store submission.
// For local dev / TestFlight, these inline values work but are visible in the bundle.
// See README.md "Production Deployment" section for instructions.
;(globalThis as any).SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://phhasqjphvifwiveyiwv.supabase.co'
;(globalThis as any).SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoaGFzcWpwaHZpZndpdmV5aXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1NDg0NjQsImV4cCI6MjA3NTEyNDQ2NH0.MmlrWwhmG5-26LiFp0k_dTKMNn1b9EkOqJWYS6Aji8k'

const Stack = createStackNavigator()
const Tabs = createBottomTabNavigator()
const LibraryStack = createStackNavigator()

function SetupBanner() {
  const { isConfigured } = useSupabaseSetup()
  if (isConfigured) return null
  return (
    <View style={{ backgroundColor: '#e53e3e', paddingVertical: 12, paddingHorizontal: 16 }}>
      <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>
        ⚠️ Setup Required: Supabase keys missing. Add SUPABASE_URL and SUPABASE_ANON_KEY to app.config.js
      </Text>
    </View>
  )
}

function LibraryStackNavigator() {
  return (
    <LibraryStack.Navigator screenOptions={{ headerShown: false }}>
      <LibraryStack.Screen name="LibraryHome" component={LibraryScreen} />
      <LibraryStack.Screen name="MoveDetails" component={MoveDetailsScreen} />
      <LibraryStack.Screen name="MoveEdit" component={MoveEditScreen} />
    </LibraryStack.Navigator>
  )
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }: { route: { name: string } }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 10, ...theme.fonts.bodySemiBold },
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopWidth: 0 },
        tabBarIcon: ({ color, size }: { color: string; size: number }) => {
          if (route.name === 'Library') return <MaterialCommunityIcons name="folder-multiple" size={size} color={color} />
          if (route.name === 'Create') return <MaterialCommunityIcons name="plus-circle" size={size} color={color} />
          if (route.name === 'Practice') return <MaterialCommunityIcons name="lightning-bolt" size={size} color={color} />
          if (route.name === 'Routines') return <MaterialCommunityIcons name="playlist-music" size={size} color={color} />
          if (route.name === 'Settings') return <MaterialCommunityIcons name="cog-outline" size={size} color={color} />
          return <View />
        },
      })}
    >
      <Tabs.Screen name="Library" component={LibraryStackNavigator} />
      <Tabs.Screen name="Create" component={MoveEditScreen} initialParams={{ mode: 'create' }} />
      <Tabs.Screen name="Practice" component={PracticeScreen} />
      <Tabs.Screen name="Routines" component={RoutineComposerScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  )
}

// Keep the splash screen visible while we load fonts
SplashScreen.preventAutoHideAsync()

function AppContentWithAuth() {
  const { user, loading } = useAuthActions()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [checkingOnboarding, setCheckingOnboarding] = useState(true)
  const [fontsLoaded, setFontsLoaded] = useState(false)

  // Load custom fonts from local assets (no network dependency)
  useEffect(() => {
    const loadFonts = async () => {
      try {
        await Font.loadAsync({
          'Manrope-Bold': require('./assets/fonts/Manrope-Bold.ttf'),
          'Manrope-SemiBold': require('./assets/fonts/Manrope-SemiBold.ttf'),
          'Inter-Regular': require('./assets/fonts/Inter_18pt-Regular.ttf'),
          'Inter-Medium': require('./assets/fonts/Inter_18pt-Medium.ttf'),
          'Inter-SemiBold': require('./assets/fonts/Inter_18pt-SemiBold.ttf'),
        })
      } catch (e) {
        console.warn('Failed to load fonts', e)
      } finally {
        setFontsLoaded(true)
        await SplashScreen.hideAsync()
      }
    }

    loadFonts()
  }, [])

  useEffect(() => {
    const checkOnboarding = async () => {
      if (!user) {
        setCheckingOnboarding(false)
        return
      }
      
      try {
        const hasSeenOnboarding = await AsyncStorage.getItem('hasSeenOnboarding')
        if (!hasSeenOnboarding) {
          setShowOnboarding(true)
        }
      } catch (e) {
        console.warn('Failed to check onboarding status', e)
      } finally {
        setCheckingOnboarding(false)
      }
    }
    
    checkOnboarding()
  }, [user])

  const handleOnboardingComplete = async () => {
    try {
      await AsyncStorage.setItem('hasSeenOnboarding', 'true')
      setShowOnboarding(false)
    } catch (e) {
      console.warn('Failed to save onboarding status', e)
      setShowOnboarding(false)
    }
  }

  if (!fontsLoaded || loading || checkingOnboarding) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 12, color: theme.colors.muted }}>Loading...</Text>
      </View>
    )
  }

  if (!user) {
    return <AuthScreen />
  }

  if (showOnboarding) {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />
  }

  return (
    <A0PurchaseProvider config={{ appUserId: user.id }}>
      <SetupBanner />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="MoveEdit" component={MoveEditScreen} />
      </Stack.Navigator>
    </A0PurchaseProvider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <NavigationContainer>
            <AppContentWithAuth />
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
})