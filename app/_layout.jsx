import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'El meu Perfil',
          headerStyle: { backgroundColor: '#2C1F3E' },
          headerTintColor: '#C4A882',
          headerTitleStyle: { fontWeight: 'bold', letterSpacing: 1 },
        }}
      />
    </Stack>
  );
}
