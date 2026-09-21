import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DATABASE_NAME, migrateDatabase } from './src/db/database';
import type { RootStackParamList, TabParamList } from './src/navigation/types';
import { BackupScreen } from './src/screens/BackupScreen';
import { RecordFormScreen } from './src/screens/RecordFormScreen';
import { RecordListScreen } from './src/screens/RecordListScreen';
import { StatsScreen } from './src/screens/StatsScreen';
import { FatalMessage, RecordsProvider } from './src/state/RecordsContext';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const tabIcon = (emoji: string) => () => <Text style={{ fontSize: 20 }}>{emoji}</Text>;

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtext,
      }}
    >
      <Tab.Screen
        name="Records"
        component={RecordListScreen}
        options={{ title: '記録', headerTitle: '収支の記録', tabBarIcon: tabIcon('📒') }}
      />
      <Tab.Screen
        name="Stats"
        component={StatsScreen}
        options={{ title: '収支', headerTitle: '収支', tabBarIcon: tabIcon('📊') }}
      />
      <Tab.Screen
        name="Backup"
        component={BackupScreen}
        options={{ title: 'データ', headerTitle: 'データのバックアップ', tabBarIcon: tabIcon('💾') }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [dbError, setDbError] = useState<string | null>(null);

  return (
    <SafeAreaProvider>
      <SQLiteProvider
        databaseName={DATABASE_NAME}
        onInit={migrateDatabase}
        onError={(e) => setDbError(e.message)}
      >
        {dbError ? (
          <FatalMessage message={`データベースを開けませんでした。\n${dbError}`} />
        ) : (
          <RecordsProvider>
            <NavigationContainer>
              <Stack.Navigator>
                <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
                <Stack.Screen
                  name="RecordForm"
                  component={RecordFormScreen}
                  options={({ route }) => ({
                    title: route.params?.id === undefined ? '記録の追加' : '記録の編集',
                    headerBackTitle: '戻る',
                  })}
                />
              </Stack.Navigator>
            </NavigationContainer>
          </RecordsProvider>
        )}
      </SQLiteProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
